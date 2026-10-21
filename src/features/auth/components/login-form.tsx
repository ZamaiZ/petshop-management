"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ApplicationAudience } from "@/lib/platform-access/hosts";
import { Button } from "@/components/ui/button";
import { AuthFeedback, AuthPasswordField, AuthTextField } from "./auth-fields";
import { AuthThemeToggle } from "./auth-theme-toggle";
import { MutationRegion, runMutationFeedback } from "@/components/feedback/mutation-feedback";

export function LoginForm({ audience }: { audience: ApplicationAudience }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const isAdmin = audience === "admin";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const result = await runMutationFeedback({
      scope: "auth",
      action: async () => {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: formData.get("email"), password: formData.get("password") }),
        }).catch(() => null);
        const payload = response ? await response.json().catch(() => null) : null;
        return {
          ok: Boolean(response?.ok),
          message: payload?.message,
          destination: typeof payload?.destination === "string" ? payload.destination : null,
        };
      },
      success: { title: "Acesso realizado", description: isAdmin ? "Sessão administrativa iniciada." : "Bem-vindo de volta." },
      failureTitle: "Não foi possível entrar",
      unexpectedMessage: "Confira sua conexão e tente novamente.",
    });

    if (!result.ok || !result.destination) {
      setMessage(result.message ?? "Esta conta não tem acesso a este painel. Confira o ambiente de entrada.");
      setPending(false);
      return;
    }

    router.replace(result.destination);
  }

  return (
    <MutationRegion scope="auth" label="Validando seu acesso…">
      <div>
        <div className="mb-7">
          <div className="flex items-center justify-between">
            <h2 className="text-[24px] font-semibold tracking-[-0.04em]">Entrar</h2>
            <AuthThemeToggle />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {isAdmin ? "Acesse a gestão da plataforma." : "Entre na conta do seu pet shop."}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
          <AuthTextField id="email" label="E-mail" type="email" autoComplete="email" maxLength={254} />
          <div className="space-y-2">
            <AuthPasswordField id="password" label="Senha da conta" autoComplete="current-password" />
            <div className="flex justify-end">
              <Link href="/recuperar-senha" className="text-[11px] text-muted-foreground hover:text-foreground">Esqueci minha senha</Link>
            </div>
          </div>
          <AuthFeedback message={message} />
          <Button type="submit" className="h-10 w-full rounded-md text-[12px]" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"}
          </Button>
        </form>
        {!isAdmin ? (
          <p className="mt-5 text-center text-[11px] text-muted-foreground">
            Precisa criar um acesso? <Link href="/cadastro" className="font-medium text-foreground hover:underline">Use um convite</Link>
          </p>
        ) : null}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? null : (
          <p className="mt-6 rounded-md bg-muted px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
            A conexão com o Supabase precisa ser configurada no ambiente antes do primeiro acesso.
          </p>
        )}
      </div>
    </MutationRegion>
  );
}
