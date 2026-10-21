import type { Metadata } from "next";
import { InventoryLoadError, InventoryView } from "@/features/inventory/components/inventory-view";
import { getInventoryOverview } from "@/features/inventory/queries";
import { requireUserContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Estoque" };

export default async function InventoryPage() {
  const context = await requireUserContext();
  const result = await getInventoryOverview(context.store.id);
  if (!result.data) return <InventoryLoadError message={result.error ?? "Tente novamente."} />;
  return <InventoryView overview={result.data} />;
}
