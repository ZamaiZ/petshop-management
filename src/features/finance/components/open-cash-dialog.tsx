"use client";

import { useState, useTransition, type FormEvent } from "react";
import { LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { BrlInput } from "@/components/ui/brl-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatMoneyInput } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/inputs";
import { openCash } from "../actions";
import { CashDenominationFields, cashCountPayload, cashCountTotal, type CashCountMap } from "./cash-denominations";
import { runMutationFeedback } from "@/components/feedback/mutation-feedback";

export function OpenCashDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [key, setKey] = useState("");
  const [counts, setCounts] = useState<CashCountMap>({});
  const [countByDenomination, setCountByDenomination] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const openingCents = countByDenomination ? cashCountTotal(counts) : parseMoneyToCents(openingAmount);
    if (openingCents === null) {
      setMessage("Informe um fundo inicial válido.");
      return;
    }
    setMessage("");
    startTransition(async () => {
      const result = await runMutationFeedback({
        scope: "finance",
        action: () => openCash({ opening: formatMoneyInput(openingCents), counts: countByDenomination ? cashCountPayload(counts) : [], key }),
        success: { title: "Caixa aberto", description: "O resumo financeiro foi atualizado." },
        failureTitle: "Não foi possível abrir o caixa",
        unexpectedMessage: "Tente novamente. Se o problema continuar, informe a referência exibida no aviso.",
      });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
    });
  }

  return <>
    <Button className="h-9 gap-2 rounded-md px-3 text-[11px]" onClick={() => { setKey(crypto.randomUUID()); setCounts({}); setOpeningAmount(""); setCountByDenomination(false); setMessage(""); setOpen(true); }}><LuPlus className="size-3.5" /> Abrir caixa</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]"><DialogHeader><DialogTitle className="text-[17px]">Abrir caixa</DialogTitle><DialogDescription className="text-[11px]">Informe o fundo inicial disponível para troco. Pix e cartão não alteram esse saldo.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="space-y-1.5"><Label htmlFor="cash-opening">Fundo inicial (R$)</Label><BrlInput id="cash-opening" name="opening" placeholder="0,00" value={countByDenomination ? formatMoneyInput(cashCountTotal(counts)) : openingAmount} onValueChange={setOpeningAmount} readOnly={countByDenomination} required /></div><label className="flex cursor-pointer items-center gap-2 text-[11px]"><Checkbox checked={countByDenomination} onCheckedChange={(checked) => setCountByDenomination(checked === true)} />Contar por cédulas e moedas</label>{countByDenomination ? <CashDenominationFields counts={counts} onChange={(denomination, quantity) => setCounts((current) => ({ ...current, [denomination]: quantity }))} /> : <p className="text-[10px] text-muted-foreground">A contagem por denominações é opcional.</p>}{message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending || !key}>{pending ? "Abrindo…" : "Confirmar abertura"}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}
