"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LuImagePlus, LuPawPrint, LuStore } from "react-icons/lu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CepLookupField, type CepAddress } from "@/components/ui/cep-lookup-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { STORE_ADDRESS_FIELDS, type StoreAddress, type StoreAddressField } from "@/lib/store-address-shared";
import { completeStoreSetup } from "../actions";

const emptyAddress: StoreAddress = {
  postal_code: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  reference: "",
};

function keepUntouched(current: string, previous: string | undefined) {
  return !current.trim() || (previous !== undefined && current.trim() === previous.trim());
}

export function StoreSetupForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [address, setAddress] = useState(emptyAddress);
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState(false);
  const [pending, startTransition] = useTransition();

  function changeAddress(field: StoreAddressField, value: string) {
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const formData = new FormData(event.currentTarget);
    for (const field of STORE_ADDRESS_FIELDS) formData.set(field, address[field]);
    const logo = fileRef.current?.files?.[0];
    if (logo) formData.set("logo", logo);

    startTransition(async () => {
      const result = await completeStoreSetup(formData);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      if (result.logoWarning) {
        setMessage("O pet shop foi criado. A logo não foi enviada; você poderá adicioná-la em Configurações.");
        setFinished(true);
        return;
      }
      router.replace("/dashboard");
    });
  }

  return (
    <main className="min-h-dvh bg-[#f6f7f9] px-4 py-8 dark:bg-background sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-[760px]">
        <div className="mb-8 flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background"><LuPawPrint className="size-4" aria-hidden="true" /></span>
          petshop.
        </div>
        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Configuração inicial</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.045em] sm:text-[34px]">Configure seu pet shop</h1>
          <p className="mt-2 max-w-[560px] text-[13px] leading-6 text-muted-foreground">
            Preencha os dados básicos para abrir o painel. Depois, você escolhe por onde quer começar.
          </p>
        </div>

        <Card className="gap-0 rounded-xl border-border/90 p-5 shadow-xs sm:p-7">
          <form onSubmit={submit} className="space-y-7" aria-busy={pending}>
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><LuStore className="size-4" aria-hidden="true" />Dados do pet shop</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="setup-name">Nome do pet shop</Label><Input id="setup-name" name="name" required minLength={2} maxLength={120} autoComplete="organization" className="h-10" /></div>
                <div className="space-y-1.5"><Label htmlFor="setup-phone">Telefone (opcional)</Label><PhoneInput id="setup-phone" name="phone" maxLength={20} className="h-10" /></div>
                <div className="space-y-1.5"><Label htmlFor="setup-email">E-mail comercial (opcional)</Label><Input id="setup-email" name="email" type="email" maxLength={254} autoComplete="email" className="h-10" /></div>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Endereço</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">A consulta do CEP sugere os campos. Revise antes de continuar.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="setup-postal-code">CEP</Label><CepLookupField id="setup-postal-code" value={address.postal_code} onValueChange={(value) => changeAddress("postal_code", value)} onAddressFound={applyLookup} /></div>
                <div className="space-y-1.5"><Label htmlFor="setup-street">Logradouro</Label><Input id="setup-street" name="street" value={address.street} onChange={(event) => changeAddress("street", event.currentTarget.value)} maxLength={200} required className="h-10" /></div>
                <div className="space-y-1.5"><Label htmlFor="setup-number">Número</Label><Input id="setup-number" name="number" value={address.number} onChange={(event) => changeAddress("number", event.currentTarget.value)} maxLength={40} required className="h-10" /></div>
                <div className="space-y-1.5"><Label htmlFor="setup-complement">Complemento (opcional)</Label><Input id="setup-complement" name="complement" value={address.complement} onChange={(event) => changeAddress("complement", event.currentTarget.value)} maxLength={120} className="h-10" /></div>
                <div className="space-y-1.5"><Label htmlFor="setup-district">Bairro</Label><Input id="setup-district" name="district" value={address.district} onChange={(event) => changeAddress("district", event.currentTarget.value)} maxLength={120} required className="h-10" /></div>
                <div className="space-y-1.5"><Label htmlFor="setup-city">Cidade</Label><Input id="setup-city" name="city" value={address.city} onChange={(event) => changeAddress("city", event.currentTarget.value)} maxLength={100} required className="h-10" /></div>
                <div className="space-y-1.5"><Label htmlFor="setup-state">UF</Label><Input id="setup-state" name="state" value={address.state} onChange={(event) => changeAddress("state", event.currentTarget.value.toUpperCase().slice(0, 2))} maxLength={2} required className="h-10" /></div>
                <div className="space-y-1.5"><Label htmlFor="setup-reference">Referência (opcional)</Label><Input id="setup-reference" name="reference" value={address.reference} onChange={(event) => changeAddress("reference", event.currentTarget.value)} maxLength={200} className="h-10" /></div>
              </div>
            </section>

            <section className="space-y-2">
              <Label htmlFor="setup-logo">Logo (opcional)</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Input ref={fileRef} id="setup-logo" type="file" accept="image/png,image/jpeg,image/webp" className="h-10 max-w-[360px] text-xs file:mr-2 file:border-0 file:bg-transparent file:text-xs" />
                <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"><LuImagePlus className="size-3.5" aria-hidden="true" />PNG, JPG ou WebP · até 2 MiB</span>
              </div>
            </section>

            {message ? <Alert variant={finished ? "default" : "destructive"}><AlertDescription>{message}</AlertDescription></Alert> : null}
            {finished ? (
              <Button type="button" className="h-10 px-5" onClick={() => router.replace("/dashboard")}>Abrir painel</Button>
            ) : (
              <Button type="submit" className="h-10 px-5" disabled={pending}>{pending ? "Criando pet shop…" : "Criar pet shop e abrir painel"}</Button>
            )}
          </form>
        </Card>
      </div>
    </main>
  );
}
