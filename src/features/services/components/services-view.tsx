"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LuArchive, LuClock3, LuPencil, LuPlus, LuRotateCcw, LuSearch } from "react-icons/lu";
import { archiveService, createService, restoreService, updateService } from "@/features/services/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatMoneyInput } from "@/lib/format";
import type { ServiceRecord } from "../queries";

function ServiceDialog({ service, open, onOpenChange, onSaved }: {
  service: ServiceRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const input = {
        name: String(form.get("name") ?? ""),
        price: String(form.get("price") ?? ""),
        duration: String(form.get("duration") ?? ""),
      };
      const result = service
        ? await updateService({ ...input, id: service.id })
        : await createService(input);
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível salvar o serviço.");
        return;
      }
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{service ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          <DialogDescription>O histórico de agendamentos e vendas mantém os dados registrados na época.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="service-name">Nome</Label><Input id="service-name" name="name" defaultValue={service?.name ?? ""} required minLength={2} maxLength={120} className="h-10" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="service-duration">Duração (minutos)</Label><Input id="service-duration" name="duration" type="number" min="15" max="600" step="15" defaultValue={service?.duration_minutes ?? 30} required className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="service-price">Preço (R$)</Label><Input id="service-price" name="price" inputMode="decimal" defaultValue={service ? formatMoneyInput(service.price_cents) : "0,00"} required className="h-10 tabular-nums" /></div>
          </div>
          {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Salvando serviço…" : service ? "Salvar alterações" : "Cadastrar serviço"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ServicesView({ services }: { services: ServiceRecord[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [target, setTarget] = useState<ServiceRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const visible = useMemo(() => services.filter((service) => {
    if (Boolean(service.archived_at) !== showArchived) return false;
    return service.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"));
  }), [search, services, showArchived]);

  function changeArchive(service: ServiceRecord, restore: boolean) {
    setMessage("");
    startTransition(async () => {
      const result = restore ? await restoreService(service.id) : await archiveService(service.id);
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível atualizar o serviço.");
        return;
      }
      router.refresh();
    });
  }

  function openDialog(service: ServiceRecord | null) {
    setTarget(service);
    setMessage("");
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><h1 className="text-2xl font-semibold tracking-[-0.04em]">Serviços</h1><p className="mt-1.5 text-sm text-muted-foreground">Gerencie os serviços usados na agenda e nas vendas.</p></div>
        <Button onClick={() => openDialog(null)} className="h-10"><LuPlus className="size-4" aria-hidden="true" />Novo serviço</Button>
      </div>
      {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
      <Card className="gap-0 rounded-xl border-border/90 p-4 shadow-xs sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm"><LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Buscar serviço" aria-label="Buscar serviços" className="h-10 pl-9" /></div>
          <div className="flex gap-2" role="group" aria-label="Situação dos serviços">
            <Button type="button" size="sm" variant={!showArchived ? "default" : "outline"} aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>Ativos</Button>
            <Button type="button" size="sm" variant={showArchived ? "default" : "outline"} aria-pressed={showArchived} onClick={() => setShowArchived(true)}>Arquivados</Button>
          </div>
        </div>
        <div className="mt-4 divide-y divide-border">
          {visible.map((service) => (
            <article key={service.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{service.name}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><LuClock3 className="size-3.5" aria-hidden="true" />{service.duration_minutes} min</span>
                  <span className="font-medium tabular-nums text-foreground">{formatMoney(service.price_cents)}</span>
                  {service.archived_at ? <span>Arquivado</span> : null}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => openDialog(service)}><LuPencil className="size-3.5" aria-hidden="true" />Editar</Button>
                {showArchived
                  ? <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => changeArchive(service, true)}><LuRotateCcw className="size-3.5" aria-hidden="true" />Reativar</Button>
                  : <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => changeArchive(service, false)}><LuArchive className="size-3.5" aria-hidden="true" />Arquivar</Button>}
              </div>
            </article>
          ))}
          {!visible.length ? <div className="py-12 text-center"><p className="text-sm font-medium">{services.length ? "Nenhum serviço encontrado." : "Nenhum serviço cadastrado."}</p><p className="mt-1 text-xs text-muted-foreground">{services.length ? "Ajuste a busca ou altere a situação selecionada." : "Cadastre serviços para usá-los na agenda e nas vendas."}</p></div> : null}
        </div>
      </Card>
      {dialogOpen ? <ServiceDialog key={target ? `service-${target.id}` : "service-new"} service={target} open onOpenChange={setDialogOpen} onSaved={() => router.refresh()} /> : null}
    </div>
  );
}
