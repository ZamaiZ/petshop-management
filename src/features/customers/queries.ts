import "server-only";

import { createClient } from "@/lib/supabase/server";

export type CustomerRecord = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  pets: { id: string; name: string; species: string; breed: string | null }[];
  addresses: { id: string; label: string | null; street: string; number: string | null; complement: string | null; district: string | null; city: string; state: string | null; postal_code: string | null; reference: string | null }[];
  recent_sales: { id: string; number: number; total_cents: number; completed_at: string | null; status: string }[];
  last_sale: { number: number; total_cents: number; completed_at: string | null } | null;
  balance_cents: number;
};

export async function getCustomers(storeId: string) {
  const supabase = await createClient();
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name, phone, email, notes, created_at")
    .eq("store_id", storeId)
    .is("archived_at", null)
    .order("name", { ascending: true })
    .limit(500);

  if (error) return { data: null, error: "Não foi possível carregar os clientes." };
  if (!customers?.length) return { data: [] as CustomerRecord[], error: null };

  const customerIds = customers.map((customer) => customer.id);
  const [petsResult, addressesResult, salesResult, receivablesResult] = await Promise.all([
    supabase
      .from("pets")
      .select("id, customer_id, name, species, breed")
      .eq("store_id", storeId)
      .in("customer_id", customerIds)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("customer_addresses")
      .select("id, customer_id, label, street, number, complement, district, city, state, postal_code, reference")
      .eq("store_id", storeId)
      .in("customer_id", customerIds)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .limit(2000),
    supabase
      .from("sales")
      .select("id, number, customer_id, total_cents, completed_at, status")
      .eq("store_id", storeId)
      .in("customer_id", customerIds)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1000),
    supabase
      .from("receivables")
      .select("id, customer_id, sale_id, remaining_cents, due_on")
      .eq("store_id", storeId)
      .eq("status", "open")
      .in("customer_id", customerIds),
  ]);

  if (petsResult.error || addressesResult.error || salesResult.error || receivablesResult.error) {
    return { data: null, error: "Não foi possível carregar o perfil completo dos clientes." };
  }

  const petsByCustomer = new Map<string, CustomerRecord["pets"]>();
  for (const pet of petsResult.data) {
    const rows = petsByCustomer.get(pet.customer_id) ?? [];
    rows.push({ id: pet.id, name: pet.name, species: pet.species, breed: pet.breed });
    petsByCustomer.set(pet.customer_id, rows);
  }

  const addressesByCustomer = new Map<string, CustomerRecord["addresses"]>();
  for (const address of addressesResult.data) {
    const rows = addressesByCustomer.get(address.customer_id) ?? [];
    rows.push({ id: address.id, label: address.label, street: address.street, number: address.number, complement: address.complement, district: address.district, city: address.city, state: address.state, postal_code: address.postal_code, reference: address.reference });
    addressesByCustomer.set(address.customer_id, rows);
  }

  const salesByCustomer = new Map<string, CustomerRecord["recent_sales"]>();
  for (const sale of salesResult.data) {
    if (!sale.customer_id) continue;
    const rows = salesByCustomer.get(sale.customer_id) ?? [];
    if (rows.length < 5) rows.push({ id: sale.id, number: sale.number, total_cents: sale.total_cents, completed_at: sale.completed_at, status: sale.status });
    salesByCustomer.set(sale.customer_id, rows);
  }

  const lastSaleByCustomer = new Map<string, NonNullable<CustomerRecord["last_sale"]>>();
  for (const sale of salesResult.data) {
    if (sale.customer_id && !lastSaleByCustomer.has(sale.customer_id)) {
      lastSaleByCustomer.set(sale.customer_id, {
        number: sale.number,
        total_cents: sale.total_cents,
        completed_at: sale.completed_at,
      });
    }
  }

  const balanceByCustomer = new Map<string, number>();
  for (const receivable of receivablesResult.data) {
    balanceByCustomer.set(
      receivable.customer_id,
      (balanceByCustomer.get(receivable.customer_id) ?? 0) + receivable.remaining_cents,
    );
  }

  return {
    data: customers.map((customer) => ({
      ...customer,
      pets: petsByCustomer.get(customer.id) ?? [],
      addresses: addressesByCustomer.get(customer.id) ?? [],
      recent_sales: salesByCustomer.get(customer.id) ?? [],
      last_sale: lastSaleByCustomer.get(customer.id) ?? null,
      balance_cents: balanceByCustomer.get(customer.id) ?? 0,
    })),
    error: null,
  };
}
