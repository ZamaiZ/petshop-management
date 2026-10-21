"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getUserContext } from "@/lib/auth/context";
import { parseMoneyToCents } from "@/lib/inputs";
import { supportedStoreTimezones } from "@/lib/store-timezones";
import { createClient } from "@/lib/supabase/server";

const themeSchema = z.enum(["system", "light", "dark"]);

export async function saveThemePreference(value: string) {
  const parsed = themeSchema.safeParse(value);
  if (!parsed.success) return { ok: false };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false };

  const { error } = await supabase
    .from("user_preferences")
    .update({ theme: parsed.data })
    .eq("user_id", data.user.id);

  if (error) return { ok: false };
  const cookieStore = await cookies();
  cookieStore.set("petshop-theme", parsed.data, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return { ok: true };
}

export async function saveSidebarPreference(collapsed: boolean) {
  if (typeof collapsed !== "boolean") return { ok: false };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false };

  const { error } = await supabase
    .from("user_preferences")
    .update({ sidebar_collapsed: collapsed })
    .eq("user_id", data.user.id);

  return { ok: !error };
}

const optionalText = z.string().trim().max(200).transform((value) => value || null);

export async function saveStoreProfile(input: unknown) {
  const parsed = z.object({
    name: z.string().trim().min(2).max(120),
    phone: optionalText,
    email: z.union([z.string().trim().email().max(254), z.literal("")]).transform((value) => value || null),
    city: z.string().trim().max(100),
    state: z.string().trim().max(2),
    street: z.string().trim().max(200),
    timezone: z.enum(supportedStoreTimezones),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira o nome e os dados da loja." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  if (context.role !== "owner") return { ok: false, message: "Somente o proprietário pode alterar os dados da loja." };
  const existingAddress = typeof context.store.address === "object" && context.store.address !== null && !Array.isArray(context.store.address)
    ? context.store.address
    : {};
  const supabase = await createClient();
  const { error } = await supabase.from("stores").update({
    name: parsed.data.name,
    phone: parsed.data.phone,
    email: parsed.data.email,
    address: { ...existingAddress, city: parsed.data.city || null, state: parsed.data.state || null, street: parsed.data.street || null },
    timezone: parsed.data.timezone,
  }).eq("id", context.store.id);
  if (error) return { ok: false, message: "Não foi possível salvar os dados da loja." };
  for (const path of ["/configuracoes", "/dashboard", "/vendas", "/entregas", "/agenda", "/financeiro"]) revalidatePath(path);
  return { ok: true };
}

function detectImage(bytes: Uint8Array) {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { mime: "image/png", extension: "png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 30 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === "VP8X") {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { mime: "image/webp", extension: "webp", width, height };
    }
    if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
      return { mime: "image/webp", extension: "webp", width, height };
    }
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { mime: "image/webp", extension: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { mime: "image/jpeg", extension: "jpg", height: (bytes[offset + 3] << 8) | bytes[offset + 4], width: (bytes[offset + 5] << 8) | bytes[offset + 6] };
      }
      offset += length;
    }
  }
  return null;
}

export async function uploadStoreLogo(formData: FormData) {
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  if (context.role !== "owner") return { ok: false, message: "Somente o proprietário pode alterar a logo." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > 2 * 1024 * 1024) return { ok: false, message: "Escolha uma imagem de até 2 MB." };
  const fileBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(fileBuffer);
  const image = detectImage(bytes);
  if (!image || (file.type && file.type !== image.mime) || image.width < 1 || image.height < 1 || image.width > 4096 || image.height > 4096 || image.width * image.height > 16_777_216) {
    return { ok: false, message: "Envie uma imagem PNG, JPEG ou WebP válida, com até 4096 px por lado." };
  }

  const supabase = await createClient();
  const path = `${context.store.id}/logos/${crypto.randomUUID()}.${image.extension}`;
  const { error: uploadError } = await supabase.storage.from("store-assets").upload(path, fileBuffer, { contentType: image.mime, cacheControl: "3600", upsert: false });
  if (uploadError) return { ok: false, message: "Não foi possível enviar a imagem. Confira o acesso da loja ao armazenamento." };
  const { error: updateError } = await supabase.from("stores").update({ logo_path: path }).eq("id", context.store.id);
  if (updateError) {
    await supabase.storage.from("store-assets").remove([path]);
    return { ok: false, message: "A imagem foi enviada, mas não foi possível associá-la à loja." };
  }
  if (context.store.logo_path) await supabase.storage.from("store-assets").remove([context.store.logo_path]);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function removeStoreLogo() {
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  if (context.role !== "owner") return { ok: false, message: "Somente o proprietário pode remover a logo." };
  const supabase = await createClient();
  const { error } = await supabase.from("stores").update({ logo_path: null }).eq("id", context.store.id);
  if (error) return { ok: false, message: "Não foi possível remover a logo." };
  if (context.store.logo_path) await supabase.storage.from("store-assets").remove([context.store.logo_path]);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createService(input: unknown) {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), price: z.string().trim().min(1).max(40), duration: z.coerce.number().int().min(15).max(600) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira nome, valor e duração do serviço." };
  const priceCents = parseMoneyToCents(parsed.data.price);
  if (priceCents === null || priceCents < 0) return { ok: false, message: "Informe um valor válido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({ store_id: context.store.id, name: parsed.data.name, price_cents: priceCents, duration_minutes: parsed.data.duration });
  if (error) return { ok: false, message: "Não foi possível cadastrar o serviço." };
  for (const path of ["/configuracoes", "/agenda", "/vendas/nova"]) revalidatePath(path);
  return { ok: true };
}

export async function archiveService(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Serviço inválido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.from("services").update({ archived_at: new Date().toISOString() }).eq("store_id", context.store.id).eq("id", parsed.data).is("archived_at", null);
  if (error) return { ok: false, message: "Não foi possível arquivar o serviço." };
  for (const path of ["/configuracoes", "/agenda", "/vendas/nova"]) revalidatePath(path);
  return { ok: true };
}

export async function createSupplier(input: unknown) {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().max(100), email: z.union([z.string().trim().email().max(254), z.literal("")]) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira o nome e os contatos do fornecedor." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({ store_id: context.store.id, name: parsed.data.name, phone: parsed.data.phone || null, email: parsed.data.email || null, address: {} });
  if (error) return { ok: false, message: "Não foi possível cadastrar o fornecedor." };
  for (const path of ["/configuracoes", "/estoque"]) revalidatePath(path);
  return { ok: true };
}

export async function archiveSupplier(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Fornecedor inválido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").update({ archived_at: new Date().toISOString() }).eq("store_id", context.store.id).eq("id", parsed.data).is("archived_at", null);
  if (error) return { ok: false, message: "Não foi possível arquivar o fornecedor." };
  for (const path of ["/configuracoes", "/estoque"]) revalidatePath(path);
  return { ok: true };
}
