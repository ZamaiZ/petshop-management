import type { Metadata } from "next";
import { StoreDirectory } from "@/features/platform-admin/components/store-directory";
import type { PlatformStore } from "@/features/platform-admin/components/store-directory";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pet shops · Administração" };

export default async function PlatformStoresPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_admin_list_stores");
  return <StoreDirectory stores={(error ? [] : data ?? []) as PlatformStore[]} loadError={Boolean(error)} />;
}
