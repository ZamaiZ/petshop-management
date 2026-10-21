import { z } from "zod";
import { hasSameOrigin, readJsonBody } from "@/lib/http/security";
import { privateJson, requireApiAccess } from "@/lib/platform-access/api";
import { issuePlatformInvitation } from "@/lib/platform-access/invitations";

const invitationSchema = z.object({ email: z.string().trim().email().max(254) });

export async function GET(request: Request) {
  const result = await requireApiAccess(request, "panel");
  if (!result.ok) return result.response;
  const store = result.access.store;
  if (!store || !store.active) return privateJson({ message: "O pet shop está inativo." }, 403);
  if (store.role !== "owner") return privateJson({ message: "Somente o gestor pode gerenciar a equipe." }, 403);

  const [invitationResult, memberResult] = await Promise.all([
    result.supabase.rpc("owner_list_employee_invitations", { p_store_id: store.id }),
    result.supabase.rpc("owner_list_store_members", { p_store_id: store.id }),
  ]);
  if (invitationResult.error || memberResult.error) {
    return privateJson({ message: "Não foi possível carregar os dados da equipe." }, 503);
  }

  return privateJson({
    invitations: invitationResult.data ?? [],
    members: memberResult.data ?? [],
  });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return privateJson({ message: "Requisição inválida." }, 403);
  const result = await requireApiAccess(request, "panel");
  if (!result.ok) return result.response;
  const store = result.access.store;
  if (!store || !store.active) return privateJson({ message: "O pet shop está inativo." }, 403);
  if (store.role !== "owner") return privateJson({ message: "Somente o gestor pode gerenciar a equipe." }, 403);

  const body = await readJsonBody(request, 10_000);
  if (!body.ok) return privateJson({ message: "Informe um e-mail válido." }, body.tooLarge ? 413 : 400);
  const parsed = invitationSchema.safeParse(body.value);
  if (!parsed.success) return privateJson({ message: "Informe um e-mail válido." }, 400);

  try {
    const invitation = await issuePlatformInvitation(result.supabase, {
      type: "employee",
      email: parsed.data.email,
      storeId: store.id,
    });
    return privateJson({ invitation }, 201);
  } catch {
    return privateJson({ message: "Não foi possível criar o convite. Confira o e-mail e tente novamente." }, 400);
  }
}
