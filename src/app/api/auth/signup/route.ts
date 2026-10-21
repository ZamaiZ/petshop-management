import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSignupRateKey, hasSameOrigin, readJsonBody } from "@/lib/http/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const signupSchema = z.object({
  storeName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(72),
  authorizationPassword: z.string().min(16).max(72),
});

function genericFailure() {
  return NextResponse.json(
    { message: "Não foi possível criar a conta. Confira os dados e tente novamente." },
    { status: 400 },
  );
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: "Requisição inválida." }, { status: 403 });
  }

  const body = await readJsonBody(request, 12_000);
  if (!body.ok && body.tooLarge) return NextResponse.json({ message: "Dados inválidos." }, { status: 413 });
  const parsed = signupSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success || Buffer.byteLength(parsed.data?.authorizationPassword ?? "", "utf8") > 72) {
    return genericFailure();
  }

  const email = parsed.data.email.toLowerCase();
  let admin: ReturnType<typeof createAdminClient>;
  let rateKey: string;

  try {
    admin = createAdminClient();
    rateKey = createSignupRateKey(request, email);
  } catch {
    return NextResponse.json({ message: "O cadastro ainda não está configurado." }, { status: 503 });
  }

  const { data: ticket, error: ticketError } = await admin.rpc("issue_registration_ticket", {
    p_password: parsed.data.authorizationPassword,
    p_email: email,
    p_store_name: parsed.data.storeName,
    p_rate_key: rateKey,
  });

  if (ticketError || !ticket) return genericFailure();

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { registration_ticket: ticket },
  });

  if (createError) return genericFailure();

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (signInError) {
    return NextResponse.json({ ok: true, signInRequired: true }, { status: 201 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
