"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { Toaster, toast } from "@/components/ui/toast";

type MutationResult = { ok: boolean; message?: string; reference?: string; committed?: boolean };
type MutationActivity =
  | { pending: true; routeRevalidationPending: boolean }
  | { pending: false; routeRevalidationPending: false; refreshAfterIdle: boolean };

type MutationOptions<Result extends MutationResult> = {
  scope: string;
  action: () => Promise<Result>;
  revalidatesCurrentRoute?: boolean | ((result: Result) => boolean);
  success: { title: string; description?: string } | ((result: Result) => { title: string; description?: string });
  failureTitle: string | ((result: Result) => string);
  unexpectedMessage: string;
};

const pendingCounts = new Map<string, number>();
const scopeListeners = new Map<string, Set<() => void>>();
const activityListeners = new Set<(activity: MutationActivity) => void>();
let pendingRouteRevalidations = 0;
let refreshAfterMutationBatch = false;

function getPendingCount(scope: string) {
  return pendingCounts.get(scope) ?? 0;
}

function setPendingCount(scope: string, count: number) {
  if (count > 0) pendingCounts.set(scope, count);
  else pendingCounts.delete(scope);
  scopeListeners.get(scope)?.forEach((listener) => listener());
}

export function hasPendingMutations() {
  return pendingCounts.size > 0;
}

export function hasPendingRouteRevalidation() {
  return pendingRouteRevalidations > 0;
}

export function subscribeToMutationActivity(listener: (activity: MutationActivity) => void) {
  activityListeners.add(listener);
  return () => {
    activityListeners.delete(listener);
  };
}

function subscribeToScope(scope: string, listener: () => void) {
  const listeners = scopeListeners.get(scope) ?? new Set<() => void>();
  listeners.add(listener);
  scopeListeners.set(scope, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) scopeListeners.delete(scope);
  };
}

export async function runMutationFeedback<Result extends MutationResult>({
  scope,
  action,
  revalidatesCurrentRoute,
  success,
  failureTitle,
  unexpectedMessage,
}: MutationOptions<Result>): Promise<Result> {
  setPendingCount(scope, getPendingCount(scope) + 1);
  const mayRevalidateCurrentRoute = revalidatesCurrentRoute !== false;
  if (mayRevalidateCurrentRoute) pendingRouteRevalidations += 1;
  activityListeners.forEach((listener) => listener({ pending: true, routeRevalidationPending: hasPendingRouteRevalidation() }));
  let actionResult: Result | undefined;
  try {
    const result = await action();
    actionResult = result;
    if (result.ok) {
      const message = typeof success === "function" ? success(result) : success;
      toast.add({
        title: message.title,
        description: message.description,
        type: "success",
        timeout: 4200,
      });
    } else {
      toast.add({
        title: typeof failureTitle === "function" ? failureTitle(result) : failureTitle,
        description: [result.message ?? unexpectedMessage, result.reference ? `Referência: ${result.reference}` : null].filter(Boolean).join(" "),
        type: result.committed === true ? "warning" : "error",
        timeout: 9000,
        priority: "high",
      });
    }
    return result;
  } catch {
    toast.add({
      title: typeof failureTitle === "string" ? failureTitle : "Não foi possível concluir a operação",
      description: unexpectedMessage,
      type: "error",
      timeout: 9000,
      priority: "high",
    });
    return { ok: false, message: unexpectedMessage } as Result;
  } finally {
    let routeIsFresh = false;
    try {
      routeIsFresh = typeof revalidatesCurrentRoute === "function"
        ? Boolean(actionResult && revalidatesCurrentRoute(actionResult))
        : revalidatesCurrentRoute === false
          ? false
          : Boolean(actionResult?.ok);
    } catch {
      routeIsFresh = false;
    }
    if (!routeIsFresh) refreshAfterMutationBatch = true;
    if (mayRevalidateCurrentRoute) pendingRouteRevalidations = Math.max(0, pendingRouteRevalidations - 1);
    setPendingCount(scope, Math.max(0, getPendingCount(scope) - 1));
    if (!hasPendingMutations()) {
      const refreshAfterIdle = refreshAfterMutationBatch;
      refreshAfterMutationBatch = false;
      activityListeners.forEach((listener) => listener({ pending: false, routeRevalidationPending: false, refreshAfterIdle }));
    }
  }
}

export function MutationFeedbackProvider({ children }: { children: ReactNode }) {
  return <Toaster>{children}</Toaster>;
}

export function useMutationFeedback() {
  return runMutationFeedback;
}

export function MutationRegion({ scope, label, children }: { scope: string; label: string; children: ReactNode }) {
  const subscribe = useCallback((listener: () => void) => subscribeToScope(scope, listener), [scope]);
  const getSnapshot = useCallback(() => getPendingCount(scope), [scope]);
  const pending = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => 0,
  );
  const busy = pending > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 180);
    return () => clearTimeout(timer);
  }, [busy]);

  return (
    <div aria-busy={busy} className="relative min-w-0">
      {children}
      {visible ? (
        <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 rounded-md border border-primary/15 bg-background/95 px-3 py-2 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
          <LuLoaderCircle aria-hidden="true" className="size-3.5 animate-spin text-primary" />
          <span>{label}</span>
        </div>
      ) : null}
    </div>
  );
}
