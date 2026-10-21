"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/context";
import { zonedDateTimeToIso } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  customerId: z.string().uuid(),
  petId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: z.string().date(),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):(?:00|30)$/),
  notes: z.string().trim().max(500),
});

const statusSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.enum(["arrived", "in_progress", "ready", "delivered", "cancelled", "no_show"]),
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().trim().max(500),
});

function appointmentError(message: string) {
  if (message.includes("appointment_conflict")) return "Esse horário já está ocupado por outro atendimento.";
  if (message.includes("pet_customer_mismatch")) return "O pet selecionado não pertence a este cliente.";
  if (message.includes("appointment_transition_invalid")) return "Esse atendimento mudou de estado. Atualize a agenda e tente novamente.";
  if (message.includes("appointment_version_conflict")) return "Outra pessoa atualizou este atendimento. Atualize a agenda.";
  return "Não foi possível salvar o atendimento. Confira os dados e tente novamente.";
}

export async function saveAppointment(input: unknown) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira o tutor, pet, serviço, data e horário." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };

  const supabase = await createClient();
  const { data: pet } = await supabase.from("pets").select("id").eq("store_id", context.store.id).eq("id", parsed.data.petId).eq("customer_id", parsed.data.customerId).is("archived_at", null).maybeSingle();
  if (!pet) return { ok: false, message: "Este pet não está vinculado ao tutor selecionado." };

  const startsAt = zonedDateTimeToIso(parsed.data.date, parsed.data.time, context.store.timezone);
  const { error } = await supabase.rpc("save_appointment", {
    p_store: context.store.id,
    p_customer: parsed.data.customerId,
    p_pet: parsed.data.petId,
    p_service: parsed.data.serviceId,
    p_start: startsAt,
    p_notes: parsed.data.notes,
  });
  if (error) return { ok: false, message: appointmentError(error.message) };
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateAppointmentStatus(input: unknown) {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira o status e o motivo." };
  if ((parsed.data.status === "cancelled" || parsed.data.status === "no_show") && parsed.data.reason.length < 3) {
    return { ok: false, message: "Informe o motivo do cancelamento ou da falta." };
  }
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_appointment_status", {
    p_store: context.store.id,
    p_appointment: parsed.data.appointmentId,
    p_status: parsed.data.status,
    p_expected_version: parsed.data.expectedVersion,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: appointmentError(error.message) };
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function rescheduleAppointment(input: unknown) {
  const schema = z.object({
    appointmentId: z.string().uuid(),
    serviceId: z.string().uuid(),
    date: z.string().date(),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):(?:00|30)$/),
    expectedVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(3).max(500),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira a nova data, horário e motivo." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const startsAt = zonedDateTimeToIso(parsed.data.date, parsed.data.time, context.store.timezone);
  const supabase = await createClient();
  const { error } = await supabase.rpc("reschedule_appointment", {
    p_store: context.store.id,
    p_appointment: parsed.data.appointmentId,
    p_service: parsed.data.serviceId,
    p_start: startsAt,
    p_expected_version: parsed.data.expectedVersion,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: appointmentError(error.message) };
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { ok: true };
}
