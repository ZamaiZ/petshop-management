import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AuthThemeToggle } from "@/features/auth/components/auth-theme-toggle";

export const metadata: Metadata = { title: "Acesso por convite", robots: { index: false, follow: false } };

export default function SignupPage() {
  return (
    <div>
      <div className="mb-7">
        <div className="flex items-center justify-between">
          <h2 className="text-[24px] font-semibold tracking-[-0.04em]">Acesso por convite</h2>
          <AuthThemeToggle />
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          A criação de conta é feita por um link individual enviado pelo administrador da plataforma ou pelo gestor do pet shop.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-[12px] leading-5 text-muted-foreground">
        Se você recebeu um convite, abra o link completo para criar seu acesso. Convites expiram após sete dias e só podem ser usados uma vez.
      </div>
      <Button render={<Link href="/login" />} className="mt-5 h-10 w-full rounded-md text-[12px]">
        Voltar para entrar
      </Button>
    </div>
  );
}
