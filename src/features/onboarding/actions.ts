"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePendingStoreSetupContext } from "@/lib/auth/context";
import { normalizeBrazilianPhone } from "@/lib/phone";
import { uploadStoreLogoForTenant } from "@/lib/storage/store-logo";
import { requiredStoreAddressSchema } from "@/lib/store-address";
import { createClient } from "@/lib/supabase/server";

const optionalPhone = z.string().trim().max(40)
  .transform(normalizeBrazilianPhone)
  .refine((value) => value === "" || value.length === 10 || value.length === 11, "Informe um telefone com DDD.")
  .transform((value) => value || "");

const setupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: optionalPhone,
  email: z.union([z.string().trim().email().max(254), z.literal("")]),
  address: requiredStoreAddressSchema,
});

type StoreSetupResult =
  | { ok: false; message: string }
  | { ok: true; logoWarning: boolean };

export async function completeStoreSetup(formData: FormData): Promise<StoreSetupResult> {
  const parsed = setupSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address: {
      postal_code: String(formData.get("postal_code") ?? "").replace(/\D/g, ""),
      street: formData.get("street"),
      number: formData.get("number"),
      complement: formData.get("complement") ?? "",
      district: formData.get("district"),
      city: formData.get("city"),
      state: formData.get("state"),
      reference: formData.get("reference") ?? "",
    },
  });
  if (!parsed.success) return { ok: false, message: "Confira o nome e preencha o endereço do pet shop." };

  await requirePendingStoreSetupContext();

  const supabase = await createClient();
  const { data: storeId, error } = await supabase.rpc("complete_store_setup", {
    p_name: parsed.data.name,
    p_phone: parsed.data.phone || null,
    p_email: parsed.data.email || null,
    p_address: parsed.data.address,
  });
  if (error || !storeId) return { ok: false, message: "Não foi possível criar o pet shop. Revise os dados e tente novamente." };

  const logo = formData.get("logo");
  let logoWarning = false;
  if (logo instanceof File && logo.size > 0) {
    const upload = await uploadStoreLogoForTenant(supabase, storeId, logo, null);
    logoWarning = !upload.ok;
  }

  revalidatePath("/dashboard");
  revalidatePath("/configuracoes");
  return { ok: true, logoWarning };
}
