import type { Metadata } from "next";
import { SalesLoadError, SalesView } from "@/features/sales/components/sales-view";
import { getSalesOverview } from "@/features/sales/queries";
import { requireUserContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Vendas" };

export default async function SalesPage() {
  const context = await requireUserContext();
  const result = await getSalesOverview(context.store.id);
  if (!result.data) return <SalesLoadError message={result.error ?? "Tente novamente."} />;
  return <SalesView overview={result.data} timezone={context.store.timezone} />;
}
