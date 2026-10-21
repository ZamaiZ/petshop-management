"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/context";
import { zonedDateTimeToIso } from "@/lib/date";
import { logServerActionError } from "@/lib/server/action-error";
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

type DatabaseError = { code?: string; message?: string; details?: string; constraint?: string };

function appointmentError(input: unknown) {
  const error: DatabaseError = input && typeof input === "object" ? input as DatabaseError : {};
  const message = error.message ?? "";
  const details = error.details ?? "";
  const constraint = error.constraint ?? "";
  if (error.code === "23P01" || constraint === "appointments_no_overlap" || message.includes("appointments_no_overlap") || message.includes("appointment_conflict")) {
    return "Esse horário já está ocupado. Escolha outro intervalo.";
  }
  if (message.includes("invalid_appointment_slot")) return "Escolha uma data futura e um horário disponível em intervalos de 30 minutos.";
  if (message.includes("customer_not_found")) return "O tutor não está mais disponível. Atualize a agenda e selecione-o novamente.";
  if (message.includes("pet_not_found") || message.includes("pet_customer_mismatch")) return "O pet não está vinculado ao tutor selecionado. Confira a seleção.";
  if (message.includes("service_not_found")) return "O serviço não está mais disponível. Atualize a lista e selecione-o novamente.";
  if (message.includes("invalid_appointment_transition") || message.includes("appointment_transition_invalid")) return "Esse atendimento mudou de estado. Atualize a agenda e tente novamente.";
  if (message.includes("version_conflict") || message.includes("appointment_version_conflict")) return "Outra pessoa atualizou este atendimento. Atualize a agenda antes de tentar novamente.";
  if (message.includes("appointment_not_reschedulable")) return "Este atendimento não pode mais ser reagendado.";
  if (message.includes("reason_required")) return "Informe o motivo para continuar.";
  if (error.code === "PGRST202" || error.code === "42883") return "A agenda está temporariamente indisponível. Tente novamente em instantes.";
  if (error.code === "42501") return "Você não tem permissão para alterar este atendimento. Atualize a página ou fale com um administrador.";
  if (error.code === "23503" || details.includes("service_id")) return "O serviço selecionado não está mais disponível. Atualize a lista e tente novamente.";
  return "Não foi possível salvar o atendimento. Confira os dados e tente novamente.";
}

function failAppointment(action: string, stage: string, error: unknown) {
  const reference = logServerActionError(action, stage, error);
  return { ok: false as const, message: appointmentError(error), reference };
}

function validateFutureSlot(date: string, time: string, timezone: string) {
  const startsAt = zonedDateTimeToIso(date, time, timezone);
  const timestamp = Date.parse(startsAt);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return null;
  return startsAt;
}

function revalidateAppointmentViews() {
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
}

export async function saveAppointment(input: unknown) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Confira o tutor, pet, serviço, data e horário." };

  let context: Awaited<ReturnType<typeof getUserContext>>;
  try {
    context = await getUserContext();
  } catch (error) {
    return failAppointment("save_appointment", "load_user_context", error);
  }
  if (!context) return { ok: false as const, message: "Sua sessão expirou. Entre novamente." };

  let startsAt: string | null;
  try {
    startsAt = validateFutureSlot(parsed.data.date, parsed.data.time, context.store.timezone);
  } catch (error) {
    return failAppointment("save_appointment", "build_slot", error);
  }
  if (!startsAt) return { ok: false as const, message: "Escolha uma data e um horário futuros, em intervalos de 30 minutos." };

  try {
    const supabase = await createClient();
    const { data: pet, error: petError } = await supabase.from("pets").select("id").eq("store_id", context.store.id).eq("id", parsed.data.petId).eq("customer_id", parsed.data.customerId).is("archived_at", null).maybeSingle();
    if (petError) return failAppointment("save_appointment", "validate_pet", petError);
    if (!pet) return { ok: false as const, message: "Este pet não está vinculado ao tutor selecionado." };

    const { data: appointmentId, error } = await supabase.rpc("save_appointment", {
      p_store: context.store.id,
      p_customer: parsed.data.customerId,
      p_pet: parsed.data.petId,
      p_service: parsed.data.serviceId,
      p_start: startsAt,
      p_notes: parsed.data.notes,
    });
    if (error) return failAppointment("save_appointment", "rpc", error);
    revalidateAppointmentViews();
    return { ok: true as const, appointmentId };
  } catch (error) {
    return failAppointment("save_appointment", "unexpected", error);
  }
}

export async function updateAppointmentStatus(input: unknown) {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Confira o status e o motivo." };
  if ((parsed.data.status === "cancelled" || parsed.data.status === "no_show") && parsed.data.reason.length < 3) {
    return { ok: false as const, message: "Informe o motivo do cancelamento ou da falta." };
  }

  let context: Awaited<ReturnType<typeof getUserContext>>;
  try {
    context = await getUserContext();
  } catch (error) {
    return failAppointment("set_appointment_status", "load_user_context", error);
  }
  if (!context) return { ok: false as const, message: "Sua sessão expirou. Entre novamente." };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_appointment_status", {
      p_store: context.store.id,
      p_appointment: parsed.data.appointmentId,
      p_status: parsed.data.status,
      p_expected_version: parsed.data.expectedVersion,
      p_reason: parsed.data.reason,
    });
    if (error) return failAppointment("set_appointment_status", "rpc", error);
    revalidateAppointmentViews();
    return { ok: true as const };
  } catch (error) {
    return failAppointment("set_appointment_status", "unexpected", error);
  }
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
  if (!parsed.success) return { ok: false as const, message: "Confira a nova data, horário e motivo." };

  let context: Awaited<ReturnType<typeof getUserContext>>;
  try {
    context = await getUserContext();
  } catch (error) {
    return failAppointment("reschedule_appointment", "load_user_context", error);
  }
  if (!context) return { ok: false as const, message: "Sua sessão expirou. Entre novamente." };

  let startsAt: string | null;
  try {
    startsAt = validateFutureSlot(parsed.data.date, parsed.data.time, context.store.timezone);
  } catch (error) {
    return failAppointment("reschedule_appointment", "build_slot", error);
  }
  if (!startsAt) return { ok: false as const, message: "Escolha uma data e um horário futuros, em intervalos de 30 minutos." };

  try {
    const supabase = await createClient();
    const { data: version, error } = await supabase.rpc("reschedule_appointment", {
      p_store: context.store.id,
      p_appointment: parsed.data.appointmentId,
      p_service: parsed.data.serviceId,
      p_start: startsAt,
      p_expected_version: parsed.data.expectedVersion,
      p_reason: parsed.data.reason,
    });
    if (error) return failAppointment("reschedule_appointment", "rpc", error);
    revalidateAppointmentViews();
    return { ok: true as const, version };
  } catch (error) {
    return failAppointment("reschedule_appointment", "unexpected", error);
  }
}
