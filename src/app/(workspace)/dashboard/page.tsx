import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireUserContext } from "@/lib/auth/context";
import { getDashboardOverview } from "@/features/dashboard/queries";
import { DashboardView } from "@/features/dashboard/components/dashboard-view";

export const metadata: Metadata = { title: "Visão geral" };

export default async function DashboardPage() {
  const context = await requireUserContext();
  const result = await getDashboardOverview(context.store.id);

  if (!result.data) {
    return (
      <div className="mx-auto max-w-3xl pt-8">
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar a visão geral</AlertTitle>
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
        <form action="/dashboard" className="mt-4">
          <Button type="submit" variant="outline" size="sm">Tentar novamente</Button>
        </form>
      </div>
    );
  }

  return <DashboardView data={result.data} timezone={context.store.timezone} />;
}
