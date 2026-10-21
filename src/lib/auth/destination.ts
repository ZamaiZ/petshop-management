import type { ParsedAccessContext } from "./context";
import type { ApplicationAudience } from "@/lib/platform-access/hosts";

export function getPostLoginDestination(access: ParsedAccessContext, audience: ApplicationAudience) {
  if (audience === "admin") return access.isPlatformAdmin ? "/lojas" : null;
  if (access.isPlatformAdmin) return null;
  if (access.pendingStoreSetup) return "/configuracao-inicial";
  if (access.store?.membershipActive) {
    return access.store.platformActive && !access.store.archived ? "/dashboard" : "/loja-inativa";
  }
  return null;
}
