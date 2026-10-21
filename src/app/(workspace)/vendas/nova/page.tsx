import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SaleComposer } from "@/features/sales/components/sale-composer";
import { getSaleComposerData } from "@/features/sales/queries";
import { requireUserContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Nova venda" };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [context, params] = await Promise.all([requireUserContext(), searchParams]);
  const result = await getSaleComposerData(context.store.id, context.store.timezone);
  if (!result.data) return <Alert variant="destructive"><AlertTitle>Falha ao carregar o catálogo</AlertTitle><AlertDescription>{result.error}</AlertDescription></Alert>;
  return <SaleComposer data={result.data} timezone={context.store.timezone} initialDelivery={params.entrega === "1"} />;
}
