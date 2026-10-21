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

function dateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}

function dateInPeriod(value: string | null, from: string, to: string) {
  return value === null || (value >= from && value <= to);
}

async function exportReceipts(storeId: string, timezone: string, period: NonNullable<ReturnType<typeof getExportPeriod>>) {
  const supabase = await createClient();
  const paymentsResult = await readPages((from, to) => supabase.from("payments")
    .select("id, sale_id, method, amount_cents, tendered_cents, change_cents, received_at")
    .eq("store_id", storeId).gte("received_at", period.start).lt("received_at", period.end)
    .order("received_at", { ascending: true }).range(from, to));
  if (paymentsResult.error || !paymentsResult.rows) return null;

  const rows: (string | number)[][] = [["Data e hora", "Venda", "Cliente", "Forma de pagamento", "Recebido", "Valor entregue", "Troco"]];
  const methods: Record<string, string> = { cash: "Dinheiro", pix: "Pix", debit_card: "Cartão de débito", credit_card: "Cartão de crédito" };
  for (let offset = 0; offset < paymentsResult.rows.length; offset += 200) {
    const batch = paymentsResult.rows.slice(offset, offset + 200);
    const saleIds = [...new Set(batch.map((payment) => payment.sale_id))];
    const salesResult = await supabase.from("sales").select("id, number, customer_id").eq("store_id", storeId).in("id", saleIds);
    if (salesResult.error) return null;
    const customerIds = [...new Set(salesResult.data.map((sale) => sale.customer_id).filter((id): id is string => Boolean(id)))];
    const customersResult = customerIds.length
      ? await supabase.from("customers").select("id, name").eq("store_id", storeId).in("id", customerIds)
      : { data: [], error: null };
    if (customersResult.error) return null;
    const sales = new Map(salesResult.data.map((sale) => [sale.id, sale]));
    const customers = new Map(customersResult.data.map((customer) => [customer.id, customer.name]));
    for (const payment of batch) {
      const sale = sales.get(payment.sale_id);
      rows.push([
        dateTime(payment.received_at, timezone),
        sale ? `Venda #${sale.number}` : "Venda",
        sale?.customer_id ? customers.get(sale.customer_id) ?? "Cliente" : "Cliente avulso",
        methods[payment.method] ?? payment.method,
        money(payment.amount_cents),
        payment.tendered_cents === null ? "—" : money(payment.tendered_cents),
        payment.change_cents === null ? "—" : money(payment.change_cents),
      ]);
    }
  }
  return csvResponse(`recebimentos-${period.from}-${period.to}.csv`, rows);
}

async function exportExpenses(storeId: string, timezone: string, period: NonNullable<ReturnType<typeof getExportPeriod>>) {
  const supabase = await createClient();
  const paymentsResult = await readPages((from, to) => supabase.from("payable_payments")
    .select("id, payable_id, amount_cents, method, paid_at")
    .eq("store_id", storeId).gte("paid_at", period.start).lt("paid_at", period.end)
    .order("paid_at", { ascending: true }).range(from, to));
  if (paymentsResult.error || !paymentsResult.rows) return null;

  const rows: (string | number)[][] = [["Data e hora", "Descrição", "Fornecedor", "Categoria", "Forma de pagamento", "Valor pago"]];
  const methods: Record<string, string> = { cash: "Dinheiro", pix: "Pix", debit_card: "Cartão de débito", credit_card: "Cartão de crédito", transfer: "Transferência" };
  for (let offset = 0; offset < paymentsResult.rows.length; offset += 200) {
    const batch = paymentsResult.rows.slice(offset, offset + 200);
    const payableIds = [...new Set(batch.map((payment) => payment.payable_id))];
    const payablesResult = await supabase.from("payables").select("id, description, supplier_id, category_id").eq("store_id", storeId).in("id", payableIds);
    if (payablesResult.error) return null;
    const supplierIds = [...new Set(payablesResult.data.map((payable) => payable.supplier_id).filter((id): id is string => Boolean(id)))];
    const categoryIds = [...new Set(payablesResult.data.map((payable) => payable.category_id).filter((id): id is string => Boolean(id)))];
    const [suppliersResult, categoriesResult] = await Promise.all([
      supplierIds.length ? supabase.from("suppliers").select("id, name").eq("store_id", storeId).in("id", supplierIds) : Promise.resolve({ data: [], error: null }),
      categoryIds.length ? supabase.from("expense_categories").select("id, name").eq("store_id", storeId).in("id", categoryIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (suppliersResult.error || categoriesResult.error) return null;
    const payables = new Map(payablesResult.data.map((payable) => [payable.id, payable]));
    const suppliers = new Map(suppliersResult.data.map((supplier) => [supplier.id, supplier.name]));
    const categories = new Map(categoriesResult.data.map((category) => [category.id, category.name]));
    for (const payment of batch) {
      const payable = payables.get(payment.payable_id);
      rows.push([
        dateTime(payment.paid_at, timezone),
        payable?.description ?? "Conta",
        payable?.supplier_id ? suppliers.get(payable.supplier_id) ?? "Fornecedor" : "—",
        payable?.category_id ? categories.get(payable.category_id) ?? "—" : "—",
        methods[payment.method] ?? payment.method,
        money(payment.amount_cents),
      ]);
    }
  }
  return csvResponse(`despesas-${period.from}-${period.to}.csv`, rows);
}

async function exportBalances(storeId: string, period: NonNullable<ReturnType<typeof getExportPeriod>>) {
  const supabase = await createClient();
  const [receivablesResult, payablesResult] = await Promise.all([
    readPages((from, to) => supabase.from("receivables").select("id, customer_id, sale_id, original_cents, remaining_cents, due_on")
      .eq("store_id", storeId).eq("status", "open").order("due_on", { ascending: true }).range(from, to)),
    readPages((from, to) => supabase.from("payables").select("id, description, supplier_id, original_cents, remaining_cents, due_on")
      .eq("store_id", storeId).eq("status", "open").order("due_on", { ascending: true }).range(from, to)),
  ]);
  if (receivablesResult.error || payablesResult.error || !receivablesResult.rows || !payablesResult.rows) return null;
  const receivables = receivablesResult.rows.filter((item) => item.remaining_cents > 0 && dateInPeriod(item.due_on, period.from, period.to));
  const payables = payablesResult.rows.filter((item) => item.remaining_cents > 0 && dateInPeriod(item.due_on, period.from, period.to));
  const rows: (string | number)[][] = [["Tipo", "Referência", "Vencimento", "Cliente ou fornecedor", "Valor original", "Saldo em aberto"]];

  for (let offset = 0; offset < receivables.length; offset += 200) {
    const batch = receivables.slice(offset, offset + 200);
    const customerIds = [...new Set(batch.map((item) => item.customer_id))];
    const saleIds = [...new Set(batch.map((item) => item.sale_id))];
    const [customersResult, salesResult] = await Promise.all([
      supabase.from("customers").select("id, name").eq("store_id", storeId).in("id", customerIds),
      supabase.from("sales").select("id, number").eq("store_id", storeId).in("id", saleIds),
    ]);
    if (customersResult.error || salesResult.error) return null;
    const customers = new Map(customersResult.data.map((item) => [item.id, item.name]));
    const sales = new Map(salesResult.data.map((item) => [item.id, item.number]));
    for (const item of batch) rows.push([
      "A receber",
      `Venda #${sales.get(item.sale_id) ?? "—"}`,
      item.due_on ?? "Sem vencimento",
      customers.get(item.customer_id) ?? "Cliente",
      money(item.original_cents),
      money(item.remaining_cents),
    ]);
  }

  for (let offset = 0; offset < payables.length; offset += 200) {
    const batch = payables.slice(offset, offset + 200);
    const supplierIds = [...new Set(batch.map((item) => item.supplier_id).filter((id): id is string => Boolean(id)))];
    const suppliersResult = supplierIds.length
      ? await supabase.from("suppliers").select("id, name").eq("store_id", storeId).in("id", supplierIds)
      : { data: [], error: null };
    if (suppliersResult.error) return null;
    const suppliers = new Map(suppliersResult.data.map((item) => [item.id, item.name]));
    for (const item of batch) rows.push([
      "A pagar",
      item.description,
      item.due_on,
      item.supplier_id ? suppliers.get(item.supplier_id) ?? "Fornecedor" : "Loja",
      money(item.original_cents),
      money(item.remaining_cents),
    ]);
  }
  return csvResponse(`saldos-${period.from}-${period.to}.csv`, rows);
}

export async function GET(request: Request) {
  const context = await getUserContext();
  if (!context) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  if (!type || !["receipts", "expenses", "balances"].includes(type)) {
    return Response.json({ error: "invalid_export_type" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const period = getExportPeriod(params, context.store.timezone);
  if (!period) return Response.json({ error: "invalid_period" }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const response = type === "receipts"
    ? await exportReceipts(context.store.id, context.store.timezone, period)
    : type === "expenses"
      ? await exportExpenses(context.store.id, context.store.timezone, period)
      : await exportBalances(context.store.id, period);
  return response ?? Response.json({ error: "export_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
