import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.generated";

type AddressSnapshot = { label?: string; street?: string; number?: string; complement?: string; district?: string; city?: string; state?: string; postal_code?: string; reference?: string };

function addressObject(value: Json): AddressSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as unknown as AddressSnapshot;
}

type DeliveryMethod = "cash" | "pix" | "debit_card" | "credit_card";

export type DeliveryRecord = {
  id: string;
  sale_id: string;
  sale_number: number;
  customer_id: string;
  customer: string;
  phone: string | null;
  address: AddressSnapshot;
  fee_cents: number;
  total_cents: number;
  sale_status: "completed" | "partially_refunded" | "refunded" | "cancelled";
  status: "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";
  cancellation_reason: string | null;
  position: number;
  version: number;
  created_at: string;
  delivered_at: string | null;
  items: string;
  payment_methods: DeliveryMethod[];
  receivable_id: string | null;
  remaining_cents: number;
};

export type DeliveryOverview = { deliveries: DeliveryRecord[]; cashSessionId: string | null };

async function getAllPages<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const result = await load(from, from + 999);
    if (result.error) return { rows: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) return { rows, error: null };
  }
  return { rows: null, error: { message: "maximum_page_count" } };
}

export async function getDeliveryOverview(storeId: string) {
  const supabase = await createClient();
  const [activeDeliveriesResult, recentClosedResult, cashResult] = await Promise.all([
    getAllPages((from, to) => supabase.from("deliveries").select("id, sale_id, customer_id, address_snapshot, fee_cents, status, position, version, created_at, delivered_at").eq("store_id", storeId).in("status", ["preparing", "ready", "out_for_delivery"]).order("status").order("position").order("created_at", { ascending: true }).range(from, to)),
    supabase.from("deliveries").select("id, sale_id, customer_id, address_snapshot, fee_cents, status, position, version, created_at, delivered_at").eq("store_id", storeId).in("status", ["delivered", "cancelled"]).order("created_at", { ascending: false }).limit(200),
    supabase.from("cash_sessions").select("id").eq("store_id", storeId).eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (activeDeliveriesResult.error || !activeDeliveriesResult.rows || recentClosedResult.error || cashResult.error) return { data: null, error: "Não foi possível carregar as entregas." };
  const deliveryRows = [...activeDeliveriesResult.rows, ...(recentClosedResult.data ?? [])];
  if (!deliveryRows.length) return { data: { deliveries: [], cashSessionId: cashResult.data?.id ?? null } satisfies DeliveryOverview, error: null };
  const saleIds = [...new Set(deliveryRows.map((delivery) => delivery.sale_id))];
  const customerIds = [...new Set(deliveryRows.map((delivery) => delivery.customer_id))];
  const [salesResult, customersResult, itemRows, paymentRows, receivablesResult, eventsResult] = await Promise.all([
    supabase.from("sales").select("id, number, total_cents, status").eq("store_id", storeId).in("id", saleIds),
    supabase.from("customers").select("id, name, phone").eq("store_id", storeId).in("id", customerIds),
    getAllPages((from, to) => supabase.from("sale_items").select("sale_id, description, quantity, unit").eq("store_id", storeId).in("sale_id", saleIds).order("created_at").range(from, to)),
    getAllPages((from, to) => supabase.from("payments").select("sale_id, method").eq("store_id", storeId).in("sale_id", saleIds).order("received_at").range(from, to)),
    supabase.from("receivables").select("id, sale_id, remaining_cents, status").eq("store_id", storeId).in("sale_id", saleIds),
    supabase.from("delivery_events").select("delivery_id, reason").eq("store_id", storeId).eq("to_status", "cancelled").in("delivery_id", deliveryRows.map((delivery) => delivery.id)).order("created_at", { ascending: false }),
  ]);
  if (salesResult.error || customersResult.error || itemRows.error || paymentRows.error || receivablesResult.error || eventsResult.error || !itemRows.rows || !paymentRows.rows) {
    return { data: null, error: "Não foi possível carregar pedidos, pagamentos e saldos das entregas." };
  }
  const sales = new Map(salesResult.data.map((sale) => [sale.id, sale]));
  const customers = new Map(customersResult.data.map((customer) => [customer.id, customer]));
  const itemsBySale = new Map<string, string[]>();
  for (const item of itemRows.rows) {
    const labels = itemsBySale.get(item.sale_id) ?? [];
    labels.push(`${item.description} · ${item.quantity} ${item.unit}`);
    itemsBySale.set(item.sale_id, labels);
  }
  const methodsBySale = new Map<string, DeliveryMethod[]>();
  for (const payment of paymentRows.rows) {
    const methods = methodsBySale.get(payment.sale_id) ?? [];
    if (["cash", "pix", "debit_card", "credit_card"].includes(payment.method) && !methods.includes(payment.method as DeliveryMethod)) methods.push(payment.method as DeliveryMethod);
    methodsBySale.set(payment.sale_id, methods);
  }
  const receivableBySale = new Map(receivablesResult.data.map((receivable) => [receivable.sale_id, receivable.status === "open" ? receivable : null]));
  const cancellationReason = new Map<string, string | null>();
  for (const event of eventsResult.data) if (!cancellationReason.has(event.delivery_id)) cancellationReason.set(event.delivery_id, event.reason);

  return {
    data: {
      deliveries: deliveryRows.map((delivery) => {
        const sale = sales.get(delivery.sale_id);
        const customer = customers.get(delivery.customer_id);
        const receivable = receivableBySale.get(delivery.sale_id);
        return {
          id: delivery.id,
          sale_id: delivery.sale_id,
          sale_number: sale?.number ?? 0,
          customer_id: delivery.customer_id,
          customer: customer?.name ?? "Cliente",
          phone: customer?.phone ?? null,
          address: addressObject(delivery.address_snapshot),
          fee_cents: delivery.fee_cents,
          total_cents: sale?.total_cents ?? delivery.fee_cents,
          sale_status: sale?.status === "cancelled" ? "cancelled" : sale?.status === "refunded" ? "refunded" : sale?.status === "partially_refunded" ? "partially_refunded" : "completed",
          status: delivery.status,
          cancellation_reason: cancellationReason.get(delivery.id) ?? null,
          position: delivery.position,
          version: delivery.version,
          created_at: delivery.created_at,
          delivered_at: delivery.delivered_at,
          items: (itemsBySale.get(delivery.sale_id) ?? []).join(", "),
          payment_methods: methodsBySale.get(delivery.sale_id) ?? [],
          receivable_id: receivable?.id ?? null,
          remaining_cents: receivable?.remaining_cents ?? 0,
        } satisfies DeliveryRecord;
      }),
      cashSessionId: cashResult.data?.id ?? null,
    } satisfies DeliveryOverview,
    error: null,
  };
}
