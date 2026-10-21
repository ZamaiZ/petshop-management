"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney } from "@/lib/format";
import type { DashboardOverview } from "../schema";

const chartConfig = {
  current_cents: { label: "Vendas", color: "var(--foreground)" },
  previous_cents: { label: "Semana anterior", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

export function SalesChart({ points }: { points: DashboardOverview["chart"] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[210px] w-full aspect-auto">
      <AreaChart data={points} margin={{ left: -16, right: 8, top: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-current_cents)" stopOpacity={0.14} />
            <stop offset="100%" stopColor="var(--color-current_cents)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="2 4" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tickFormatter={(value: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)).replace(".", "")}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={42}
          tickFormatter={(value: number) => value >= 100_000 ? `${Math.round(value / 100_000) / 10}k` : `${Math.round(value / 1000)}k`}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
          content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value))} />}
        />
        <Area dataKey="previous_cents" type="monotone" stroke="var(--color-previous_cents)" strokeDasharray="4 5" strokeWidth={1.5} fill="transparent" />
        <Area dataKey="current_cents" type="monotone" stroke="var(--color-current_cents)" strokeWidth={2} fill="url(#salesFill)" />
      </AreaChart>
    </ChartContainer>
  );
}
