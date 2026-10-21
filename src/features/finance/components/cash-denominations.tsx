"use client";

import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";

export const cashDenominations = [
  { cents: 20_000, label: "R$ 200" },
  { cents: 10_000, label: "R$ 100" },
  { cents: 5_000, label: "R$ 50" },
  { cents: 2_000, label: "R$ 20" },
  { cents: 1_000, label: "R$ 10" },
  { cents: 500, label: "R$ 5" },
  { cents: 200, label: "R$ 2" },
  { cents: 100, label: "R$ 1" },
  { cents: 50, label: "R$ 0,50" },
  { cents: 25, label: "R$ 0,25" },
  { cents: 10, label: "R$ 0,10" },
  { cents: 5, label: "R$ 0,05" },
];

export type CashCountMap = Record<number, string>;

export function cashCountTotal(counts: CashCountMap) {
  return cashDenominations.reduce((total, denomination) => total + denomination.cents * (Number(counts[denomination.cents]) || 0), 0);
}

export function cashCountPayload(counts: CashCountMap) {
  return cashDenominations.flatMap((denomination) => {
    const quantity = Number(counts[denomination.cents]) || 0;
    return quantity > 0 ? [{ denomination_cents: denomination.cents, quantity }] : [];
  });
}

export function CashDenominationFields({ counts, onChange }: { counts: CashCountMap; onChange: (denomination: number, quantity: string) => void }) {
  const total = cashCountTotal(counts);
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{cashDenominations.map((denomination) => <div key={denomination.cents} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2"><span className="w-[58px] shrink-0 text-[10px] font-medium tabular-nums">{denomination.label}</span><Input aria-label={`Quantidade de ${denomination.label}`} type="number" inputMode="numeric" min="0" step="1" value={counts[denomination.cents] ?? "0"} onChange={(event) => onChange(denomination.cents, event.target.value)} className="h-8 min-w-0 px-2 text-right text-[11px] tabular-nums" /></div>)}</div>
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2.5 text-[11px]"><span className="text-muted-foreground">Total contado</span><span className="font-semibold tabular-nums">{formatMoney(total)}</span></div>
  </div>;
}
