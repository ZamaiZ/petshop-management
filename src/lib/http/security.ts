import { createHmac } from "node:crypto";
import { getApplicationUrl, getRequestAudience } from "@/lib/platform-access/hosts";

export function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const audience = getRequestAudience(request);
    const expectedOrigin = audience ? getApplicationUrl(audience)?.origin : null;
    return Boolean(expectedOrigin && new URL(origin).origin === expectedOrigin);
  } catch {
    return false;
  }
}

export function isSafeReturnPath(value: string | null) {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"));
}

export async function readJsonBody(request: Request, maxBytes: number) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false as const, tooLarge: true as const };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false as const, tooLarge: false as const };

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size limit remains authoritative if the transport is already closed.
        }
        return { ok: false as const, tooLarge: true as const };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false as const, tooLarge: false as const };
  } finally {
    reader.releaseLock();
  }

  try {
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true as const, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false as const, tooLarge: false as const };
  }
}

export function createInvitationRateKey(request: Request, invitationTokenHash: string) {
  const secret = process.env.SIGNUP_RATE_LIMIT_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Signup rate limit secret must contain at least 32 bytes.");
  }

  const configuredHeader = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  const forwardedAddress = configuredHeader
    ? request.headers.get(configuredHeader)?.split(",")[0]?.trim()
    : undefined;
  if (process.env.NODE_ENV === "production" && !configuredHeader) {
    throw new Error("A trusted client IP header is required for invitation rate limiting.");
  }
  if (process.env.NODE_ENV === "production" && !forwardedAddress) {
    throw new Error("The trusted client IP header is missing from the request.");
  }

  const subject = forwardedAddress ? `ip:${forwardedAddress}` : `token:${invitationTokenHash}`;

  return createHmac("sha256", secret).update(subject).digest("hex");
}
