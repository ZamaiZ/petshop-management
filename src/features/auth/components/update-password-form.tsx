"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthFeedback, AuthPasswordField } from "./auth-fields";
import { MutationRegion, runMutationFeedback } from "@/components/feedback/mutation-feedback";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const result = await runMutationFeedback({ scope: "auth", action: async () => {
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: formData.get("password") }),
      }).catch(() => null);
      const payload = response ? await response.json().catch(() => null) : null;
      return {
        ok: Boolean(response?.ok),
        message: payload?.message,
        destination: typeof payload?.destination === "string" ? payload.destination : null,
      };
    }, success: { title: "Senha atualizada", description: "Sua nova senha já pode ser usada para entrar." }, failureTitle: "Não foi possível atualizar a senha", unexpectedMessage: "Confira sua conexão e tente novamente." });

    if (!result.ok) {
      setMessage(result?.message ?? "Não foi possível atualizar a senha agora.");
      setPending(false);
      return;
    }

    setMessage("Senha atualizada. Você já pode continuar.");
    setPending(false);
    router.replace(result.destination ?? "/login");
  }

  return (
    <MutationRegion scope="auth" label="Atualizando sua senha…"><div>
      <div className="mb-7">
        <h2 className="text-[24px] font-semibold tracking-[-0.04em]">Criar nova senha</h2>
        <p className="mt-2 text-[12px] text-muted-foreground">Escolha uma senha pessoal para acessar sua conta.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
        <AuthPasswordField id="password" label="Nova senha" autoComplete="new-password" minLength={12} />
        <AuthFeedback message={message} />
        <Button type="submit" className="h-10 w-full rounded-md text-[12px]" disabled={pending}>
          {pending ? "Salvando…" : "Salvar nova senha"}
        </Button>
      </form>
    </div></MutationRegion>
  );
}
