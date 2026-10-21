import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { requireApplicationUrl } from "./hosts";

export type InvitationType = "store_owner" | "employee";

export function normalizeInvitationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createInvitationToken() {
  return randomBytes(32).toString("hex");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isInvitationToken(token: string) {
  return /^[0-9a-f]{64}$/.test(token);
}

export function createInvitationLink(token: string) {
  const url = requireApplicationUrl("panel");
  url.pathname = "/convite";
  url.search = new URLSearchParams({ token }).toString();
  return url.toString();
}

export async function issuePlatformInvitation(
  supabase: SupabaseClient<Database>,
  input: { type: InvitationType; email: string; storeId: string | null },
) {
  const token = createInvitationToken();
  const link = createInvitationLink(token);
  const { data, error } = await supabase.rpc("create_platform_invitation", {
    p_invitation_type: input.type,
    p_email: normalizeInvitationEmail(input.email),
    p_store_id: input.storeId,
    p_token_hash: hashInvitationToken(token),
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("invitation_create_failed");
  }

  const invitationId = data.invitation_id;
  const expiresAt = data.expires_at;
  if (typeof invitationId !== "string" || typeof expiresAt !== "string") {
    throw new Error("invitation_create_failed");
  }

  return {
    invitationId,
    expiresAt,
    link,
  };
}
