import { NextResponse, type NextRequest } from "next/server";
import { hasSameOrigin } from "@/lib/http/security";
import { getRequestAudience } from "@/lib/platform-access/hosts";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!getRequestAudience(request)) {
    return NextResponse.json({ message: "Painel indisponível." }, { status: 404 });
  }
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: "Requisição inválida." }, { status: 403 });
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
