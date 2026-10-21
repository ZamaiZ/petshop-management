import "server-only";

import { createClient } from "@/lib/supabase/server";
import { dashboardOverviewSchema } from "./schema";

export async function getDashboardOverview(storeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_overview", { p_store: storeId });

  if (error) return { data: null, error: "Não foi possível carregar os dados da loja." };
  const parsed = dashboardOverviewSchema.safeParse(data);
  if (!parsed.success) return { data: null, error: "A resposta do dashboard está incompleta." };

  return { data: parsed.data, error: null };
}
