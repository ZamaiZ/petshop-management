import type { Metadata } from "next";
import { InvitationCreateCard } from "@/features/invitations/components/invitation-create-card";
import { InvitationList, type InvitationRecord } from "@/features/invitations/components/invitation-list";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Convites · Administração" };

export default async function PlatformInvitationsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_admin_list_invitations");
  const invitations = error ? [] : (data ?? []) as InvitationRecord[];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Administração da plataforma</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">Convites para novos pet shops</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Crie um link de uso único para o futuro gestor configurar uma loja.</p>
      </div>
      <InvitationCreateCard
        endpoint="/api/platform-admin/invitations"
        title="Criar convite de gestor"
        description="O primeiro acesso terá o papel de gestor. O convite fica vinculado ao e-mail indicado, expira em sete dias e é enviado manualmente pelo link seguro."
      />
      <InvitationList invitations={invitations} endpoint="/api/platform-admin/invitations" title="Convites de pet shops" />
      {error ? <p role="alert" className="text-[11px] text-destructive">Não foi possível carregar os convites agora.</p> : null}
    </div>
  );
}
