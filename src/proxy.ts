import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.generated";
import { getRequestAudience } from "@/lib/platform-access/hosts";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

const workspaceRoots = [
  "/dashboard",
  "/vendas",
  "/estoque",
  "/agenda",
  "/entregas",
  "/clientes",
  "/financeiro",
  "/configuracoes",
  "/equipe",
  "/configuracao-inicial",
  "/loja-inativa",
];

function isUnderPath(pathname: string, roots: string[]) {
  return roots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

function adminInternalPath(pathname: string) {
  if (pathname === "/") return "/platform-admin/stores";
  if (pathname === "/login") return "/platform-admin/login";
  if (pathname === "/convites") return "/platform-admin/invitations";
  if (pathname === "/lojas") return "/platform-admin/stores";
  if (pathname === "/platform-admin" || pathname.startsWith("/platform-admin/")) return pathname;
  if (
    pathname === "/recuperar-senha" ||
    pathname === "/redefinir-senha" ||
    pathname === "/auth/callback" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/platform-admin/")
  ) return pathname;
  return null;
}

function copyCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    const { name, value, ...options } = cookie;
    target.cookies.set(name, value, options);
  }
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const audience = getRequestAudience(request);
  if (!audience) return new NextResponse(null, { status: 404 });
  if (
    path.startsWith("/_next/") ||
    path === "/favicon.ico" ||
    /\.(?:css|js|mjs|map|svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$/.test(path)
  ) return NextResponse.next();

  const adminPath = audience === "admin" ? adminInternalPath(path) : null;
  if (audience === "admin" && !adminPath) return new NextResponse(null, { status: 404 });
  if (audience === "panel" && (path === "/platform-admin" || path.startsWith("/platform-admin/"))) {
    return new NextResponse(null, { status: 404 });
  }

  const isWorkspace = audience === "panel" && isUnderPath(path, workspaceRoots);
  const isAdminProtected = audience === "admin"
    && adminPath !== "/platform-admin/login"
    && adminPath !== "/recuperar-senha"
    && adminPath !== "/redefinir-senha"
    && adminPath !== "/auth/callback"
    && adminPath !== null
    && !adminPath.startsWith("/api/auth/");

  if (!hasSupabasePublicEnv()) {
    if (isWorkspace || isAdminProtected) {
      return NextResponse.redirect(new URL("/login?setup=1", request.url));
    }
    if (audience === "admin" && adminPath !== path) {
      const destination = request.nextUrl.clone();
      destination.pathname = adminPath!;
      return NextResponse.rewrite(destination);
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  let isAuthenticated = false;
  try {
    const { data } = await supabase.auth.getClaims();
    isAuthenticated = Boolean(data?.claims?.sub);
  } catch {
    // Protected routes fail closed when the Auth provider cannot validate a session.
  }

  if ((isWorkspace || isAdminProtected) && !isAuthenticated) {
    const redirectResponse = NextResponse.redirect(new URL("/login", request.url));
    copyCookies(response, redirectResponse);
    return redirectResponse;
  }

  if (path === "/convite" || path.startsWith("/convite/")) {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }

  if (audience === "admin" && adminPath !== path) {
    const destination = request.nextUrl.clone();
    destination.pathname = adminPath!;
    const rewriteResponse = NextResponse.rewrite(destination, { request });
    copyCookies(response, rewriteResponse);
    return rewriteResponse;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
