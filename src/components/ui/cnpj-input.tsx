"use client";

import { useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { formatCnpj, normalizeCnpj } from "@/lib/cnpj";

type NativeInputProps = ComponentProps<typeof Input>;

type CnpjInputProps = Omit<NativeInputProps, "type" | "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

function positionAfterCharacters(value: string, count: number) {
  if (count <= 0) return 0;
  let found = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/[A-Z0-9]/i.test(value[index])) found += 1;
    if (found === count) return index + 1;
  }
  return value.length;
}

export function CnpjInput({ value, defaultValue, onValueChange, ...props }: CnpjInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(() => normalizeCnpj(defaultValue ?? ""));
  const normalized = normalizeCnpj(controlled ? value ?? "" : internal);
  const formatted = formatCnpj(normalized);

  function update(nextValue: string, caretCharacters: number) {
    const next = normalizeCnpj(nextValue);
    if (!controlled) setInternal(next);
    onValueChange?.(next);
    const nextFormatted = formatCnpj(next);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) {
        const position = positionAfterCharacters(nextFormatted, caretCharacters);
        input.setSelectionRange(position, position);
      }
    });
  }

  return <Input
    {...props}
    ref={inputRef}
    type="text"
    inputMode="text"
    autoCapitalize="characters"
    autoComplete="off"
    spellCheck={false}
    maxLength={18}
    value={formatted}
    onChange={(event) => {
      const inputValue = event.currentTarget.value;
      const caret = event.currentTarget.selectionStart ?? inputValue.length;
      const charactersBeforeCaret = normalizeCnpj(inputValue.slice(0, caret)).length;
      update(inputValue, charactersBeforeCaret);
    }}
  />;
}
