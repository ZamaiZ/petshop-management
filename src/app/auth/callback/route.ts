import { NextResponse, type NextRequest } from "next/server";
import { isSafeReturnPath } from "@/lib/http/security";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedPath = request.nextUrl.searchParams.get("next");
  const returnPath = isSafeReturnPath(requestedPath) ? requestedPath : "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?recovery=expired", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?recovery=expired", request.url));

  return NextResponse.redirect(new URL(returnPath, request.url));
}
