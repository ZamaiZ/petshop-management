"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ptBR } from "date-fns/locale";
import {
  LuCalendarDays,
  LuClock3,
  LuPawPrint,
  LuPlus,
  LuScissors,
} from "react-icons/lu";
import { Calendar } from "@/components/ui/calendar";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComboboxField } from "@/components/ui/combobox-field";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatTime } from "@/lib/format";
import { dateTimeInTimeZone } from "@/lib/date";
import { rescheduleAppointment, saveAppointment, updateAppointmentStatus } from "../actions";
import type { AgendaAppointment } from "../queries";

type AgendaData = {
  appointments: AgendaAppointment[];
  services: { id: string; name: string; price_cents: number; duration_minutes: number }[];
  customers: { id: string; name: string }[];
  pets: { id: string; customer_id: string; name: string; species: string; breed: string | null }[];
};

const statusLabels: Record<AgendaAppointment["status"], string> = {
  scheduled: "Agendado",
  arrived: "Chegou",
  in_progress: "Em atendimento",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado",
  no_show: "Falta",
};

const statusClasses: Record<AgendaAppointment["status"], string> = {
  scheduled: "border-border bg-muted/70 text-muted-foreground",
  arrived: "border-border bg-muted/70 text-muted-foreground",
  in_progress: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200",
  delivered: "border-border bg-muted/70 text-muted-foreground",
  cancelled: "border-border bg-muted/70 text-muted-foreground",
  no_show: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
};

function dateTitle(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(date);
}

function selectedDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function AppointmentForm({ date, data, onClose }: { date: string; data: AgendaData; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [petId, setPetId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(date);
  const pets = useMemo(() => data.pets.filter((pet) => pet.customer_id === customerId), [data.pets, customerId]);
  const service = data.services.find((item) => item.id === serviceId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const result = await saveAppointment({
        customerId,
        petId,
        serviceId,
        date: String(form.get("date") ?? date),
        time: String(form.get("time") ?? ""),
        notes: String(form.get("notes") ?? ""),
      });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      onClose();
      router.refresh();
    });
  }

  return <form onSubmit={submit} className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2"><Label>Tutor</Label><ComboboxField value={customerId} onValueChange={(value) => { setCustomerId(value); setPetId(""); }} options={data.customers.map((customer) => ({ value: customer.id, label: customer.name }))} placeholder="Selecione o cliente" /></div>
      <div className="space-y-1.5"><Label>Pet</Label><ComboboxField value={petId} onValueChange={setPetId} options={pets.map((pet) => ({ value: pet.id, label: `${pet.name} · ${pet.species}` }))} placeholder={customerId ? "Selecione o pet" : "Escolha o tutor"} disabled={!customerId} /></div>
      <div className="space-y-1.5"><Label>Serviço</Label><ComboboxField value={serviceId} onValueChange={setServiceId} options={data.services.map((item) => ({ value: item.id, label: item.name }))} placeholder="Selecione o serviço" /></div>
      <div className="space-y-1.5"><Label htmlFor="appointment-date">Data</Label><DatePickerField id="appointment-date" name="date" value={appointmentDate} onValueChange={setAppointmentDate} required /></div>
      <div className="space-y-1.5"><Label htmlFor="appointment-time">Horário</Label><Input id="appointment-time" name="time" type="time" step={1800} defaultValue="09:00" required /></div>
    </div>
    {service ? <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2.5 text-[11px]"><span className="text-muted-foreground">Duração: {service.duration_minutes} min</span><span className="font-medium tabular-nums">{formatMoney(service.price_cents)}</span></div> : null}
    <div className="space-y-1.5"><Label htmlFor="appointment-notes">Cuidados e observações</Label><Textarea id="appointment-notes" name="notes" rows={3} maxLength={500} /></div>
    {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
    <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={pending || !customerId || !petId || !serviceId}>{pending ? "Agendando…" : "Confirmar agendamento"}</Button></DialogFooter>
  </form>;
}

function StatusReasonDialog({ appointment, status, onUpdated }: { appointment: AgendaAppointment; status: "cancelled" | "no_show"; onUpdated: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
    setMessage("");
    startTransition(async () => {
      const result = await updateAppointmentStatus({ appointmentId: appointment.id, status, expectedVersion: appointment.version, reason });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
      onUpdated();
      router.refresh();
    });
  }

  const label = status === "cancelled" ? "Cancelar" : "Registrar falta";
  return <>
    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-muted-foreground" onClick={() => setOpen(true)}>{label}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-[420px]"><DialogHeader><DialogTitle className="text-[17px]">{label} atendimento</DialogTitle><DialogDescription className="text-[11px]">{appointment.pet} · {appointment.service}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-3"><div className="space-y-1.5"><Label htmlFor={`appointment-reason-${appointment.id}`}>Motivo</Label><Textarea id={`appointment-reason-${appointment.id}`} name="reason" minLength={3} maxLength={500} required rows={3} /></div>{message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Voltar</Button><Button type="submit" variant={status === "cancelled" ? "destructive" : "default"} disabled={pending}>{pending ? "Salvando…" : label}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}

function RescheduleDialog({ appointment, services, timezone }: { appointment: AgendaAppointment; services: AgendaData["services"]; timezone: string }) {
  const router = useRouter();
  const current = dateTimeInTimeZone(appointment.starts_at, timezone);
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState(appointment.service_id);
  const [rescheduleDate, setRescheduleDate] = useState(current.date);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const result = await rescheduleAppointment({
        appointmentId: appointment.id,
        serviceId,
        date: String(form.get("date") ?? current.date),
        time: String(form.get("time") ?? current.time),
        expectedVersion: appointment.version,
        reason: String(form.get("reason") ?? ""),
      });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return <>
    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-muted-foreground" onClick={() => { setRescheduleDate(current.date); setOpen(true); }}>Reagendar</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-[440px]"><DialogHeader><DialogTitle className="text-[17px]">Reagendar atendimento</DialogTitle><DialogDescription className="text-[11px]">A agenda verifica conflitos e grava a nova versão do atendimento.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-3"><div className="space-y-1.5"><Label>Serviço</Label><ComboboxField value={serviceId} onValueChange={setServiceId} options={services.map((service) => ({ value: service.id, label: `${service.name} · ${service.duration_minutes} min` }))} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor={`reschedule-date-${appointment.id}`}>Data</Label><DatePickerField id={`reschedule-date-${appointment.id}`} name="date" value={rescheduleDate} onValueChange={setRescheduleDate} required /></div><div className="space-y-1.5"><Label htmlFor={`reschedule-time-${appointment.id}`}>Horário</Label><Input id={`reschedule-time-${appointment.id}`} name="time" type="time" step={1800} defaultValue={current.time} required /></div></div><div className="space-y-1.5"><Label htmlFor={`reschedule-reason-${appointment.id}`}>Motivo</Label><Textarea id={`reschedule-reason-${appointment.id}`} name="reason" rows={2} required minLength={3} maxLength={500} /></div>{message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar novo horário"}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}

function AppointmentCard({ appointment, services, timezone }: { appointment: AgendaAppointment; services: AgendaData["services"]; timezone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const nextStatus: Partial<Record<AgendaAppointment["status"], { status: "arrived" | "in_progress" | "ready" | "delivered"; label: string }>> = {
    scheduled: { status: "arrived", label: "Confirmar chegada" },
    arrived: { status: "in_progress", label: "Iniciar atendimento" },
    in_progress: { status: "ready", label: "Marcar como pronto" },
    ready: { status: "delivered", label: "Entregar pet" },
  };
  const next = nextStatus[appointment.status];

  function advance() {
    if (!next) return;
    setMessage("");
    startTransition(async () => {
      const result = await updateAppointmentStatus({ appointmentId: appointment.id, status: next.status, expectedVersion: appointment.version, reason: "" });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      router.refresh();
    });
  }

  return <article className="grid gap-3 border-b border-border px-4 py-4 last:border-0 sm:grid-cols-[52px_minmax(0,1fr)_auto] sm:items-start sm:px-5">
    <time className="pt-1 text-[11px] font-medium tabular-nums text-muted-foreground">{formatTime(appointment.starts_at, timezone)}</time>
    <div className="flex min-w-0 gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><LuPawPrint className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="truncate text-[11px] font-semibold">{appointment.pet}{appointment.breed ? ` · ${appointment.breed}` : appointment.species ? ` · ${appointment.species}` : ""}</p><Badge variant="outline" className={`h-5 rounded-md px-1.5 text-[9px] font-normal ${statusClasses[appointment.status]}`}><span className="mr-1 size-1.5 rounded-full bg-current opacity-60" />{statusLabels[appointment.status]}</Badge></div>
        <p className="mt-1.5 truncate text-[10px] text-muted-foreground">{appointment.service} · {appointment.customer}</p>
        {appointment.notes ? <p className="mt-1 truncate text-[10px] text-muted-foreground">{appointment.notes}</p> : null}
        <p className="mt-2 text-[12px] font-semibold tabular-nums">{formatMoney(appointment.price_cents)}</p>
        {message ? <p role="alert" className="mt-2 text-[10px] text-destructive">{message}</p> : null}
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-end gap-1.5 sm:max-w-52">
      {next ? <Button type="button" variant="outline" size="sm" className="h-8 rounded-md px-2.5 text-[10px]" onClick={advance} disabled={pending}>{pending ? "Atualizando…" : next.label}</Button> : appointment.status === "delivered" ? <span className="text-[10px] text-muted-foreground">Atendimento finalizado</span> : null}
      {!(["delivered", "cancelled", "no_show"] as string[]).includes(appointment.status) ? <StatusReasonDialog appointment={appointment} status="cancelled" onUpdated={() => router.refresh()} /> : null}
      {appointment.status === "scheduled" ? <StatusReasonDialog appointment={appointment} status="no_show" onUpdated={() => router.refresh()} /> : null}
      {!( ["delivered", "cancelled", "no_show"] as string[]).includes(appointment.status) ? <RescheduleDialog appointment={appointment} services={services} timezone={timezone} /> : null}
    </div>
  </article>;
}

export function AgendaView({ data, date, timezone }: { data: AgendaData; date: string; timezone: string }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const selected = selectedDate(date);
  const [visibleMonth, setVisibleMonth] = useState(selected);
  useEffect(() => { setVisibleMonth(selectedDate(date)); }, [date]);
  const dayAppointments = data.appointments;
  const services = data.services;

  function navigateDate(value: string) {
    router.push(`/agenda?date=${encodeURIComponent(value)}`);
  }

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-[24px] font-semibold tracking-[-0.04em]">Agenda</h1><p className="mt-1.5 text-[12px] text-muted-foreground">Organize os horários de banho, tosa e outros atendimentos.</p></div><Button className="h-9 gap-2 rounded-md px-3 text-[11px]" onClick={() => setCreateOpen(true)}><LuPlus className="size-3.5" /> Novo agendamento</Button></div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]"><DialogHeader><DialogTitle className="text-[18px]">Novo agendamento</DialogTitle><DialogDescription className="text-[11px]">Os horários começam em intervalos de 30 minutos. A duração vem do serviço.</DialogDescription></DialogHeader><AppointmentForm date={date} data={data} onClose={() => setCreateOpen(false)} /></DialogContent></Dialog>
    <div className="grid gap-4 xl:grid-cols-[310px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card className="gap-0 overflow-hidden rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="text-[12px] font-semibold">{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: timezone }).format(visibleMonth)}</div><LuCalendarDays className="size-4 text-muted-foreground" /></div>
          <Calendar mode="single" month={visibleMonth} onMonthChange={setVisibleMonth} selected={selected} onSelect={(value) => { if (value) navigateDate(dateKey(value)); }} locale={ptBR} weekStartsOn={1} className="mx-auto" />
          <div className="border-t border-border px-4 py-4">
            <h2 className="text-[11px] font-semibold">Serviços da loja</h2>
            <div className="mt-3 space-y-2.5">{services.length ? services.map((service) => <div key={service.id} className="flex items-start justify-between gap-3 text-[10px]"><span className="min-w-0"><span className="block truncate font-medium">{service.name}</span><span className="mt-1 flex items-center gap-1 text-muted-foreground"><LuClock3 className="size-3" />{service.duration_minutes} min</span></span><span className="whitespace-nowrap text-muted-foreground">a partir de {formatMoney(service.price_cents)}</span></div>) : <p className="text-[10px] text-muted-foreground">Cadastre os serviços da loja para liberar agendamentos.</p>}</div>
          </div>
        </Card>
        <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"><Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => navigateDate(dateKeyAtTimeZone(new Date(Date.parse(`${date}T12:00:00Z`) - 86400000), timezone))}>Dia anterior</Button><Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => navigateDate(dateKeyAtTimeZone(new Date(), timezone))}>Hoje</Button><Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => navigateDate(dateKeyAtTimeZone(new Date(Date.parse(`${date}T12:00:00Z`) + 86400000), timezone))}>Próximo dia</Button></div>
      </div>
      <Card className="gap-0 overflow-hidden rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="flex flex-col justify-between gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:px-5"><div><h2 className="text-[13px] font-semibold">{dateTitle(date)}</h2><p className="mt-1 text-[10px] text-muted-foreground">{dayAppointments.length} {dayAppointments.length === 1 ? "agendamento no dia" : "agendamentos no dia"}</p></div><Badge variant="outline" className="w-fit rounded-md px-2 py-1 text-[10px] font-normal"><span className="mr-1.5 size-1.5 rounded-full bg-muted-foreground/60" />Agenda do dia</Badge></div>
        {dayAppointments.length ? dayAppointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} services={services} timezone={timezone} />) : <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center"><span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><LuScissors className="size-4" /></span><p className="mt-3 text-[12px] font-medium">Sem atendimentos neste dia</p><p className="mt-1 text-[10px] text-muted-foreground">Escolha outra data ou crie um novo agendamento.</p><Button variant="outline" size="sm" className="mt-4 h-8 text-[10px]" onClick={() => setCreateOpen(true)}><LuPlus className="size-3.5" /> Agendar serviço</Button></div>}
      </Card>
    </div>
  </div>;
}

function dateKeyAtTimeZone(date: Date, timezone: string) {
  const values = new Map(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function AgendaLoadError({ message }: { message: string }) {
  return <Alert variant="destructive"><AlertTitle>Falha ao carregar a agenda</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>;
}
