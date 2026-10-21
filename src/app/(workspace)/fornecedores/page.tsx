import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SuppliersView } from "@/features/suppliers/components/suppliers-view";
import { getSuppliersOverview } from "@/features/suppliers/queries";
import { requireUserContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function SuppliersPage() {
  const context = await requireUserContext();
  const result = await getSuppliersOverview(context.store.id);
  if (!result.data) return <Alert variant="destructive"><AlertTitle>Falha ao carregar fornecedores</AlertTitle><AlertDescription>{result.error}</AlertDescription></Alert>;
  return <SuppliersView suppliers={result.data} />;
}
