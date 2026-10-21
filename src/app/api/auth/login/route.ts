import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hasSameOrigin, readJsonBody } from "@/lib/http/security";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72),
});

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: "Requisição inválida." }, { status: 403 });
  }

  const body = await readJsonBody(request, 10_000);
  if (!body.ok && body.tooLarge) return NextResponse.json({ message: "Dados inválidos." }, { status: 413 });
  const parsed = loginSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return NextResponse.json({ message: "Confira o e-mail e a senha informados." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });

  if (error) {
    return NextResponse.json({ message: "E-mail ou senha não conferem." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
