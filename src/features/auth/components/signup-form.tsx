"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthFeedback, AuthPasswordField, AuthTextField } from "./auth-fields";
import { AuthThemeToggle } from "./auth-theme-toggle";

export function SignupForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const accountPassword = String(formData.get("password") ?? "");
    const authorizationPassword = String(formData.get("authorizationPassword") ?? "");
    if (new TextEncoder().encode(authorizationPassword).length > 72) {
      setMessage("A senha de autorização deve ter no máximo 72 bytes.");
      setPending(false);
      return;
    }

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeName: formData.get("storeName"),
        email: formData.get("email"),
        password: accountPassword,
        authorizationPassword,
      }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => null) : null;

    if (!response?.ok) {
      setMessage(result?.message ?? "Não foi possível criar a conta agora.");
      setPending(false);
      return;
    }

    if (result?.signInRequired) {
      router.replace("/login?created=1");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[24px] font-semibold tracking-[-0.04em]">Criar conta</h2>
          <AuthThemeToggle />
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Cadastre seu pet shop para começar.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3.5" aria-busy={pending}>
        <AuthTextField id="storeName" label="Nome do pet shop" maxLength={120} />
        <AuthTextField id="email" label="E-mail" type="email" autoComplete="email" maxLength={254} />
        <AuthPasswordField id="password" label="Senha da conta" autoComplete="new-password" minLength={12} />
        <AuthPasswordField id="authorizationPassword" label="Senha de autorização" autoComplete="off" minLength={16} />
        <p className="-mt-1 text-[10px] leading-4 text-muted-foreground">A senha de autorização é fornecida pelo responsável pelo sistema e não substitui sua senha de acesso.</p>
        <AuthFeedback message={message} />
        <Button type="submit" className="mt-1 h-10 w-full rounded-md text-[12px]" disabled={pending}>
          {pending ? "Criando conta…" : "Criar conta"}
        </Button>
      </form>
      <p className="mt-5 text-center text-[11px] text-muted-foreground">
        Já tem conta? <Link href="/login" className="font-medium text-foreground hover:underline">Entrar</Link>
      </p>
    </div>
  );
}
