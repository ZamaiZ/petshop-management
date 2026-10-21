"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

const optionalText = z.string().trim().max(500).transform((value) => value || null);

const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: optionalText,
  email: z.union([z.string().trim().email().max(254), z.literal("")]).transform((value) => value || null),
  notes: optionalText,
});

const petSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  species: z.string().trim().min(1).max(40),
  breed: z.string().trim().max(80).transform((value) => value || null),
  birthDate: z.union([z.string().date(), z.literal("")]).transform((value) => value || null),
  weightKg: z.union([z.coerce.number().positive().max(500), z.literal("")]).transform((value) => value === "" ? null : value),
  careNotes: optionalText,
  behaviorNotes: optionalText,
});

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createCustomer(formData: FormData) {
  const parsed = customerSchema.safeParse({
    name: readText(formData, "name"),
    phone: readText(formData, "phone"),
    email: readText(formData, "email"),
    notes: readText(formData, "notes"),
  });
  if (!parsed.success) return { ok: false, message: "Confira o nome e os dados de contato." };

  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };

  const supabase = await createClient();
  const { error } = await supabase.from("customers").insert({
    store_id: context.store.id,
    ...parsed.data,
  });

  if (error) return { ok: false, message: "Não foi possível salvar o cliente." };
  revalidatePath("/clientes");
  return { ok: true };
}

export async function createPet(formData: FormData) {
  const parsed = petSchema.safeParse({
    customerId: readText(formData, "customerId"),
    name: readText(formData, "name"),
    species: readText(formData, "species"),
    breed: readText(formData, "breed"),
    birthDate: readText(formData, "birthDate"),
    weightKg: readText(formData, "weightKg"),
    careNotes: readText(formData, "careNotes"),
    behaviorNotes: readText(formData, "behaviorNotes"),
  });
  if (!parsed.success) return { ok: false, message: "Confira os dados do pet." };

  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("store_id", context.store.id)
    .eq("id", parsed.data.customerId)
    .is("archived_at", null)
    .maybeSingle();
  if (!customer) return { ok: false, message: "Cliente não encontrado." };

  const { error } = await supabase.from("pets").insert({
    store_id: context.store.id,
    customer_id: customer.id,
    name: parsed.data.name,
    species: parsed.data.species,
    breed: parsed.data.breed,
    birth_date: parsed.data.birthDate,
    weight_kg: parsed.data.weightKg,
    care_notes: parsed.data.careNotes,
    behavior_notes: parsed.data.behaviorNotes,
  });

  if (error) return { ok: false, message: "Não foi possível salvar o pet." };
  revalidatePath("/clientes");
  revalidatePath("/agenda");
  return { ok: true };
}

export async function createCustomerAddress(input: unknown) {
  const parsed = z.object({
    customerId: z.string().uuid(),
    label: z.string().trim().max(80),
    street: z.string().trim().min(1).max(200),
    number: z.string().trim().max(40),
    complement: z.string().trim().max(120),
    district: z.string().trim().max(120),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().max(2),
    postalCode: z.string().trim().max(20),
    reference: z.string().trim().max(200),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Informe pelo menos a rua e a cidade." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("id").eq("store_id", context.store.id).eq("id", parsed.data.customerId).is("archived_at", null).maybeSingle();
  if (!customer) return { ok: false, message: "Cliente não encontrado." };
  const { error } = await supabase.from("customer_addresses").insert({
    store_id: context.store.id,
    customer_id: customer.id,
    label: parsed.data.label || null,
    street: parsed.data.street,
    number: parsed.data.number || null,
    complement: parsed.data.complement || null,
    district: parsed.data.district || null,
    city: parsed.data.city,
    state: parsed.data.state || null,
    postal_code: parsed.data.postalCode || null,
    reference: parsed.data.reference || null,
  });
  if (error) return { ok: false, message: "Não foi possível salvar o endereço." };
  revalidatePath("/clientes");
  revalidatePath("/vendas/nova");
  return { ok: true };
}

export async function archiveCustomerAddress(customerId: string, addressId: string) {
  const parsed = z.object({ customerId: z.string().uuid(), addressId: z.string().uuid() }).safeParse({ customerId, addressId });
  if (!parsed.success) return { ok: false, message: "Endereço inválido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.from("customer_addresses").update({ archived_at: new Date().toISOString() }).eq("store_id", context.store.id).eq("customer_id", parsed.data.customerId).eq("id", parsed.data.addressId).is("archived_at", null);
  if (error) return { ok: false, message: "Não foi possível arquivar o endereço." };
  revalidatePath("/clientes");
  revalidatePath("/vendas/nova");
  return { ok: true };
}

export async function archiveCustomer(customerId: string) {
  const parsedId = z.string().uuid().safeParse(customerId);
  if (!parsedId.success) return { ok: false, message: "Cliente inválido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ archived_at: new Date().toISOString() })
    .eq("store_id", context.store.id)
    .eq("id", parsedId.data)
    .is("archived_at", null);
  if (error) return { ok: false, message: "Não foi possível arquivar o cliente." };
  revalidatePath("/clientes");
  revalidatePath("/agenda");
  return { ok: true };
}
