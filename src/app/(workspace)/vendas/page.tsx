import type { Metadata } from "next";
import { getSaleComposerData, getSalesOverview } from "@/features/sales/queries";
import { SalesLoadError, SalesView } from "@/features/sales/components/sales-view";
import { requireUserContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Vendas" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const context = await requireUserContext();
  const newSaleOpen = params.nova === "1";
  const [result, composerResult] = await Promise.all([
    getSalesOverview(context.store.id),
    newSaleOpen ? getSaleComposerData(context.store.id, context.store.timezone) : Promise.resolve(null),
  ]);
  if (!result.data) return <SalesLoadError message={result.error ?? "Tente novamente."} />;
  return <SalesView overview={result.data} timezone={context.store.timezone} composerData={composerResult?.data ?? null} composerError={composerResult?.error ?? null} newSaleOpen={newSaleOpen} initialDelivery={params.entrega === "1"} />;
}
