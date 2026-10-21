import { z } from "zod";

export const dashboardOverviewSchema = z.object({
  today_sales_cents: z.number().int(),
  today_sales_count: z.number().int(),
  receivables_cents: z.number().int(),
  low_stock_count: z.number().int(),
  appointments_today_count: z.number().int(),
  cash_open: z.boolean(),
  week_total_cents: z.number().int(),
  previous_week_total_cents: z.number().int(),
  chart: z.array(z.object({ date: z.string(), current_cents: z.number().int(), previous_cents: z.number().int() })),
  attention: z.array(z.object({ kind: z.string(), title: z.string(), description: z.string(), href: z.string() })),
  recent_sales: z.array(z.object({
    id: z.string(),
    number: z.number().int(),
    customer: z.string(),
    items: z.string(),
    payment: z.string(),
    status: z.string(),
    total_cents: z.number().int(),
    completed_at: z.string(),
  })),
});

export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>;
