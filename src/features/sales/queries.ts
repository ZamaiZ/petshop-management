import "server-only";

import { quantityPrecision } from "@/lib/business-rules";
import { createClient } from "@/lib/supabase/server";
import { dashboardOverviewSchema } from "@/features/dashboard/schema";
import { dateKeyAtTimeZone } from "@/lib/date";

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

async function readPages<T>(load: (from: number, to: number) => PromiseLike<PageResult<T>>) {
  const rows: T[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const result = await load(from, from + 999);
    if (result.error) return { rows: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) return { rows, error: null };
  }
  return { rows, error: { message: "maximum_page_count" } };
}

export type SaleRecord = {
  id: string;
  number: number;
  customer_id: string | null;
  customer: string;
  cancellation_reason: string | null;
  status: "draft" | "completed" | "partially_refunded" | "refunded" | "cancelled";
  created_at: string;
  completed_at: string | null;
  subtotal_cents: number;
  discount_cents: number;
  delivery_fee_cents: number;
  has_delivery: boolean;
  delivery_status: string | null;
  total_cents: number;
  paid_cents: number;
  receivable_cents: number;
  payment_methods: string[];
  payments: { method: string; amount_cents: number; tendered_cents: number | null; change_cents: number | null }[];
  items: { id: string; product_id: string | null; description: string; quantity: number; returned_quantity: number; returnable_quantity: number; unit: string; line_total_cents: number }[];
};

export type SalesOverview = {
  todaySalesCents: number;
  todayCount: number;
  averageTicketCents: number;
  openReceivablesCount: number;
  cashSessionId: string | null;
  sales: SaleRecord[];
};

async function getSalesRows(storeId: string) {
  const supabase = await createClient();
  const salesResult = await supabase.from("sales")
    .select("id, number, customer_id, status, cancellation_reason, created_at, completed_at, subtotal_cents, discount_cents, delivery_fee_cents, total_cents")
    .eq("store_id", storeId)
    .neq("status", "draft")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  if (salesResult.error) return { rows: null, error: "Não foi possível carregar o histórico de vendas." };
  if (!salesResult.data.length) return { rows: [] as SaleRecord[], error: null };

  const saleIds = salesResult.data.map((sale) => sale.id);
  const customerIds = [...new Set(salesResult.data.map((sale) => sale.customer_id).filter((id): id is string => Boolean(id)))];
  const [customersResult, receivablesResult, itemsResult, paymentsResult, returnsResult, deliveriesResult] = await Promise.all([
    customerIds.length ? supabase.from("customers").select("id, name").eq("store_id", storeId).in("id", customerIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("receivables").select("sale_id, remaining_cents, status").eq("store_id", storeId).in("sale_id", saleIds),
    readPages((from, to) => supabase.from("sale_items").select("id, sale_id, product_id, description, quantity, unit, line_total_cents").eq("store_id", storeId).in("sale_id", saleIds).order("created_at").range(from, to)),
    readPages((from, to) => supabase.from("payments").select("sale_id, method, amount_cents, tendered_cents, change_cents").eq("store_id", storeId).in("sale_id", saleIds).order("received_at").range(from, to)),
    readPages((from, to) => supabase.from("sale_return_items").select("sale_id, sale_item_id, quantity").eq("store_id", storeId).in("sale_id", saleIds).order("created_at").range(from, to)),
    supabase.from("deliveries").select("sale_id, status").eq("store_id", storeId).in("sale_id", saleIds),
  ]);
  if (customersResult.error || receivablesResult.error || itemsResult.error || paymentsResult.error || returnsResult.error || deliveriesResult.error || !itemsResult.rows || !paymentsResult.rows || !returnsResult.rows) {
    return { rows: null, error: "Não foi possível carregar os itens e pagamentos das vendas." };
  }

  const customerNames = new Map(customersResult.data.map((customer) => [customer.id, customer.name]));
  const deliveryBySale = new Map(deliveriesResult.data.map((delivery) => [delivery.sale_id, delivery.status]));
  const balanceBySale = new Map(receivablesResult.data.map((receivable) => [receivable.sale_id, receivable.status === "open" ? receivable.remaining_cents : 0]));
  const itemsBySale = new Map<string, SaleRecord["items"]>();
  const returnedByItem = new Map<string, number>();
  for (const returned of returnsResult.rows) returnedByItem.set(returned.sale_item_id, (returnedByItem.get(returned.sale_item_id) ?? 0) + returned.quantity);
  for (const item of itemsResult.rows) {
    const current = itemsBySale.get(item.sale_id) ?? [];
    const returnedQuantity = returnedByItem.get(item.id) ?? 0;
    current.push({ id: item.id, product_id: item.product_id, description: item.description, quantity: item.quantity, returned_quantity: returnedQuantity, returnable_quantity: Math.max(0, item.quantity - returnedQuantity), unit: item.unit, line_total_cents: item.line_total_cents });
    itemsBySale.set(item.sale_id, current);
  }
  const paidBySale = new Map<string, number>();
  const methodsBySale = new Map<string, Set<string>>();
  const paymentsBySale = new Map<string, SaleRecord["payments"]>();
  for (const payment of paymentsResult.rows) {
    paidBySale.set(payment.sale_id, (paidBySale.get(payment.sale_id) ?? 0) + payment.amount_cents);
    const methods = methodsBySale.get(payment.sale_id) ?? new Set<string>();
    methods.add(payment.method);
    methodsBySale.set(payment.sale_id, methods);
    const payments = paymentsBySale.get(payment.sale_id) ?? [];
    payments.push({ method: payment.method, amount_cents: payment.amount_cents, tendered_cents: payment.tendered_cents, change_cents: payment.change_cents });
    paymentsBySale.set(payment.sale_id, payments);
  }

  return {
    rows: salesResult.data.map((sale) => ({
      ...sale,
      customer: sale.customer_id ? customerNames.get(sale.customer_id) ?? "Cliente" : "Cliente avulso",
      has_delivery: deliveryBySale.has(sale.id),
      delivery_status: deliveryBySale.get(sale.id) ?? null,
      paid_cents: paidBySale.get(sale.id) ?? 0,
      receivable_cents: balanceBySale.get(sale.id) ?? 0,
      payment_methods: [...(methodsBySale.get(sale.id) ?? new Set<string>())],
      payments: paymentsBySale.get(sale.id) ?? [],
      items: itemsBySale.get(sale.id) ?? [],
    } satisfies SaleRecord)),
    error: null,
  };
}

export async function getSalesOverview(storeId: string) {
  const supabase = await createClient();
  const [salesResult, summaryResult, receivablesCountResult, cashResult] = await Promise.all([
    getSalesRows(storeId),
    supabase.rpc("dashboard_overview", { p_store: storeId }),
    supabase.from("receivables").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "open"),
    supabase.from("cash_sessions").select("id").eq("store_id", storeId).eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (salesResult.error || summaryResult.error || receivablesCountResult.error || cashResult.error) {
    return { data: null, error: salesResult.error ?? "Não foi possível calcular os indicadores de vendas." };
  }
  const summary = dashboardOverviewSchema.safeParse(summaryResult.data);
  if (!summary.success) return { data: null, error: "Os indicadores de vendas estão incompletos." };
  const todaySalesCents = summary.data.today_sales_cents;
  const todayCount = summary.data.today_sales_count;
  return {
    data: {
      todaySalesCents,
      todayCount,
      averageTicketCents: todayCount ? Math.round(todaySalesCents / todayCount) : 0,
      openReceivablesCount: receivablesCountResult.count ?? 0,
      cashSessionId: cashResult.data?.id ?? null,
      sales: salesResult.rows ?? [],
    } satisfies SalesOverview,
    error: null,
  };
}

export async function getSaleComposerData(storeId: string, timezone: string) {
  const supabase = await createClient();
  const [productsResult, servicesResult, categoriesResult, customersResult, cashResult, appointmentResult] = await Promise.all([
    supabase.from("products").select("id, name, barcode, sku, unit, sale_price_cents, category_id, track_lots").eq("store_id", storeId).is("archived_at", null).order("name").limit(1000),
    supabase.from("services").select("id, name, price_cents, duration_minutes").eq("store_id", storeId).is("archived_at", null).order("name").limit(500),
    supabase.from("categories").select("id, name").eq("store_id", storeId).is("archived_at", null).order("name").limit(500),
    supabase.from("customers").select("id, name, phone").eq("store_id", storeId).is("archived_at", null).order("name").limit(1000),
    supabase.from("cash_sessions").select("id").eq("store_id", storeId).eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("appointments").select("id, customer_id, pet_id, service_id, starts_at, price_cents, status").eq("store_id", storeId).is("sale_id", null).in("status", ["ready", "delivered"]).order("starts_at", { ascending: false }).limit(500),
  ]);
  if (productsResult.error || servicesResult.error || categoriesResult.error || customersResult.error || cashResult.error || appointmentResult.error) {
    return { data: null, error: "Não foi possível carregar o catálogo para a venda." };
  }
  const productIds = productsResult.data.map((product) => product.id);
  const customerIds = customersResult.data.map((customer) => customer.id);
  const appointmentCustomerIds = [...new Set(appointmentResult.data.map((appointment) => appointment.customer_id))];
  const addressCustomerIds = [...new Set([...customerIds, ...appointmentCustomerIds])];
  const [balancesResult, addressesResult, appointmentPetsResult, packagingsResult, lotsResult] = await Promise.all([
    productIds.length ? supabase.from("inventory_balances").select("product_id, quantity").eq("store_id", storeId).in("product_id", productIds) : Promise.resolve({ data: [], error: null }),
    addressCustomerIds.length ? supabase.from("customer_addresses").select("id, customer_id, label, street, number, complement, district, city, state, postal_code, reference").eq("store_id", storeId).in("customer_id", addressCustomerIds).is("archived_at", null).order("created_at", { ascending: true }).limit(2000) : Promise.resolve({ data: [], error: null }),
    appointmentResult.data.length ? supabase.from("pets").select("id, name").eq("store_id", storeId).in("id", [...new Set(appointmentResult.data.map((appointment) => appointment.pet_id))]) : Promise.resolve({ data: [], error: null }),
    productIds.length ? supabase.from("product_packagings").select("id, product_id, label, barcode, base_quantity").eq("store_id", storeId).in("product_id", productIds).order("label") : Promise.resolve({ data: [], error: null }),
    productIds.length ? readPages((from, to) => supabase.from("inventory_lots").select("product_id, quantity, expires_on").eq("store_id", storeId).in("product_id", productIds).order("product_id").order("created_at").range(from, to)) : Promise.resolve({ rows: [], error: null }),
  ]);
  if (balancesResult.error || addressesResult.error || appointmentPetsResult.error || packagingsResult.error || lotsResult.error || !lotsResult.rows) return { data: null, error: "Não foi possível carregar os saldos e endereços." };
  const balances = new Map(balancesResult.data.map((balance) => [balance.product_id, balance.quantity]));
  const petNames = new Map(appointmentPetsResult.data.map((pet) => [pet.id, pet.name]));
  const today = dateKeyAtTimeZone(new Date(), timezone);
  const sellableLotQuantity = new Map<string, number>();
  for (const lot of lotsResult.rows) if (lot.expires_on === null || lot.expires_on >= today) sellableLotQuantity.set(lot.product_id, (sellableLotQuantity.get(lot.product_id) ?? 0) + lot.quantity);
  const packagingsByProduct = new Map<string, { id: string; label: string; barcode: string | null; base_quantity: number }[]>();
  for (const packaging of packagingsResult.data) {
    const rows = packagingsByProduct.get(packaging.product_id) ?? [];
    rows.push({ id: packaging.id, label: packaging.label, barcode: packaging.barcode, base_quantity: packaging.base_quantity });
    packagingsByProduct.set(packaging.product_id, rows);
  }
  return {
    data: {
      products: productsResult.data.map((product) => ({ ...product, unit_precision: quantityPrecision(product.unit), quantity: product.track_lots ? sellableLotQuantity.get(product.id) ?? 0 : balances.get(product.id) ?? 0, packagings: packagingsByProduct.get(product.id) ?? [] })),
      services: servicesResult.data,
      categories: categoriesResult.data,
      customers: customersResult.data,
      addresses: addressesResult.data,
      appointments: appointmentResult.data.map((appointment) => ({ ...appointment, pet: petNames.get(appointment.pet_id) ?? "Pet" })),
      cashSessionId: cashResult.data?.id ?? null,
    },
    error: null,
  };
}
