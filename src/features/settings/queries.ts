import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function getSettingsCatalog(storeId: string) {
  const supabase = await createClient();
  const [servicesResult, suppliersResult] = await Promise.all([
    supabase.from("services").select("id, name, price_cents, duration_minutes, archived_at").eq("store_id", storeId).order("name").limit(1000),
    supabase.from("suppliers").select("id, name, cnpj, phone, email, address, notes, archived_at").eq("store_id", storeId).order("name").limit(1000),
  ]);
  if (servicesResult.error || suppliersResult.error) return { data: null, error: "Não foi possível carregar serviços e fornecedores." };
  return { data: { services: servicesResult.data, suppliers: suppliersResult.data }, error: null };
}
