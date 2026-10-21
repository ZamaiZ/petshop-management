import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ServiceRecord = {
  id: string;
  name: string;
  price_cents: number;
  duration_minutes: number;
  archived_at: string | null;
};

export async function getServicesOverview(storeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, name, price_cents, duration_minutes, archived_at")
    .eq("store_id", storeId)
    .order("name")
    .limit(1000);
  if (error) return { data: null, error: "Não foi possível carregar os serviços." };
  return { data: data as ServiceRecord[], error: null };
}
