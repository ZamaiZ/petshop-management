import { z } from "zod";
import { hasSameOrigin, readJsonBody } from "@/lib/http/security";
import { privateJson, requireApiAccess } from "@/lib/platform-access/api";

const idSchema = z.string().uuid();
const statusSchema = z.object({ active: z.boolean() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  if (!hasSameOrigin(request)) return privateJson({ message: "Requisição inválida." }, 403);
  const { storeId } = await params;
  if (!idSchema.safeParse(storeId).success) return privateJson({ message: "Pet shop inválido." }, 400);

  const body = await readJsonBody(request, 10_000);
  if (!body.ok) return privateJson({ message: "Informe a situação do pet shop." }, body.tooLarge ? 413 : 400);
  const parsed = statusSchema.safeParse(body.value);
  if (!parsed.success) return privateJson({ message: "Informe a situação do pet shop." }, 400);

  const result = await requireApiAccess(request, "admin");
  if (!result.ok) return result.response;
  if (!result.access.isPlatformAdmin) return privateJson({ message: "Acesso não autorizado." }, 403);

  const { data, error } = await result.supabase.rpc("platform_admin_set_store_active", {
    p_store_id: storeId,
    p_active: parsed.data.active,
  });
  if (error) return privateJson({ message: "Não foi possível atualizar o pet shop." }, 503);
  return privateJson({ ok: true, changed: data });
}
