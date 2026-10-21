"use client"

import { useState } from "react"
import { format, isValid, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { LuCalendarDays } from "react-icons/lu"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "cn"

type DatePickerFieldProps = {
  id?: string
  name?: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  required?: boolean
  min?: string
  max?: string
  className?: string
}

function parseDate(value: string | undefined) {
  if (!value) return undefined
  const date = parseISO(value)
  return isValid(date) ? date : undefined
}

export function DatePickerField({
  id,
  name,
  value,
  onValueChange,
  placeholder = "Selecione uma data",
  ariaLabel,
  disabled = false,
  required = false,
  min,
  max,
  className,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false)
  const selectedDate = parseDate(value)
  const minDate = parseDate(min)
  const maxDate = parseDate(max)
  const disabledDate = minDate || maxDate
    ? (date: Date) => (minDate !== undefined && date < minDate) || (maxDate !== undefined && date > maxDate)
    : undefined

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              aria-label={ariaLabel}
              variant="outline"
              disabled={disabled}
              data-empty={!selectedDate}
              className={cn(
                "h-9 w-full justify-start gap-2 text-left font-normal data-[empty=true]:text-muted-foreground",
                className
              )}
            />
          }
        >
          <LuCalendarDays className="size-4" />
          {selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: ptBR }) : <span>{placeholder}</span>}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={ptBR}
            selected={selectedDate}
            onSelect={(date: Date | undefined) => {
              onValueChange(date ? format(date, "yyyy-MM-dd") : "")
              setOpen(false)
            }}
            disabled={disabledDate}
            required={required}
          />
        </PopoverContent>
      </Popover>
      {name ? <input type="hidden" name={name} value={value} disabled={disabled} /> : null}
    </>
  )
}
