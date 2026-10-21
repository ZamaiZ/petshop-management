import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.generated";
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
];

function isUnderPath(pathname: string, roots: string[]) {
  return roots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isWorkspace = isUnderPath(path, workspaceRoots);

  if (!hasSupabasePublicEnv()) {
    if (isWorkspace) return NextResponse.redirect(new URL("/login?setup=1", request.url));
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

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);

  if (isWorkspace && !isAuthenticated) {
    const redirectResponse = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
