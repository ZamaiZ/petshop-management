import type { ReactNode } from "react";
import Link from "next/link";
import { LuPawPrint } from "react-icons/lu";
import type { ApplicationAudience } from "@/lib/platform-access/hosts";

export default function AuthLayout({ children, audience = "panel" }: {
  children: ReactNode;
  audience?: ApplicationAudience;
}) {
  const isAdmin = audience === "admin";

  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-2">
      <section className="relative hidden min-h-dvh flex-col justify-between bg-[#f5f6f8] px-12 py-10 text-foreground lg:flex xl:px-[60px] xl:py-14 dark:bg-[#17181b]">
        <Link href="/login" className="inline-flex w-fit items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
            <LuPawPrint className="size-4" aria-hidden="true" />
          </span>
          petshop.
        </Link>
        <div className="pb-1">
          <h1 className="text-[38px] font-semibold tracking-[-0.045em]">{isAdmin ? "Acesso à plataforma" : "Acesso à loja"}</h1>
          <p className="mt-3 text-[14px] text-muted-foreground">{isAdmin ? "Convites e situação dos pet shops." : "Vendas, estoque, agenda e financeiro."}</p>
        </div>
        <p className="text-xs text-muted-foreground">{isAdmin ? "Administração geral da plataforma." : "Gestão simples para cuidar melhor do seu negócio."}</p>
      </section>
      <section className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[360px]">
          <div className="mb-8 flex justify-center lg:hidden">
            <Link href="/login" className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
                <LuPawPrint className="size-4" aria-hidden="true" />
              </span>
              petshop.
            </Link>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
