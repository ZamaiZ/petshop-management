"use client";

import { useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

type NativeInputProps = ComponentProps<typeof Input>;

type BrlInputProps = Omit<NativeInputProps, "type" | "inputMode" | "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

const MAX_DIGITS = 15;

function digitsFromValue(value: string) {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, MAX_DIGITS);
}

function formatDigits(digits: string) {
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const reais = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${reais},${padded.slice(-2)}`;
}

function positionAfterDigits(value: string, count: number) {
  if (count <= 0) return 0;
  // The first two digits are visually padded as reais/cents, so the raw
  // input position cannot be mapped to them one-for-one. Keep short values
  // at the end until the user has entered enough digits to remove padding.
  if (digitsFromValue(value).length <= 3) return value.length;
  let found = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index])) found += 1;
    if (found === count) return index + 1;
  }
  return value.length;
}

export function BrlInput({ value, defaultValue, onValueChange, ...props }: BrlInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const [internalDigits, setInternalDigits] = useState(() => digitsFromValue(defaultValue ?? ""));
  const digits = controlled ? digitsFromValue(value ?? "") : internalDigits;
  const formatted = formatDigits(digits);

  function update(nextDigits: string, caretDigits: number) {
    const safeDigits = nextDigits.slice(0, MAX_DIGITS);
    const nextValue = formatDigits(safeDigits);
    if (!controlled) setInternalDigits(safeDigits);
    onValueChange?.(nextValue);
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
    const caretDigits = digitsFromValue(inputValue.slice(0, caret)).length;
    update(digitsFromValue(inputValue), caretDigits);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (input.selectionStart !== input.selectionEnd) return;

    const caret = input.selectionStart ?? 0;
    const visibleDigitsBeforeCaret = input.value.slice(0, caret).replace(/\D/g, "").length;
    const displayPadding = Math.max(0, 3 - digits.length);
    const digitsBeforeCaret = Math.max(0, visibleDigitsBeforeCaret - displayPadding);
    if (event.key === "Backspace" && caret > 0 && !/\d/.test(input.value[caret - 1])) {
      event.preventDefault();
      if (digitsBeforeCaret > 0) update(digits.slice(0, digitsBeforeCaret - 1) + digits.slice(digitsBeforeCaret), digitsBeforeCaret - 1);
    } else if (event.key === "Delete" && caret < input.value.length && !/\d/.test(input.value[caret])) {
      event.preventDefault();
      if (digitsBeforeCaret < digits.length) update(digits.slice(0, digitsBeforeCaret) + digits.slice(digitsBeforeCaret + 1), digitsBeforeCaret);
    }
  }

  return <Input
    {...props}
    ref={inputRef}
    type="text"
    inputMode="numeric"
    autoComplete="off"
    spellCheck={false}
    value={formatted}
    onChange={handleChange}
    onKeyDown={handleKeyDown}
  />;
}
