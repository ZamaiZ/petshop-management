"use client";

import { useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { formatBrazilianPhone, normalizeBrazilianPhone } from "@/lib/phone";

type NativeInputProps = ComponentProps<typeof Input>;

type PhoneInputProps = Omit<NativeInputProps, "type" | "inputMode" | "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

function inputDigits(value: string) {
  return normalizeBrazilianPhone(value).slice(0, 11);
}

function positionAfterDigits(value: string, count: number) {
  if (count <= 0) return 0;
  let found = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index])) found += 1;
    if (found === count) return index + 1;
  }
  return value.length;
}

export function PhoneInput({ value, defaultValue, onValueChange, ...props }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const [internalDigits, setInternalDigits] = useState(() => inputDigits(defaultValue ?? ""));
  const digits = controlled ? inputDigits(value ?? "") : internalDigits;
  const formatted = formatBrazilianPhone(digits);

  function update(nextDigits: string, caretDigits: number) {
    const safeDigits = inputDigits(nextDigits);
    const nextValue = formatBrazilianPhone(safeDigits);
    if (!controlled) setInternalDigits(safeDigits);
    onValueChange?.(safeDigits);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const position = positionAfterDigits(nextValue, caretDigits);
      input.setSelectionRange(position, position);
    });
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const inputValue = event.currentTarget.value;
    const caret = event.currentTarget.selectionStart ?? inputValue.length;
    const caretDigits = inputDigits(inputValue.slice(0, caret)).length;
    update(inputDigits(inputValue), caretDigits);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (input.selectionStart !== input.selectionEnd) return;

    const caret = input.selectionStart ?? 0;
    const digitsBeforeCaret = inputDigits(input.value.slice(0, caret)).length;
    if (event.key === "Backspace" && caret > 0 && !/\d/.test(input.value[caret - 1])) {
      event.preventDefault();
      if (digitsBeforeCaret > 0) {
        update(digits.slice(0, digitsBeforeCaret - 1) + digits.slice(digitsBeforeCaret), digitsBeforeCaret - 1);
      }
    } else if (event.key === "Delete" && caret < input.value.length && !/\d/.test(input.value[caret])) {
      event.preventDefault();
      if (digitsBeforeCaret < digits.length) {
        update(digits.slice(0, digitsBeforeCaret) + digits.slice(digitsBeforeCaret + 1), digitsBeforeCaret);
      }
    }
  }

  return <Input
    {...props}
    ref={inputRef}
    type="tel"
    inputMode="tel"
    autoComplete={props.autoComplete ?? "tel-national"}
    value={formatted}
    onChange={handleChange}
    onKeyDown={handleKeyDown}
  />;
}
