"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.generated";
import { getSupabasePublicEnv } from "./env";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  if (!browserClient) {
    const { url, key } = getSupabasePublicEnv();
    browserClient = createBrowserClient<Database>(url, key);
  }

  return browserClient;
}
