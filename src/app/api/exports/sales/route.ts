import { getUserContext } from "@/lib/auth/context";
import { getExportPeriod } from "@/lib/export-period";
import { excelDateTime, xlsxResponse, type XlsxValue } from "@/lib/xlsx-export";
import { createClient } from "@/lib/supabase/server";

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

async function readPages<T>(load: (from: number, to: number) => PromiseLike<PageResult<T>>) {
  const rows: T[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const result = await load(from, from + 999);
    if (result.error) return { rows: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) return { rows, error: null };
  }
  return { rows: null, error: { message: "maximum_page_count" } };
}

function statusLabel(status: string, remaining: number) {
  if (status === "cancelled") return "Cancelada";
  if (status === "refunded") return "Devolvida";
  if (status === "partially_refunded") return "Devolução parcial";
  return remaining > 0 ? "A receber" : "Paga";
}

function statusKey(status: string, remaining: number) {
  if (status === "cancelled" || status === "refunded" || status === "partially_refunded") return status;
  return remaining > 0 ? "receivable" : "paid";
}

export async function GET(request: Request) {
  const context = await getUserContext();
  if (!context) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const params = new URL(request.url).searchParams;
  const period = getExportPeriod(params, context.store.timezone);
  if (!period) return Response.json({ error: "invalid_period" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const statusFilter = params.get("status") ?? "all";
  if (!["all", "paid", "receivable", "cancelled", "refunded", "partially_refunded"].includes(statusFilter)) {
    return Response.json({ error: "invalid_status" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const searchQuery = (params.get("q") ?? "").trim().slice(0, 120).toLocaleLowerCase("pt-BR");
  const supabase = await createClient();
  const sales: { id: string; number: number; customer_id: string | null; status: string; total_cents: number; delivery_fee_cents: number; completed_at: string | null; created_at: string }[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const page = await supabase.from("sales").select("id, number, customer_id, status, total_cents, delivery_fee_cents, completed_at, created_at").eq("store_id", context.store.id).neq("status", "draft").or(`and(completed_at.gte.${period.start},completed_at.lt.${period.end}),and(completed_at.is.null,created_at.gte.${period.start},created_at.lt.${period.end})`).order("completed_at", { ascending: false }).range(from, from + 999);
    if (page.error) return Response.json({ error: "export_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    sales.push(...page.data);
    if (page.data.length < 1000) break;
  }

  const headers = ["Venda", "Data e hora", "Cliente", "Status", "Entrega", "Taxa de entrega", "Total", "Recebido", "Saldo", "Formas de pagamento"];
  const rows: XlsxValue[][] = [];
  const paymentNames: Record<string, string> = { cash: "Dinheiro", pix: "Pix", debit_card: "Cartão de débito", credit_card: "Cartão de crédito" };

  for (let offset = 0; offset < sales.length; offset += 200) {
    const batch = sales.slice(offset, offset + 200);
    const ids = batch.map((sale) => sale.id);
    const customerIds = [...new Set(batch.map((sale) => sale.customer_id).filter((id): id is string => Boolean(id)))];
    const [customersResult, paymentsResult, receivablesResult, deliveriesResult, itemsResult] = await Promise.all([
      customerIds.length ? supabase.from("customers").select("id, name").eq("store_id", context.store.id).in("id", customerIds) : Promise.resolve({ data: [], error: null }),
      readPages((from, to) => supabase.from("payments").select("sale_id, method, amount_cents").eq("store_id", context.store.id).in("sale_id", ids).range(from, to)),
      supabase.from("receivables").select("sale_id, remaining_cents, status").eq("store_id", context.store.id).in("sale_id", ids),
      supabase.from("deliveries").select("sale_id, status").eq("store_id", context.store.id).in("sale_id", ids),
      readPages((from, to) => supabase.from("sale_items").select("sale_id, description").eq("store_id", context.store.id).in("sale_id", ids).range(from, to)),
    ]);
    if (customersResult.error || paymentsResult.error || receivablesResult.error || deliveriesResult.error || itemsResult.error || !paymentsResult.rows || !itemsResult.rows) {
      return Response.json({ error: "export_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
    const customers = new Map(customersResult.data.map((customer) => [customer.id, customer.name]));
    const paidBySale = new Map<string, number>();
    const methodsBySale = new Map<string, Set<string>>();
    for (const payment of paymentsResult.rows) {
      paidBySale.set(payment.sale_id, (paidBySale.get(payment.sale_id) ?? 0) + payment.amount_cents);
      const methods = methodsBySale.get(payment.sale_id) ?? new Set<string>();
      methods.add(payment.method);
      methodsBySale.set(payment.sale_id, methods);
    }
    const dueBySale = new Map(receivablesResult.data.map((receivable) => [receivable.sale_id, receivable.status === "open" ? receivable.remaining_cents : 0]));
    const deliveryBySale = new Map(deliveriesResult.data.map((delivery) => [delivery.sale_id, delivery.status]));
    const descriptionsBySale = new Map<string, string[]>();
    for (const item of itemsResult.rows) descriptionsBySale.set(item.sale_id, [...(descriptionsBySale.get(item.sale_id) ?? []), item.description]);
    for (const sale of batch) {
      const date = sale.completed_at ?? sale.created_at;
      const remaining = dueBySale.get(sale.id) ?? 0;
      if (statusFilter !== "all" && statusKey(sale.status, remaining) !== statusFilter) continue;
      const customer = sale.customer_id ? customers.get(sale.customer_id) ?? "Cliente" : "Cliente avulso";
      if (searchQuery && ![String(sale.number), customer, ...(descriptionsBySale.get(sale.id) ?? [])].some((value) => value.toLocaleLowerCase("pt-BR").includes(searchQuery))) continue;
      rows.push([
        sale.number,
        excelDateTime(date, context.store.timezone),
        customer,
        statusLabel(sale.status, remaining),
        deliveryBySale.has(sale.id) ? "Sim" : "Não",
        sale.delivery_fee_cents / 100,
        sale.total_cents / 100,
        (paidBySale.get(sale.id) ?? 0) / 100,
        remaining / 100,
        [...(methodsBySale.get(sale.id) ?? new Set<string>())].map((method) => paymentNames[method] ?? method).join(" / ") || "A receber",
      ]);
    }
  }

  return xlsxResponse(`vendas-${period.from}-${period.to}.xlsx`, "Vendas", headers, rows);
}
