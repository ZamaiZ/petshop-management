"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

export type CepAddress = {
  street: string;
  district: string;
  city: string;
  state: string;
};

function formatCep(value: string) {
  return value.length > 5 ? `${value.slice(0, 5)}-${value.slice(5)}` : value;
}

export function CepLookupField({
  id,
  value,
  onValueChange,
  onAddressFound,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  onAddressFound: (address: CepAddress, previous: CepAddress | null) => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "missing" | "error">("idle");
  const previousLookup = useRef<CepAddress | null>(null);
  const onAddressFoundRef = useRef(onAddressFound);
  const digits = value.replace(/\D/g, "").slice(0, 8);

  useEffect(() => {
    onAddressFoundRef.current = onAddressFound;
  }, [onAddressFound]);

  useEffect(() => {
    if (digits.length !== 8) {
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 7000);
    const debounce = setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch(`/api/cep?cep=${digits}`, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (response.status === 404) {
          setStatus("missing");
          return;
        }
        if (!response.ok) throw new Error("viacep_unavailable");
        const payload = await response.json() as {
          erro?: boolean;
          logradouro?: string;
          bairro?: string;
          localidade?: string;
          uf?: string;
        };
        if (controller.signal.aborted) return;
        if (payload.erro) {
          setStatus("missing");
          return;
        }
        const address = {
          street: payload.logradouro ?? "",
          district: payload.bairro ?? "",
          city: payload.localidade ?? "",
          state: payload.uf ?? "",
        };
        onAddressFoundRef.current(address, previousLookup.current);
        previousLookup.current = address;
        setStatus("found");
      } catch {
        if (timedOut || !controller.signal.aborted) setStatus("error");
      }
    }, 400);

    return () => {
      clearTimeout(debounce);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [digits]);

  const statusMessage = status === "loading"
    ? "Consultando CEP…"
    : status === "found"
      ? "Endereço encontrado. Revise os campos preenchidos."
      : status === "missing"
        ? "CEP não encontrado. Você pode preencher o endereço manualmente."
        : status === "error"
          ? "Não foi possível consultar o CEP. Preencha o endereço manualmente."
          : "Digite os oito números do CEP para consultar.";

  return (
    <div className="space-y-1">
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={9}
        value={formatCep(digits)}
        onChange={(event) => onValueChange(event.currentTarget.value.replace(/\D/g, "").slice(0, 8))}
        aria-describedby={`${id}-status`}
        className="h-11"
      />
      <p id={`${id}-status`} aria-live="polite" className={`text-[10px] ${status === "error" || status === "missing" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>
        {statusMessage}
      </p>
    </div>
  );
}
