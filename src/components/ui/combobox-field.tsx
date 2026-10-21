"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { cn } from "cn"

export type ComboboxFieldOption<Value extends string = string> = {
  value: Value
  label: string
}

type ComboboxFieldProps<Value extends string> = {
  id?: string
  name?: string
  value: Value
  options: readonly ComboboxFieldOption<Value>[]
  onValueChange: (value: Value) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  inputClassName?: string
  emptyMessage?: string
}

export function ComboboxField<Value extends string>({
  id,
  name,
  value,
  options,
  onValueChange,
  placeholder,
  disabled = false,
  className,
  inputClassName,
  emptyMessage = "Nenhuma opção encontrada.",
}: ComboboxFieldProps<Value>) {
  const selectedOption = options.find((option) => option.value === value) ?? null

  return (
    <Combobox
      items={options}
      value={selectedOption}
      onValueChange={(option) => {
        if (option) onValueChange(option.value)
      }}
      itemToStringLabel={(option) => option.label}
      isItemEqualToValue={(item, selected) => item.value === selected.value}
      disabled={disabled}
      name={name}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        disabled={disabled}
        className={cn("w-full", className)}
        inputClassName={cn("h-full", inputClassName)}
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(option: ComboboxFieldOption<Value>) => (
            <ComboboxItem key={option.value} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
