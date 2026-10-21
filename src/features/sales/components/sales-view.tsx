"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LuArrowRight, LuBanknote, LuCalendarDays, LuChartNoAxesCombined, LuCircleCheck, LuCreditCard, LuDownload, LuLoaderCircle, LuPlus, LuSearch } from "react-icons/lu";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComboboxField } from "@/components/ui/combobox-field";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { SaleComposer, type ComposerData } from "./sale-composer";
import { addCivilDays, dateKeyAtTimeZone } from "@/lib/date";
import { quantityPrecision } from "@/lib/business-rules";
import { formatMoney, formatQuantity, formatShortDate, formatTime, localDateKey } from "@/lib/format";
import { cancelSale, returnSaleItems } from "../actions";
import type { SaleRecord, SalesOverview } from "../queries";
import { MutationRegion, runMutationFeedback } from "@/components/feedback/mutation-feedback";

const paymentLabels: Record<string, string> = { cash: "Dinheiro", pix: "Pix", debit_card: "Cartão de débito", credit_card: "Cartão de crédito", credit: "A receber", transfer: "Transferência" };
const deliveryLabels: Record<string, string> = { preparing: "Preparando", ready: "Pronta", out_for_delivery: "Em rota", delivered: "Entregue", cancelled: "Cancelada" };

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
      const result = await runMutationFeedback({ scope: "sales", action: () => mode === "cancel"
        ? cancelSale({ saleId: sale.id, reason, method, cashSessionId, key })
        : returnSaleItems({ saleId: sale.id, reason, method, cashSessionId, key, lines: returnLines.map((line) => ({ saleItemId: line.saleItemId, quantity: Number(line.quantity), restock: line.restock })).filter((line) => line.quantity > 0) }),
        success: mode === "cancel" ? { title: "Venda cancelada", description: "O status e o financeiro foram atualizados." } : { title: "Devolução registrada", description: "A venda e o estoque foram atualizados." },
        failureTitle: mode === "cancel" ? "Não foi possível cancelar a venda" : "Não foi possível registrar a devolução",
        unexpectedMessage: "Confira os dados e tente novamente.",
      });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setMode("details");
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
            return <div key={item.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_115px_auto] sm:items-center"><div><p className="text-[11px] font-medium">{item.description}</p><p className="text-[10px] text-muted-foreground">Até {formatQuantity(item.returnable_quantity, item.unit)} podem ser devolvidos</p></div><Input aria-label={`Quantidade devolvida de ${item.description}`} type="number" min="0" max={item.returnable_quantity} step={item.product_id ? 1 / 10 ** quantityPrecision(item.unit) : 1} value={line.quantity} onChange={(event) => setReturnLines((current) => current.map((entry) => entry.saleItemId === item.id ? { ...entry, quantity: event.target.value } : entry))} className="h-8 text-[11px]" />{item.product_id ? <div className="flex items-center gap-2 text-[10px]"><Checkbox id={`restock-${item.id}`} checked={line.restock} onCheckedChange={(checked) => setReturnLines((current) => current.map((entry) => entry.saleItemId === item.id ? { ...entry, restock: checked === true } : entry))} /><Label htmlFor={`restock-${item.id}`} className="cursor-pointer">Repor estoque</Label></div> : null}</div>;
          })}</div> : <div className="rounded-md bg-muted/40 p-3 text-[11px] text-muted-foreground">Os itens ainda não devolvidos serão registrados como retorno. Produtos retornam ao estoque.</div>}
          <div className="space-y-1.5"><Label htmlFor={`sale-reason-${sale.id}`}>Motivo</Label><Input id={`sale-reason-${sale.id}`} value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={500} /></div>
          <div className="space-y-1.5"><Label>Forma de devolução</Label><ComboboxField value={method} onValueChange={(value) => setMethod(value as typeof method)} options={[{ value: "pix", label: "Pix" }, { value: "debit_card", label: "Cartão de débito" }, { value: "credit_card", label: "Cartão de crédito" }, { value: "cash", label: "Dinheiro" }]} />{method === "cash" && !cashSessionId ? <p className="text-[10px] text-destructive">Abra o caixa para devolver dinheiro.</p> : null}</div>
          {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setMode("details")}>Voltar</Button><Button type="submit" disabled={pending || (method === "cash" && !cashSessionId)}>{pending ? "Registrando..." : mode === "cancel" ? "Confirmar cancelamento" : "Confirmar devolução"}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  </>;
}

type SalesRange = "today" | "7" | "30" | "90" | "custom";

export function SalesView({ overview, timezone, composerData, composerError, newSaleOpen, initialDelivery = false }: {
  overview: SalesOverview;
  timezone: string;
  composerData: ComposerData | null;
  composerError: string | null;
  newSaleOpen: boolean;
  initialDelivery?: boolean;
}) {
  const router = useRouter();
  const today = localDateKey(new Date(), timezone);
  const [range, setRange] = useState<SalesRange>("30");
  const [customFrom, setCustomFrom] = useState(addCivilDays(today, -29));
  const [customTo, setCustomTo] = useState(today);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [mobilePage, setMobilePage] = useState(0);
  const [completedSale, setCompletedSale] = useState("");
  const [composerOpen, setComposerOpen] = useState(newSaleOpen);
  const openedFromList = useRef(false);
  useEffect(() => { setComposerOpen(newSaleOpen); }, [newSaleOpen]);
  useEffect(() => { if (!newSaleOpen) openedFromList.current = false; }, [newSaleOpen]);

  const from = range === "today" ? today : range === "7" ? addCivilDays(today, -6) : range === "30" ? addCivilDays(today, -29) : range === "90" ? addCivilDays(today, -89) : customFrom;
  const to = range === "custom" ? customTo : today;
  const periodSales = useMemo(() => overview.sales.filter((sale) => {
    const timestamp = sale.completed_at ?? sale.created_at;
    const day = dateKeyAtTimeZone(new Date(timestamp), timezone);
    return day >= from && day <= to;
  }), [from, overview.sales, timezone, to]);
  const filteredSales = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return periodSales.filter((sale) => {
      const matchesStatus = status === "all" || stateOf(sale) === status;
      const matchesSearch = !query || [String(sale.number), sale.customer, ...sale.items.map((item) => item.description)].some((value) => value.toLocaleLowerCase("pt-BR").includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [periodSales, search, status]);
  useEffect(() => { setMobilePage(0); }, [customFrom, customTo, filteredSales.length, range, search, status, today]);
  const periodTotalCents = periodSales.filter((sale) => sale.status !== "cancelled").reduce((sum, sale) => sum + sale.total_cents, 0);
  const periodCount = periodSales.filter((sale) => sale.completed_at !== null && sale.status !== "cancelled").length;
  const periodReceivableCents = periodSales.reduce((sum, sale) => sum + sale.receivable_cents, 0);
  const averageTicket = periodCount ? Math.round(periodTotalCents / periodCount) : 0;
  const mobilePageCount = Math.max(1, Math.ceil(filteredSales.length / 10));
  const currentMobilePage = Math.min(mobilePage, mobilePageCount - 1);
  const mobileSales = filteredSales.slice(currentMobilePage * 10, currentMobilePage * 10 + 10);

  function closeComposer() {
    setComposerOpen(false);
    if (openedFromList.current) {
      openedFromList.current = false;
      router.back();
    } else {
      router.replace("/vendas", { scroll: false });
    }
  }

  function openComposer() {
    openedFromList.current = true;
    setCompletedSale("");
    setComposerOpen(true);
    router.push(initialDelivery ? "/vendas?nova=1&entrega=1" : "/vendas?nova=1", { scroll: false });
  }

  function exportHref() {
    const params = new URLSearchParams({ from, to });
    if (status !== "all") params.set("status", status);
    if (search.trim()) params.set("q", search.trim().slice(0, 120));
    return `/api/exports/sales?${params.toString()}`;
  }

  const columns = useMemo<DataTableColumn<SaleRecord>[]>(() => [
    { accessorKey: "number", header: "Venda / cliente", cell: ({ row }) => <div><p className="font-medium">#{row.original.number} <span className="mx-1 text-muted-foreground">/</span> {row.original.customer}</p><p className="mt-1.5 max-w-[330px] truncate text-[10px] text-muted-foreground">{row.original.items.slice(0, 2).map((item) => `${item.description} · ${formatQuantity(item.quantity, item.unit)}`).join(", ") || "Venda sem itens"}</p></div> },
    { accessorKey: "completed_at", header: "Horário", cell: ({ row }) => { const date = row.original.completed_at ?? row.original.created_at; return `${formatShortDate(date, timezone)} · ${formatTime(date, timezone)}`; } },
    { id: "delivery", header: "Entrega", cell: ({ row }) => row.original.has_delivery ? <Badge variant="outline">{deliveryLabels[row.original.delivery_status ?? ""] ?? "Entrega"}</Badge> : "—" },
    { id: "payment", header: "Pagamento", cell: ({ row }) => row.original.payment_methods.length ? [...new Set(row.original.payment_methods)].map((method) => paymentLabels[method] ?? method).join(" · ") : row.original.receivable_cents > 0 ? "A receber" : "—" },
    { id: "status", header: "Status", cell: ({ row }) => <Badge variant="outline" className={stateClass(row.original)}><span className={`mr-1.5 size-1.5 rounded-full ${stateOf(row.original) === "paid" ? "bg-emerald-500" : stateOf(row.original) === "receivable" ? "bg-amber-500" : "bg-muted-foreground"}`} />{stateLabel(row.original)}</Badge> },
    { accessorKey: "total_cents", header: "Total", cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.total_cents)}</span> },
    { id: "details", header: "", enableSorting: false, cell: ({ row }) => <SaleActionDialog sale={row.original} cashSessionId={overview.cashSessionId} /> },
  ], [overview.cashSessionId, timezone]);

  return <MutationRegion scope="sales" label="Atualizando vendas, pagamentos e estoque…"><div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-[24px] font-semibold tracking-[-0.04em]">Vendas</h1><p className="mt-1.5 text-[12px] text-muted-foreground">Histórico e pagamentos.</p></div><Button className="h-9 gap-2 rounded-md px-3 text-[11px]" onClick={openComposer}><LuPlus className="size-3.5" /> Nova venda</Button></div>
    {completedSale ? <Alert><LuCircleCheck className="size-4" /><AlertDescription>Venda registrada com sucesso. Código {completedSale}.</AlertDescription></Alert> : null}
    <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <Metric label="Vendido no período" value={formatMoney(periodTotalCents)} detail="Total bruto, antes de devoluções" icon={<LuBanknote className="size-4" />} />
      <Metric label="Vendas realizadas" value={String(periodCount)} detail="Dentro do período selecionado" icon={<LuCircleCheck className="size-4" />} />
      <Metric label="Ticket médio" value={formatMoney(averageTicket)} detail="Valor médio por venda concluída" icon={<LuChartNoAxesCombined className="size-4" />} />
      <Metric label="A receber" value={formatMoney(periodReceivableCents)} detail="Saldo pendente no período" icon={<LuCreditCard className="size-4" />} />
    </section>
    <Card className="gap-0 rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative w-full max-w-[310px]"><LuSearch className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, venda ou item..." aria-label="Buscar por cliente, venda ou item" maxLength={120} className="h-9 rounded-md pl-9 text-[11px]" /></div>
          <div className="flex flex-wrap items-center gap-2">
            <ComboboxField value={range} onValueChange={(value) => setRange(value as SalesRange)} options={[{ value: "today", label: "Hoje" }, { value: "7", label: "Últimos 7 dias" }, { value: "30", label: "Últimos 30 dias" }, { value: "90", label: "Últimos 90 dias" }, { value: "custom", label: "Personalizado" }]} className="h-9 w-[155px]" inputClassName="text-[11px]" />
            <ComboboxField value={status} onValueChange={setStatus} options={[{ value: "all", label: "Todos os status" }, { value: "paid", label: "Pagas" }, { value: "receivable", label: "A receber" }, { value: "cancelled", label: "Canceladas" }, { value: "refunded", label: "Devolvidas" }, { value: "partially_refunded", label: "Devolução parcial" }]} className="h-9 w-[170px]" inputClassName="text-[11px]" />
            <a href={exportHref()} className={buttonVariants({ variant: "outline", className: "h-9 gap-2 px-3 text-[11px]" })}><LuDownload className="size-3.5" /> Exportar XLSX</a>
          </div>
        </div>
        {range === "custom" ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"><LuCalendarDays className="size-3.5" /> Período</span><DatePickerField ariaLabel="Data inicial" value={customFrom} min={addCivilDays(today, -365)} max={customTo || today} onValueChange={setCustomFrom} className="h-8 text-[10px]" /><span className="text-center text-[10px] text-muted-foreground">até</span><DatePickerField ariaLabel="Data final" value={customTo} max={today} min={customFrom || undefined} onValueChange={setCustomTo} className="h-8 text-[10px]" /></div> : null}
      </div>
      <div className="divide-y md:hidden">
        {filteredSales.length ? mobileSales.map((sale) => <article key={sale.id} className="space-y-2.5 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[11px] font-semibold">Venda #{sale.number} · {sale.customer}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatShortDate(sale.completed_at ?? sale.created_at, timezone)} · {formatTime(sale.completed_at ?? sale.created_at, timezone)}</p></div><SaleActionDialog sale={sale} cashSessionId={overview.cashSessionId} /></div>
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-1.5"><Badge variant="outline" className={stateClass(sale)}>{stateLabel(sale)}</Badge>{sale.has_delivery ? <Badge variant="outline">Entrega · {deliveryLabels[sale.delivery_status ?? ""] ?? "ativa"}</Badge> : null}</div><span className="text-[11px] font-semibold tabular-nums">{formatMoney(sale.total_cents)}</span></div>
          <p className="line-clamp-2 text-[10px] text-muted-foreground">{sale.items.slice(0, 3).map((item) => `${item.description} · ${formatQuantity(item.quantity, item.unit)}`).join(", ") || "Venda sem itens"}</p>
        </article>) : <p className="px-4 py-12 text-center text-xs text-muted-foreground">Nenhuma venda encontrada.</p>}
        {filteredSales.length > 10 ? <div className="flex items-center justify-between px-4 py-3"><p className="text-[10px] text-muted-foreground">{currentMobilePage * 10 + 1}–{Math.min((currentMobilePage + 1) * 10, filteredSales.length)} de {filteredSales.length}</p><div className="flex gap-1.5"><Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-[10px]" onClick={() => setMobilePage((page) => Math.max(0, page - 1))} disabled={currentMobilePage === 0}>Anterior</Button><Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-[10px]" onClick={() => setMobilePage((page) => Math.min(mobilePageCount - 1, page + 1))} disabled={currentMobilePage >= mobilePageCount - 1}>Próxima</Button></div></div> : null}
      </div>
      <div className="hidden md:block"><DataTable columns={columns} data={filteredSales} emptyMessage="Nenhuma venda encontrada." hideSearch /></div>
    </Card>
    <Dialog open={composerOpen} onOpenChange={(open) => { if (!open && composerOpen) closeComposer(); }}>
      <DialogContent className="flex h-[96dvh] max-h-[96dvh] w-[98vw] max-w-[1440px] flex-col overflow-hidden p-0 sm:max-w-[1440px]">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12 sm:px-6"><DialogTitle className="text-[17px]">Nova venda</DialogTitle><DialogDescription className="text-[11px]">Selecione os produtos ou serviços, revise o carrinho e conclua o pagamento.</DialogDescription></DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 xl:px-7">{composerData ? <SaleComposer data={composerData} timezone={timezone} initialDelivery={initialDelivery} onCompleted={(saleId) => { setCompletedSale(saleId.slice(0, 8)); openedFromList.current = false; setComposerOpen(false); router.replace("/vendas", { scroll: false }); }} /> : composerError ? <Alert variant="destructive"><AlertTitle>Falha ao carregar o catálogo</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3">{composerError}<Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>Tentar novamente</Button></AlertDescription></Alert> : <div role="status" aria-live="polite" className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center text-xs text-muted-foreground"><LuLoaderCircle className="size-5 animate-spin text-primary" /><span>Carregando produtos, serviços e clientes…</span></div>}</div>
      </DialogContent>
    </Dialog>
  </div></MutationRegion>;
}

function Metric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return <Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="flex items-center justify-between text-[10px] text-muted-foreground">{label}{icon}</div><p className="mt-4 text-[25px] font-semibold tabular-nums">{value}</p><p className="mt-2 text-[10px] text-muted-foreground">{detail}</p></Card>;
}

export function SalesLoadError({ message }: { message: string }) {
  const router = useRouter();
  return <Alert variant="destructive"><AlertTitle>Falha ao carregar vendas</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3">{message}<Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>Tentar novamente</Button></AlertDescription></Alert>;
}
