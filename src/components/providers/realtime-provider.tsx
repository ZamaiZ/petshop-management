"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LuWifiOff } from "react-icons/lu";
import { createClient } from "@/lib/supabase/browser";
import { hasPendingRouteRevalidation, subscribeToMutationActivity } from "@/components/feedback/mutation-feedback";

const tenantTables = [
  "store_memberships", "categories", "suppliers", "customers", "customer_addresses", "pets", "products", "product_packagings",
  "inventory_balances", "inventory_lots", "inventory_movements", "inventory_counts", "inventory_count_items", "services",
  "cash_sessions", "cash_counts", "cash_movements", "sales", "sale_items", "payments", "receivables", "receivable_payments",
  "expense_categories", "goods_receipts", "goods_receipt_items", "payables", "payable_payments", "sale_returns", "sale_return_items",
  "sale_refunds", "sale_refund_allocations", "appointments", "deliveries", "delivery_events", "audit_logs",
] as const;

type ConnectionState = "connecting" | "online" | "offline";

export function RealtimeProvider({ storeId, userId, children }: { storeId: string; userId: string; children: ReactNode }) {
  const router = useRouter();
  const [connection, setConnection] = useState<ConnectionState>("connecting");

  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshQueuedDuringMutation = false;
    const channel = supabase.channel(`store-updates:${storeId}:${userId}`);
    const scheduleRefresh = () => {
      if (hasPendingRouteRevalidation()) {
        refreshQueuedDuringMutation = true;
        return;
      }
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        router.refresh();
      }, 140);
    };
    const stopMutationSubscription = subscribeToMutationActivity((activity) => {
      if (activity.pending && activity.routeRevalidationPending && refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = undefined;
        refreshQueuedDuringMutation = true;
        return;
      }
      if (activity.pending || !refreshQueuedDuringMutation) return;
      const shouldRefresh = activity.refreshAfterIdle;
      refreshQueuedDuringMutation = false;
      if (shouldRefresh) scheduleRefresh();
    });

    for (const table of tenantTables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `store_id=eq.${storeId}` }, scheduleRefresh);
    }
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "stores", filter: `id=eq.${storeId}` }, scheduleRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("online");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setConnection("offline");
        else setConnection("connecting");
      });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      stopMutationSubscription();
      void supabase.removeChannel(channel);
    };
  }, [router, storeId, userId]);

  return <>
    {connection === "offline" ? <div role="status" className="fixed right-3 bottom-24 z-40 flex items-center gap-2 rounded-md border border-border bg-background/95 px-3 py-2 text-[10px] text-muted-foreground shadow-sm"><LuWifiOff className="size-3.5" />Sem sincronização ao vivo</div> : null}
    {children}
  </>;
}
