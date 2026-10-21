import type { Metadata } from "next";
import { TeamView } from "@/features/team/components/team-view";
import { requireOwnerContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage() {
  const context = await requireOwnerContext();
  const supabase = await createClient();
  const [invitationResult, memberResult] = await Promise.all([
    supabase.rpc("owner_list_employee_invitations", { p_store_id: context.store.id }),
    supabase.rpc("owner_list_store_members", { p_store_id: context.store.id }),
  ]);

  return (
    <TeamView
      invitations={invitationResult.error ? [] : invitationResult.data ?? []}
      members={memberResult.error ? [] : memberResult.data ?? []}
      loadError={Boolean(invitationResult.error || memberResult.error)}
    />
  );
}
