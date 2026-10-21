import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getPostLoginDestination } from "@/lib/auth/destination";
import { createInvitationRateKey, hasSameOrigin, readJsonBody } from "@/lib/http/security";
import { privateJson } from "@/lib/platform-access/api";
import { hashInvitationToken, isInvitationToken, normalizeInvitationEmail } from "@/lib/platform-access/invitations";
import { getRequestAudience } from "@/lib/platform-access/hosts";
import { parseAccessContext } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const invitationSchema = z.object({
  token: z.string().refine(isInvitationToken),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(72),
});

function genericFailure(status = 400) {
  return privateJson({ message: "Convite inválido ou indisponível. Confira o e-mail e tente novamente." }, status);
}

async function signInAndResolve(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
  password: string,
) {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false as const };

    const { data, error: contextError } = await supabase.rpc("current_access_context");
    const access = contextError ? null : parseAccessContext(data);
    const destination = access ? getPostLoginDestination(access, "panel") : null;
    if (!destination) {
      await supabase.auth.signOut();
      return { ok: false as const };
    }
    return { ok: true as const, destination };
  } catch {
    try {
      await supabase.auth.signOut();
    } catch {
      // The account remains available for a later manual sign-in.
    }
    return { ok: false as const };
  }
}

export async function POST(request: NextRequest) {
  if (getRequestAudience(request) !== "panel") return genericFailure(404);
  if (!hasSameOrigin(request)) return privateJson({ message: "Requisição inválida." }, 403);

  const body = await readJsonBody(request, 12_000);
  if (!body.ok) return genericFailure(body.tooLarge ? 413 : 400);
  const parsed = invitationSchema.safeParse(body.value);
  if (!parsed.success || Buffer.byteLength(parsed.data?.password ?? "", "utf8") > 72) return genericFailure();

  const email = normalizeInvitationEmail(parsed.data.email);
  const tokenHash = hashInvitationToken(parsed.data.token);
  let admin: ReturnType<typeof createAdminClient>;
  let rateKey: string;
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    admin = createAdminClient();
    rateKey = createInvitationRateKey(request, tokenHash);
    supabase = await createClient();
  } catch {
    return privateJson({ message: "A criação de contas ainda não está configurada." }, 503);
  }

  let reservationData: unknown;
  let reservationError: unknown;
  try {
    const reservationResult = await admin.rpc("reserve_platform_invitation", {
      p_token_hash: tokenHash,
      p_email: email,
      p_rate_key: rateKey,
    });
    reservationData = reservationResult.data;
    reservationError = reservationResult.error;
  } catch {
    return genericFailure();
  }
  if (reservationError || !reservationData || typeof reservationData !== "object" || Array.isArray(reservationData)) {
    return genericFailure();
  }

  const reservation = reservationData as Record<string, unknown>;
  if (reservation.status === "accepted") {
    const signedIn = await signInAndResolve(supabase, email, parsed.data.password);
    return signedIn.ok
      ? NextResponse.json({ ok: true, destination: signedIn.destination }, { headers: { "Cache-Control": "private, no-store, max-age=0" } })
      : genericFailure(409);
  }
  if (reservation.status !== "reserved") return genericFailure(reservation.status === "busy" ? 409 : 400);

  const invitationId = typeof reservation.invitation_id === "string" ? reservation.invitation_id : "";
  const reservationId = typeof reservation.reservation_id === "string" ? reservation.reservation_id : "";
  if (!z.string().uuid().safeParse(invitationId).success || !z.string().uuid().safeParse(reservationId).success) {
    return genericFailure();
  }

  let creationFailed = false;
  try {
    const { error } = await admin.auth.admin.createUser({
      email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        platform_invitation_id: invitationId,
        platform_reservation_id: reservationId,
      },
    });
    creationFailed = Boolean(error);
  } catch {
    creationFailed = true;
  }

  if (creationFailed) {
    let acceptanceData: unknown = null;
    try {
      const result = await admin.rpc("resolve_platform_invitation_acceptance", {
        p_token_hash: tokenHash,
        p_email: email,
      });
      acceptanceData = result.data;
    } catch {
      // The reservation expires on its own if the provider cannot be reached.
    }
    const acceptance = acceptanceData && typeof acceptanceData === "object" && !Array.isArray(acceptanceData)
      ? acceptanceData as Record<string, unknown>
      : null;
    if (acceptance?.status === "accepted") {
      const signedIn = await signInAndResolve(supabase, email, parsed.data.password);
      return signedIn.ok
        ? NextResponse.json({ ok: true, destination: signedIn.destination }, { headers: { "Cache-Control": "private, no-store, max-age=0" } })
        : genericFailure(409);
    }
    try {
      await admin.rpc("release_platform_invitation_reservation", {
        p_invitation_id: invitationId,
        p_reservation_id: reservationId,
      });
    } catch {
      // The reservation expires after five minutes if release cannot complete.
    }
    return genericFailure();
  }

  const signedIn = await signInAndResolve(supabase, email, parsed.data.password);
  if (!signedIn.ok) {
    return privateJson({ ok: true, signInRequired: true }, 201);
  }
  return privateJson({ ok: true, destination: signedIn.destination }, 201);
}
