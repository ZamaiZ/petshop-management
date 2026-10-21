import { z } from "zod";
import { hasSameOrigin } from "@/lib/http/security";
import { privateJson, requireApiAccess } from "@/lib/platform-access/api";

const idSchema = z.string().uuid();

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  if (!hasSameOrigin(request)) return privateJson({ message: "Requisição inválida." }, 403);
  const { invitationId } = await params;
  if (!idSchema.safeParse(invitationId).success) return privateJson({ message: "Convite inválido." }, 400);

  const result = await requireApiAccess(request, "admin");
  if (!result.ok) return result.response;
  if (!result.access.isPlatformAdmin) return privateJson({ message: "Acesso não autorizado." }, 403);

  const { data, error } = await result.supabase.rpc("revoke_platform_invitation", {
    p_invitation_id: invitationId,
  });
  if (error) return privateJson({ message: "Não foi possível revogar o convite." }, 503);
  if (!data) return privateJson({ message: "Este convite já foi usado ou não está mais ativo." }, 409);
  return privateJson({ ok: true });
}
