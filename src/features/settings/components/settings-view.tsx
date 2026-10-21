"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LuImagePlus, LuPawPrint, LuStore, LuTrash2 } from "react-icons/lu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CepLookupField, type CepAddress } from "@/components/ui/cep-lookup-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { removeStoreLogo, saveStoreProfile, uploadStoreLogo } from "../actions";

type AddressField = "postal_code" | "street" | "number" | "complement" | "district" | "city" | "state" | "reference";
type StoreAddress = Record<AddressField, string>;

function storeAddress(value: unknown): StoreAddress {
  const address = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const fields: AddressField[] = ["postal_code", "street", "number", "complement", "district", "city", "state", "reference"];
  return Object.fromEntries(fields.map((field) => [
    field,
    field === "postal_code"
      ? (typeof address[field] === "string" ? address[field].replace(/\D/g, "").slice(0, 8) : "")
      : (typeof address[field] === "string" ? address[field] : ""),
  ])) as StoreAddress;
}

function keepUntouched(current: string, previous: string | undefined) {
  return !current.trim() || (previous !== undefined && current.trim() === previous.trim());
}

export function SettingsView({ store, logoUrl }: {
  store: { id: string; name: string; phone: string | null; email: string | null; address: unknown; logo_path: string | null };
  logoUrl: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [address, setAddress] = useState(() => storeAddress(store.address));

  function changeAddress(field: AddressField, value: string) {
    setAddress((current) => ({ ...current, [field]: value }));
  }

  function applyLookup(found: CepAddress, previous: CepAddress | null) {
    setAddress((current) => ({
      ...current,
      street: keepUntouched(current.street, previous?.street) ? found.street : current.street,
      district: keepUntouched(current.district, previous?.district) ? found.district : current.district,
      city: keepUntouched(current.city, previous?.city) ? found.city : current.city,
      state: keepUntouched(current.state, previous?.state) ? found.state : current.state,
    }));
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setSaved(false);
    startTransition(async () => {
      const result = await saveStoreProfile({
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        email: String(form.get("email") ?? ""),
        address,
      });
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível salvar os dados da loja.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function uploadLogo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage("Escolha uma imagem para enviar.");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    setMessage("");
    setBusy(true);
    startTransition(async () => {
      const result = await uploadStoreLogo(form);
      setBusy(false);
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível enviar a imagem.");
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      setSaved(true);
      router.refresh();
    });
  }

  function clearLogo() {
    setMessage("");
    startTransition(async () => {
      const result = await removeStoreLogo();
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível remover a logo.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em]">Configurações</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Dados e identidade da loja.</p>
      </div>
      {message ? <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert> : null}
      {saved ? <Alert><AlertDescription>Alterações salvas.</AlertDescription></Alert> : null}

      <Card className="max-w-4xl gap-0 rounded-xl border-border/90 p-5 shadow-xs sm:p-6">
        <div className="flex items-center gap-2 text-sm font-semibold"><LuStore className="size-4" aria-hidden="true" />Identidade da loja</div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Avatar className="size-16 rounded-xl border border-border after:rounded-xl">
            <AvatarImage src={logoUrl ?? undefined} alt={`Logo de ${store.name}`} className="rounded-[11px] object-contain" />
            <AvatarFallback className="rounded-[11px] bg-muted"><LuPawPrint className="size-6" aria-hidden="true" /></AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Logo da loja</p>
            <p className="mt-1 text-xs text-muted-foreground">PNG, JPG ou WebP, até 2 MiB e 4096 × 4096 px.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <form onSubmit={uploadLogo} className="flex flex-wrap items-center gap-2">
                <Input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Selecionar logo da loja" className="h-10 max-w-[280px] text-xs file:mr-2 file:border-0 file:bg-transparent file:text-xs" />
                <Button type="submit" variant="outline" className="h-10" disabled={pending || busy}><LuImagePlus className="size-4" aria-hidden="true" />{busy ? "Enviando…" : "Enviar logo"}</Button>
              </form>
              {store.logo_path ? <Button type="button" variant="ghost" className="h-10" onClick={clearLogo} disabled={pending}><LuTrash2 className="size-4" aria-hidden="true" />Remover logo</Button> : null}
            </div>
          </div>
        </div>

        <form onSubmit={saveProfile} className="mt-8 space-y-5">
          <div>
            <h2 className="text-sm font-semibold">Dados do pet shop</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="store-name">Nome da loja</Label><Input id="store-name" name="name" defaultValue={store.name} required minLength={2} maxLength={120} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="store-phone">Telefone</Label><PhoneInput id="store-phone" name="phone" defaultValue={store.phone ?? ""} maxLength={20} className="h-10" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="store-email">E-mail</Label><Input id="store-email" name="email" type="email" defaultValue={store.email ?? ""} maxLength={254} className="h-10" /></div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Endereço</h3>
            <p className="mt-1 text-xs text-muted-foreground">A consulta de CEP sugere campos; revise antes de salvar.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="store-postal-code">CEP</Label><CepLookupField id="store-postal-code" value={address.postal_code} onValueChange={(value) => changeAddress("postal_code", value)} onAddressFound={applyLookup} /></div>
            <div className="space-y-1.5"><Label htmlFor="store-street">Logradouro</Label><Input id="store-street" value={address.street} onChange={(event) => changeAddress("street", event.currentTarget.value)} maxLength={200} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="store-number">Número</Label><Input id="store-number" value={address.number} onChange={(event) => changeAddress("number", event.currentTarget.value)} maxLength={40} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="store-complement">Complemento (opcional)</Label><Input id="store-complement" value={address.complement} onChange={(event) => changeAddress("complement", event.currentTarget.value)} maxLength={120} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="store-district">Bairro</Label><Input id="store-district" value={address.district} onChange={(event) => changeAddress("district", event.currentTarget.value)} maxLength={120} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="store-city">Cidade</Label><Input id="store-city" value={address.city} onChange={(event) => changeAddress("city", event.currentTarget.value)} maxLength={100} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="store-state">UF</Label><Input id="store-state" value={address.state} onChange={(event) => changeAddress("state", event.currentTarget.value.toUpperCase().slice(0, 2))} maxLength={2} className="h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="store-reference">Referência</Label><Input id="store-reference" value={address.reference} onChange={(event) => changeAddress("reference", event.currentTarget.value)} maxLength={200} className="h-10" /></div>
          </div>
          <Button type="submit" className="h-10 px-4" disabled={pending}>{pending ? "Salvando…" : "Salvar alterações"}</Button>
        </form>
      </Card>
    </div>
  );
}
