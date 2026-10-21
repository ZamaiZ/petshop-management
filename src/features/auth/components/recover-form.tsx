"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AuthFeedback, AuthTextField } from "./auth-fields";
import { MutationRegion, runMutationFeedback } from "@/components/feedback/mutation-feedback";

export function RecoverForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const result = await runMutationFeedback({ scope: "auth", action: async () => {
      const response = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.get("email") }),
      }).catch(() => null);
      const payload = response ? await response.json().catch(() => null) : null;
      return { ok: Boolean(response?.ok), message: payload?.message };
    }, success: { title: "Solicitação enviada", description: "Se o e-mail estiver cadastrado, as instruções chegarão em breve." }, failureTitle: "Não foi possível enviar as instruções", unexpectedMessage: "Confira sua conexão e tente novamente." });
    const response = { ok: result.ok };

    if (!response?.ok) {
      setMessage(result?.message ?? "Não foi possível enviar as instruções agora.");
    } else {
      setSent(true);
      setMessage("Se o e-mail estiver cadastrado, enviaremos as instruções para redefinir a senha.");
    }
    setPending(false);
  }

  return (
    <MutationRegion scope="auth" label="Enviando as instruções…"><div>
      <div className="mb-7">
        <h2 className="text-[24px] font-semibold tracking-[-0.04em]">Recuperar senha</h2>
        <p className="mt-2 text-[12px] text-muted-foreground">Enviaremos um link para o e-mail da sua conta.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
        <AuthTextField id="email" label="E-mail" type="email" autoComplete="email" maxLength={254} />
        <AuthFeedback message={message} success={sent} />
        <Button type="submit" className="h-10 w-full rounded-md text-[12px]" disabled={pending || sent}>
          {pending ? "Enviando…" : sent ? "Instruções enviadas" : "Enviar instruções"}
        </Button>
      </form>
      <p className="mt-5 text-center text-[11px] text-muted-foreground"><Link href="/login" className="font-medium text-foreground hover:underline">Voltar para entrar</Link></p>
    </div></MutationRegion>
  );
}
