import "server-only";

import { cache } from "react";
import { io } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const getUserContext = cache(async () => {
  await io();
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("store_memberships")
    .select("store_id")
    .eq("user_id", authData.user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) return null;

  const [storeResult, preferencesResult] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, phone, email, address, timezone, logo_path")
      .eq("id", membership.store_id)
      .is("archived_at", null)
      .single(),
    supabase
      .from("user_preferences")
      .select("theme, sidebar_collapsed")
      .eq("user_id", authData.user.id)
      .maybeSingle(),
  ]);

  if (storeResult.error || !storeResult.data) return null;

  return {
    user: authData.user,
    store: storeResult.data,
    preferences: preferencesResult.data ?? { theme: "system" as const, sidebar_collapsed: false },
  };
});

export async function requireUserContext() {
  const context = await getUserContext();
  if (!context) redirect("/login");
  return context;
}
