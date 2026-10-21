import "server-only";

import { parseAccessContext } from "@/lib/auth/context";
import { getRequestAudience, type ApplicationAudience } from "./hosts";
import { createClient } from "@/lib/supabase/server";

export async function getAuthenticatedRequestContext(request: Request, audience: ApplicationAudience) {
  if (getRequestAudience(request) !== audience) return { status: "wrong_host" as const };

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { status: "unauthenticated" as const };

  const { data, error } = await supabase.rpc("current_access_context");
  const access = error ? null : parseAccessContext(data);
  if (!access) return { status: "unavailable" as const };

  return { status: "ok" as const, supabase, user: authData.user, access };
}
