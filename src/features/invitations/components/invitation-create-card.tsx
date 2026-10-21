"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCopy, LuMailPlus } from "react-icons/lu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CreatedInvitation = { invitationId: string; expiresAt: string; link: string };

export function InvitationCreateCard({ endpoint, title, description }: {
  endpoint: string;
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [invitation, setInvitation] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setInvitation(null);
    setCopied(false);
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.invitation) {
        setMessage(payload?.message ?? "Não foi possível criar o convite. Tente novamente.");
        return;
      }
      const result = payload.invitation;
      if (typeof result.invitationId !== "string" || typeof result.expiresAt !== "string" || typeof result.link !== "string") {
        setMessage("Não foi possível exibir o link. Atualize a página e consulte os convites.");
        return;
      }
      setInvitation(result as CreatedInvitation);
      router.refresh();
    } catch {
      setMessage("Não foi possível criar o convite. Confira sua conexão e tente novamente.");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.link);
      setCopied(true);
      setMessage("");
    } catch {
      setMessage("Não foi possível copiar automaticamente. Selecione o link e copie manualmente.");
    }
  }

  return (
    <Card className="gap-0 rounded-xl border-border/90 p-5 shadow-xs sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted"><LuMailPlus className="size-4" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" aria-busy={pending}>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="invitation-email">E-mail do convite</Label>
          <Input id="invitation-email" name="email" type="email" autoComplete="email" maxLength={254} required className="h-10" placeholder="nome@exemplo.com" />
        </div>
        <Button type="submit" className="h-10 shrink-0 px-4" disabled={pending}>{pending ? "Criando…" : "Criar link"}</Button>
      </form>
      {message ? <Alert variant="destructive" className="mt-4"><AlertDescription>{message}</AlertDescription></Alert> : null}
      {invitation ? (
        <div className="mt-5 rounded-lg border border-border bg-muted/25 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium">Link pronto para enviar manualmente</p>
            <span className="shrink-0 text-[10px] text-muted-foreground">Válido por 7 dias</span>
          </div>
          <div className="mt-2 flex gap-2">
            <Input aria-label="Link seguro do convite" readOnly value={invitation.link} className="h-9 min-w-0 text-[10px]" onFocus={(event) => event.currentTarget.select()} />
            <Button type="button" variant="outline" className="h-9 shrink-0 px-3" onClick={copyLink} aria-label="Copiar link do convite">
              {copied ? <LuCheck className="size-4" aria-hidden="true" /> : <LuCopy className="size-4" aria-hidden="true" />}
              <span className="hidden sm:inline">{copied ? "Copiado" : "Copiar"}</span>
            </Button>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">O link é de uso único e fica vinculado ao e-mail informado. Guarde-o até enviá-lo.</p>
        </div>
      ) : null}
    </Card>
  );
}
