"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getUserContext } from "@/lib/auth/context";
import { isValidCnpj, normalizeCnpj } from "@/lib/cnpj";
import { createClient } from "@/lib/supabase/server";

const responseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    nomeFantasia: z.string().nullable().optional(),
    razaoSocial: z.string().nullable().optional(),
    telefone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    logradouro: z.string().nullable().optional(),
    numero: z.string().nullable().optional(),
    complemento: z.string().nullable().optional(),
    bairro: z.string().nullable().optional(),
    municipio: z.string().nullable().optional(),
    uf: z.string().nullable().optional(),
    cep: z.string().nullable().optional(),
  }).nullable().optional(),
});

function text(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export async function lookupSupplierCnpj(value: string) {
  const cnpj = normalizeCnpj(value);
  if (!isValidCnpj(cnpj)) return { ok: false, message: "Informe um CNPJ válido para consultar." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };

  try {
    const response = await fetch(`https://kitana.opencnpj.com/cnpj/${encodeURIComponent(cnpj)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return { ok: false, message: "CNPJ não encontrado. Você pode preencher os dados manualmente." };
    if (!response.ok) return { ok: false, message: "Consulta indisponível. Você pode preencher os dados manualmente." };

    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success || !parsed.data.success || !parsed.data.data) {
      return { ok: false, message: "A consulta não retornou dados utilizáveis. Preencha manualmente." };
    }

    const data = parsed.data.data;
    return {
      ok: true,
      message: "Dados públicos sugeridos pela consulta. Revise antes de salvar.",
      fields: {
        name: text(data.nomeFantasia) || text(data.razaoSocial),
        phone: text(data.telefone),
        email: text(data.email),
        street: text(data.logradouro),
        number: text(data.numero),
        complement: text(data.complemento),
        district: text(data.bairro),
        postalCode: text(data.cep).replace(/\D/g, "").slice(0, 8),
        city: text(data.municipio),
        state: text(data.uf).toUpperCase().slice(0, 2),
      },
    };
  } catch {
    return { ok: false, message: "Consulta indisponível. Você pode preencher os dados manualmente." };
  }
}

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  cnpj: z.string().trim().max(18),
  phone: z.string().trim().max(100),
  email: z.union([z.string().trim().email().max(254), z.literal("")]),
  street: z.string().trim().max(200),
  number: z.string().trim().max(40),
  complement: z.string().trim().max(120),
  district: z.string().trim().max(120),
  postalCode: z.string().trim().max(20),
  city: z.string().trim().max(100),
  state: z.string().trim().max(2),
  reference: z.string().trim().max(200),
  notes: z.string().trim().max(500),
});

function supplierValues(input: z.infer<typeof supplierSchema>) {
  const cnpj = normalizeCnpj(input.cnpj);
  if (cnpj && !isValidCnpj(cnpj)) return null;
  return {
    name: input.name,
    cnpj: cnpj || null,
    phone: input.phone || null,
    email: input.email || null,
    address: {
      street: input.street || null,
      number: input.number || null,
      complement: input.complement || null,
      district: input.district || null,
      postal_code: input.postalCode || null,
      city: input.city || null,
      state: input.state.toUpperCase() || null,
      reference: input.reference || null,
    },
    notes: input.notes || null,
  };
}

function revalidateSuppliers() {
  for (const path of ["/fornecedores", "/estoque", "/financeiro"]) revalidatePath(path);
}

export async function createSupplier(input: unknown) {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira o nome e os contatos do fornecedor." };
  const values = supplierValues(parsed.data);
  if (!values) return { ok: false, message: "Informe um CNPJ válido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({ store_id: context.store.id, ...values });
  if (error) return { ok: false, message: error.code === "23505" ? "Este CNPJ já está cadastrado, inclusive em fornecedores arquivados." : "Não foi possível cadastrar o fornecedor." };
  revalidateSuppliers();
  return { ok: true };
}

export async function updateSupplier(input: unknown) {
  const parsed = supplierSchema.extend({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira os dados do fornecedor." };
  const values = supplierValues(parsed.data);
  if (!values) return { ok: false, message: "Informe um CNPJ válido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").update(values).eq("store_id", context.store.id).eq("id", parsed.data.id).select("id").maybeSingle();
  if (error) return { ok: false, message: error.code === "23505" ? "Este CNPJ já está cadastrado em outro fornecedor." : "Não foi possível atualizar o fornecedor." };
  if (!data) return { ok: false, message: "Fornecedor não encontrado." };
  revalidateSuppliers();
  return { ok: true };
}

export async function archiveSupplier(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Fornecedor inválido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").update({ archived_at: new Date().toISOString() }).eq("store_id", context.store.id).eq("id", parsed.data).is("archived_at", null).select("id").maybeSingle();
  if (error) return { ok: false, message: "Não foi possível arquivar o fornecedor." };
  if (!data) return { ok: false, message: "Fornecedor não encontrado ou já arquivado." };
  revalidateSuppliers();
  return { ok: true };
}

export async function restoreSupplier(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Fornecedor inválido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").update({ archived_at: null })
    .eq("store_id", context.store.id).eq("id", parsed.data).not("archived_at", "is", null).select("id").maybeSingle();
  if (error) return { ok: false, message: error.code === "23505" ? "Este CNPJ já está cadastrado em outro fornecedor." : "Não foi possível reativar o fornecedor." };
  if (!data) return { ok: false, message: "Fornecedor não encontrado ou já ativo." };
  revalidateSuppliers();
  return { ok: true };
}
