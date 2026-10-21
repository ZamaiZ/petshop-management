import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LuCirclePause, LuPawPrint } from "react-icons/lu";
import { Card } from "@/components/ui/card";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { getAccessContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Pet shop inativo", robots: { index: false, follow: false } };

export default function InactiveStorePage() {
  return <Suspense fallback={<main className="min-h-dvh" aria-busy="true" />}><ResolvedInactiveStorePage /></Suspense>;
}

async function ResolvedInactiveStorePage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.isPlatformAdmin) redirect("/login?access=denied");
  if (access.pendingStoreSetup) redirect("/configuracao-inicial");
  if (!access.store) redirect("/login?access=denied");
  if (!access.store.membershipActive) redirect("/login?access=denied");
  if (access.store.platformActive && !access.store.archived) redirect("/dashboard");

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f6f7f9] px-4 py-10 dark:bg-background">
      <Card className="w-full max-w-[460px] gap-0 rounded-xl border-border/90 p-7 text-center shadow-xs sm:p-9">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground"><LuCirclePause className="size-6" aria-hidden="true" /></div>
        <div className="mt-5 flex items-center justify-center gap-2 text-[12px] font-semibold"><LuPawPrint className="size-4" aria-hidden="true" />petshop.</div>
        <h1 className="mt-3 text-[22px] font-semibold tracking-[-0.04em]">Acesso temporariamente suspenso</h1>
        <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">{access.store.name}</span> está inativo na plataforma. Os dados foram preservados. Fale com o administrador da plataforma para reativar o acesso.
        </p>
        <div className="mt-6 flex justify-center"><LogoutButton /></div>
      </Card>
    </main>
  );
}
