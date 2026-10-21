"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LuImagePlus, LuPawPrint, LuPlus, LuStore, LuTrash2 } from "react-icons/lu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComboboxField } from "@/components/ui/combobox-field";
import { BrlInput } from "@/components/ui/brl-input";
import { CnpjInput } from "@/components/ui/cnpj-input";
import { formatCnpj } from "@/lib/cnpj";
import { formatMoney, formatMoneyInput } from "@/lib/format";
import { storeTimezones } from "@/lib/store-timezones";
import { archiveService, archiveSupplier, createService, createSupplier, removeStoreLogo, restoreService, restoreSupplier, saveStoreProfile, updateService, updateSupplier, uploadStoreLogo } from "../actions";

type Service = { id: string; name: string; price_cents: number; duration_minutes: number; archived_at: string | null };
type Supplier = { id: string; name: string; cnpj: string | null; phone: string | null; email: string | null; address: unknown; notes: string | null; archived_at: string | null };
type SettingsCatalog = { services: Service[]; suppliers: Supplier[] };
type Address = { city?: string | null; state?: string | null; street?: string | null; number?: string | null; complement?: string | null; district?: string | null; postal_code?: string | null; reference?: string | null };

function storeAddress(value: unknown): Address {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const address = value as Record<string, unknown>;
  return {
    city: typeof address.city === "string" ? address.city : "",
    state: typeof address.state === "string" ? address.state : "",
    street: typeof address.street === "string" ? address.street : "",
    number: typeof address.number === "string" ? address.number : "",
    complement: typeof address.complement === "string" ? address.complement : "",
    district: typeof address.district === "string" ? address.district : "",
    postal_code: typeof address.postal_code === "string" ? address.postal_code : "",
    reference: typeof address.reference === "string" ? address.reference : "",
  };
}

export function SettingsView({ store, logoUrl, catalog }: { store: { id: string; name: string; phone: string | null; email: string | null; address: unknown; timezone: string; logo_path: string | null }; logoUrl: string | null; catalog: SettingsCatalog }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [timezone, setTimezone] = useState(store.timezone);
  const address = storeAddress(store.address);

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setSaved(false);
    startTransition(async () => {
      const result = await saveStoreProfile({ name: String(form.get("name") ?? ""), phone: String(form.get("phone") ?? ""), email: String(form.get("email") ?? ""), city: String(form.get("city") ?? ""), state: String(form.get("state") ?? ""), street: String(form.get("street") ?? ""), timezone });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setSaved(true);
      router.refresh();
    });
  }

  function uploadLogo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setMessage("Escolha uma imagem para enviar."); return; }
    const form = new FormData();
    form.set("file", file);
    setMessage("");
    setBusy(true);
    startTransition(async () => {
      const result = await uploadStoreLogo(form);
      setBusy(false);
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      if (fileRef.current) fileRef.current.value = "";
      setSaved(true);
      router.refresh();
    });
  }

  function clearLogo() {
    setMessage("");
    startTransition(async () => {
      const result = await removeStoreLogo();
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setSaved(true);
      router.refresh();
    });
  }

  return <div className="space-y-5">
    <div><h1 className="text-[24px] font-semibold tracking-[-0.04em]">Configurações</h1><p className="mt-1.5 text-[12px] text-muted-foreground">Dados e identidade da loja.</p></div>
    {message ? <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert> : null}
    {saved ? <Alert><AlertDescription>Alterações salvas.</AlertDescription></Alert> : null}
    <Card className="max-w-[820px] gap-0 rounded-[10px] border-border/90 p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:p-6">
      <div className="flex items-center gap-2 text-[12px] font-semibold"><LuStore className="size-4" /> Identidade da loja</div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Avatar className="size-14 rounded-[12px] border border-border after:rounded-[12px]"><AvatarImage src={logoUrl ?? undefined} alt={`Logo de ${store.name}`} className="rounded-[11px] object-contain" /><AvatarFallback className="rounded-[11px] bg-muted"><LuPawPrint className="size-6 text-muted-foreground" /></AvatarFallback></Avatar>
        <div className="flex flex-wrap gap-2">
          <form onSubmit={uploadLogo} className="flex flex-wrap items-center gap-2"><Input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Selecionar logo da loja" className="h-9 w-[230px] text-[10px] file:mr-2 file:border-0 file:bg-transparent file:text-[10px]" disabled={busy} /><Button type="submit" variant="outline" className="h-9 gap-1.5 px-3 text-[10px]" disabled={busy}><LuImagePlus className="size-3.5" />{busy ? "Enviando..." : "Adicionar logo"}</Button></form>
          {store.logo_path ? <Button type="button" variant="ghost" className="h-9 px-2 text-[10px]" onClick={clearLogo} disabled={pending}><LuTrash2 className="mr-1.5 size-3.5" />Remover</Button> : null}
        </div>
        <p className="w-full text-[9px] text-muted-foreground sm:pl-[68px]">PNG, JPG ou WebP · até 2 MB · até 4096 × 4096 px</p>
      </div>
      <form onSubmit={saveProfile} className="mt-6 space-y-3.5">
        <h2 className="text-[12px] font-semibold">Dados do pet shop</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="store-name" className="text-[10px]">Nome da loja</Label><Input id="store-name" name="name" defaultValue={store.name} required minLength={2} maxLength={120} className="h-9 text-[11px]" /></div>
          <div className="space-y-1"><Label htmlFor="store-phone" className="text-[10px]">Telefone</Label><Input id="store-phone" name="phone" defaultValue={store.phone ?? ""} maxLength={200} className="h-9 text-[11px]" /></div>
          <div className="space-y-1"><Label htmlFor="store-email" className="text-[10px]">E-mail</Label><Input id="store-email" name="email" type="email" defaultValue={store.email ?? ""} maxLength={254} className="h-9 text-[11px]" /></div>
          <div className="space-y-1"><Label htmlFor="store-city" className="text-[10px]">Cidade</Label><Input id="store-city" name="city" defaultValue={address.city ?? ""} maxLength={100} className="h-9 text-[11px]" /></div>
          <div className="space-y-1"><Label htmlFor="store-state" className="text-[10px]">Estado</Label><Input id="store-state" name="state" defaultValue={address.state ?? ""} maxLength={2} className="h-9 text-[11px]" /></div>
          <div className="space-y-1"><Label htmlFor="store-timezone" className="text-[10px]">Fuso horário</Label><ComboboxField id="store-timezone" value={timezone} onValueChange={setTimezone} options={storeTimezones} className="h-9" inputClassName="text-[11px]" /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="store-street" className="text-[10px]">Endereço</Label><Input id="store-street" name="street" defaultValue={address.street ?? ""} maxLength={200} className="h-9 text-[11px]" /></div>
        </div>
        <Button type="submit" className="h-9 px-3 text-[10px]" disabled={pending}>{pending ? "Salvando..." : "Salvar alterações"}</Button>
      </form>
    </Card>

    <section className="grid max-w-[1100px] gap-4 xl:grid-cols-2">
      <CatalogCard title="Serviços de banho e tosa" addLabel="Novo serviço" onAdd={() => { setEditingService(null); setServiceOpen(true); }}>
        {catalog.services.filter((service) => !service.archived_at).map((service) => <div key={service.id} className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"><div className="min-w-0"><p className="truncate text-[11px] font-medium">{service.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{service.duration_minutes} minutos · {formatMoney(service.price_cents)}</p></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="sm" className="h-7 px-2 text-[9px]" onClick={() => { setEditingService(service); setServiceOpen(true); }}>Editar</Button><Button variant="ghost" size="sm" className="h-7 px-2 text-[9px] text-muted-foreground" disabled={pending} onClick={() => startTransition(async () => { const result = await archiveService(service.id); if (!result.ok) setMessage(result.message ?? "Não foi possível concluir a operação."); else router.refresh(); })}>Arquivar</Button></div></div>)}
        {catalog.services.some((service) => service.archived_at) ? <div className="mt-2 border-t border-dashed border-border pt-2"><p className="pb-1 text-[9px] font-medium text-muted-foreground">Arquivados</p>{catalog.services.filter((service) => service.archived_at).map((service) => <div key={service.id} className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="truncate text-[10px] font-medium text-muted-foreground">{service.name}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{service.duration_minutes} minutos · {formatMoney(service.price_cents)}</p></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="sm" className="h-7 px-2 text-[9px]" onClick={() => { setEditingService(service); setServiceOpen(true); }}>Editar</Button><Button variant="ghost" size="sm" className="h-7 px-2 text-[9px]" disabled={pending} onClick={() => startTransition(async () => { const result = await restoreService(service.id); if (!result.ok) setMessage(result.message ?? "Não foi possível concluir a operação."); else router.refresh(); })}>Reativar</Button></div></div>)}</div> : null}
        {!catalog.services.length ? <p className="py-8 text-center text-[10px] text-muted-foreground">Nenhum serviço cadastrado.</p> : null}
      </CatalogCard>
      <CatalogCard title="Fornecedores" addLabel="Novo fornecedor" onAdd={() => { setEditingSupplier(null); setSupplierOpen(true); }}>
        {catalog.suppliers.filter((supplier) => !supplier.archived_at).map((supplier) => <div key={supplier.id} className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"><div className="min-w-0"><p className="truncate text-[11px] font-medium">{supplier.name}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{[supplier.cnpj ? formatCnpj(supplier.cnpj) : null, supplier.phone, supplier.email].filter(Boolean).join(" · ") || "Sem contato"}</p></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="sm" className="h-7 px-2 text-[9px]" onClick={() => { setEditingSupplier(supplier); setSupplierOpen(true); }}>Editar</Button><Button variant="ghost" size="sm" className="h-7 px-2 text-[9px] text-muted-foreground" disabled={pending} onClick={() => startTransition(async () => { const result = await archiveSupplier(supplier.id); if (!result.ok) setMessage(result.message ?? "Não foi possível concluir a operação."); else router.refresh(); })}>Arquivar</Button></div></div>)}
        {catalog.suppliers.some((supplier) => supplier.archived_at) ? <div className="mt-2 border-t border-dashed border-border pt-2"><p className="pb-1 text-[9px] font-medium text-muted-foreground">Arquivados</p>{catalog.suppliers.filter((supplier) => supplier.archived_at).map((supplier) => <div key={supplier.id} className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="truncate text-[10px] font-medium text-muted-foreground">{supplier.name}</p><p className="mt-0.5 truncate text-[9px] text-muted-foreground">{[supplier.cnpj ? formatCnpj(supplier.cnpj) : null, supplier.phone, supplier.email].filter(Boolean).join(" · ") || "Sem contato"}</p></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="sm" className="h-7 px-2 text-[9px]" onClick={() => { setEditingSupplier(supplier); setSupplierOpen(true); }}>Editar</Button><Button variant="ghost" size="sm" className="h-7 px-2 text-[9px]" disabled={pending} onClick={() => startTransition(async () => { const result = await restoreSupplier(supplier.id); if (!result.ok) setMessage(result.message ?? "Não foi possível concluir a operação."); else router.refresh(); })}>Reativar</Button></div></div>)}</div> : null}
        {!catalog.suppliers.length ? <p className="py-8 text-center text-[10px] text-muted-foreground">Nenhum fornecedor cadastrado.</p> : null}
      </CatalogCard>
    </section>

    <ServiceDialog key={`${serviceOpen}-${editingService?.id ?? "new"}`} service={editingService} open={serviceOpen} onOpenChange={setServiceOpen} onSaved={() => router.refresh()} />
    <SupplierDialog key={`${supplierOpen}-${editingSupplier?.id ?? "new"}`} supplier={editingSupplier} open={supplierOpen} onOpenChange={setSupplierOpen} onSaved={() => router.refresh()} />
  </div>;
}

function CatalogCard({ title, addLabel, onAdd, children }: { title: string; addLabel: string; onAdd: () => void; children: ReactNode }) {
  return <Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="flex items-center justify-between gap-3 border-b border-border pb-3"><h2 className="text-[12px] font-semibold">{title}</h2><Button variant="outline" className="h-8 gap-1.5 px-2.5 text-[9px]" onClick={onAdd}><LuPlus className="size-3.5" />{addLabel}</Button></div><div className="pt-1">{children}</div></Card>;
}

function ServiceDialog({ service, open, onOpenChange, onSaved }: { service: Service | null; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const input = { name: String(form.get("name") ?? ""), price: String(form.get("price") ?? ""), duration: String(form.get("duration") ?? "") };
      const result = service ? await updateService({ ...input, id: service.id }) : await createService(input);
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      onOpenChange(false);
      onSaved();
    });
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-[420px]"><DialogHeader><DialogTitle className="text-[16px]">{service ? "Editar serviço" : "Novo serviço"}</DialogTitle><DialogDescription className="text-[11px]">Cada porte ou modalidade pode ter preço e duração próprios.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-3"><div className="space-y-1"><Label htmlFor="service-name" className="text-[10px]">Nome</Label><Input id="service-name" name="name" defaultValue={service?.name ?? ""} required minLength={2} maxLength={120} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label htmlFor="service-price" className="text-[10px]">Valor (R$)</Label><BrlInput id="service-price" name="price" defaultValue={service ? formatMoneyInput(service.price_cents) : ""} placeholder="0,00" required /></div><div className="space-y-1"><Label htmlFor="service-duration" className="text-[10px]">Duração (min)</Label><Input id="service-duration" name="duration" type="number" min={15} max={600} step={15} defaultValue={service?.duration_minutes ?? 60} required /></div></div>{message ? <p role="alert" className="text-[10px] text-destructive">{message}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Salvando..." : service ? "Salvar serviço" : "Cadastrar serviço"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function SupplierDialog({ supplier, open, onOpenChange, onSaved }: { supplier: Supplier | null; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const input = {
        name: String(form.get("name") ?? ""),
        cnpj: String(form.get("cnpj") ?? ""),
        phone: String(form.get("phone") ?? ""),
        email: String(form.get("email") ?? ""),
        street: String(form.get("street") ?? ""),
        number: String(form.get("number") ?? ""),
        complement: String(form.get("complement") ?? ""),
        district: String(form.get("district") ?? ""),
        postalCode: String(form.get("postalCode") ?? ""),
        city: String(form.get("city") ?? ""),
        state: String(form.get("state") ?? ""),
        reference: String(form.get("reference") ?? ""),
        notes: String(form.get("notes") ?? ""),
      };
      const result = supplier ? await updateSupplier({ ...input, id: supplier.id }) : await createSupplier(input);
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      onOpenChange(false);
      onSaved();
    });
  }
  const address = storeAddress(supplier?.address);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]"><DialogHeader><DialogTitle className="text-[16px]">{supplier ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle><DialogDescription className="text-[11px]">O CNPJ é opcional e será salvo sem a máscara.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1 sm:col-span-2"><Label htmlFor="supplier-name" className="text-[10px]">Nome de exibição</Label><Input id="supplier-name" name="name" defaultValue={supplier?.name ?? ""} required minLength={2} maxLength={120} /></div><div className="space-y-1"><Label htmlFor="supplier-cnpj" className="text-[10px]">CNPJ</Label><CnpjInput id="supplier-cnpj" name="cnpj" defaultValue={supplier?.cnpj ?? ""} placeholder="XX.XXX.XXX/XXXX-00" /></div><div className="space-y-1"><Label htmlFor="supplier-phone" className="text-[10px]">Telefone</Label><Input id="supplier-phone" name="phone" defaultValue={supplier?.phone ?? ""} maxLength={100} /></div><div className="space-y-1"><Label htmlFor="supplier-email" className="text-[10px]">E-mail</Label><Input id="supplier-email" name="email" type="email" defaultValue={supplier?.email ?? ""} maxLength={254} /></div><div className="space-y-1"><Label htmlFor="supplier-city" className="text-[10px]">Cidade</Label><Input id="supplier-city" name="city" defaultValue={address.city ?? ""} maxLength={100} /></div><div className="space-y-1"><Label htmlFor="supplier-state" className="text-[10px]">UF</Label><Input id="supplier-state" name="state" defaultValue={address.state ?? ""} maxLength={2} /></div><div className="space-y-1"><Label htmlFor="supplier-street" className="text-[10px]">Logradouro</Label><Input id="supplier-street" name="street" defaultValue={address.street ?? ""} maxLength={200} /></div><div className="space-y-1"><Label htmlFor="supplier-number" className="text-[10px]">Número</Label><Input id="supplier-number" name="number" defaultValue={address.number ?? ""} maxLength={40} /></div><div className="space-y-1"><Label htmlFor="supplier-complement" className="text-[10px]">Complemento</Label><Input id="supplier-complement" name="complement" defaultValue={address.complement ?? ""} maxLength={120} /></div><div className="space-y-1"><Label htmlFor="supplier-district" className="text-[10px]">Bairro</Label><Input id="supplier-district" name="district" defaultValue={address.district ?? ""} maxLength={120} /></div><div className="space-y-1"><Label htmlFor="supplier-postal-code" className="text-[10px]">CEP</Label><Input id="supplier-postal-code" name="postalCode" defaultValue={address.postal_code ?? ""} maxLength={20} /></div><div className="space-y-1 sm:col-span-2"><Label htmlFor="supplier-reference" className="text-[10px]">Referência do endereço</Label><Input id="supplier-reference" name="reference" defaultValue={address.reference ?? ""} maxLength={200} /></div><div className="space-y-1 sm:col-span-2"><Label htmlFor="supplier-notes" className="text-[10px]">Observações</Label><Input id="supplier-notes" name="notes" defaultValue={supplier?.notes ?? ""} maxLength={500} /></div></div>{message ? <p role="alert" className="text-[10px] text-destructive">{message}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Salvando..." : supplier ? "Salvar fornecedor" : "Cadastrar fornecedor"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
