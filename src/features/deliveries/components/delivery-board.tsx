"use client";

import { useState, useTransition, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LuArrowLeft, LuCheck, LuMapPin, LuPhone, LuTruck } from "react-icons/lu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, formatShortDate, formatTime } from "@/lib/format";
import { moveDelivery } from "../actions";
import type { DeliveryOverview, DeliveryRecord } from "../queries";
import { receiveReceivable } from "@/features/finance/actions";

const lanes = [
  { id: "preparing", label: "A preparar", action: "Marcar como pronta" },
  { id: "ready", label: "Pronto para sair", action: "Iniciar entrega" },
  { id: "out_for_delivery", label: "Saiu para entrega", action: "Confirmar entrega" },
  { id: "delivered", label: "Entregue", action: null },
] as const;
type LaneStatus = (typeof lanes)[number]["id"];

function addressLine(address: DeliveryRecord["address"]) {
  const first = [address.street, address.number, address.complement].filter(Boolean).join(", ");
  const second = [address.district, [address.city, address.state].filter(Boolean).join(" / ")].filter(Boolean).join(" · ");
  return [first, second, address.postal_code].filter(Boolean);
}

function paymentName(method: string) {
  const labels: Record<string, string> = { cash: "Dinheiro", pix: "Pix", debit_card: "Cartão de débito", credit_card: "Cartão de crédito" };
  return labels[method] ?? method;
}

function ReceiveOnDelivery({ delivery, cashSessionId, onSaved }: { delivery: DeliveryRecord; cashSessionId: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"cash" | "pix" | "debit_card" | "credit_card">("pix");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [key, setKey] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const result = await receiveReceivable({ receivableId: delivery.receivable_id!, amount: String(form.get("amount") ?? ""), method, sessionId: method === "cash" ? cashSessionId : null, tendered: String(form.get("tendered") ?? ""), key });
      if (!result.ok) { setMessage(result.message); return; }
      setOpen(false);
      onSaved();
    });
  }

  const amount = (delivery.remaining_cents / 100).toFixed(2).replace(".", ",");
  return <>
    <Button variant="outline" className="h-8 w-full text-[10px]" onClick={() => { setKey(crypto.randomUUID()); setMessage(""); setOpen(true); }}>Receber na entrega · {formatMoney(delivery.remaining_cents)}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-[410px]"><DialogHeader><DialogTitle className="text-[16px]">Receber venda #{delivery.sale_number}</DialogTitle><DialogDescription className="text-[11px]">Saldo pendente de {delivery.customer}: {formatMoney(delivery.remaining_cents)}.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-3"><div className="space-y-1"><Label htmlFor={`delivery-receive-amount-${delivery.id}`} className="text-[10px]">Valor recebido (R$)</Label><Input id={`delivery-receive-amount-${delivery.id}`} name="amount" inputMode="decimal" defaultValue={amount} required /></div><div className="space-y-1"><Label className="text-[10px]">Forma de pagamento</Label><Select value={method} onValueChange={(value) => setMethod((value as typeof method) ?? "pix")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pix">Pix</SelectItem><SelectItem value="debit_card">Cartão de débito</SelectItem><SelectItem value="credit_card">Cartão de crédito</SelectItem><SelectItem value="cash">Dinheiro</SelectItem></SelectContent></Select></div>{method === "cash" ? <div className="space-y-1"><Label htmlFor={`delivery-tendered-${delivery.id}`} className="text-[10px]">Valor entregue (R$)</Label><Input id={`delivery-tendered-${delivery.id}`} name="tendered" inputMode="decimal" defaultValue={amount} required /></div> : null}{method === "cash" && !cashSessionId ? <p className="text-[10px] text-destructive">Abra o caixa antes de receber em dinheiro.</p> : null}{message ? <p role="alert" className="text-[10px] text-destructive">{message}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending || !key || (method === "cash" && !cashSessionId)}>{pending ? "Recebendo..." : "Confirmar recebimento"}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}

function CancelDelivery({ delivery, onSaved }: { delivery: DeliveryRecord; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await moveDelivery({ deliveryId: delivery.id, status: "cancelled", position: delivery.position, expectedVersion: delivery.version, reason });
      if (!result.ok) { setMessage(result.message); return; }
      setOpen(false);
      onSaved();
    });
  }

  return <>
    <Button variant="ghost" size="sm" className="h-7 px-2 text-[9px] text-muted-foreground" onClick={() => { setReason(""); setOpen(true); }}>Cancelar entrega</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-[400px]"><DialogHeader><DialogTitle className="text-[16px]">Cancelar entrega #{delivery.sale_number}</DialogTitle><DialogDescription className="text-[11px]">O pagamento e a venda continuam registrados separadamente.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-3"><div className="space-y-1"><Label htmlFor={`cancel-delivery-${delivery.id}`} className="text-[10px]">Motivo</Label><Input id={`cancel-delivery-${delivery.id}`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} required /></div>{message ? <p role="alert" className="text-[10px] text-destructive">{message}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Voltar</Button><Button type="submit" variant="destructive" disabled={pending}>{pending ? "Cancelando..." : "Confirmar cancelamento"}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}

function DeliveryCard({ delivery, cashSessionId, onMove, onRefresh, timezone }: { delivery: DeliveryRecord; cashSessionId: string | null; onMove: (delivery: DeliveryRecord, status: LaneStatus) => void; onRefresh: () => void; timezone: string }) {
  const currentIndex = lanes.findIndex((lane) => lane.id === delivery.status);
  const next = delivery.sale_status === "cancelled" ? undefined : lanes[currentIndex + 1];
  const previous = delivery.sale_status === "cancelled" || delivery.status === "delivered" ? undefined : lanes[currentIndex - 1];
  const address = addressLine(delivery.address);
  const methods = delivery.payment_methods.map(paymentName).join(" · ");
  const paymentLabel = delivery.sale_status === "cancelled" ? "Venda cancelada" : delivery.sale_status === "refunded" ? "Venda devolvida" : delivery.sale_status === "partially_refunded" ? "Devolução parcial" : delivery.remaining_cents > 0 ? "Receber na entrega" : methods ? `Pago via ${methods}` : "Pago";
  const paymentTone = delivery.sale_status === "cancelled" || delivery.sale_status === "refunded"
    ? "border-rose-200 bg-rose-50 text-[9px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
    : delivery.sale_status === "partially_refunded" || delivery.remaining_cents > 0
      ? "border-amber-200 bg-amber-50 text-[9px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
      : "border-emerald-200 bg-emerald-50 text-[9px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200";
  return <Card draggable={delivery.status !== "delivered" && delivery.sale_status !== "cancelled"} onDragStart={(event) => event.dataTransfer.setData("text/plain", delivery.id)} className="gap-0 rounded-[9px] border-border/90 bg-card p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
    <div className="flex items-center justify-between text-[10px] font-semibold"><span>#{delivery.sale_number}</span><LuTruck className="size-3.5 text-muted-foreground" /></div>
    <p className="mt-3 truncate text-[11px] font-semibold">{delivery.customer}</p>
    {delivery.phone ? <a href={`tel:${delivery.phone}`} className="mt-1 inline-flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground"><LuPhone className="size-3" />{delivery.phone}</a> : null}
    {delivery.sale_status === "cancelled" ? <p className="mt-2 text-[9px] leading-4 text-destructive">Venda cancelada · confirme o cancelamento da entrega.</p> : null}
    <p className="mt-2 line-clamp-2 min-h-7 text-[10px] leading-4 text-muted-foreground">{delivery.items || "Pedido sem itens"}</p>
    <div className="my-3 h-px bg-border" />
    <div className="flex items-start gap-2 text-[10px] text-muted-foreground"><LuMapPin className="mt-0.5 size-3.5 shrink-0" /><div className="min-w-0 space-y-0.5">{address.map((line, index) => <p key={index} className="truncate">{line}</p>)}</div></div>
    <div className="mt-3 flex items-center justify-between"><span className="text-[11px] font-semibold tabular-nums">{formatMoney(delivery.total_cents)}</span><Badge variant="outline" className={paymentTone}>{paymentLabel}</Badge></div>
    {delivery.remaining_cents > 0 && delivery.receivable_id ? <div className="mt-2"><ReceiveOnDelivery delivery={delivery} cashSessionId={cashSessionId} onSaved={onRefresh} /></div> : null}
    {next?.action ? <Button variant="outline" className="mt-2 h-8 w-full text-[10px]" onClick={() => onMove(delivery, next.id)}><LuCheck className="mr-1.5 size-3.5" />{next.action}</Button> : null}
    {previous ? <Button variant="ghost" className="mt-1 h-7 w-full text-[9px] text-muted-foreground" onClick={() => onMove(delivery, previous.id)}><LuArrowLeft className="mr-1.5 size-3" />Voltar para {previous.label.toLocaleLowerCase("pt-BR")}</Button> : null}
    {delivery.status !== "delivered" && delivery.status !== "cancelled" ? <div className="mt-1 flex justify-end"><CancelDelivery delivery={delivery} onSaved={onRefresh} /></div> : null}
    {delivery.delivered_at ? <p className="mt-2 text-[9px] text-muted-foreground">Entregue em {formatShortDate(delivery.delivered_at, timezone)} · {formatTime(delivery.delivered_at, timezone)}</p> : null}
  </Card>;
}

export function DeliveryBoard({ overview, timezone }: { overview: DeliveryOverview; timezone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState("");
  const grouped = (status: LaneStatus) => overview.deliveries.filter((delivery) => delivery.status === status);

  function move(delivery: DeliveryRecord, status: LaneStatus) {
    const current = lanes.findIndex((lane) => lane.id === delivery.status);
    const target = lanes.findIndex((lane) => lane.id === status);
    if (Math.abs(target - current) !== 1) { setError("A entrega precisa avançar ou voltar uma etapa por vez."); return; }
    const position = grouped(status).length;
    setError("");
    startTransition(async () => {
      const result = await moveDelivery({ deliveryId: delivery.id, status, position, expectedVersion: delivery.version, reason: "" });
      if (!result.ok) { setError(result.message); return; }
      router.refresh();
    });
  }

  function drop(event: DragEvent<HTMLElement>, status: LaneStatus) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || dragId;
    const delivery = overview.deliveries.find((item) => item.id === id);
    if (delivery) move(delivery, status);
    setDragId("");
  }

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-[24px] font-semibold tracking-[-0.04em]">Entregas</h1><p className="mt-1.5 text-[12px] text-muted-foreground">Preparação, saída e entrega dos pedidos.</p></div><ButtonLink href="/vendas/nova?entrega=1" className="h-9 gap-2 px-3 text-[11px]"><LuTruck className="size-3.5" /> Nova entrega</ButtonLink></div>
    <div className="rounded-md border border-border bg-card px-3 py-2.5 text-[10px] text-muted-foreground">O andamento da entrega e a situação do pagamento são acompanhados separadamente.</div>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {pending ? <div aria-live="polite" className="text-[10px] text-muted-foreground">Atualizando entrega...</div> : null}
    <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-2 2xl:grid-cols-4">
      {lanes.map((lane) => {
        const deliveries = grouped(lane.id);
        return <section key={lane.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, lane.id)} className="min-h-[360px] min-w-0 rounded-[10px] border border-border bg-muted/35 p-3">
          <div className="mb-3 flex items-center justify-between px-0.5 text-[10px] font-semibold"><span>{lane.label}</span><span className="text-muted-foreground">{deliveries.length}</span></div>
          <div className="space-y-3">{deliveries.map((delivery) => <div key={delivery.id} onDragStart={() => setDragId(delivery.id)}><DeliveryCard delivery={delivery} cashSessionId={overview.cashSessionId} onMove={move} onRefresh={() => router.refresh()} timezone={timezone} /></div>)}
            {!deliveries.length ? <div className="grid min-h-[225px] place-items-center rounded-md border border-dashed border-border/70 px-4 text-center text-[10px] text-muted-foreground">Nenhuma entrega aqui.</div> : null}
          </div>
        </section>;
      })}
    </div>
    {overview.deliveries.some((delivery) => delivery.status === "cancelled") ? <Card className="gap-0 rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="border-b border-border px-4 py-3 text-[11px] font-semibold">Entregas canceladas</div>{overview.deliveries.filter((delivery) => delivery.status === "cancelled").map((delivery) => <div key={delivery.id} className="grid gap-1 border-b border-border px-4 py-3 text-[10px] last:border-0 sm:grid-cols-[1fr_1fr_auto]"><span className="font-medium">#{delivery.sale_number} · {delivery.customer}</span><span className="text-muted-foreground">{delivery.cancellation_reason || "Motivo não informado"}</span><span className="tabular-nums">{formatMoney(delivery.total_cents)}</span></div>)}</Card> : null}
    <div className="text-[9px] text-muted-foreground">Atualizado no fuso da loja: {timezone}</div>
  </div>;
}
