import { createHmac } from "node:crypto";

export function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function isSafeReturnPath(value: string | null) {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"));
}

export async function readJsonBody(request: Request, maxBytes: number) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) return { ok: false as const, tooLarge: true as const };
  try {
    return { ok: true as const, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false as const, tooLarge: false as const };
  }
}

export function createSignupRateKey(request: Request, normalizedEmail: string) {
  const secret = process.env.SIGNUP_RATE_LIMIT_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Signup rate limit secret must contain at least 32 bytes.");
  }

  const configuredHeader = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  const forwardedAddress = configuredHeader
    ? request.headers.get(configuredHeader)?.split(",")[0]?.trim()
    : undefined;
  const subject = forwardedAddress || `email:${normalizedEmail}`;

  return createHmac("sha256", secret).update(subject).digest("hex");
}
