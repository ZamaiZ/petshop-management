"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthFeedback, AuthPasswordField } from "./auth-fields";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/update-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: formData.get("password") }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => null) : null;

    if (!response?.ok) {
      setMessage(result?.message ?? "Não foi possível atualizar a senha agora.");
      setPending(false);
      return;
    }

    setMessage("Senha atualizada. Você já pode continuar.");
    setPending(false);
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-7">
        <h2 className="text-[24px] font-semibold tracking-[-0.04em]">Criar nova senha</h2>
        <p className="mt-2 text-[12px] text-muted-foreground">Escolha uma senha pessoal para acessar sua loja.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
        <AuthPasswordField id="password" label="Nova senha" autoComplete="new-password" minLength={12} />
        <AuthFeedback message={message} />
        <Button type="submit" className="h-10 w-full rounded-md text-[12px]" disabled={pending}>
          {pending ? "Salvando…" : "Salvar nova senha"}
        </Button>
      </form>
    </div>
  );
}
