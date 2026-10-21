import type { NextRequest } from "next/server";
import { z } from "zod";
import { getPostLoginDestination } from "@/lib/auth/destination";
import { parseAccessContext } from "@/lib/auth/context";
import { hasSameOrigin, readJsonBody } from "@/lib/http/security";
import { privateJson } from "@/lib/platform-access/api";
import { getRequestAudience } from "@/lib/platform-access/hosts";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ password: z.string().min(12).max(72) });

export async function POST(request: NextRequest) {
  const audience = getRequestAudience(request);
  if (!audience) return privateJson({ message: "Painel indisponível." }, 404);
  if (!hasSameOrigin(request)) {
    return privateJson({ message: "Requisição inválida." }, 403);
  }

  const body = await readJsonBody(request, 10_000);
  if (!body.ok) return privateJson({ message: "Dados inválidos." }, body.tooLarge ? 413 : 400);
  const parsed = schema.safeParse(body.value);
  if (!parsed.success || Buffer.byteLength(parsed.data?.password ?? "", "utf8") > 72) {
    return privateJson({ message: "A senha precisa ter ao menos 12 caracteres." }, 400);
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return privateJson({ message: "O acesso ainda não está configurado." }, 503);
  }
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) {
    return privateJson({ message: "O link de redefinição expirou. Solicite outro." }, 401);
  }

  const { data: accessData, error: accessError } = await supabase.rpc("current_access_context");
  const access = accessError ? null : parseAccessContext(accessData);
  if (!access) return privateJson({ message: "Não foi possível validar o acesso agora." }, 503);
  const destination = getPostLoginDestination(access, audience);
  if (!destination) {
    return privateJson({ message: "Esta conta não tem acesso a este painel." }, 403);
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return privateJson({ message: "Não foi possível atualizar a senha." }, 400);
  }

  return privateJson({ ok: true, destination });
}
