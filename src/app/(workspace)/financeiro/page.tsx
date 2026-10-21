import type { Metadata } from "next";
import { FinanceLoadError, FinanceView } from "@/features/finance/components/finance-view";
import { getFinanceOverview } from "@/features/finance/queries";
import { requireUserContext } from "@/lib/auth/context";
import { dateKeyAtTimeZone } from "@/lib/date";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinancePage() {
  const context = await requireUserContext();
  const result = await getFinanceOverview(context.store.id, context.store.timezone);
  if (!result.data) return <FinanceLoadError message={result.error ?? "Tente novamente."} />;
  return <FinanceView overview={result.data} timezone={context.store.timezone} today={dateKeyAtTimeZone(new Date(), context.store.timezone)} />;
}
