import { getUserContext } from "@/lib/auth/context";
import { csvResponse, getExportPeriod } from "@/lib/csv-export";
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

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function statusLabel(status: string, remaining: number) {
  if (status === "cancelled") return "Cancelada";
  if (status === "refunded") return "Devolvida";
  if (status === "partially_refunded") return "Devolução parcial";
  return remaining > 0 ? "A receber" : "Paga";
}

export async function GET(request: Request) {
  const context = await getUserContext();
  if (!context) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const period = getExportPeriod(new URL(request.url).searchParams, context.store.timezone);
  if (!period) return Response.json({ error: "invalid_period" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const supabase = await createClient();
  const sales: { id: string; number: number; customer_id: string | null; status: string; total_cents: number; completed_at: string | null; created_at: string }[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const page = await supabase.from("sales").select("id, number, customer_id, status, total_cents, completed_at, created_at").eq("store_id", context.store.id).neq("status", "draft").gte("completed_at", period.start).lt("completed_at", period.end).order("completed_at", { ascending: false }).range(from, from + 999);
    if (page.error) return Response.json({ error: "export_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    sales.push(...page.data);
    if (page.data.length < 1000) break;
  }

  const rows: (string | number)[][] = [["Venda", "Data", "Cliente", "Status", "Total", "Recebido", "Saldo", "Formas de pagamento"]];
  const paymentNames: Record<string, string> = { cash: "Dinheiro", pix: "Pix", debit_card: "Cartão de débito", credit_card: "Cartão de crédito" };
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: context.store.timezone });

  for (let offset = 0; offset < sales.length; offset += 200) {
    const batch = sales.slice(offset, offset + 200);
    const ids = batch.map((sale) => sale.id);
    const customerIds = [...new Set(batch.map((sale) => sale.customer_id).filter((id): id is string => Boolean(id)))];
    const [customersResult, paymentsResult, receivablesResult] = await Promise.all([
      customerIds.length ? supabase.from("customers").select("id, name").eq("store_id", context.store.id).in("id", customerIds) : Promise.resolve({ data: [], error: null }),
      readPages((from, to) => supabase.from("payments").select("sale_id, method, amount_cents").eq("store_id", context.store.id).in("sale_id", ids).range(from, to)),
      supabase.from("receivables").select("sale_id, remaining_cents, status").eq("store_id", context.store.id).in("sale_id", ids),
    ]);
    if (customersResult.error || paymentsResult.error || receivablesResult.error || !paymentsResult.rows) {
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
    for (const sale of batch) {
      const date = sale.completed_at ?? sale.created_at;
      const remaining = dueBySale.get(sale.id) ?? 0;
      rows.push([
        sale.number,
        dateFormatter.format(new Date(date)),
        sale.customer_id ? customers.get(sale.customer_id) ?? "Cliente" : "Cliente avulso",
        statusLabel(sale.status, remaining),
        money(sale.total_cents),
        money(paidBySale.get(sale.id) ?? 0),
        money(remaining),
        [...(methodsBySale.get(sale.id) ?? new Set<string>())].map((method) => paymentNames[method] ?? method).join(" / ") || "A receber",
      ]);
    }
  }

  return csvResponse(`vendas-${period.from}-${period.to}.csv`, rows);
}
