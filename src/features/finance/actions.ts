"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/context";
import { parseMoneyToCents } from "@/lib/inputs";
import { createClient } from "@/lib/supabase/server";

const cashCountSchema = z.array(z.object({
  denomination_cents: z.number().int().refine((value) => [20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50, 25, 10, 5].includes(value)),
  quantity: z.number().int().nonnegative().max(2_147_483_647),
})).max(12).superRefine((counts, context) => {
  if (new Set(counts.map((count) => count.denomination_cents)).size !== counts.length) {
    context.addIssue({ code: "custom", message: "Denomination rows must be unique." });
  }
});

function financeError(message: string) {
  if (message.includes("cash_already_open")) return "Já existe um caixa aberto nesta loja.";
  if (message.includes("insufficient_cash")) return "O caixa não tem saldo suficiente para esse movimento.";
  if (message.includes("insufficient_change_fund")) return "O saldo físico do caixa não cobre o troco informado.";
  if (message.includes("invalid_tender")) return "O valor entregue precisa cobrir o valor do pagamento.";
  if (message.includes("count_mismatch")) return "A soma das cédulas e moedas não confere com o total informado.";
  if (message.includes("cash_close_note_required")) return "Informe uma observação quando o valor contado diferir do esperado.";
  if (message.includes("idempotency_payload_mismatch")) return "Esta tentativa já foi enviada com outros dados. Atualize a tela.";
  return "Não foi possível concluir a operação financeira. Revise os dados e tente novamente.";
}

export async function openCash(input: { opening: string; counts: { denomination_cents: number; quantity: number }[]; key: string }) {
  const parsed = z.object({ opening: z.string().trim().min(1).max(40), counts: cashCountSchema, key: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Informe um fundo inicial válido." };
  const openingCents = parseMoneyToCents(parsed.data.opening);
  if (openingCents === null) return { ok: false, message: "O valor de abertura não é válido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_cash", { p_store: context.store.id, p_opening: openingCents, p_counts: parsed.data.counts, p_key: parsed.data.key });
  if (error) return { ok: false, message: financeError(error.message) };
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function closeCash(input: { sessionId: string; counted: string; notes: string; counts: { denomination_cents: number; quantity: number }[]; key: string }) {
  const parsed = z.object({ sessionId: z.string().uuid(), counted: z.string().trim().min(1).max(40), notes: z.string().trim().max(500), counts: cashCountSchema, key: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Informe o valor contado e uma justificativa válida." };
  const countedCents = parseMoneyToCents(parsed.data.counted);
  if (countedCents === null) return { ok: false, message: "O valor contado não é válido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_cash", {
    p_store: context.store.id,
    p_session: parsed.data.sessionId,
    p_counted: countedCents,
    p_notes: parsed.data.notes,
    p_counts: parsed.data.counts,
    p_key: parsed.data.key,
  });
  if (error) return { ok: false, message: financeError(error.message) };
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function moveCash(input: { sessionId: string; kind: "reinforcement" | "withdrawal"; amount: string; reason: string; key: string }) {
  const parsed = z.object({ sessionId: z.string().uuid(), kind: z.enum(["reinforcement", "withdrawal"]), amount: z.string().trim().min(1).max(40), reason: z.string().trim().min(1).max(500), key: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Informe um valor e um motivo." };
  const amountCents = parseMoneyToCents(parsed.data.amount);
  if (amountCents === null || amountCents <= 0) return { ok: false, message: "O valor do movimento precisa ser maior que zero." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_cash", { p_store: context.store.id, p_session: parsed.data.sessionId, p_kind: parsed.data.kind, p_amount: amountCents, p_reason: parsed.data.reason, p_key: parsed.data.key });
  if (error) return { ok: false, message: financeError(error.message) };
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function receiveReceivable(input: { receivableId: string; amount: string; method: "cash" | "pix" | "debit_card" | "credit_card"; sessionId: string | null; tendered: string; key: string }) {
  const parsed = z.object({ receivableId: z.string().uuid(), amount: z.string().trim().min(1).max(40), method: z.enum(["cash", "pix", "debit_card", "credit_card"]), sessionId: z.string().uuid().nullable(), tendered: z.string().max(40), key: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Informe o valor recebido e a forma de pagamento." };
  const amountCents = parseMoneyToCents(parsed.data.amount);
  const tenderedCents = parsed.data.method === "cash" ? parseMoneyToCents(parsed.data.tendered) : null;
  if (amountCents === null || amountCents <= 0 || (parsed.data.method === "cash" && (tenderedCents === null || tenderedCents < amountCents))) return { ok: false, message: "Confira o valor recebido e o troco." };
  if (parsed.data.method === "cash" && !parsed.data.sessionId) return { ok: false, message: "Abra o caixa antes de receber em dinheiro." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_receivable", { p_store: context.store.id, p_receivable: parsed.data.receivableId, p_amount: amountCents, p_method: parsed.data.method, p_session: parsed.data.sessionId, p_key: parsed.data.key, p_tendered: tenderedCents });
  if (error) return { ok: false, message: financeError(error.message) };
  revalidatePath("/financeiro");
  revalidatePath("/entregas");
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function payPayable(input: { payableId: string; amount: string; method: "cash" | "pix" | "debit_card" | "credit_card" | "transfer"; sessionId: string | null; key: string }) {
  const parsed = z.object({ payableId: z.string().uuid(), amount: z.string().trim().min(1).max(40), method: z.enum(["cash", "pix", "debit_card", "credit_card", "transfer"]), sessionId: z.string().uuid().nullable(), key: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Informe o valor e a forma de pagamento." };
  const amountCents = parseMoneyToCents(parsed.data.amount);
  if (amountCents === null || amountCents <= 0) return { ok: false, message: "O pagamento precisa ser maior que zero." };
  if (parsed.data.method === "cash" && !parsed.data.sessionId) return { ok: false, message: "Abra o caixa antes de pagar em dinheiro." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_payable", { p_store: context.store.id, p_payable: parsed.data.payableId, p_amount: amountCents, p_method: parsed.data.method, p_session: parsed.data.sessionId, p_key: parsed.data.key });
  if (error) return { ok: false, message: financeError(error.message) };
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createExpense(input: { description: string; categoryId: string; amount: string; dueOn: string; payNow: boolean; method: "cash" | "pix" | "debit_card" | "credit_card" | "transfer"; sessionId: string | null; key: string }) {
  const parsed = z.object({ description: z.string().trim().min(1).max(500), categoryId: z.string().uuid().or(z.literal("")), amount: z.string().trim().min(1).max(40), dueOn: z.string().date(), payNow: z.boolean(), method: z.enum(["cash", "pix", "debit_card", "credit_card", "transfer"]), sessionId: z.string().uuid().nullable(), key: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira a descrição, o valor e o vencimento." };
  const amountCents = parseMoneyToCents(parsed.data.amount);
  if (amountCents === null || amountCents <= 0) return { ok: false, message: "O valor da despesa precisa ser maior que zero." };
  if (parsed.data.payNow && parsed.data.method === "cash" && !parsed.data.sessionId) return { ok: false, message: "Abra o caixa antes de pagar em dinheiro." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_expense", { p_store: context.store.id, p_description: parsed.data.description, p_category: parsed.data.categoryId || null, p_amount: amountCents, p_due: parsed.data.dueOn, p_key: parsed.data.key, p_pay_now: parsed.data.payNow, p_method: parsed.data.method, p_session: parsed.data.sessionId });
  if (error) return { ok: false, message: financeError(error.message) };
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createExpenseCategory(name: string) {
  const parsed = z.string().trim().min(1).max(100).safeParse(name);
  if (!parsed.success) return { ok: false, message: "Informe o nome da categoria." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.from("expense_categories").insert({ store_id: context.store.id, name: parsed.data });
  if (error) return { ok: false, message: "Não foi possível criar a categoria. Ela pode já existir." };
  revalidatePath("/financeiro");
  return { ok: true };
}
