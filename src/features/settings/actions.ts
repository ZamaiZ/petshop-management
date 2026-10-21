"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getUserContext } from "@/lib/auth/context";
import { BUSINESS_TIME_ZONE } from "@/lib/business-rules";
import { normalizeBrazilianPhone } from "@/lib/phone";
import { uploadStoreLogoForTenant } from "@/lib/storage/store-logo";
import { storeAddressSchema } from "@/lib/store-address";
import { createClient } from "@/lib/supabase/server";

const optionalPhone = z.string().trim().max(40)
  .transform(normalizeBrazilianPhone)
  .refine((value) => value === "" || value.length === 10 || value.length === 11, "Informe um telefone com DDD.")
  .transform((value) => value || null);

export async function saveStoreProfile(input: unknown) {
  const parsed = z.object({
    name: z.string().trim().min(2).max(120),
    phone: optionalPhone,
    email: z.union([z.string().trim().email().max(254), z.literal("")]).transform((value) => value || null),
    address: storeAddressSchema,
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira o nome, o telefone, o CEP e o endereço da loja." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const existingAddress = typeof context.store.address === "object" && context.store.address !== null && !Array.isArray(context.store.address)
    ? context.store.address
    : {};
  const supabase = await createClient();
  const { error } = await supabase.from("stores").update({
    name: parsed.data.name,
    phone: parsed.data.phone,
    email: parsed.data.email,
    address: {
      ...existingAddress,
      postal_code: parsed.data.address.postal_code || null,
      street: parsed.data.address.street || null,
      number: parsed.data.address.number || null,
      complement: parsed.data.address.complement || null,
      district: parsed.data.address.district || null,
      city: parsed.data.address.city || null,
      state: parsed.data.address.state.toUpperCase() || null,
      reference: parsed.data.address.reference || null,
    },
    timezone: BUSINESS_TIME_ZONE,
  }).eq("id", context.store.id);
  if (error) return { ok: false, message: "Não foi possível salvar os dados da loja." };
  for (const path of ["/configuracoes", "/dashboard", "/vendas", "/entregas", "/agenda", "/financeiro"]) revalidatePath(path);
  return { ok: true };
}

export async function uploadStoreLogo(formData: FormData) {
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Escolha uma imagem para enviar." };

  const supabase = await createClient();
  const result = await uploadStoreLogoForTenant(supabase, context.store.id, file, context.store.logo_path);
  if (!result.ok) return result;
  revalidatePath("/configuracoes");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function removeStoreLogo() {
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.from("stores").update({ logo_path: null }).eq("id", context.store.id);
  if (error) return { ok: false, message: "Não foi possível remover a logo." };
  if (context.store.logo_path) await supabase.storage.from("store-assets").remove([context.store.logo_path]);
  revalidatePath("/configuracoes");
  revalidatePath("/dashboard");
  return { ok: true };
}
