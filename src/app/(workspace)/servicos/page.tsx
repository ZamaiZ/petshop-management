import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ServicesView } from "@/features/services/components/services-view";
import { getServicesOverview } from "@/features/services/queries";
import { requireUserContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Serviços" };

export default async function ServicesPage() {
  const context = await requireUserContext();
  const result = await getServicesOverview(context.store.id);
  if (!result.data) return <Alert variant="destructive"><AlertTitle>Falha ao carregar serviços</AlertTitle><AlertDescription>{result.error}</AlertDescription></Alert>;
  return <ServicesView services={result.data} />;
}
