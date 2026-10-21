import { z } from "zod";
import { getPostLoginDestination } from "@/lib/auth/destination";
import { parseAccessContext } from "@/lib/auth/context";
import { hasSameOrigin, readJsonBody } from "@/lib/http/security";
import { privateJson } from "@/lib/platform-access/api";
import { getRequestAudience } from "@/lib/platform-access/hosts";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72),
});

export async function POST(request: Request) {
  const audience = getRequestAudience(request);
  if (!audience) return privateJson({ message: "Painel indisponível." }, 404);
  if (!hasSameOrigin(request)) return privateJson({ message: "Requisição inválida." }, 403);

  const body = await readJsonBody(request, 10_000);
  if (!body.ok) return privateJson({ message: "Confira o e-mail e a senha informados." }, body.tooLarge ? 413 : 400);
  const parsed = loginSchema.safeParse(body.value);
  if (!parsed.success || Buffer.byteLength(parsed.data?.password ?? "", "utf8") > 72) {
    return privateJson({ message: "Confira o e-mail e a senha informados." }, 400);
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return privateJson({ message: "O acesso ainda não está configurado." }, 503);
  }

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
    });
    if (error) return privateJson({ message: "E-mail ou senha não conferem." }, 401);

    const { data, error: contextError } = await supabase.rpc("current_access_context");
    const access = contextError ? null : parseAccessContext(data);
    const destination = access ? getPostLoginDestination(access, audience) : null;
    if (!destination) {
      await supabase.auth.signOut();
      return privateJson({ message: "Esta conta não tem acesso a este painel." }, 403);
    }

    return privateJson({ ok: true, destination });
  } catch {
    try {
      await supabase.auth.signOut();
    } catch {
      // Keep the response independent of provider internals.
    }
    return privateJson({ message: "Não foi possível validar o acesso agora." }, 503);
  }
}
