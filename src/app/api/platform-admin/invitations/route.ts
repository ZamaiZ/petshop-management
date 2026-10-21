import { z } from "zod";
import { hasSameOrigin, readJsonBody } from "@/lib/http/security";
import { privateJson, requireApiAccess } from "@/lib/platform-access/api";
import { issuePlatformInvitation } from "@/lib/platform-access/invitations";

const invitationSchema = z.object({ email: z.string().trim().email().max(254) });

export async function GET(request: Request) {
  const result = await requireApiAccess(request, "admin");
  if (!result.ok) return result.response;
  if (!result.access.isPlatformAdmin) return privateJson({ message: "Acesso não autorizado." }, 403);

  const { data, error } = await result.supabase.rpc("platform_admin_list_invitations");
  if (error) return privateJson({ message: "Não foi possível carregar os convites." }, 503);
  return privateJson({ invitations: data ?? [] });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return privateJson({ message: "Requisição inválida." }, 403);
  const result = await requireApiAccess(request, "admin");
  if (!result.ok) return result.response;
  if (!result.access.isPlatformAdmin) return privateJson({ message: "Acesso não autorizado." }, 403);

  const body = await readJsonBody(request, 10_000);
  if (!body.ok) return privateJson({ message: "Informe um e-mail válido." }, body.tooLarge ? 413 : 400);
  const parsed = invitationSchema.safeParse(body.value);
  if (!parsed.success) return privateJson({ message: "Informe um e-mail válido." }, 400);

  try {
    const invitation = await issuePlatformInvitation(result.supabase, {
      type: "store_owner",
      email: parsed.data.email,
      storeId: null,
    });
    return privateJson({ invitation }, 201);
  } catch {
    return privateJson({ message: "Não foi possível criar o convite. Confira o e-mail e tente novamente." }, 400);
  }
}
