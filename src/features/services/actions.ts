"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/context";
import { parseMoneyToCents } from "@/lib/inputs";
import { createClient } from "@/lib/supabase/server";

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  price: z.string().trim().min(1).max(40),
  duration: z.coerce.number().int().min(15).max(600),
});

function revalidateServices() {
  for (const path of ["/servicos", "/agenda", "/vendas"]) revalidatePath(path);
}

export async function createService(input: unknown) {
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira nome, valor e duração do serviço." };
  const priceCents = parseMoneyToCents(parsed.data.price);
  if (priceCents === null || priceCents < 0) return { ok: false, message: "Informe um valor válido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({ store_id: context.store.id, name: parsed.data.name, price_cents: priceCents, duration_minutes: parsed.data.duration });
  if (error) return { ok: false, message: "Não foi possível cadastrar o serviço." };
  revalidateServices();
  return { ok: true };
}

export async function updateService(input: unknown) {
  const parsed = serviceSchema.extend({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira nome, valor e duração do serviço." };
  const priceCents = parseMoneyToCents(parsed.data.price);
  if (priceCents === null || priceCents < 0) return { ok: false, message: "Informe um valor válido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").update({ name: parsed.data.name, price_cents: priceCents, duration_minutes: parsed.data.duration })
    .eq("store_id", context.store.id).eq("id", parsed.data.id).select("id").maybeSingle();
  if (error) return { ok: false, message: "Não foi possível atualizar o serviço." };
  if (!data) return { ok: false, message: "Serviço não encontrado." };
  revalidateServices();
  return { ok: true };
}

export async function archiveService(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Serviço inválido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").update({ archived_at: new Date().toISOString() }).eq("store_id", context.store.id).eq("id", parsed.data).is("archived_at", null).select("id").maybeSingle();
  if (error) return { ok: false, message: "Não foi possível arquivar o serviço." };
  if (!data) return { ok: false, message: "Serviço não encontrado ou já arquivado." };
  revalidateServices();
  return { ok: true };
}

export async function restoreService(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Serviço inválido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").update({ archived_at: null })
    .eq("store_id", context.store.id).eq("id", parsed.data).not("archived_at", "is", null).select("id").maybeSingle();
  if (error) return { ok: false, message: "Não foi possível reativar o serviço." };
  if (!data) return { ok: false, message: "Serviço não encontrado ou já ativo." };
  revalidateServices();
  return { ok: true };
}
