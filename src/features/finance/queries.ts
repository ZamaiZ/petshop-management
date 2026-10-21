import "server-only";

import { createClient } from "@/lib/supabase/server";
import { dateKeyAtTimeZone, localDayRange } from "@/lib/date";

async function readPages<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const result = await load(from, from + 999);
    if (result.error) return { rows: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) return { rows, error: null };
  }
  return { rows: null, error: { message: "maximum_page_count" } };
}

export type FinanceReceivable = {
  id: string;
  customer_id: string;
  customer: string;
  sale_id: string;
  sale_number: number;
  original_cents: number;
  remaining_cents: number;
  due_on: string | null;
};

export type FinancePayable = {
  id: string;
  description: string;
  supplier: string | null;
  category: string | null;
  due_on: string;
  original_cents: number;
  remaining_cents: number;
};

export type FinanceOverview = {
  receivedTodayCents: number;
  receivableTotalCents: number;
  payableTotalCents: number;
  expensesTodayCents: number;
  receivables: FinanceReceivable[];
  payables: FinancePayable[];
  cashSession: {
    id: string;
    opened_at: string;
    opening_cents: number;
    expected_cents: number;
  } | null;
  cashMovements: { id: string; kind: string; reason: string; amount_cents: number; occurred_at: string }[];
  closedSessions: { id: string; opened_at: string; closed_at: string; expected_cents: number; counted_cents: number; difference_cents: number }[];
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
};

export async function getFinanceOverview(storeId: string, timezone: string) {
  const supabase = await createClient();
  const today = dateKeyAtTimeZone(new Date(), timezone);
  const range = localDayRange(today, timezone);
  const [paymentsResult, receivablesResult, payablesResult, currentSessionResult, closedSessionsResult, expensePaymentsResult, categoriesResult, suppliersResult] = await Promise.all([
    readPages((from, to) => supabase.from("payments").select("amount_cents").eq("store_id", storeId).gte("received_at", range.start).lt("received_at", range.end).order("received_at", { ascending: true }).range(from, to)),
    readPages((from, to) => supabase.from("receivables").select("id, customer_id, sale_id, original_cents, remaining_cents, due_on").eq("store_id", storeId).eq("status", "open").order("due_on", { ascending: true }).range(from, to)),
    readPages((from, to) => supabase.from("payables").select("id, description, supplier_id, category_id, due_on, original_cents, remaining_cents").eq("store_id", storeId).eq("status", "open").order("due_on", { ascending: true }).range(from, to)),
    supabase.from("cash_sessions").select("id, opened_at, opening_cents").eq("store_id", storeId).eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("cash_sessions").select("id, opened_at, closed_at, expected_cents, counted_cents, difference_cents").eq("store_id", storeId).eq("status", "closed").order("closed_at", { ascending: false }).limit(10),
    readPages((from, to) => supabase.from("payable_payments").select("amount_cents").eq("store_id", storeId).gte("paid_at", range.start).lt("paid_at", range.end).order("paid_at", { ascending: true }).range(from, to)),
    supabase.from("expense_categories").select("id, name").eq("store_id", storeId).is("archived_at", null).order("name"),
    supabase.from("suppliers").select("id, name").eq("store_id", storeId).is("archived_at", null).order("name"),
  ]);
  if (paymentsResult.error || receivablesResult.error || payablesResult.error || currentSessionResult.error || closedSessionsResult.error || expensePaymentsResult.error || categoriesResult.error || suppliersResult.error || !paymentsResult.rows || !receivablesResult.rows || !payablesResult.rows || !expensePaymentsResult.rows) {
    return { data: null, error: "Não foi possível carregar os dados financeiros." };
  }

  const customerIds = [...new Set(receivablesResult.rows.map((item) => item.customer_id))];
  const saleIds = [...new Set(receivablesResult.rows.map((item) => item.sale_id))];
  const supplierIds = [...new Set(payablesResult.rows.map((item) => item.supplier_id).filter((id): id is string => Boolean(id)))];
  const categoryIds = [...new Set(payablesResult.rows.map((item) => item.category_id).filter((id): id is string => Boolean(id)))];
  const [customersResult, salesResult, suppliersUsedResult, categoriesUsedResult] = await Promise.all([
    customerIds.length ? supabase.from("customers").select("id, name").eq("store_id", storeId).in("id", customerIds) : Promise.resolve({ data: [], error: null }),
    saleIds.length ? supabase.from("sales").select("id, number").eq("store_id", storeId).in("id", saleIds) : Promise.resolve({ data: [], error: null }),
    supplierIds.length ? supabase.from("suppliers").select("id, name").eq("store_id", storeId).in("id", supplierIds) : Promise.resolve({ data: [], error: null }),
    categoryIds.length ? supabase.from("expense_categories").select("id, name").eq("store_id", storeId).in("id", categoryIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (customersResult.error || salesResult.error || suppliersUsedResult.error || categoriesUsedResult.error) return { data: null, error: "Não foi possível carregar os nomes das contas." };

  const customers = new Map(customersResult.data.map((row) => [row.id, row.name]));
  const sales = new Map(salesResult.data.map((row) => [row.id, row.number]));
  const suppliers = new Map(suppliersUsedResult.data.map((row) => [row.id, row.name]));
  const categories = new Map(categoriesUsedResult.data.map((row) => [row.id, row.name]));
  let cashSession: FinanceOverview["cashSession"] = null;
  let cashMovements: FinanceOverview["cashMovements"] = [];
  if (currentSessionResult.data) {
    const movementsResult = await readPages((from, to) => supabase.from("cash_movements").select("id, kind, reason, amount_cents, occurred_at").eq("store_id", storeId).eq("cash_session_id", currentSessionResult.data.id).order("occurred_at", { ascending: true }).range(from, to));
    if (movementsResult.error || !movementsResult.rows) return { data: null, error: "Falha ao carregar os movimentos do caixa." };
    cashMovements = movementsResult.rows;
    cashSession = {
      ...currentSessionResult.data,
      expected_cents: currentSessionResult.data.opening_cents + movementsResult.rows.reduce((sum, movement) => sum + movement.amount_cents, 0),
    };
  }

  return {
    data: {
      receivedTodayCents: paymentsResult.rows.reduce((sum, payment) => sum + payment.amount_cents, 0),
      receivableTotalCents: receivablesResult.rows.reduce((sum, item) => sum + item.remaining_cents, 0),
      payableTotalCents: payablesResult.rows.reduce((sum, item) => sum + item.remaining_cents, 0),
      expensesTodayCents: expensePaymentsResult.rows.reduce((sum, payment) => sum + payment.amount_cents, 0),
      receivables: receivablesResult.rows.map((item) => ({ ...item, customer: customers.get(item.customer_id) ?? "Cliente", sale_number: sales.get(item.sale_id) ?? 0 })),
      payables: payablesResult.rows.map((item) => ({ ...item, supplier: item.supplier_id ? suppliers.get(item.supplier_id) ?? null : null, category: item.category_id ? categories.get(item.category_id) ?? null : null })),
      cashSession,
      cashMovements,
      closedSessions: closedSessionsResult.data.filter((session) => session.closed_at && session.expected_cents !== null && session.counted_cents !== null && session.difference_cents !== null).map((session) => ({
        id: session.id,
        opened_at: session.opened_at,
        closed_at: session.closed_at!,
        expected_cents: session.expected_cents!,
        counted_cents: session.counted_cents!,
        difference_cents: session.difference_cents!,
      })),
      categories: categoriesResult.data,
      suppliers: suppliersResult.data,
    } satisfies FinanceOverview,
    error: null,
  };
}
