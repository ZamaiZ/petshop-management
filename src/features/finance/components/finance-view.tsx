"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  LuBanknote,
  LuArrowDown,
  LuCalendarClock,
  LuClock3,
  LuDownload,
  LuPlus,
  LuReceiptText,
  LuWallet,
} from "react-icons/lu";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BrlInput } from "@/components/ui/brl-input";
import { Label } from "@/components/ui/label";
import { ComboboxField } from "@/components/ui/combobox-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addCivilDays } from "@/lib/date";
import { formatMoney, formatMoneyInput, formatShortDate, formatTime, localDateKey } from "@/lib/format";
import { closeCash, createExpense, createExpenseCategory, moveCash, payPayable, receiveReceivable } from "../actions";
import type { FinanceOverview, FinancePayable, FinanceReceivable } from "../queries";
import { CashDenominationFields, cashCountPayload, cashCountTotal, type CashCountMap } from "./cash-denominations";
import { OpenCashDialog } from "./open-cash-dialog";
import { MutationRegion, runMutationFeedback } from "@/components/feedback/mutation-feedback";

function moneyInput(cents: number) {
  return formatMoneyInput(cents);
}

function CashMovementDialog({ sessionId, kind }: { sessionId: string; kind: "reinforcement" | "withdrawal" }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [key, setKey] = useState("");
  const title = kind === "reinforcement" ? "Reforço de caixa" : "Retirada de caixa";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const result = await runMutationFeedback({ scope: "finance", action: () => moveCash({ sessionId, kind, amount: String(form.get("amount") ?? ""), reason: String(form.get("reason") ?? ""), key }), success: { title: kind === "reinforcement" ? "Reforço registrado" : "Retirada registrada", description: "O saldo e o histórico do caixa foram atualizados." }, failureTitle: "Não foi possível registrar o movimento", unexpectedMessage: "Tente novamente e confira o estado do caixa." });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
    });
  }

  return <>
    <Button variant="outline" className="h-8 gap-1.5 rounded-md px-2.5 text-[10px]" onClick={() => { setKey(crypto.randomUUID()); setMessage(""); setOpen(true); }}><LuPlus className="size-3.5" />{kind === "reinforcement" ? "Reforço" : "Retirada"}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-[420px]"><DialogHeader><DialogTitle className="text-[17px]">{title}</DialogTitle><DialogDescription className="text-[11px]">O movimento fica registrado no histórico desta sessão.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-3"><div className="space-y-1.5"><Label htmlFor={`cash-move-${kind}`}>Valor (R$)</Label><BrlInput id={`cash-move-${kind}`} name="amount" placeholder="0,00" required /></div><div className="space-y-1.5"><Label htmlFor={`cash-reason-${kind}`}>Motivo</Label><Input id={`cash-reason-${kind}`} name="reason" maxLength={500} required /></div>{message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending || !key}>{pending ? "Registrando…" : "Registrar movimento"}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}

function CloseCashDialog({ session }: { session: NonNullable<FinanceOverview["cashSession"]> }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [key, setKey] = useState("");
  const [counts, setCounts] = useState<CashCountMap>({});
  const [countByDenomination, setCountByDenomination] = useState(false);
  const [countedInput, setCountedInput] = useState("");
  const countedCents = countByDenomination ? cashCountTotal(counts) : parseMoneyToCents(countedInput);
  const differenceCents = countedCents === null ? null : countedCents - session.expected_cents;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    if (countedCents === null) {
      setMessage("Informe o valor contado.");
      return;
    }
    startTransition(async () => {
      const result = await runMutationFeedback({ scope: "finance", action: () => closeCash({ sessionId: session.id, counted: moneyInput(countedCents), notes: String(form.get("notes") ?? ""), counts: countByDenomination ? cashCountPayload(counts) : [], key }), success: { title: "Caixa fechado", description: "O resumo financeiro foi atualizado." }, failureTitle: "Não foi possível fechar o caixa", unexpectedMessage: "Tente novamente e confira os valores da conferência." });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
    });
  }

  return <>
    <Button className="h-9 gap-2 rounded-md px-3 text-[11px]" onClick={() => { setKey(crypto.randomUUID()); setCounts({}); setCountedInput(""); setCountByDenomination(false); setMessage(""); setOpen(true); }}><LuWallet className="size-3.5" /> Fechar caixa</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]"><DialogHeader><DialogTitle className="text-[17px]">Fechar caixa</DialogTitle><DialogDescription className="text-[11px]">Esperado no caixa: {formatMoney(session.expected_cents)}. Conte o dinheiro físico ou informe o total contado.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-3"><div className="space-y-1.5"><Label htmlFor="cash-counted">Dinheiro contado (R$)</Label><BrlInput id="cash-counted" name="counted" placeholder="0,00" value={countByDenomination ? moneyInput(cashCountTotal(counts)) : countedInput} onValueChange={setCountedInput} readOnly={countByDenomination} required /></div><label className="flex cursor-pointer items-center gap-2 text-[11px]"><Checkbox checked={countByDenomination} onCheckedChange={(checked) => setCountByDenomination(checked === true)} />Contar por cédulas e moedas</label>{countByDenomination ? <CashDenominationFields counts={counts} onChange={(denomination, quantity) => setCounts((current) => ({ ...current, [denomination]: quantity }))} /> : <p className="text-[10px] text-muted-foreground">A contagem por denominações é opcional.</p>}{differenceCents !== null ? <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-[11px]"><span className="text-muted-foreground">Diferença</span><span className={differenceCents < 0 ? "font-semibold text-destructive" : "font-semibold"}>{formatMoney(differenceCents)}</span></div> : null}<div className="space-y-1.5"><Label htmlFor="cash-close-notes">Observação da conferência</Label><Input id="cash-close-notes" name="notes" maxLength={500} placeholder="Obrigatória quando houver diferença" required={differenceCents !== null && differenceCents !== 0} /></div>{message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending || !key}>{pending ? "Fechando…" : "Confirmar fechamento"}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}

function ReceiveReceivableDialog({ receivable, cashSessionId }: { receivable: FinanceReceivable; cashSessionId: string | null }) {
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
      const result = await runMutationFeedback({ scope: "finance", action: () => receiveReceivable({ receivableId: receivable.id, amount: String(form.get("amount") ?? ""), method, sessionId: method === "cash" ? cashSessionId : null, tendered: String(form.get("tendered") ?? ""), key }), success: { title: "Recebimento registrado", description: "O saldo e as contas relacionadas foram atualizados." }, failureTitle: "Não foi possível receber o valor", unexpectedMessage: "Confira o valor e a forma de pagamento e tente novamente." });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
    });
  }

  return <>
    <Button variant="outline" size="sm" className="h-7 px-2.5 text-[10px]" onClick={() => { setKey(crypto.randomUUID()); setMessage(""); setOpen(true); }}>Receber</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-[420px]"><DialogHeader><DialogTitle className="text-[17px]">Receber saldo</DialogTitle><DialogDescription className="text-[11px]">Venda #{receivable.sale_number} · {receivable.customer} · saldo {formatMoney(receivable.remaining_cents)}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-3"><div className="space-y-1.5"><Label htmlFor={`receive-amount-${receivable.id}`}>Valor recebido (R$)</Label><BrlInput id={`receive-amount-${receivable.id}`} name="amount" defaultValue={moneyInput(receivable.remaining_cents)} required /></div><div className="space-y-1.5"><Label>Forma de pagamento</Label><ComboboxField value={method} onValueChange={(value) => setMethod(value as typeof method)} options={[{ value: "pix", label: "Pix" }, { value: "debit_card", label: "Cartão de débito" }, { value: "credit_card", label: "Cartão de crédito" }, { value: "cash", label: "Dinheiro" }]} /></div>{method === "cash" ? <div className="space-y-1.5"><Label htmlFor={`receive-tendered-${receivable.id}`}>Valor entregue (R$)</Label><BrlInput id={`receive-tendered-${receivable.id}`} name="tendered" defaultValue={moneyInput(receivable.remaining_cents)} required /></div> : null}{method === "cash" && !cashSessionId ? <p className="text-[11px] text-destructive">Abra o caixa antes de receber em dinheiro.</p> : null}{message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending || !key || (method === "cash" && !cashSessionId)}>{pending ? "Recebendo…" : "Confirmar recebimento"}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}

function PayPayableDialog({ payable, cashSessionId }: { payable: FinancePayable; cashSessionId: string | null }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"cash" | "pix" | "debit_card" | "credit_card" | "transfer">("pix");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [key, setKey] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const result = await runMutationFeedback({ scope: "finance", action: () => payPayable({ payableId: payable.id, amount: String(form.get("amount") ?? ""), method, sessionId: method === "cash" ? cashSessionId : null, key }), success: { title: "Conta paga", description: "A lista de contas e o caixa foram atualizados." }, failureTitle: "Não foi possível pagar a conta", unexpectedMessage: "Confira o valor e a forma de pagamento e tente novamente." });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
    });
  }

  return <>
    <Button variant="outline" size="sm" className="h-7 px-2.5 text-[10px]" onClick={() => { setKey(crypto.randomUUID()); setMessage(""); setOpen(true); }}>Pagar</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-[420px]"><DialogHeader><DialogTitle className="text-[17px]">Pagar conta</DialogTitle><DialogDescription className="text-[11px]">{payable.description} · saldo {formatMoney(payable.remaining_cents)}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-3"><div className="space-y-1.5"><Label htmlFor={`payable-amount-${payable.id}`}>Valor pago (R$)</Label><BrlInput id={`payable-amount-${payable.id}`} name="amount" defaultValue={moneyInput(payable.remaining_cents)} required /></div><div className="space-y-1.5"><Label>Forma de pagamento</Label><ComboboxField value={method} onValueChange={(value) => setMethod(value as typeof method)} options={[{ value: "pix", label: "Pix" }, { value: "debit_card", label: "Cartão de débito" }, { value: "credit_card", label: "Cartão de crédito" }, { value: "transfer", label: "Transferência" }, { value: "cash", label: "Dinheiro" }]} /></div>{method === "cash" && !cashSessionId ? <p className="text-[11px] text-destructive">Abra o caixa antes de pagar em dinheiro.</p> : null}{message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending || !key || (method === "cash" && !cashSessionId)}>{pending ? "Pagando…" : "Confirmar pagamento"}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}

function ExpenseCategoryDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await runMutationFeedback({ scope: "finance", action: () => createExpenseCategory(String(form.get("name") ?? "")), success: { title: "Categoria criada", description: "Ela já está disponível para classificar despesas." }, failureTitle: "Não foi possível criar a categoria", unexpectedMessage: "Confira o nome e tente novamente." });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
    });
  }
  return <>
    <Button variant="outline" className="h-8 px-2.5 text-[10px]" onClick={() => setOpen(true)}>Categorias</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-[380px]"><DialogHeader><DialogTitle className="text-[17px]">Nova categoria de despesa</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-3"><div className="space-y-1.5"><Label htmlFor="expense-category-name">Nome</Label><Input id="expense-category-name" name="name" required maxLength={100} /></div>{message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}<DialogFooter><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar categoria"}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}

function ExpenseDialog({ overview, timezone }: { overview: FinanceOverview; timezone: string }) {
  const today = localDateKey(new Date(), timezone);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [payNow, setPayNow] = useState(false);
  const [method, setMethod] = useState<"cash" | "pix" | "debit_card" | "credit_card" | "transfer">("pix");
  const [key, setKey] = useState("");
  const [dueOn, setDueOn] = useState(today);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const result = await runMutationFeedback({ scope: "finance", action: () => createExpense({ description: String(form.get("description") ?? ""), categoryId, amount: String(form.get("amount") ?? ""), dueOn: String(form.get("dueOn") ?? ""), payNow, method, sessionId: payNow && method === "cash" ? overview.cashSession?.id ?? null : null, key }), success: { title: "Despesa registrada", description: payNow ? "A despesa e o pagamento foram atualizados." : "A conta a pagar já aparece no financeiro." }, failureTitle: "Não foi possível registrar a despesa", unexpectedMessage: "Confira o valor, vencimento e forma de pagamento e tente novamente." });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
    });
  }

  return <>
    <Button className="h-9 gap-2 rounded-md px-3 text-[11px]" onClick={() => { setKey(crypto.randomUUID()); setDueOn(localDateKey(new Date(), timezone)); setMessage(""); setOpen(true); }}><LuPlus className="size-3.5" /> Registrar despesa</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]"><DialogHeader><DialogTitle className="text-[17px]">Registrar despesa</DialogTitle><DialogDescription className="text-[11px]">Uma despesa paga gera um pagamento e, se for dinheiro, uma saída no caixa.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-3"><div className="space-y-1.5"><Label htmlFor="expense-description">Descrição</Label><Input id="expense-description" name="description" required maxLength={500} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="expense-amount">Valor (R$)</Label><BrlInput id="expense-amount" name="amount" placeholder="0,00" required /></div><div className="space-y-1.5"><Label htmlFor="expense-due">Vencimento</Label><DatePickerField id="expense-due" name="dueOn" value={dueOn} onValueChange={setDueOn} required /></div></div><div className="space-y-1.5"><Label>Categoria</Label><ComboboxField value={categoryId} onValueChange={setCategoryId} options={overview.categories.map((category) => ({ value: category.id, label: category.name }))} placeholder="Sem categoria" /></div><div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2.5 text-[11px]"><Checkbox id="expense-pay-now" checked={payNow} onCheckedChange={(checked) => setPayNow(checked === true)} /><Label htmlFor="expense-pay-now" className="cursor-pointer">Pagar agora</Label></div>{payNow ? <div className="space-y-1.5"><Label>Forma de pagamento</Label><ComboboxField value={method} onValueChange={(value) => setMethod(value as typeof method)} options={[{ value: "pix", label: "Pix" }, { value: "debit_card", label: "Cartão de débito" }, { value: "credit_card", label: "Cartão de crédito" }, { value: "transfer", label: "Transferência" }, { value: "cash", label: "Dinheiro"}]} />{method === "cash" && !overview.cashSession ? <p className="text-[10px] text-destructive">Abra o caixa antes de pagar em dinheiro.</p> : null}</div> : null}{message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending || (payNow && method === "cash" && !overview.cashSession)}>{pending ? "Salvando…" : "Registrar despesa"}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}

const movementLabels: Record<string, string> = { sale: "Venda em dinheiro", receivable: "Recebimento de saldo", reinforcement: "Reforço", withdrawal: "Retirada", expense: "Despesa", refund: "Reembolso" };

function FinanceExportDialog({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const canExport = Boolean(from && to && from <= to);
  const options = [
    { type: "sales", label: "Vendas", description: "Totais, formas de pagamento e saldos" },
    { type: "receipts", label: "Recebimentos", description: "Pagamentos recebidos no período" },
    { type: "expenses", label: "Despesas pagas", description: "Pagamentos feitos a fornecedores e contas" },
    { type: "balances", label: "Saldos em aberto", description: "Valores a receber e a pagar por vencimento" },
  ] as const;

  function download(type: "sales" | "receipts" | "expenses" | "balances") {
    const params = new URLSearchParams({ from, to });
    const route = type === "sales" ? "/api/exports/sales" : "/api/exports/finance";
    if (type !== "sales") params.set("type", type);
    setOpen(false);
    const link = document.createElement("a");
    link.href = `${route}?${params.toString()}`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  }

  return <>
    <Button type="button" variant="outline" className="h-9 gap-2 rounded-md px-3 text-[11px]" onClick={() => setOpen(true)}><LuDownload className="size-3.5" /> Exportar período</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader><DialogTitle className="text-[17px]">Exportar dados financeiros</DialogTitle><DialogDescription className="text-[11px]">Selecione o período. Os arquivos XLSX incluem todos os registros que atendem às datas, mesmo que não estejam visíveis na tabela.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="export-from">De</Label><DatePickerField id="export-from" value={from} min={addCivilDays(today, -365)} max={to || undefined} onValueChange={setFrom} /></div>
          <div className="space-y-1.5"><Label htmlFor="export-to">Até</Label><DatePickerField id="export-to" value={to} max={today} min={from || undefined} onValueChange={setTo} /></div>
        </div>
        {!canExport ? <p role="alert" className="text-[11px] text-destructive">A data inicial precisa ser anterior ou igual à data final.</p> : null}
        <div className="space-y-2">
          {options.map((option) => <Button key={option.type} type="button" variant="outline" className="h-auto w-full justify-between gap-4 px-3 py-2.5 text-left" disabled={!canExport} onClick={() => download(option.type)}><span className="min-w-0"><span className="block text-[11px] font-medium">{option.label}</span><span className="mt-0.5 block truncate text-[10px] font-normal text-muted-foreground">{option.description}</span></span><LuDownload className="size-3.5 shrink-0" /></Button>)}
        </div>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

export function FinanceView({ overview, timezone, today }: { overview: FinanceOverview; timezone: string; today: string }) {
  const [tab, setTab] = useState("cash");
  const receivableColumns = useMemo<DataTableColumn<FinanceReceivable>[]>(() => [
    { accessorKey: "customer", header: "Cliente", cell: ({ row }) => <div><p className="font-medium">{row.original.customer}</p><p className="mt-1 text-[10px] text-muted-foreground">Venda #{row.original.sale_number}</p></div> },
    { accessorKey: "due_on", header: "Vencimento", cell: ({ row }) => row.original.due_on ? formatShortDate(row.original.due_on) : "—" },
    { accessorKey: "original_cents", header: "Original", cell: ({ row }) => formatMoney(row.original.original_cents) },
    { accessorKey: "remaining_cents", header: "Saldo", cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.remaining_cents)}</span> },
    { id: "action", header: "", enableSorting: false, cell: ({ row }) => <ReceiveReceivableDialog receivable={row.original} cashSessionId={overview.cashSession?.id ?? null} /> },
  ], [overview.cashSession?.id, router]);
  const payableColumns = useMemo<DataTableColumn<FinancePayable>[]>(() => [
    { accessorKey: "description", header: "Conta", cell: ({ row }) => <div><p className="font-medium">{row.original.description}</p><p className="mt-1 text-[10px] text-muted-foreground">{[row.original.supplier, row.original.category].filter(Boolean).join(" · ") || "Despesa da loja"}</p></div> },
    { accessorKey: "due_on", header: "Vencimento", cell: ({ row }) => formatShortDate(row.original.due_on) },
    { accessorKey: "original_cents", header: "Original", cell: ({ row }) => formatMoney(row.original.original_cents) },
    { accessorKey: "remaining_cents", header: "Saldo", cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.remaining_cents)}</span> },
    { id: "action", header: "", enableSorting: false, cell: ({ row }) => <PayPayableDialog payable={row.original} cashSessionId={overview.cashSession?.id ?? null} /> },
  ], [overview.cashSession?.id, router]);
  const cashIn = overview.cashMovements.filter((movement) => movement.amount_cents > 0).reduce((sum, movement) => sum + movement.amount_cents, 0);

  return <MutationRegion scope="finance" label="Atualizando caixa, saldos e contas…"><div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-[24px] font-semibold tracking-[-0.04em]">Financeiro</h1><p className="mt-1.5 text-[12px] text-muted-foreground">Clareza para acompanhar o dinheiro da sua loja.</p></div><div className="flex flex-wrap gap-2"><FinanceExportDialog today={today} /></div></div>
    <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="flex items-center justify-between text-[10px] text-muted-foreground">Recebido nas vendas<LuBanknote className="size-4" /></div><p className="mt-4 text-[25px] font-semibold tabular-nums">{formatMoney(overview.receivedTodayCents)}</p><p className="mt-2 text-[10px] text-muted-foreground">Pagamentos recebidos hoje</p></Card>
      <Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="flex items-center justify-between text-[10px] text-muted-foreground">A receber<LuClock3 className="size-4" /></div><p className="mt-4 text-[25px] font-semibold tabular-nums">{formatMoney(overview.receivableTotalCents)}</p><p className="mt-2 text-[10px] text-muted-foreground">Saldos pendentes de clientes</p></Card>
      <Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="flex items-center justify-between text-[10px] text-muted-foreground">Contas a pagar<LuCalendarClock className="size-4" /></div><p className="mt-4 text-[25px] font-semibold tabular-nums">{formatMoney(overview.payableTotalCents)}</p><p className="mt-2 text-[10px] text-muted-foreground">Compromissos em aberto</p></Card>
      <Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="flex items-center justify-between text-[10px] text-muted-foreground">Despesas registradas<LuReceiptText className="size-4" /></div><p className="mt-4 text-[25px] font-semibold tabular-nums">{formatMoney(overview.expensesTodayCents)}</p><p className="mt-2 text-[10px] text-muted-foreground">Pagamentos e saídas de hoje</p></Card>
    </section>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="h-9"><TabsTrigger value="cash" className="gap-1.5 px-4 text-[11px]"><LuWallet className="size-3.5" />Caixa</TabsTrigger><TabsTrigger value="receivables" className="gap-1.5 px-4 text-[11px]"><LuArrowDown className="size-3.5" />A receber</TabsTrigger><TabsTrigger value="payables" className="gap-1.5 px-4 text-[11px]"><LuReceiptText className="size-3.5" />A pagar</TabsTrigger></TabsList>
      <TabsContent value="cash" className="mt-4 space-y-4">
        {overview.cashSession ? <>
          <section className="grid gap-3 md:grid-cols-3"><Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><p className="text-[10px] text-muted-foreground">Fundo de abertura</p><p className="mt-2 text-[23px] font-semibold tabular-nums">{formatMoney(overview.cashSession.opening_cents)}</p></Card><Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><p className="text-[10px] text-muted-foreground">Entradas em dinheiro</p><p className="mt-2 text-[23px] font-semibold tabular-nums">{formatMoney(cashIn)}</p></Card><Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><p className="text-[10px] text-muted-foreground">Dinheiro esperado em caixa</p><p className="mt-2 text-[23px] font-semibold tabular-nums">{formatMoney(overview.cashSession.expected_cents)}</p></Card></section>
          <Card className="gap-0 overflow-hidden rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="flex flex-col justify-between gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:px-5"><div><div className="flex items-center gap-2 text-[12px] font-semibold"><span className="size-2 rounded-full bg-emerald-500" />Caixa aberto</div><p className="mt-1 text-[10px] text-muted-foreground">Abertura: {formatShortDate(overview.cashSession.opened_at, timezone)}, {formatTime(overview.cashSession.opened_at, timezone)}</p></div><CloseCashDialog session={overview.cashSession} /></div>
            <div className="space-y-0 px-4 py-3 sm:px-5"><div className="flex items-center justify-between border-b border-border py-3 text-[11px]"><span className="text-muted-foreground">Fundo inicial para troco</span><span className="tabular-nums">{formatMoney(overview.cashSession.opening_cents)}</span></div>{overview.cashMovements.map((movement) => <div key={movement.id} className="flex items-center justify-between gap-4 border-b border-border py-3 text-[11px]"><span className="min-w-0"><span className="block truncate font-medium">{movementLabels[movement.kind] ?? movement.kind}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{movement.reason} · {formatTime(movement.occurred_at, timezone)}</span></span><span className={movement.amount_cents < 0 ? "shrink-0 tabular-nums text-destructive" : "shrink-0 tabular-nums"}>{formatMoney(movement.amount_cents)}</span></div>)}<div className="flex items-center justify-between py-3 text-[11px] font-semibold"><span>Dinheiro esperado</span><span className="tabular-nums">{formatMoney(overview.cashSession.expected_cents)}</span></div></div>
            <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 sm:px-5"><CashMovementDialog sessionId={overview.cashSession.id} kind="reinforcement" /><CashMovementDialog sessionId={overview.cashSession.id} kind="withdrawal" /></div>
          </Card>
        </> : <Card className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-[10px] border-border/90 p-6 text-center shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><LuWallet className="size-4" /></span><div><h2 className="text-[13px] font-semibold">Caixa fechado</h2><p className="mt-1 text-[11px] text-muted-foreground">Abra uma sessão para registrar pagamentos e movimentos em dinheiro.</p></div><OpenCashDialog /></Card>}
        {overview.closedSessions.length ? <Card className="gap-0 overflow-hidden rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="border-b border-border px-4 py-3 text-[11px] font-semibold sm:px-5">Histórico de fechamentos</div>{overview.closedSessions.map((session) => <div key={session.id} className="grid gap-2 border-b border-border px-4 py-3 text-[10px] last:border-0 sm:grid-cols-[1.2fr_1fr_1fr_1fr] sm:px-5"><span>{formatShortDate(session.closed_at, timezone)} · {formatTime(session.closed_at, timezone)}</span><span className="text-muted-foreground">Esperado {formatMoney(session.expected_cents)}</span><span className="text-muted-foreground">Contado {formatMoney(session.counted_cents)}</span><span className={session.difference_cents < 0 ? "font-medium text-destructive" : "font-medium"}>Diferença {formatMoney(session.difference_cents)}</span></div>)}</Card> : null}
      </TabsContent>
      <TabsContent value="receivables" className="mt-4"><Card className="gap-0 rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><DataTable columns={receivableColumns} data={overview.receivables} searchPlaceholder="Buscar por cliente ou venda…" emptyMessage="Nenhum saldo a receber." toolbarActions={<span className="px-2 text-[10px] text-muted-foreground">{overview.receivables.length} contas abertas</span>} /></Card></TabsContent>
      <TabsContent value="payables" className="mt-4 space-y-3"><div className="flex flex-wrap justify-end gap-2"><ExpenseCategoryDialog /><ExpenseDialog overview={overview} timezone={timezone} /></div><Card className="gap-0 rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><DataTable columns={payableColumns} data={overview.payables} searchPlaceholder="Buscar por descrição, fornecedor ou categoria…" emptyMessage="Nenhuma conta a pagar." toolbarActions={<span className="px-2 text-[10px] text-muted-foreground">{overview.payables.length} contas abertas</span>} /></Card></TabsContent>
    </Tabs>
  </div></MutationRegion>;
}

export function FinanceLoadError({ message }: { message: string }) {
  return <Alert variant="destructive"><AlertTitle>Falha ao carregar o financeiro</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>;
}
