import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { hasSameOrigin } from "@/lib/http/security";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: "Requisição inválida." }, { status: 403 });
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  const cookieStore = await cookies();
  cookieStore.delete("petshop-theme");

  return NextResponse.json({ ok: true });
}
