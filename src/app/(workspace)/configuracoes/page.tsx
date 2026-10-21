import type { Metadata } from "next";
import { SettingsView } from "@/features/settings/components/settings-view";
import { requireUserContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const context = await requireUserContext();
  return <SettingsView store={context.store} logoUrl={context.store.logo_path ? "/api/store/logo" : null} />;
}
