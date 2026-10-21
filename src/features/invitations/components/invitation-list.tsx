"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LuClock3, LuMail, LuShieldCheck, LuUserRoundX } from "react-icons/lu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type InvitationRecord = {
  invitation_id: string;
  email_normalized: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

function invitationState(invitation: InvitationRecord) {
  if (invitation.accepted_at) return { label: "Aceito", tone: "text-emerald-700 dark:text-emerald-300", icon: LuShieldCheck, canRevoke: false };
  if (invitation.revoked_at) return { label: "Revogado", tone: "text-muted-foreground", icon: LuUserRoundX, canRevoke: false };
  if (new Date(invitation.expires_at).getTime() <= Date.now()) return { label: "Expirado", tone: "text-amber-700 dark:text-amber-300", icon: LuClock3, canRevoke: false };
  return { label: "Aguardando", tone: "text-sky-700 dark:text-sky-300", icon: LuMail, canRevoke: true };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function InvitationList({ invitations, endpoint, title = "Convites recentes" }: {
  invitations: InvitationRecord[];
  endpoint: string;
  title?: string;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState("");
  const [message, setMessage] = useState("");

  async function revoke(id: string) {
    setPendingId(id);
    setMessage("");
    try {
      const response = await fetch(`${endpoint}/${id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Não foi possível revogar o convite.");
        return;
      }
      router.refresh();
    } catch {
      setMessage("Não foi possível revogar o convite. Tente novamente.");
    } finally {
      setPendingId("");
    }
  }

  return (
    <Card className="gap-0 rounded-xl border-border/90 p-5 shadow-xs sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">Links ativos, expirados e já utilizados.</p>
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><LuMail className="size-4" aria-hidden="true" /></span>
      </div>
      {message ? <Alert variant="destructive" className="mt-4"><AlertDescription>{message}</AlertDescription></Alert> : null}
      {invitations.length ? (
        <div className="mt-4 divide-y divide-border">
          {invitations.map((invitation) => {
            const state = invitationState(invitation);
            const Icon = state.icon;
            return (
              <div key={invitation.invitation_id} className="flex flex-col gap-3 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium">{invitation.email_normalized}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Expira em {formatDate(invitation.expires_at)}</p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${state.tone}`}><Icon className="size-3.5" aria-hidden="true" />{state.label}</span>
                  {state.canRevoke ? (
                    <Button type="button" variant="ghost" className="h-8 px-2.5 text-[10px]" onClick={() => revoke(invitation.invitation_id)} disabled={pendingId === invitation.invitation_id}>
                      {pendingId === invitation.invitation_id ? "Revogando…" : "Revogar"}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <p className="text-[12px] font-medium">Nenhum convite criado</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Quando você criar um link, o estado aparecerá aqui.</p>
        </div>
      )}
    </Card>
  );
}
