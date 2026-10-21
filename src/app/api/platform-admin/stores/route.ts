import { privateJson, requireApiAccess } from "@/lib/platform-access/api";

export async function GET(request: Request) {
  const result = await requireApiAccess(request, "admin");
  if (!result.ok) return result.response;
  if (!result.access.isPlatformAdmin) return privateJson({ message: "Acesso não autorizado." }, 403);

  const { data, error } = await result.supabase.rpc("platform_admin_list_stores");
  if (error) return privateJson({ message: "Não foi possível carregar os pet shops." }, 503);
  return privateJson({ stores: data ?? [] });
}
