"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LuArchive, LuBuilding2, LuMapPin, LuPencil, LuPlus, LuRotateCcw, LuSearch } from "react-icons/lu";
import { archiveSupplier, createSupplier, lookupSupplierCnpj, restoreSupplier, updateSupplier } from "@/features/suppliers/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CnpjInput } from "@/components/ui/cnpj-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCnpj, isValidCnpj } from "@/lib/cnpj";
import type { SupplierAddress, SupplierRecord } from "../queries";

type SupplierFields = {
  name: string;
  cnpj: string;
  phone: string;
  email: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  postalCode: string;
  city: string;
  state: string;
  reference: string;
  notes: string;
};

function readAddress(address: SupplierAddress | null | unknown): SupplierAddress {
  if (typeof address !== "object" || address === null || Array.isArray(address)) return {};
  return address as SupplierAddress;
}

function initialSupplierFields(supplier: SupplierRecord | null): SupplierFields {
  const address = readAddress(supplier?.address);
  return {
    name: supplier?.name ?? "",
    cnpj: supplier?.cnpj ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    street: address.street ?? "",
    number: address.number ?? "",
    complement: address.complement ?? "",
    district: address.district ?? "",
    postalCode: address.postal_code?.replace(/\D/g, "").slice(0, 8) ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    reference: address.reference ?? "",
    notes: supplier?.notes ?? "",
  };
}

function SupplierDialog({ supplier, open, onOpenChange, onSaved }: {
  supplier: SupplierRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState(() => initialSupplierFields(supplier));
  const [pending, startTransition] = useTransition();
  const [lookupBusy, setLookupBusy] = useState(false);
  const [message, setMessage] = useState("");

  function change(field: keyof SupplierFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = supplier
        ? await updateSupplier({ ...fields, id: supplier.id })
        : await createSupplier(fields);
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível salvar o fornecedor.");
        return;
      }
      onOpenChange(false);
      onSaved();
    });
  }

  function consultCnpj() {
    if (!isValidCnpj(fields.cnpj)) return;
    setMessage("");
    setLookupBusy(true);
    startTransition(async () => {
      const result = await lookupSupplierCnpj(fields.cnpj);
      setLookupBusy(false);
      if (!result.ok || !result.fields) {
        setMessage(result.message ?? "Não foi possível consultar o CNPJ.");
        return;
      }
      const suggested = result.fields;
      setFields((current) => ({
        ...current,
        name: current.name.trim() ? current.name : suggested.name,
        phone: current.phone.trim() ? current.phone : suggested.phone,
        email: current.email.trim() ? current.email : suggested.email,
        street: current.street.trim() ? current.street : suggested.street,
        number: current.number.trim() ? current.number : suggested.number,
        complement: current.complement.trim() ? current.complement : suggested.complement,
        district: current.district.trim() ? current.district : suggested.district,
        postalCode: current.postalCode.trim() ? current.postalCode : suggested.postalCode,
        city: current.city.trim() ? current.city : suggested.city,
        state: current.state.trim() ? current.state : suggested.state,
      }));
      setMessage(result.message ?? "Dados sugeridos. Revise antes de salvar.");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{supplier ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
          <DialogDescription>Consultar CNPJ sugere dados públicos e não confirma regularidade fiscal.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="supplier-cnpj">CNPJ</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <CnpjInput id="supplier-cnpj" value={fields.cnpj} onValueChange={(value) => change("cnpj", value)} placeholder="00.000.000/0000-00" className="h-10 sm:flex-1" />
              {isValidCnpj(fields.cnpj) ? <Button type="button" variant="outline" className="h-10" disabled={pending || lookupBusy} onClick={consultCnpj}>{lookupBusy ? "Consultando…" : "Consultar CNPJ"}</Button> : null}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="supplier-name">Nome de exibição</Label><Input id="supplier-name" value={fields.name} onChange={(event) => change("name", event.currentTarget.value)} required minLength={2} maxLength={120} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="supplier-phone">Telefone</Label><Input id="supplier-phone" value={fields.phone} onChange={(event) => change("phone", event.currentTarget.value)} maxLength={100} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="supplier-email">E-mail</Label><Input id="supplier-email" type="email" value={fields.email} onChange={(event) => change("email", event.currentTarget.value)} maxLength={254} className="h-10" /></div>
            <div className="space-y-1.5 sm:col-span-2"><h3 className="text-sm font-semibold">Endereço</h3></div>
            <div className="space-y-1.5"><Label htmlFor="supplier-street">Logradouro</Label><Input id="supplier-street" value={fields.street} onChange={(event) => change("street", event.currentTarget.value)} maxLength={200} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="supplier-number">Número</Label><Input id="supplier-number" value={fields.number} onChange={(event) => change("number", event.currentTarget.value)} maxLength={40} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="supplier-complement">Complemento</Label><Input id="supplier-complement" value={fields.complement} onChange={(event) => change("complement", event.currentTarget.value)} maxLength={120} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="supplier-district">Bairro</Label><Input id="supplier-district" value={fields.district} onChange={(event) => change("district", event.currentTarget.value)} maxLength={120} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="supplier-postal-code">CEP</Label><Input id="supplier-postal-code" value={fields.postalCode} onChange={(event) => change("postalCode", event.currentTarget.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" maxLength={8} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="supplier-city">Cidade</Label><Input id="supplier-city" value={fields.city} onChange={(event) => change("city", event.currentTarget.value)} maxLength={100} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="supplier-state">UF</Label><Input id="supplier-state" value={fields.state} onChange={(event) => change("state", event.currentTarget.value.toUpperCase().slice(0, 2))} maxLength={2} className="h-10" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="supplier-reference">Referência</Label><Input id="supplier-reference" value={fields.reference} onChange={(event) => change("reference", event.currentTarget.value)} maxLength={200} className="h-10" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="supplier-notes">Observações</Label><Input id="supplier-notes" value={fields.notes} onChange={(event) => change("notes", event.currentTarget.value)} maxLength={500} className="h-10" /></div>
          </div>
          {message ? <p role="status" aria-live="polite" className={`text-sm ${message.includes("não foi") || message.includes("não encontrado") ? "text-destructive" : "text-muted-foreground"}`}>{message}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={pending || lookupBusy}>{pending ? "Salvando fornecedor…" : supplier ? "Salvar fornecedor" : "Cadastrar fornecedor"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SuppliersView({ suppliers }: { suppliers: SupplierRecord[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [target, setTarget] = useState<SupplierRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const visible = useMemo(() => suppliers.filter((supplier) => {
    if (Boolean(supplier.archived_at) !== showArchived) return false;
    const address = readAddress(supplier.address);
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return !query || [supplier.name, supplier.cnpj, supplier.phone, supplier.email, address.city, address.state]
      .some((value) => value?.toLocaleLowerCase("pt-BR").includes(query));
  }), [search, showArchived, suppliers]);

  function openDialog(supplier: SupplierRecord | null) {
    setTarget(supplier);
    setMessage("");
    setDialogOpen(true);
  }

  function changeArchive(supplier: SupplierRecord, restore: boolean) {
    setMessage("");
    startTransition(async () => {
      const result = restore ? await restoreSupplier(supplier.id) : await archiveSupplier(supplier.id);
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível atualizar o fornecedor.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><h1 className="text-2xl font-semibold tracking-[-0.04em]">Fornecedores</h1><p className="mt-1.5 text-sm text-muted-foreground">Consulte contatos e mantenha o catálogo de fornecedores.</p></div>
        <Button onClick={() => openDialog(null)} className="h-10"><LuPlus className="size-4" aria-hidden="true" />Novo fornecedor</Button>
      </div>
      {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
      <Card className="gap-0 rounded-xl border-border/90 p-4 shadow-xs sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm"><LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Buscar nome, CNPJ, contato ou cidade" aria-label="Buscar fornecedores" className="h-10 pl-9" /></div>
          <div className="flex gap-2" role="group" aria-label="Situação dos fornecedores">
            <Button type="button" size="sm" variant={!showArchived ? "default" : "outline"} aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>Ativos</Button>
            <Button type="button" size="sm" variant={showArchived ? "default" : "outline"} aria-pressed={showArchived} onClick={() => setShowArchived(true)}>Arquivados</Button>
          </div>
        </div>
        <div className="mt-4 divide-y divide-border">
          {visible.map((supplier) => {
            const address = readAddress(supplier.address);
            const location = [address.city, address.state].filter(Boolean).join(" / ");
            return (
              <article key={supplier.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{supplier.name}</h2>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {supplier.cnpj ? <span className="inline-flex items-center gap-1.5"><LuBuilding2 className="size-3.5" aria-hidden="true" />{formatCnpj(supplier.cnpj)}</span> : null}
                    {supplier.phone ? <span>{supplier.phone}</span> : null}
                    {supplier.email ? <span className="break-all">{supplier.email}</span> : null}
                    {location ? <span className="inline-flex items-center gap-1.5"><LuMapPin className="size-3.5" aria-hidden="true" />{location}</span> : null}
                    {!supplier.cnpj && !supplier.phone && !supplier.email && !location ? <span>Sem dados de contato</span> : null}
                    {supplier.archived_at ? <span>Arquivado</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => openDialog(supplier)}><LuPencil className="size-3.5" aria-hidden="true" />Editar</Button>
                  {showArchived
                    ? <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => changeArchive(supplier, true)}><LuRotateCcw className="size-3.5" aria-hidden="true" />Reativar</Button>
                    : <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => changeArchive(supplier, false)}><LuArchive className="size-3.5" aria-hidden="true" />Arquivar</Button>}
                </div>
              </article>
            );
          })}
          {!visible.length ? <div className="py-12 text-center"><p className="text-sm font-medium">{suppliers.length ? "Nenhum fornecedor encontrado." : "Nenhum fornecedor cadastrado."}</p><p className="mt-1 text-xs text-muted-foreground">{suppliers.length ? "Ajuste a busca ou altere a situação selecionada." : "Cadastre um fornecedor para vincular recebimentos de mercadoria."}</p></div> : null}
        </div>
      </Card>
      {dialogOpen ? <SupplierDialog key={target ? `supplier-${target.id}` : "supplier-new"} supplier={target} open onOpenChange={setDialogOpen} onSaved={() => router.refresh()} /> : null}
    </div>
  );
}
