import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DeliveryBoard } from "@/features/deliveries/components/delivery-board";
import { getDeliveryOverview } from "@/features/deliveries/queries";
import { requireUserContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Entregas" };

export default async function DeliveriesPage() {
  const context = await requireUserContext();
  const result = await getDeliveryOverview(context.store.id);
  if (!result.data) return <Alert variant="destructive"><AlertTitle>Falha ao carregar entregas</AlertTitle><AlertDescription>{result.error}</AlertDescription></Alert>;
  return <DeliveryBoard overview={result.data} timezone={context.store.timezone} />;
}
