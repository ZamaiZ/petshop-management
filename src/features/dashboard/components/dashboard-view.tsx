import Link from "next/link";
import {
  LuArrowUpRight,
  LuCalendarDays,
  LuChevronRight,
  LuClock3,
  LuCreditCard,
  LuPackage,
  LuPawPrint,
  LuPlus,
  LuScissors,
  LuShoppingBag,
  LuTruck,
} from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatTime } from "@/lib/format";
import type { DashboardOverview } from "../schema";
import { SalesChart } from "./sales-chart";

const metrics = [
  { key: "sales", label: "Vendas de hoje", icon: LuShoppingBag, detail: (data: DashboardOverview) => `${data.today_sales_count} ${data.today_sales_count === 1 ? "venda realizada" : "vendas realizadas"}` },
  { key: "receivables", label: "A receber", icon: LuCreditCard, detail: () => "Pendências de clientes" },
  { key: "stock", label: "Estoque baixo", icon: LuPackage, detail: () => "Produtos precisam de reposição" },
  { key: "appointments", label: "Atendimentos hoje", icon: LuScissors, detail: () => "Banho e tosa agendados" },
] as const;

function metricValue(key: (typeof metrics)[number]["key"], data: DashboardOverview) {
  if (key === "sales") return formatMoney(data.today_sales_cents);
  if (key === "receivables") return formatMoney(data.receivables_cents);
  if (key === "stock") return String(data.low_stock_count).padStart(2, "0");
  return String(data.appointments_today_count).padStart(2, "0");
}

function paymentLabel(method: string) {
  const labels: Record<string, string> = { cash: "Dinheiro", pix: "Pix", debit_card: "Cartão de débito", credit_card: "Cartão de crédito", credit: "A receber" };
  return labels[method] ?? method;
}

function statusBadge(status: string) {
  const labels: Record<string, string> = { completed: "Pago", partially_refunded: "Devolução parcial", refunded: "Devolvida", cancelled: "Cancelada", receivable: "A receber" };
  const classes: Record<string, string> = {
    completed: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    receivable: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    cancelled: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
    partially_refunded: "border-amber-200 bg-amber-50 text-amber-800",
    refunded: "border-slate-200 bg-slate-100 text-slate-600",
  };
  return <Badge variant="outline" className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-normal ${classes[status] ?? ""}`}>{labels[status] ?? status}</Badge>;
}

export function DashboardView({ data, timezone }: { data: DashboardOverview; timezone: string }) {
  const today = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: timezone }).format(new Date());

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.04em]">Visão geral</h1>
          <p className="mt-1.5 text-[12px] text-muted-foreground">Vendas, estoque e atendimentos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`h-8 rounded-md px-2.5 text-[11px] font-normal ${data.cash_open ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" : "text-muted-foreground"}`}>
            <span className={`mr-1.5 size-1.5 rounded-full ${data.cash_open ? "bg-emerald-600" : "bg-muted-foreground"}`} />
            {data.cash_open ? "Caixa aberto" : "Caixa fechado"}
          </Badge>
          <div className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-[11px] font-medium shadow-xs">
            <LuCalendarDays className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <time>{today}</time>
          </div>
        </div>
      </div>

      <section aria-label="Indicadores de hoje" className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {metrics.map(({ key, label, icon: Icon, detail }) => (
          <Card key={key} className="gap-0 rounded-[10px] border-border/90 px-4 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{label}</span>
              <Icon className="size-4" aria-hidden="true" />
            </div>
            <p className="mt-4 text-[27px] leading-none font-semibold tracking-[-0.04em] tabular-nums">{metricValue(key, data)}</p>
            <p className="mt-2.5 text-[10px] text-muted-foreground">{detail(data)}</p>
          </Card>
        ))}
      </section>

      <section className="flex flex-col justify-between gap-3 rounded-[10px] border border-border bg-card px-4 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-muted text-muted-foreground"><LuPlus className="size-4" aria-hidden="true" /></span>
          <div>
            <h2 className="text-[12px] font-semibold">Ações rápidas</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">Vendas, recebimentos e agendamentos.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/vendas/nova" className="h-9 rounded-md px-3 text-[11px]"><LuPlus className="size-3.5" />Nova venda</ButtonLink>
          <ButtonLink href="/estoque?acao=receber" variant="outline" className="h-9 rounded-md px-3 text-[11px]"><LuPackage className="size-3.5" />Receber mercadoria</ButtonLink>
          <ButtonLink href="/agenda?acao=agendar" variant="outline" className="h-9 rounded-md px-3 text-[11px]"><LuCalendarDays className="size-3.5" />Agendar serviço</ButtonLink>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Card className="gap-0 overflow-hidden rounded-[10px] border-border/90 py-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5">
            <div>
              <h2 className="text-[12px] font-semibold">Movimento da loja</h2>
              <p className="mt-1 text-[10px] text-muted-foreground">Uma visão das vendas nos últimos 7 dias</p>
            </div>
            <Badge variant="outline" className="h-8 rounded-md px-2.5 text-[10px] font-normal">Esta semana</Badge>
          </div>
          <div className="px-4 pt-4 sm:px-5">
            <div className="flex items-baseline gap-2">
              <span className="text-[23px] font-semibold tracking-[-0.04em] tabular-nums">{formatMoney(data.week_total_cents)}</span>
              <span className="text-[10px] text-muted-foreground">nos últimos 7 dias</span>
            </div>
            <div className="mt-2 flex justify-end gap-4 text-[9px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-foreground" />Vendas</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-muted-foreground/30" />Anterior</span>
            </div>
            <SalesChart points={data.chart} />
          </div>
        </Card>

        <Card className="gap-0 overflow-hidden rounded-[10px] border-border/90 py-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5">
            <div>
              <h2 className="text-[12px] font-semibold">Precisa da sua atenção</h2>
              <p className="mt-1 text-[10px] text-muted-foreground">Pendências operacionais</p>
            </div>
            <LuClock3 className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="divide-y divide-border">
            {data.attention.length ? data.attention.map((item, index) => {
              const Icon = item.kind === "delivery" ? LuTruck : item.kind === "appointment" ? LuPawPrint : item.kind === "payable" ? LuCreditCard : LuPackage;
              return (
                <Link key={`${item.kind}-${index}`} href={item.href} className="group flex min-h-[62px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Icon className="size-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-semibold">{item.title}</span>
                    <span className="mt-1 block truncate text-[10px] text-muted-foreground">{item.description}</span>
                  </span>
                  <LuChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              );
            }) : (
              <div className="flex min-h-40 flex-col items-center justify-center px-5 text-center">
                <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground"><LuClock3 className="size-4" /></span>
                <p className="mt-3 text-[11px] font-medium">Tudo em dia</p>
                <p className="mt-1 text-[10px] text-muted-foreground">As pendências da loja aparecerão aqui.</p>
              </div>
            )}
          </div>
        </Card>
      </section>

      <Card className="gap-0 overflow-hidden rounded-[10px] border-border/90 py-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-[12px] font-semibold">Últimas vendas</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">Os atendimentos mais recentes da sua loja</p>
          </div>
          <ButtonLink href="/vendas" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[10px]">Ver todas <LuArrowUpRight className="size-3.5" /></ButtonLink>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/70 hover:bg-muted/70">
                <TableHead className="min-w-[330px] px-5 text-[10px] font-medium">Venda / cliente</TableHead>
                <TableHead className="text-[10px] font-medium">Horário</TableHead>
                <TableHead className="text-[10px] font-medium">Pagamento</TableHead>
                <TableHead className="text-[10px] font-medium">Status</TableHead>
                <TableHead className="pr-5 text-right text-[10px] font-medium">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent_sales.length ? data.recent_sales.map((sale) => (
                <TableRow key={sale.id} className="bg-card">
                  <TableCell className="px-5 py-3.5">
                    <div className="text-[10px] font-semibold">#{sale.number} <span className="mx-1.5 font-normal text-muted-foreground">/</span> {sale.customer}</div>
                    <div className="mt-1 max-w-[330px] truncate text-[9px] text-muted-foreground">{sale.items}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[10px]">{formatTime(sale.completed_at, timezone)}</TableCell>
                  <TableCell className="whitespace-nowrap text-[10px]">{paymentLabel(sale.payment)}</TableCell>
                  <TableCell>{statusBadge(sale.status)}</TableCell>
                  <TableCell className="pr-5 text-right text-[10px] font-medium tabular-nums">{formatMoney(sale.total_cents)}</TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground">Nenhuma venda registrada ainda.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
