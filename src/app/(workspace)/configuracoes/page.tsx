import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SettingsView } from "@/features/settings/components/settings-view";
import { getSettingsCatalog } from "@/features/settings/queries";
import { requireUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const context = await requireUserContext();
  const [catalog, supabase] = await Promise.all([getSettingsCatalog(context.store.id), createClient()]);
  if (!catalog.data) return <Alert variant="destructive"><AlertTitle>Falha ao carregar configurações</AlertTitle><AlertDescription>{catalog.error}</AlertDescription></Alert>;
  const logoResult = context.store.logo_path ? await supabase.storage.from("store-assets").createSignedUrl(context.store.logo_path, 60 * 60 * 24) : null;
  return <SettingsView store={context.store} logoUrl={logoResult?.data?.signedUrl ?? null} catalog={catalog.data} />;
}
