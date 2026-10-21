import "server-only";

import { createClient } from "@/lib/supabase/server";

export type SupplierAddress = {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  postal_code?: string | null;
  city?: string | null;
  state?: string | null;
  reference?: string | null;
};

export type SupplierRecord = {
  id: string;
  name: string;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: SupplierAddress | null;
  notes: string | null;
  archived_at: string | null;
};

export async function getSuppliersOverview(storeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, cnpj, phone, email, address, notes, archived_at")
    .eq("store_id", storeId)
    .order("name")
    .limit(1000);
  if (error) return { data: null, error: "Não foi possível carregar os fornecedores." };
  return { data: data as SupplierRecord[], error: null };
}
