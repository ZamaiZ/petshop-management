import "server-only";

import { cache } from "react";
import { io } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BUSINESS_TIME_ZONE } from "@/lib/business-rules";
import { getApplicationAudience } from "@/lib/platform-access/hosts";
import type { StoreRole } from "@/lib/platform-access/types";
import { createClient } from "@/lib/supabase/server";

export type AccessStore = {
  id: string;
  role: StoreRole;
  membershipActive: boolean;
  platformActive: boolean;
  archived: boolean;
  active: boolean;
  name: string;
  phone: string | null;
  email: string | null;
  address: unknown;
  timezone: string;
  logoPath: string | null;
};

export type ParsedAccessContext = {
  isPlatformAdmin: boolean;
  pendingStoreSetup: boolean;
  store: AccessStore | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAccessContext(value: unknown): ParsedAccessContext | null {
  if (!isRecord(value)) return null;

  const rawStore = isRecord(value.store) ? value.store : null;
  let store: AccessStore | null = null;
  if (rawStore) {
    if (
      typeof rawStore.id !== "string" ||
      (rawStore.role !== "owner" && rawStore.role !== "employee") ||
      typeof rawStore.active !== "boolean"
    ) {
      return null;
    }

    store = {
      id: rawStore.id,
      role: rawStore.role,
      membershipActive: rawStore.membership_active === true,
      platformActive: rawStore.platform_active === true,
      archived: rawStore.archived === true,
      active: rawStore.active,
      name: typeof rawStore.name === "string" ? rawStore.name : "",
      phone: typeof rawStore.phone === "string" ? rawStore.phone : null,
      email: typeof rawStore.email === "string" ? rawStore.email : null,
      address: rawStore.address,
      timezone: typeof rawStore.timezone === "string" ? rawStore.timezone : BUSINESS_TIME_ZONE,
      logoPath: typeof rawStore.logo_path === "string" ? rawStore.logo_path : null,
    };
  }

  return {
    isPlatformAdmin: value.is_platform_admin === true,
    pendingStoreSetup: value.pending_store_setup === true,
    store,
  };
}

export const getAccessContext = cache(async () => {
  await io();
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return null;

    const { data, error } = await supabase.rpc("current_access_context");
    const access = error ? null : parseAccessContext(data);
    if (!access) return null;

    return { user: authData.user, ...access };
  } catch {
    return null;
  }
});

export const getUserContext = cache(async () => {
  const access = await getAccessContext();
  if (!access?.store?.active) return null;

  const requestHeaders = await headers();
  if (getApplicationAudience(requestHeaders.get("host")) !== "panel") return null;

  return {
    user: access.user,
    role: access.store.role,
    store: {
      id: access.store.id,
      name: access.store.name,
      phone: access.store.phone,
      email: access.store.email,
      address: access.store.address,
      timezone: BUSINESS_TIME_ZONE,
      logo_path: access.store.logoPath,
    },
  };
});

export async function requireUserContext() {
  const requestHeaders = await headers();
  if (getApplicationAudience(requestHeaders.get("host")) !== "panel") redirect("/login");

  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.isPlatformAdmin) redirect("/login?access=denied");
  if (access.pendingStoreSetup) redirect("/configuracao-inicial");
  if (!access.store) redirect("/login?access=denied");
  if (!access.store.membershipActive) redirect("/login?access=denied");
  if (!access.store.platformActive || access.store.archived) redirect("/loja-inativa");

  return {
    user: access.user,
    role: access.store.role,
    store: {
      id: access.store.id,
      name: access.store.name,
      phone: access.store.phone,
      email: access.store.email,
      address: access.store.address,
      timezone: BUSINESS_TIME_ZONE,
      logo_path: access.store.logoPath,
    },
  };
}

export async function requireOwnerContext() {
  const context = await requireUserContext();
  if (context.role !== "owner") redirect("/dashboard");
  return context;
}

export async function requirePendingStoreSetupContext() {
  const requestHeaders = await headers();
  if (getApplicationAudience(requestHeaders.get("host")) !== "panel") redirect("/login");

  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.isPlatformAdmin) redirect("/login?access=denied");
  if (access.pendingStoreSetup) return { user: access.user };
  if (access.store?.membershipActive) {
    if (access.store.platformActive && !access.store.archived) redirect("/dashboard");
    redirect("/loja-inativa");
  }
  redirect("/login?access=denied");
}

export async function requirePlatformAdminContext() {
  const requestHeaders = await headers();
  if (getApplicationAudience(requestHeaders.get("host")) !== "admin") redirect("/login");

  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.isPlatformAdmin) redirect("/login?access=denied");
  return access;
}
