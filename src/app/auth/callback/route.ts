import { NextResponse, type NextRequest } from "next/server";
import { getPostLoginDestination } from "@/lib/auth/destination";
import { parseAccessContext } from "@/lib/auth/context";
import { isSafeReturnPath } from "@/lib/http/security";
import { getRequestAudience } from "@/lib/platform-access/hosts";
import { createClient } from "@/lib/supabase/server";

function isAllowedCallbackPath(path: string, audience: "panel" | "admin") {
  if (path === "/redefinir-senha") return true;
  if (audience === "admin") return path === "/" || path === "/convites" || path === "/lojas";
  return [
    "/dashboard", "/vendas", "/estoque", "/agenda", "/entregas", "/clientes",
    "/financeiro", "/configuracoes", "/equipe", "/configuracao-inicial", "/loja-inativa",
  ].some((root) => path === root || path.startsWith(`${root}/`));
}

export async function GET(request: NextRequest) {
  const audience = getRequestAudience(request);
  if (!audience) return new NextResponse(null, { status: 404 });

  const code = request.nextUrl.searchParams.get("code");
  const requestedPath = request.nextUrl.searchParams.get("next");
  const validRequestedPath = requestedPath && isSafeReturnPath(requestedPath) && isAllowedCallbackPath(requestedPath, audience)
    ? requestedPath
    : null;

  if (!code) return NextResponse.redirect(new URL("/login?recovery=expired", request.url));

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/login?recovery=expired", request.url));

    const { data, error: contextError } = await supabase.rpc("current_access_context");
    const access = contextError ? null : parseAccessContext(data);
    const destination = access ? getPostLoginDestination(access, audience) : null;
    if (!destination) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?access=denied", request.url));
    }

    return NextResponse.redirect(new URL(validRequestedPath ?? destination, request.url));
  } catch {
    return NextResponse.redirect(new URL("/login?recovery=expired", request.url));
  }
}
