"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/context";
import { parseMoneyToCents } from "@/lib/inputs";
import { logServerActionError } from "@/lib/server/action-error";
import { createClient } from "@/lib/supabase/server";

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  price: z.string().trim().min(1).max(40),
  duration: z.coerce.number().int().min(15).max(600),
});

function revalidateServices() {
  for (const path of ["/servicos", "/agenda", "/vendas"]) revalidatePath(path);
}

function serviceFailure(action: string, stage: string, error: unknown) {
  const reference = logServerActionError(action, stage, error);
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  let message = "Não foi possível salvar o serviço. Tente novamente.";
  if (code === "42501") message = "Você não tem permissão para alterar serviços nesta loja.";
  if (code === "23514" || code === "22P02") message = "Confira o valor e a duração do serviço e tente novamente.";
  if (code === "23503") message = "Não foi possível concluir porque este serviço está vinculado a outros registros.";
  if (code.startsWith("PGRST") || code === "42883") message = "O cadastro de serviços está temporariamente indisponível. Tente novamente em instantes.";
  return { ok: false as const, message, reference };
}

export async function createService(input: unknown) {
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Confira nome, valor e duração do serviço." };
  const priceCents = parseMoneyToCents(parsed.data.price);
  if (priceCents === null || priceCents < 0) return { ok: false as const, message: "Informe um valor válido." };

  let context: Awaited<ReturnType<typeof getUserContext>>;
  try {
    context = await getUserContext();
  } catch (error) {
    return serviceFailure("create_service", "load_user_context", error);
  }
  if (!context) return { ok: false as const, message: "Sua sessão expirou. Entre novamente." };

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("services").insert({ store_id: context.store.id, name: parsed.data.name, price_cents: priceCents, duration_minutes: parsed.data.duration });
    if (error) return serviceFailure("create_service", "insert", error);
    revalidateServices();
    return { ok: true as const };
  } catch (error) {
    return serviceFailure("create_service", "unexpected", error);
  }
}

export async function updateService(input: unknown) {
  const parsed = serviceSchema.extend({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Confira nome, valor e duração do serviço." };
  const priceCents = parseMoneyToCents(parsed.data.price);
  if (priceCents === null || priceCents < 0) return { ok: false as const, message: "Informe um valor válido." };

  let context: Awaited<ReturnType<typeof getUserContext>>;
  try {
    context = await getUserContext();
  } catch (error) {
    return serviceFailure("update_service", "load_user_context", error);
  }
  if (!context) return { ok: false as const, message: "Sua sessão expirou. Entre novamente." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("services").update({ name: parsed.data.name, price_cents: priceCents, duration_minutes: parsed.data.duration })
      .eq("store_id", context.store.id).eq("id", parsed.data.id).select("id").maybeSingle();
    if (error) return serviceFailure("update_service", "update", error);
    if (!data) return { ok: false as const, message: "Serviço não encontrado. Atualize a lista e tente novamente." };
    revalidateServices();
    return { ok: true as const };
  } catch (error) {
    return serviceFailure("update_service", "unexpected", error);
  }
}

export async function archiveService(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false as const, message: "Serviço inválido." };
  let context: Awaited<ReturnType<typeof getUserContext>>;
  try {
    context = await getUserContext();
  } catch (error) {
    return serviceFailure("archive_service", "load_user_context", error);
  }
  if (!context) return { ok: false as const, message: "Sua sessão expirou. Entre novamente." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("services").update({ archived_at: new Date().toISOString() }).eq("store_id", context.store.id).eq("id", parsed.data).is("archived_at", null).select("id").maybeSingle();
    if (error) return serviceFailure("archive_service", "update", error);
    if (!data) return { ok: false as const, message: "Serviço não encontrado ou já arquivado." };
    revalidateServices();
    return { ok: true as const };
  } catch (error) {
    return serviceFailure("archive_service", "unexpected", error);
  }
}

export async function restoreService(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false as const, message: "Serviço inválido." };
  let context: Awaited<ReturnType<typeof getUserContext>>;
  try {
    context = await getUserContext();
  } catch (error) {
    return serviceFailure("restore_service", "load_user_context", error);
  }
  if (!context) return { ok: false as const, message: "Sua sessão expirou. Entre novamente." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("services").update({ archived_at: null })
      .eq("store_id", context.store.id).eq("id", parsed.data).not("archived_at", "is", null).select("id").maybeSingle();
    if (error) return serviceFailure("restore_service", "update", error);
    if (!data) return { ok: false as const, message: "Serviço não encontrado ou já ativo." };
    revalidateServices();
    return { ok: true as const };
  } catch (error) {
    return serviceFailure("restore_service", "unexpected", error);
  }
}
