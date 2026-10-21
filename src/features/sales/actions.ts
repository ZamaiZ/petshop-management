"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/context";
import { parseMoneyToCents } from "@/lib/inputs";
import { createClient } from "@/lib/supabase/server";

const itemSchema = z.object({
  productId: z.string().uuid().nullable(),
  serviceId: z.string().uuid().nullable(),
  appointmentId: z.string().uuid().nullable(),
  packagingId: z.string().uuid().nullable(),
  quantity: z.number().positive().max(100000),
}).superRefine((item, issue) => {
  if (Number(Boolean(item.productId)) + Number(Boolean(item.serviceId)) !== 1) issue.addIssue({ code: "custom", message: "invalid_item" });
  if (item.productId && item.appointmentId) issue.addIssue({ code: "custom", message: "appointment_requires_service" });
  if (item.serviceId && item.packagingId) issue.addIssue({ code: "custom", message: "service_cannot_use_packaging" });
});

const paymentSchema = z.object({
  method: z.enum(["cash", "pix", "debit_card", "credit_card"]),
  amount: z.string().trim().min(1).max(40),
  tendered: z.string().trim().max(40),
});

const saleSchema = z.object({
  key: z.string().uuid(),
  customerId: z.string().uuid().nullable(),
  items: z.array(itemSchema).min(1).max(200),
  payments: z.array(paymentSchema).max(12),
  discount: z.string().trim().min(1).max(40),
  dueOn: z.union([z.string().date(), z.literal("")]),
  deliveryFee: z.string().trim().max(40),
  deliveryAddress: z.object({
    label: z.string().trim().max(100), street: z.string().trim().min(1).max(200), number: z.string().trim().max(40),
    complement: z.string().trim().max(100), district: z.string().trim().max(100), city: z.string().trim().min(1).max(100),
    state: z.string().trim().max(2), postal_code: z.string().trim().max(20), reference: z.string().trim().max(200),
  }).nullable(),
  cashSessionId: z.string().uuid().nullable(),
});

function saleError(message: string) {
  if (message.includes("insufficient_stock")) return "Não há estoque suficiente para um dos itens.";
  if (message.includes("insufficient_lot_stock")) return "O saldo dos lotes mudou. Atualize o estoque e tente novamente.";
  if (message.includes("expired_lot")) return "Um lote deste produto venceu e não pode ser vendido.";
  if (message.includes("insufficient_change_fund")) return "O caixa não tem saldo físico suficiente para esse troco. Use outro meio de pagamento ou informe o valor exato.";
  if (message.includes("cash_session_not_open")) return "Abra o caixa para registrar pagamentos em dinheiro.";
  if (message.includes("invalid_tender")) return "O valor entregue precisa cobrir o valor pago em dinheiro.";
  if (message.includes("customer_required_for_credit")) return "Selecione um cliente para deixar saldo a receber.";
  if (message.includes("appointment_sale_mismatch")) return "O atendimento não pode ser vinculado a esse serviço ou cliente.";
  if (message.includes("appointment_already_billed")) return "Esse atendimento já foi incluído em outra venda.";
  if (message.includes("idempotency_payload_mismatch")) return "Esta tentativa já foi enviada com outros dados. Atualize a venda antes de tentar novamente.";
  if (message.includes("payment_above_total")) return "A soma dos pagamentos excede o total da venda.";
  if (message.includes("invalid_discount")) return "O desconto não pode ultrapassar o subtotal.";
  if (message.includes("invalid_quantity_precision")) return "A quantidade não respeita a precisão deste produto.";
  if (message.includes("appointment_conflict")) return "O horário foi ocupado por outro atendimento.";
  return "Não foi possível concluir a venda. Confira os dados e tente novamente.";
}

export async function completeSale(input: unknown) {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira os itens, pagamentos e endereço da venda." };
  const discountCents = parseMoneyToCents(parsed.data.discount);
  const deliveryFeeCents = parseMoneyToCents(parsed.data.deliveryFee || "0");
  if (discountCents === null || discountCents < 0 || deliveryFeeCents === null || deliveryFeeCents < 0) {
    return { ok: false, message: "Informe valores válidos para desconto e entrega." };
  }
  const payments = parsed.data.payments.map((payment) => ({
    method: payment.method,
    amount_cents: parseMoneyToCents(payment.amount),
    tendered_cents: payment.method === "cash" ? parseMoneyToCents(payment.tendered) : null,
  }));
  if (payments.some((payment) => payment.amount_cents === null || payment.amount_cents <= 0 || (payment.method === "cash" && (payment.tendered_cents === null || payment.tendered_cents < payment.amount_cents)))) {
    return { ok: false, message: "Confira o valor de cada pagamento e o valor entregue em dinheiro." };
  }
  if (parsed.data.deliveryAddress && !parsed.data.customerId) return { ok: false, message: "Selecione o cliente para registrar uma entrega." };

  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const hasCash = payments.some((payment) => payment.method === "cash");
  const { data: saleId, error } = await supabase.rpc("complete_sale", {
    p_store: context.store.id,
    p_session: hasCash ? parsed.data.cashSessionId : null,
    p_customer: parsed.data.customerId,
    p_items: parsed.data.items.map((item) => ({
      product_id: item.productId,
      service_id: item.serviceId,
      appointment_id: item.appointmentId,
      packaging_id: item.packagingId,
      quantity: item.quantity,
    })),
    p_payments: payments,
    p_discount: discountCents,
    p_key: parsed.data.key,
    p_due: parsed.data.dueOn || null,
    p_delivery_fee: deliveryFeeCents,
    p_delivery_address: parsed.data.deliveryAddress,
  });
  if (error || !saleId) return { ok: false, message: saleError(error?.message ?? "unknown") };
  for (const path of ["/vendas", "/dashboard", "/estoque", "/financeiro", "/clientes", "/agenda", "/entregas"]) revalidatePath(path);
  return { ok: true, saleId };
}

const refundMethod = z.enum(["cash", "pix", "debit_card", "credit_card"]).nullable();

export async function cancelSale(input: { saleId: string; reason: string; method: "cash" | "pix" | "debit_card" | "credit_card" | null; cashSessionId: string | null; key: string }) {
  const parsed = z.object({ saleId: z.string().uuid(), reason: z.string().trim().min(3).max(500), method: refundMethod, cashSessionId: z.string().uuid().nullable(), key: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Informe o motivo do cancelamento." };
  if (parsed.data.method === "cash" && !parsed.data.cashSessionId) return { ok: false, message: "Abra o caixa para devolver dinheiro." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_sale", { p_store: context.store.id, p_sale: parsed.data.saleId, p_reason: parsed.data.reason, p_method: parsed.data.method, p_session: parsed.data.method === "cash" ? parsed.data.cashSessionId : null, p_key: parsed.data.key });
  if (error) return { ok: false, message: saleError(error.message) };
  for (const path of ["/vendas", "/dashboard", "/estoque", "/financeiro", "/entregas"]) revalidatePath(path);
  return { ok: true };
}

export async function returnSaleItems(input: { saleId: string; reason: string; method: "cash" | "pix" | "debit_card" | "credit_card" | null; cashSessionId: string | null; key: string; lines: { saleItemId: string; quantity: number; restock: boolean }[] }) {
  const parsed = z.object({ saleId: z.string().uuid(), reason: z.string().trim().min(3).max(500), method: refundMethod, cashSessionId: z.string().uuid().nullable(), key: z.string().uuid(), lines: z.array(z.object({ saleItemId: z.string().uuid(), quantity: z.number().positive().max(100000), restock: z.boolean() })).min(1).max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira as quantidades e o motivo da devolução." };
  if (parsed.data.method === "cash" && !parsed.data.cashSessionId) return { ok: false, message: "Abra o caixa para devolver dinheiro." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("return_sale_items", { p_store: context.store.id, p_sale: parsed.data.saleId, p_lines: parsed.data.lines.map((line) => ({ sale_item_id: line.saleItemId, quantity: line.quantity, restock: line.restock })), p_reason: parsed.data.reason, p_method: parsed.data.method, p_session: parsed.data.method === "cash" ? parsed.data.cashSessionId : null, p_key: parsed.data.key });
  if (error) return { ok: false, message: saleError(error.message) };
  for (const path of ["/vendas", "/dashboard", "/estoque", "/financeiro", "/entregas"]) revalidatePath(path);
  return { ok: true };
}
