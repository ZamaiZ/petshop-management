import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { getSupabasePublicEnv } from "./env";

export function createAdminClient() {
  const { url } = getSupabasePublicEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Supabase server secret is missing.");
  }

  return createSupabaseClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
