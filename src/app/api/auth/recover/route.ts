import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hasSameOrigin, readJsonBody } from "@/lib/http/security";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ email: z.string().trim().email().max(254) });

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: "Requisição inválida." }, { status: 403 });
  }

  const body = await readJsonBody(request, 10_000);
  if (!body.ok && body.tooLarge) return NextResponse.json({ message: "Dados inválidos." }, { status: 413 });
  const parsed = schema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return NextResponse.json({ message: "Informe um e-mail válido." }, { status: 400 });
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  await supabase.auth.resetPasswordForEmail(parsed.data.email.toLowerCase(), {
    redirectTo: `${new URL(siteUrl).origin}/auth/callback?next=%2Fredefinir-senha`,
  });

  return NextResponse.json({ ok: true });
}
