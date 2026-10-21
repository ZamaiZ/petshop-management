"use client";

import { useState } from "react";
import { LuEye, LuEyeOff } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthTextField({
  id,
  label,
  type = "text",
  autoComplete,
  required = true,
  maxLength,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[12px] font-medium">{label}</Label>
      <Input id={id} name={id} type={type} autoComplete={autoComplete} required={required} maxLength={maxLength} className="h-10 rounded-md bg-background text-[13px]" />
    </div>
  );
}

export function AuthPasswordField({
  id,
  label,
  autoComplete,
  minLength = 1,
  maxLength = 72,
}: {
  id: string;
  label: string;
  autoComplete: string;
  minLength?: number;
  maxLength?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[12px] font-medium">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={maxLength}
          className="h-10 rounded-md bg-background pr-11 text-[13px]"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {visible ? <LuEyeOff /> : <LuEye />}
        </Button>
      </div>
    </div>
  );
}

export function AuthFeedback({ message, success = false }: { message: string; success?: boolean }) {
  if (!message) return null;
  return (
    <p role={success ? "status" : "alert"} className={`rounded-md border px-3 py-2.5 text-[12px] ${success ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
      {message}
    </p>
  );
}
