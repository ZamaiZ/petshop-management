"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthFeedback, AuthPasswordField, AuthTextField } from "./auth-fields";
import { AuthThemeToggle } from "./auth-theme-toggle";
import { MutationRegion, runMutationFeedback } from "@/components/feedback/mutation-feedback";

export function InvitationAcceptanceForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setMessage("Este link está incompleto. Peça um novo convite ao responsável.");
      return;
    }

    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const result = await runMutationFeedback({
      scope: "auth",
      action: async () => {
        const response = await fetch("/api/auth/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            email: formData.get("email"),
            password: formData.get("password"),
          }),
        }).catch(() => null);
        const payload = response ? await response.json().catch(() => null) : null;
        return {
          ok: Boolean(response?.ok),
          message: payload?.message,
          destination: typeof payload?.destination === "string" ? payload.destination : null,
          signInRequired: Boolean(payload?.signInRequired),
        };
      },
      success: { title: "Conta criada", description: "Seu acesso foi liberado." },
      failureTitle: "Não foi possível aceitar o convite",
      unexpectedMessage: "Confira o link e os dados informados.",
    });

    if (!result.ok) {
      setMessage(result.message ?? "Não foi possível aceitar este convite.");
      setPending(false);
      return;
    }

    if (result.signInRequired) {
      router.replace("/login?created=1");
      return;
    }
    router.replace(result.destination ?? "/login");
  }

  return (
    <MutationRegion scope="auth" label="Validando o convite…">
      <div>
        <div className="mb-7">
          <div className="flex items-center justify-between">
            <h2 className="text-[24px] font-semibold tracking-[-0.04em]">Criar acesso</h2>
            <AuthThemeToggle />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Informe o e-mail que recebeu o convite e escolha uma senha para entrar.
          </p>
        </div>
        {!token ? (
          <AuthFeedback message="Este link está incompleto ou inválido. Peça um novo convite ao responsável." />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
            <AuthTextField id="email" label="E-mail do convite" type="email" autoComplete="email" maxLength={254} />
            <AuthPasswordField id="password" label="Criar senha" autoComplete="new-password" minLength={12} />
            <p className="-mt-1 text-[10px] leading-4 text-muted-foreground">Use pelo menos 12 caracteres.</p>
            <AuthFeedback message={message} />
            <Button type="submit" className="h-10 w-full rounded-md text-[12px]" disabled={pending}>
              {pending ? "Criando acesso…" : "Aceitar convite"}
            </Button>
          </form>
        )}
      </div>
    </MutationRegion>
  );
}
