import type { Metadata } from "next";
import { SettingsView } from "@/features/settings/components/settings-view";
import { requireUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const context = await requireUserContext();
  const supabase = await createClient();
  const logoResult = context.store.logo_path ? await supabase.storage.from("store-assets").createSignedUrl(context.store.logo_path, 60 * 60 * 24) : null;
  return <SettingsView store={context.store} logoUrl={logoResult?.data?.signedUrl ?? null} />;
}
