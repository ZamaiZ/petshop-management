import "server-only";

import { NextResponse } from "next/server";
import { getAuthenticatedRequestContext } from "./request-context";
import type { ApplicationAudience } from "./hosts";

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function requireApiAccess(request: Request, audience: ApplicationAudience) {
  try {
    const result = await getAuthenticatedRequestContext(request, audience);
    if (result.status === "ok") return { ok: true as const, ...result };
    if (result.status === "wrong_host") {
      return { ok: false as const, response: privateJson({ message: "Rota indisponível." }, 404) };
    }
    if (result.status === "unauthenticated") {
      return { ok: false as const, response: privateJson({ message: "Entre novamente para continuar." }, 401) };
    }
  } catch {
    // Keep environment and provider details out of API responses.
  }
  return { ok: false as const, response: privateJson({ message: "Não foi possível validar o acesso." }, 503) };
}
