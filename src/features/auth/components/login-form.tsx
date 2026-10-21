"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthFeedback, AuthPasswordField, AuthTextField } from "./auth-fields";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: formData.get("email"), password: formData.get("password") }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => null) : null;

    if (!response?.ok) {
      setMessage(result?.message ?? "Não foi possível entrar agora. Tente novamente.");
      setPending(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-7">
        <h2 className="text-[24px] font-semibold tracking-[-0.04em]">Entrar</h2>
        <p className="mt-2 text-[12px] text-muted-foreground">Entre na conta do seu pet shop.</p>
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
      <p className="mt-5 text-center text-[11px] text-muted-foreground">
        Ainda não tem conta? <Link href="/cadastro" className="font-medium text-foreground hover:underline">Criar conta</Link>
      </p>
      {process.env.NEXT_PUBLIC_SUPABASE_URL ? null : (
        <p className="mt-6 rounded-md bg-muted px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
          A conexão com o Supabase precisa ser configurada no ambiente antes do primeiro acesso.
        </p>
      )}
    </div>
  );
}
