"use client";

import { useMemo, useState, useTransition } from "react";
import {
  LuDog,
  LuMail,
  LuPhone,
  LuPlus,
  LuUserRound,
} from "react-icons/lu";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CepLookupField, type CepAddress } from "@/components/ui/cep-lookup-field";
import { ComboboxField } from "@/components/ui/combobox-field";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { formatCivilDate, formatMoney, formatShortDate } from "@/lib/format";
import { formatBrazilianPhone } from "@/lib/phone";
import { archiveCustomer, archiveCustomerAddress, archivePet, createCustomer, createCustomerAddress, createPet, updatePet } from "../actions";
import { MutationRegion, runMutationFeedback } from "@/components/feedback/mutation-feedback";
import type { CustomerRecord } from "../queries";

const petSpeciesOptions: { value: string; label: string }[] = [
  { value: "Cachorro", label: "Cachorro" },
  { value: "Gato", label: "Gato" },
  { value: "Roedor", label: "Roedor" },
  { value: "Ave", label: "Ave" },
  { value: "Réptil", label: "Réptil" },
  { value: "Peixe", label: "Peixe" },
  { value: "Anfíbio", label: "Anfíbio" },
  { value: "__other__", label: "Outra espécie" },
];

type CustomerAddressFields = {
  label: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  reference: string;
};

const emptyCustomerAddress: CustomerAddressFields = {
  label: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  postalCode: "",
  reference: "",
};

function keepAddressValue(current: string, previous: string | null | undefined) {
  return !current.trim() || current === previous;
}

function CustomerFormDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage("");
    startTransition(async () => {
      const result = await runMutationFeedback({ scope: "customers", action: () => createCustomer(data), success: { title: "Cliente cadastrado", description: "Ele já está disponível na lista de clientes." }, failureTitle: "Não foi possível cadastrar o cliente", unexpectedMessage: "Confira os dados e tente novamente." });
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível concluir a operação.");
        return;
      }
      form.reset();
      setPhone("");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="h-9 gap-2 rounded-md px-3 text-[11px]" />}>
        <LuPlus className="size-3.5" /> Novo cliente
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[18px]">Novo cliente</DialogTitle>
          <DialogDescription className="text-[11px]">Cadastre o tutor. Os pets e endereços são adicionados no perfil.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="customer-name">Nome</Label>
            <Input id="customer-name" name="name" required minLength={2} maxLength={120} autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="customer-phone">Telefone</Label>
              <PhoneInput id="customer-phone" name="phone" value={phone} onValueChange={setPhone} maxLength={20} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-email">E-mail</Label>
              <Input id="customer-email" name="email" type="email" maxLength={254} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-notes">Observações</Label>
            <Textarea id="customer-notes" name="notes" maxLength={500} rows={3} />
          </div>
          {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar cliente"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PetForm({ customerId, pet, onSaved }: { customerId: string; pet?: CustomerRecord["pets"][number]; onSaved?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [birthDate, setBirthDate] = useState(pet?.birth_date ?? "");
  const [species, setSpecies] = useState(pet?.species ?? "Cachorro");
  const [speciesOther, setSpeciesOther] = useState("");
  const speciesOptions = pet?.species && !petSpeciesOptions.some((option) => option.value === pet.species)
    ? [...petSpeciesOptions.slice(0, -1), { value: pet.species, label: pet.species }, petSpeciesOptions[petSpeciesOptions.length - 1]]
    : petSpeciesOptions;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("customerId", customerId);
    data.set("species", species === "__other__" ? speciesOther.trim() : species);
    if (pet) data.set("id", pet.id);
    setMessage("");
    startTransition(async () => {
      const result = await runMutationFeedback({ scope: "customers", action: () => pet ? updatePet(data) : createPet(data), success: { title: pet ? "Pet atualizado" : "Pet cadastrado", description: "O perfil do cliente foi atualizado." }, failureTitle: "Não foi possível salvar o pet", unexpectedMessage: "Confira os dados e tente novamente." });
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível concluir a operação.");
        return;
      }
      if (!pet) {
        form.reset();
        setBirthDate("");
        setSpecies("Cachorro");
        setSpeciesOther("");
      } else {
        onSaved?.();
      }
    });
  }

  return (
    <form onSubmit={submit} className={pet ? "space-y-3" : "mt-5 space-y-3 rounded-lg border border-border p-4"}>
      <h3 className="text-[12px] font-semibold">{pet ? `Editar ${pet.name}` : "Adicionar pet"}</h3>
      {pet ? <input type="hidden" name="id" value={pet.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor={`pet-name-${customerId}-${pet?.id ?? "new"}`}>Nome</Label><Input id={`pet-name-${customerId}-${pet?.id ?? "new"}`} name="name" defaultValue={pet?.name ?? ""} required maxLength={80} /></div>
        <div className="space-y-1.5"><Label htmlFor={`pet-species-${customerId}-${pet?.id ?? "new"}`}>Espécie</Label><ComboboxField id={`pet-species-${customerId}-${pet?.id ?? "new"}`} value={species} onValueChange={setSpecies} options={speciesOptions} placeholder="Selecione a espécie" className="h-9" /></div>
        {species === "__other__" ? <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`pet-species-other-${customerId}-${pet?.id ?? "new"}`}>Qual espécie?</Label><Input id={`pet-species-other-${customerId}-${pet?.id ?? "new"}`} value={speciesOther} onChange={(event) => setSpeciesOther(event.currentTarget.value)} required maxLength={40} /></div> : null}
        <div className="space-y-1.5"><Label htmlFor={`pet-breed-${customerId}-${pet?.id ?? "new"}`}>Raça</Label><Input id={`pet-breed-${customerId}-${pet?.id ?? "new"}`} name="breed" defaultValue={pet?.breed ?? ""} maxLength={80} /></div>
        <div className="space-y-1.5"><Label htmlFor={`pet-birth-${customerId}-${pet?.id ?? "new"}`}>Nascimento</Label><DatePickerField id={`pet-birth-${customerId}-${pet?.id ?? "new"}`} name="birthDate" value={birthDate} onValueChange={setBirthDate} /></div>
        <div className="space-y-1.5"><Label htmlFor={`pet-weight-${customerId}-${pet?.id ?? "new"}`}>Peso (kg)</Label><Input id={`pet-weight-${customerId}-${pet?.id ?? "new"}`} name="weightKg" inputMode="decimal" type="number" min="0.001" max="500" step="0.001" defaultValue={pet?.weight_kg ?? ""} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor={`pet-care-${customerId}-${pet?.id ?? "new"}`}>Cuidados</Label><Textarea id={`pet-care-${customerId}-${pet?.id ?? "new"}`} name="careNotes" rows={2} maxLength={500} defaultValue={pet?.care_notes ?? ""} /></div>
      <div className="space-y-1.5"><Label htmlFor={`pet-behavior-${customerId}-${pet?.id ?? "new"}`}>Comportamento</Label><Textarea id={`pet-behavior-${customerId}-${pet?.id ?? "new"}`} name="behaviorNotes" rows={2} maxLength={500} defaultValue={pet?.behavior_notes ?? ""} /></div>
      {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
      <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "Salvando…" : pet ? "Salvar alterações" : "Salvar pet"}</Button></div>
    </form>
  );
}

function PetEditDialog({ customerId, pet }: { customerId: string; pet: CustomerRecord["pets"][number] }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => setOpen(true)}>Editar</Button>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[520px]">
      <DialogHeader><DialogTitle className="text-[17px]">Dados do pet</DialogTitle><DialogDescription className="text-[11px]">Atualize informações usadas no atendimento e na agenda.</DialogDescription></DialogHeader>
      <PetForm key={pet.id} customerId={customerId} pet={pet} onSaved={() => setOpen(false)} />
    </DialogContent>
  </Dialog>;
}

function ArchivePetButton({ customerId, pet }: { customerId: string; pet: CustomerRecord["pets"][number] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function archive(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await runMutationFeedback({ scope: "customers", action: () => archivePet(customerId, pet.id), success: { title: "Pet arquivado", description: "Ele deixou de aparecer nas opções de novos atendimentos." }, failureTitle: "Não foi possível arquivar o pet", unexpectedMessage: "Atualize o perfil e tente novamente." });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível arquivar o pet."); return; }
      setOpen(false);
    });
  }
  return <AlertDialog open={open} onOpenChange={setOpen}>
    <AlertDialogTrigger render={<Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-destructive" />}>Arquivar</AlertDialogTrigger>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Arquivar {pet.name}?</AlertDialogTitle><AlertDialogDescription>O pet sai da lista ativa e deixa de aparecer para novos agendamentos. O histórico existente é preservado.</AlertDialogDescription></AlertDialogHeader>{message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}<AlertDialogFooter><AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel><AlertDialogAction onClick={archive} disabled={pending}>{pending ? "Arquivando…" : "Arquivar pet"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
  </AlertDialog>;
}

function AddressForm({ customerId }: { customerId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [address, setAddress] = useState<CustomerAddressFields>(emptyCustomerAddress);

  function changeAddress(field: keyof CustomerAddressFields, value: string) {
    setAddress((current) => ({ ...current, [field]: value }));
  }

  function applyCepAddress(found: CepAddress, previous: CepAddress | null) {
    setAddress((current) => ({
      ...current,
      street: keepAddressValue(current.street, previous?.street) ? found.street : current.street,
      district: keepAddressValue(current.district, previous?.district) ? found.district : current.district,
      city: keepAddressValue(current.city, previous?.city) ? found.city : current.city,
      state: keepAddressValue(current.state, previous?.state) ? found.state : current.state,
    }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await runMutationFeedback({ scope: "customers", action: () => createCustomerAddress({
        customerId,
        ...address,
      }), success: { title: "Endereço cadastrado", description: "O perfil do cliente foi atualizado." }, failureTitle: "Não foi possível cadastrar o endereço", unexpectedMessage: "Confira o endereço e tente novamente." });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setAddress(emptyCustomerAddress);
    });
  }

  return <form onSubmit={submit} className="space-y-3 rounded-md border border-border p-3">
    <h4 className="text-[11px] font-semibold">Adicionar endereço</h4>
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor={`address-label-${customerId}`}>Identificação</Label><Input id={`address-label-${customerId}`} value={address.label} onChange={(event) => changeAddress("label", event.currentTarget.value)} maxLength={80} placeholder="Casa, trabalho…" /></div>
      <div className="space-y-1"><Label htmlFor={`address-postal-${customerId}`}>CEP</Label><CepLookupField id={`address-postal-${customerId}`} value={address.postalCode} onValueChange={(value) => changeAddress("postalCode", value)} onAddressFound={applyCepAddress} /></div>
      <div className="space-y-1"><Label htmlFor={`address-street-${customerId}`}>Rua</Label><Input id={`address-street-${customerId}`} value={address.street} onChange={(event) => changeAddress("street", event.currentTarget.value)} maxLength={200} required /></div>
      <div className="space-y-1"><Label htmlFor={`address-number-${customerId}`}>Número</Label><Input id={`address-number-${customerId}`} value={address.number} onChange={(event) => changeAddress("number", event.currentTarget.value)} maxLength={40} /></div>
      <div className="space-y-1"><Label htmlFor={`address-complement-${customerId}`}>Complemento (opcional)</Label><Input id={`address-complement-${customerId}`} value={address.complement} onChange={(event) => changeAddress("complement", event.currentTarget.value)} maxLength={120} /></div>
      <div className="space-y-1"><Label htmlFor={`address-district-${customerId}`}>Bairro</Label><Input id={`address-district-${customerId}`} value={address.district} onChange={(event) => changeAddress("district", event.currentTarget.value)} maxLength={120} /></div>
      <div className="space-y-1"><Label htmlFor={`address-city-${customerId}`}>Cidade</Label><Input id={`address-city-${customerId}`} value={address.city} onChange={(event) => changeAddress("city", event.currentTarget.value)} maxLength={100} required /></div>
      <div className="space-y-1"><Label htmlFor={`address-state-${customerId}`}>Estado</Label><Input id={`address-state-${customerId}`} value={address.state} onChange={(event) => changeAddress("state", event.currentTarget.value.toUpperCase().slice(0, 2))} maxLength={2} /></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor={`address-reference-${customerId}`}>Referência</Label><Input id={`address-reference-${customerId}`} value={address.reference} onChange={(event) => changeAddress("reference", event.currentTarget.value)} maxLength={200} /></div>
    </div>
    {message ? <p role="alert" className="text-[10px] text-destructive">{message}</p> : null}
    <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "Salvando…" : "Salvar endereço"}</Button></div>
  </form>;
}

function ArchiveAddressButton({ customerId, addressId }: { customerId: string; addressId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function archive() {
    setMessage("");
    startTransition(async () => {
      const result = await runMutationFeedback({ scope: "customers", action: () => archiveCustomerAddress(customerId, addressId), success: { title: "Endereço removido", description: "O perfil do cliente foi atualizado." }, failureTitle: "Não foi possível remover o endereço", unexpectedMessage: "Atualize o perfil e tente novamente." });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
    });
  }

  return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger render={<Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[9px] text-destructive" />}>Remover</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remover este endereço?</AlertDialogTitle><AlertDialogDescription>O endereço sai do cadastro e deixa de aparecer nas próximas entregas. Vendas já registradas mantêm a cópia usada na entrega.</AlertDialogDescription></AlertDialogHeader>{message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}<AlertDialogFooter><AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel><AlertDialogAction onClick={archive} disabled={pending}>{pending ? "Removendo…" : "Remover endereço"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function CustomerProfile({ customer }: { customer: CustomerRecord }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  function archive() {
    setMessage("");
    startTransition(async () => {
      const result = await runMutationFeedback({ scope: "customers", action: () => archiveCustomer(customer.id), success: { title: "Cliente arquivado", description: "Ele deixou de aparecer na lista de clientes ativos." }, failureTitle: "Não foi possível arquivar o cliente", unexpectedMessage: "Atualize a lista e tente novamente." });
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível concluir a operação.");
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-7 px-2.5 text-[10px]" />}>Ver perfil</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-lg bg-muted"><LuUserRound className="size-4" /></span><div><DialogTitle className="text-[18px]">{customer.name}</DialogTitle><DialogDescription className="text-[11px]">Cliente desde {formatShortDate(customer.created_at)}</DialogDescription></div></div>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[11px]"><LuPhone className="size-3.5 text-muted-foreground" />{customer.phone ? formatBrazilianPhone(customer.phone) : "Sem telefone"}</div>
          <div className="flex min-w-0 items-center gap-2 rounded-md border border-border px-3 py-2 text-[11px]"><LuMail className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{customer.email || "Sem e-mail"}</span></div>
          <div className="rounded-md border border-border px-3 py-2 sm:col-span-2"><p className="text-[10px] text-muted-foreground">Saldo em aberto</p><p className="mt-1 text-[14px] font-semibold tabular-nums">{formatMoney(customer.balance_cents)}</p></div>
        </div>
        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold">Endereços</h3>
          {customer.addresses.length ? <div className="space-y-2">{customer.addresses.map((address) => <div key={address.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3"><div className="min-w-0"><p className="text-[11px] font-medium">{address.label || "Endereço"}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{[`${address.street}${address.number ? `, ${address.number}` : ""}`, address.complement, address.district, [address.city, address.state].filter(Boolean).join(" / "), address.postal_code, address.reference].filter(Boolean).join(" · ")}</p></div><ArchiveAddressButton customerId={customer.id} addressId={address.id} /></div>)}</div> : <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[10px] text-muted-foreground">Nenhum endereço cadastrado.</p>}
          <AddressForm customerId={customer.id} />
        </section>
        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold">Pets</h3>
          {customer.pets.length ? <div className="space-y-2">{customer.pets.map((pet) => <div key={pet.id} className="rounded-md border border-border p-3"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><LuDog className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="truncate text-[11px] font-medium">{pet.name}</p><p className="text-[10px] text-muted-foreground">{pet.breed ? `${pet.breed} · ` : ""}{pet.species}{pet.birth_date ? ` · Nasc. ${formatCivilDate(pet.birth_date)}` : ""}{pet.weight_kg ? ` · ${pet.weight_kg.toLocaleString("pt-BR")} kg` : ""}</p></div></div><div className="flex shrink-0 gap-1"><PetEditDialog customerId={customer.id} pet={pet} /><ArchivePetButton customerId={customer.id} pet={pet} /></div></div>{pet.care_notes ? <p className="mt-2 whitespace-pre-wrap text-[10px] leading-4"><span className="font-medium">Cuidados: </span><span className="text-muted-foreground">{pet.care_notes}</span></p> : null}{pet.behavior_notes ? <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4"><span className="font-medium">Comportamento: </span><span className="text-muted-foreground">{pet.behavior_notes}</span></p> : null}</div>)}</div> : <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-[11px] text-muted-foreground">Nenhum pet cadastrado.</p>}
        </section>
        <section className="rounded-md border border-border p-3">
          <h3 className="text-[11px] font-semibold">Última compra</h3>
          {customer.last_sale ? <p className="mt-1.5 text-[11px] text-muted-foreground">Venda #{customer.last_sale.number} · {customer.last_sale.completed_at ? formatShortDate(customer.last_sale.completed_at) : ""} · {formatMoney(customer.last_sale.total_cents)}</p> : <p className="mt-1.5 text-[11px] text-muted-foreground">Nenhuma venda registrada.</p>}
        </section>
        {customer.recent_sales.length ? <section className="space-y-2"><h3 className="text-[12px] font-semibold">Compras recentes</h3><div className="divide-y rounded-md border border-border">{customer.recent_sales.map((sale) => <div key={sale.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[10px]"><span>Venda #{sale.number}<span className="ml-2 text-muted-foreground">{sale.completed_at ? formatShortDate(sale.completed_at) : ""}</span></span><span className="shrink-0 font-medium tabular-nums">{formatMoney(sale.total_cents)}</span></div>)}</div></section> : null}
        {customer.notes ? <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-[11px] leading-5">{customer.notes}</p> : null}
        <PetForm customerId={customer.id} />
        {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
          <Button type="button" variant="destructive" onClick={archive} disabled={pending}>{pending ? "Arquivando…" : "Arquivar cliente"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerView({ customers }: { customers: CustomerRecord[] }) {
  const columns = useMemo<DataTableColumn<CustomerRecord>[]>(() => [
    {
      accessorKey: "name",
      header: "Cliente",
      cell: ({ row }) => <div className="flex min-w-44 items-center gap-3"><Avatar className="size-8 shrink-0"><AvatarFallback className="bg-muted text-[10px] font-medium text-muted-foreground">{row.original.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate font-medium">{row.original.name}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{row.original.email || "Sem e-mail"}</p></div></div>,
    },
    {
      id: "phone",
      accessorFn: (row) => `${row.phone ?? ""} ${formatBrazilianPhone(row.phone)}`,
      header: "Contato",
      cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatBrazilianPhone(row.original.phone) || "—"}</span>,
    },
    { id: "pets", accessorFn: (row) => row.pets.map((pet) => `${pet.name} ${pet.breed ?? ""}`).join(" "), header: "Pets", cell: ({ row }) => <span className="block max-w-64 truncate">{row.original.pets.map((pet) => `${pet.name}${pet.breed ? ` · ${pet.breed}` : ""}`).join(", ") || <span className="text-muted-foreground">Nenhum pet</span>}</span> },
    { id: "balance", accessorFn: (row) => row.balance_cents, header: "A receber", cell: ({ row }) => row.original.balance_cents > 0 ? <Badge variant="outline" className="rounded-md border-amber-200 bg-amber-50 px-2 text-[10px] font-normal text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{formatMoney(row.original.balance_cents)}</Badge> : <span className="text-muted-foreground">—</span> },
    { id: "actions", header: "", enableSorting: false, cell: ({ row }) => <CustomerProfile customer={row.original} /> },
  ], []);

  return (
    <MutationRegion scope="customers" label="Atualizando clientes, pets e endereços…"><div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><h1 className="text-[24px] font-semibold tracking-[-0.04em]">Clientes e pets</h1><p className="mt-1.5 text-[12px] text-muted-foreground">Cadastro, pets e saldos pendentes.</p></div>
        <CustomerFormDialog />
      </div>
      <Card className="gap-0 rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <DataTable columns={columns} data={customers} searchPlaceholder="Buscar por nome, telefone ou pet…" emptyMessage="Nenhum cliente encontrado." toolbarActions={<span className="px-2 text-[10px] text-muted-foreground">{customers.length} clientes cadastrados</span>} />
      </Card>
    </div></MutationRegion>
  );
}

export function CustomerLoadError({ message }: { message: string }) {
  return <Alert variant="destructive"><AlertTitle>Falha ao carregar clientes</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>;
}
