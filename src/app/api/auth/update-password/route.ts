import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hasSameOrigin, readJsonBody } from "@/lib/http/security";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ password: z.string().min(12).max(72) });

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: "Requisição inválida." }, { status: 403 });
  }

  const body = await readJsonBody(request, 10_000);
  if (!body.ok && body.tooLarge) return NextResponse.json({ message: "Dados inválidos." }, { status: 413 });
  const parsed = schema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return NextResponse.json({ message: "A senha precisa ter ao menos 12 caracteres." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) {
    return NextResponse.json({ message: "O link de redefinição expirou. Solicite outro." }, { status: 401 });
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return NextResponse.json({ message: "Não foi possível atualizar a senha." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
