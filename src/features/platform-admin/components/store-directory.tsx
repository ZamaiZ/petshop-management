"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LuCircleCheck, LuCirclePause, LuStore } from "react-icons/lu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type PlatformStore = {
  store_id: string;
  store_name: string;
  platform_active: boolean;
  platform_active_changed_at: string | null;
  created_at: string;
  owner_user_id: string | null;
  owner_email: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function StoreStatusAction({ store }: { store: PlatformStore }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const nextActive = !store.platform_active;

  async function updateStatus() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/platform-admin/stores/${store.store_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? "Não foi possível atualizar o pet shop.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setMessage("Não foi possível atualizar o pet shop. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant={nextActive ? "outline" : "ghost"} className="h-8 px-2.5 text-[10px]" onClick={() => { setMessage(""); setOpen(true); }}>
        {nextActive ? "Reativar" : "Desativar"}
      </Button>
      {message ? <p role="alert" className="mt-2 max-w-44 text-[10px] text-destructive">{message}</p> : null}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{nextActive ? "Reativar pet shop?" : "Desativar pet shop?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {nextActive
                ? `O acesso de ${store.store_name} será liberado novamente para seus gestores e colaboradores.`
                : `O acesso de ${store.store_name} será bloqueado. Os dados e os vínculos dos usuários serão preservados.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
            <AlertDialogAction variant={nextActive ? "default" : "destructive"} onClick={updateStatus} disabled={pending}>
              {pending ? "Atualizando…" : nextActive ? "Reativar pet shop" : "Desativar pet shop"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function StoreDirectory({ stores, loadError }: { stores: PlatformStore[]; loadError: boolean }) {
  const activeCount = stores.filter((store) => store.platform_active).length;
  const inactiveCount = stores.length - activeCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Administração da plataforma</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">Pet shops</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Consulte o estado das lojas e controle o acesso à plataforma.</p>
        </div>
        <div className="flex gap-2">
          <Card className="flex min-w-28 items-center gap-2 rounded-lg border-border/90 px-3 py-2.5 shadow-xs">
            <span className="grid size-7 place-items-center rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><LuCircleCheck className="size-4" aria-hidden="true" /></span>
            <span><span className="block text-[15px] font-semibold leading-4">{activeCount}</span><span className="mt-1 block text-[9px] text-muted-foreground">Ativos</span></span>
          </Card>
          <Card className="flex min-w-28 items-center gap-2 rounded-lg border-border/90 px-3 py-2.5 shadow-xs">
            <span className="grid size-7 place-items-center rounded-md bg-muted text-muted-foreground"><LuCirclePause className="size-4" aria-hidden="true" /></span>
            <span><span className="block text-[15px] font-semibold leading-4">{inactiveCount}</span><span className="mt-1 block text-[9px] text-muted-foreground">Inativos</span></span>
          </Card>
        </div>
      </div>

      {loadError ? <Alert variant="destructive"><AlertDescription>Não foi possível carregar a lista. Atualize a página para tentar novamente.</AlertDescription></Alert> : null}
      <Card className="gap-0 overflow-hidden rounded-xl border-border/90 p-0 shadow-xs">
        {stores.length ? (
          <div className="divide-y divide-border">
            {stores.map((store) => (
              <div key={store.store_id} className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1.8fr)_minmax(160px,1fr)_minmax(110px,0.7fr)_auto] sm:items-center sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><LuStore className="size-4" aria-hidden="true" /></span>
                  <div className="min-w-0"><p className="truncate text-[12px] font-semibold">{store.store_name}</p><p className="mt-1 text-[10px] text-muted-foreground">Criado em {formatDate(store.created_at)}</p></div>
                </div>
                <div className="min-w-0"><p className="text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Gestor</p><p className="mt-1 truncate text-[11px]">{store.owner_email ?? "Não identificado"}</p></div>
                <div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-medium ${store.platform_active ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                    <span className={`size-1.5 rounded-full ${store.platform_active ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />{store.platform_active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <div className="sm:text-right"><StoreStatusAction store={store} /></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-16 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground"><LuStore className="size-5" aria-hidden="true" /></span>
            <p className="mt-3 text-[12px] font-medium">Nenhum pet shop cadastrado</p>
            <p className="mt-1 text-[10px] text-muted-foreground">As lojas aparecerão aqui quando o primeiro convite for aceito e a configuração concluída.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
