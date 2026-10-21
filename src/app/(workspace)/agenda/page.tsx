import type { Metadata } from "next";
import { AgendaLoadError, AgendaView } from "@/features/appointments/components/agenda-view";
import { getAgendaOverview } from "@/features/appointments/queries";
import { requireUserContext } from "@/lib/auth/context";
import { dateKeyAtTimeZone } from "@/lib/date";
import { z } from "zod";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const context = await requireUserContext();
  const params = await searchParams;
  const date = z.string().date().safeParse(params.date).success ? params.date! : dateKeyAtTimeZone(new Date(), context.store.timezone);
  const result = await getAgendaOverview(context.store.id, date, context.store.timezone);
  if (!result.data) return <AgendaLoadError message={result.error ?? "Tente novamente."} />;
  return <AgendaView data={result.data} date={date} timezone={context.store.timezone} />;
}
