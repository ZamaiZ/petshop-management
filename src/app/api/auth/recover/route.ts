import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hasSameOrigin, readJsonBody } from "@/lib/http/security";
import { getApplicationUrl, getRequestAudience } from "@/lib/platform-access/hosts";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ email: z.string().trim().email().max(254) });

export async function POST(request: NextRequest) {
  const audience = getRequestAudience(request);
  if (!audience) return NextResponse.json({ message: "Painel indisponível." }, { status: 404 });
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: "Requisição inválida." }, { status: 403 });
  }

  const body = await readJsonBody(request, 10_000);
  if (!body.ok && body.tooLarge) return NextResponse.json({ message: "Dados inválidos." }, { status: 413 });
  const parsed = schema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return NextResponse.json({ message: "Informe um e-mail válido." }, { status: 400 });
  }

  const siteUrl = getApplicationUrl(audience);
  if (!siteUrl) return NextResponse.json({ message: "O acesso ainda não está configurado." }, { status: 503 });
  try {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email.toLowerCase(), {
      redirectTo: `${siteUrl.origin}/auth/callback?next=%2Fredefinir-senha`,
    });
  } catch {
    // Keep the recovery response identical so it does not disclose account existence.
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
