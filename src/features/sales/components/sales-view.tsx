"use client";

import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LuArrowRight, LuBanknote, LuChartNoAxesCombined, LuCircleCheck, LuCreditCard, LuDownload, LuPlus } from "react-icons/lu";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, formatQuantity, formatShortDate, formatTime } from "@/lib/format";
import { cancelSale, returnSaleItems } from "../actions";
import type { SaleRecord, SalesOverview } from "../queries";

const paymentLabels: Record<string, string> = { cash: "Dinheiro", pix: "Pix", debit_card: "Cartão de débito", credit_card: "Cartão de crédito", credit: "A receber", transfer: "Transferência" };

function stateOf(sale: SaleRecord) {
  if (sale.status === "cancelled") return "cancelled";
  if (sale.status === "refunded") return "refunded";
  if (sale.status === "partially_refunded") return "partially_refunded";
  if (sale.receivable_cents > 0) return "receivable";
  return "paid";
}

function stateLabel(sale: SaleRecord) {
  const state = stateOf(sale);
  return state === "paid" ? "Pago" : state === "receivable" ? "Pendente" : state === "cancelled" ? "Cancelada" : state === "refunded" ? "Devolvida" : "Devolução parcial";
}

function stateClass(sale: SaleRecord) {
  const state = stateOf(sale);
  if (state === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200";
  if (state === "receivable") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200";
  return "border-border bg-muted/70 text-muted-foreground";
}

function SaleActionDialog({ sale, cashSessionId }: { sale: SaleRecord; cashSessionId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"details" | "cancel" | "return">("details");
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<"cash" | "pix" | "debit_card" | "credit_card">("pix");
  const [message, setMessage] = useState("");
  const [key, setKey] = useState("");
  const [returnLines, setReturnLines] = useState<{ saleItemId: string; quantity: string; restock: boolean }[]>([]);

  function openMode(nextMode: typeof mode) {
    setMode(nextMode);
    setMessage("");
    setReason("");
    setKey(crypto.randomUUID());
    if (nextMode === "return") setReturnLines(sale.items.filter((item) => item.returnable_quantity > 0).map((item) => ({ saleItemId: item.id, quantity: String(item.returnable_quantity), restock: item.product_id !== null })));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = mode === "cancel"
        ? await cancelSale({ saleId: sale.id, reason, method, cashSessionId, key })
        : await returnSaleItems({ saleId: sale.id, reason, method, cashSessionId, key, lines: returnLines.map((line) => ({ saleItemId: line.saleItemId, quantity: Number(line.quantity), restock: line.restock })).filter((line) => line.quantity > 0) });
      if (!result.ok) { setMessage(result.message); return; }
      setMode("details");
      router.refresh();
    });
  }

  const refundable = sale.status === "completed" || sale.status === "partially_refunded";
  const date = sale.completed_at ?? sale.created_at;
  const methodText = sale.payment_methods.length ? sale.payment_methods.map((item) => paymentLabels[item] ?? item).join(" · ") : "A receber";

  return <>
    <Button variant="ghost" size="icon-sm" aria-label={`Ver venda ${sale.number}`} onClick={() => { setMode("details"); setOpen(true); }}><LuArrowRight className="size-4" /></Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="text-[17px]">{mode === "details" ? `Venda #${sale.number}` : mode === "cancel" ? "Cancelar venda" : "Registrar devolução"}</DialogTitle>
          <DialogDescription className="text-[11px]">{sale.customer} · {formatShortDate(date)} às {formatTime(date)}</DialogDescription>
        </DialogHeader>
        {mode === "details" ? <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-[11px] sm:grid-cols-4"><div><p className="text-muted-foreground">Status</p><Badge variant="outline" className={`mt-1 ${stateClass(sale)}`}>{stateLabel(sale)}</Badge></div><div><p className="text-muted-foreground">Total</p><p className="mt-1 font-semibold tabular-nums">{formatMoney(sale.total_cents)}</p></div><div><p className="text-muted-foreground">Recebido</p><p className="mt-1 font-semibold tabular-nums">{formatMoney(sale.paid_cents)}</p></div><div><p className="text-muted-foreground">A receber</p><p className="mt-1 font-semibold tabular-nums">{formatMoney(sale.receivable_cents)}</p></div></section>
          <div><h3 className="mb-2 text-[11px] font-semibold">Itens</h3><div className="divide-y rounded-md border">{sale.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 px-3 py-2.5 text-[11px]"><div className="min-w-0"><p className="truncate font-medium">{item.description}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatQuantity(item.quantity, item.unit)}{item.returned_quantity > 0 ? ` · ${formatQuantity(item.returned_quantity, item.unit)} devolvido` : ""}</p></div><span className="shrink-0 tabular-nums">{formatMoney(item.line_total_cents)}</span></div>)}</div></div>
          <div><h3 className="mb-2 text-[11px] font-semibold">Pagamentos</h3>{sale.payments.length ? <div className="divide-y rounded-md border">{sale.payments.map((payment, index) => <div key={`${payment.method}-${index}`} className="flex items-center justify-between px-3 py-2.5 text-[11px]"><span>{paymentLabels[payment.method] ?? payment.method}{payment.change_cents ? ` · troco ${formatMoney(payment.change_cents)}` : ""}</span><span className="tabular-nums">{formatMoney(payment.amount_cents)}</span></div>)}</div> : <p className="rounded-md border px-3 py-3 text-[11px] text-muted-foreground">{methodText}</p>}</div>
          {sale.cancellation_reason ? <p className="rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">Cancelamento: {sale.cancellation_reason}</p> : null}
          {refundable ? <DialogFooter className="flex-col-reverse sm:flex-row"><Button variant="outline" onClick={() => openMode("return")} disabled={!sale.items.some((item) => item.returnable_quantity > 0)}>Devolver itens</Button><Button variant="destructive" onClick={() => openMode("cancel")} disabled={!sale.items.some((item) => item.returnable_quantity > 0)}>Cancelar venda</Button></DialogFooter> : null}
        </div> : <form onSubmit={submit} className="space-y-4">
          {mode === "return" ? <div className="divide-y rounded-md border">{returnLines.map((line) => {
            const item = sale.items.find((entry) => entry.id === line.saleItemId)!;
            return <div key={item.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_115px_auto] sm:items-center"><div><p className="text-[11px] font-medium">{item.description}</p><p className="text-[10px] text-muted-foreground">Até {formatQuantity(item.returnable_quantity, item.unit)} podem ser devolvidos</p></div><Input aria-label={`Quantidade devolvida de ${item.description}`} type="number" min="0" max={item.returnable_quantity} step={item.product_id ? 0.001 : 1} value={line.quantity} onChange={(event) => setReturnLines((current) => current.map((entry) => entry.saleItemId === item.id ? { ...entry, quantity: event.target.value } : entry))} className="h-8 text-[11px]" />{item.product_id ? <div className="flex items-center gap-2 text-[10px]"><Checkbox id={`restock-${item.id}`} checked={line.restock} onCheckedChange={(checked) => setReturnLines((current) => current.map((entry) => entry.saleItemId === item.id ? { ...entry, restock: checked === true } : entry))} /><Label htmlFor={`restock-${item.id}`} className="cursor-pointer">Repor estoque</Label></div> : null}</div>;
          })}</div> : <div className="rounded-md bg-muted/40 p-3 text-[11px] text-muted-foreground">Os itens ainda não devolvidos serão registrados como retorno. Produtos retornam ao estoque.</div>}
          <div className="space-y-1.5"><Label htmlFor={`sale-reason-${sale.id}`}>Motivo</Label><Input id={`sale-reason-${sale.id}`} value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={500} /></div>
          <div className="space-y-1.5"><Label>Forma de devolução</Label><Select value={method} onValueChange={(value) => setMethod((value as typeof method) ?? "pix")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pix">Pix</SelectItem><SelectItem value="debit_card">Cartão de débito</SelectItem><SelectItem value="credit_card">Cartão de crédito</SelectItem><SelectItem value="cash">Dinheiro</SelectItem></SelectContent></Select>{method === "cash" && !cashSessionId ? <p className="text-[10px] text-destructive">Abra o caixa para devolver dinheiro.</p> : null}</div>
          {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setMode("details")}>Voltar</Button><Button type="submit" disabled={pending || (method === "cash" && !cashSessionId)}>{pending ? "Registrando..." : mode === "cancel" ? "Confirmar cancelamento" : "Confirmar devolução"}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  </>;
}

export function SalesView({ overview, timezone }: { overview: SalesOverview; timezone: string }) {
  const [status, setStatus] = useState("all");
  const filteredSales = useMemo(() => status === "all" ? overview.sales : overview.sales.filter((sale) => stateOf(sale) === status), [overview.sales, status]);
  const columns = useMemo<DataTableColumn<SaleRecord>[]>(() => [
    { accessorKey: "number", header: "Venda / cliente", cell: ({ row }) => <div><p className="font-medium">#{row.original.number} <span className="mx-1 text-muted-foreground">/</span> {row.original.customer}</p><p className="mt-1.5 max-w-[330px] truncate text-[10px] text-muted-foreground">{row.original.items.slice(0, 2).map((item) => `${item.description} · ${formatQuantity(item.quantity, item.unit)}`).join(", ") || "Venda sem itens"}</p></div> },
    { accessorKey: "completed_at", header: "Horário", cell: ({ row }) => row.original.completed_at ? `${formatShortDate(row.original.completed_at, timezone)} · ${formatTime(row.original.completed_at, timezone)}` : "—" },
    { id: "payment", header: "Pagamento", cell: ({ row }) => row.original.payment_methods.length ? [...new Set(row.original.payment_methods)].map((method) => paymentLabels[method] ?? method).join(" · ") : row.original.receivable_cents > 0 ? "A receber" : "—" },
    { id: "status", header: "Status", cell: ({ row }) => <Badge variant="outline" className={stateClass(row.original)}><span className={`mr-1.5 size-1.5 rounded-full ${stateOf(row.original) === "paid" ? "bg-emerald-500" : stateOf(row.original) === "receivable" ? "bg-amber-500" : "bg-muted-foreground"}`} />{stateLabel(row.original)}</Badge> },
    { accessorKey: "total_cents", header: "Total", cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.total_cents)}</span> },
    { id: "details", header: "", enableSorting: false, cell: ({ row }) => <SaleActionDialog sale={row.original} cashSessionId={overview.cashSessionId} /> },
  ], [overview.cashSessionId, timezone]);

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-[24px] font-semibold tracking-[-0.04em]">Vendas</h1><p className="mt-1.5 text-[12px] text-muted-foreground">Histórico e pagamentos.</p></div><ButtonLink href="/vendas/nova" className="h-9 gap-2 rounded-md px-3 text-[11px]"><LuPlus className="size-3.5" /> Nova venda</ButtonLink></div>
    <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <Metric label="Vendido hoje" value={formatMoney(overview.todaySalesCents)} detail="Produtos e serviços" icon={<LuBanknote className="size-4" />} />
      <Metric label="Vendas realizadas" value={String(overview.todayCount)} detail="Atendimentos concluídos" icon={<LuCircleCheck className="size-4" />} />
      <Metric label="Ticket médio" value={formatMoney(overview.averageTicketCents)} detail="Valor médio por venda" icon={<LuChartNoAxesCombined className="size-4" />} />
      <Metric label="Vendas a receber" value={String(overview.openReceivablesCount)} detail="Acompanhe os pagamentos" icon={<LuCreditCard className="size-4" />} />
    </section>
    <Card className="gap-0 rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
      <DataTable columns={columns} data={filteredSales} searchPlaceholder="Buscar por cliente ou número da venda..." emptyMessage="Nenhuma venda encontrada." toolbarActions={<><Select value={status} onValueChange={(value) => setStatus(value ?? "all")}><SelectTrigger className="h-9 w-[150px] text-[11px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="paid">Pagas</SelectItem><SelectItem value="receivable">A receber</SelectItem><SelectItem value="cancelled">Canceladas</SelectItem><SelectItem value="refunded">Devolvidas</SelectItem></SelectContent></Select><a href="/api/exports/sales" className={buttonVariants({ variant: "outline", className: "h-9 gap-2 px-3 text-[11px]" })}><LuDownload className="size-3.5" /> Exportar</a></>} />
    </Card>
  </div>;
}

function Metric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return <Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="flex items-center justify-between text-[10px] text-muted-foreground">{label}{icon}</div><p className="mt-4 text-[25px] font-semibold tabular-nums">{value}</p><p className="mt-2 text-[10px] text-muted-foreground">{detail}</p></Card>;
}

export function SalesLoadError({ message }: { message: string }) {
  return <Alert variant="destructive"><AlertTitle>Falha ao carregar vendas</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>;
}
