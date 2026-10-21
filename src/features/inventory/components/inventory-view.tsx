"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  LuBoxes,
  LuCircleAlert,
  LuClipboardList,
  LuHistory,
  LuPackageCheck,
  LuPlus,
  LuRefreshCw,
  LuTruck,
} from "react-icons/lu";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BrlInput } from "@/components/ui/brl-input";
import { Label } from "@/components/ui/label";
import { ComboboxField } from "@/components/ui/combobox-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney, formatMoneyInput, formatQuantity, formatShortDate } from "@/lib/format";
import { formatCnpj } from "@/lib/cnpj";
import { parseMoneyToCents } from "@/lib/inputs";
import { adjustStock, archiveCategory, archiveProduct, completeInventoryCount, convertToBulk, createCategory, createProduct, deleteProductPackaging, receiveGoods, restoreCategory, saveProductPackaging, startInventoryCount, updateCategory, updateProduct } from "../actions";
import type { InventoryMovement, InventoryOverview, InventoryProduct } from "../queries";

type ReceiptLine = { productId: string; packages: string; conversionFactor: string; totalCost: string; lotCode: string; expiresOn: string };
type CountLine = { itemId: string; productId: string; product: string; unit: string; precision: number; lotId: string | null; lotCode: string | null; expected: number; counted: number; balanceVersion: number };

function ProductDialog({ categories }: { categories: InventoryOverview["categories"] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [unit, setUnit] = useState("un");
  const [precision, setPrecision] = useState("0");
  const [categoryId, setCategoryId] = useState("");
  const [trackLots, setTrackLots] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    const precision = Number(form.get("precision") ?? 0);
    startTransition(async () => {
      const result = await createProduct({
        name: form.get("name"),
        brand: form.get("brand"),
        description: form.get("description"),
        sku: form.get("sku"),
        barcode: form.get("barcode"),
        categoryId,
        unit,
        precision,
        minimumStock: form.get("minimumStock"),
        trackLots,
        salePrice: form.get("salePrice"),
        averageCost: form.get("averageCost"),
      });
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível concluir a operação.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-9 gap-2 rounded-md px-3 text-[11px]"><LuPlus className="size-3.5" /> Novo produto</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader><DialogTitle className="text-[18px]">Novo produto</DialogTitle><DialogDescription className="text-[11px]">O saldo inicial entra por recebimento ou ajuste auditável.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="product-name">Nome</Label><Input id="product-name" name="name" required maxLength={160} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="product-description">Descrição</Label><Input id="product-description" name="description" maxLength={500} /></div>
              <div className="space-y-1.5"><Label htmlFor="product-brand">Marca</Label><Input id="product-brand" name="brand" maxLength={100} /></div>
              <div className="space-y-1.5"><Label htmlFor="product-category">Categoria</Label><ComboboxField id="product-category" value={categoryId} onValueChange={setCategoryId} options={categories.filter((category) => !category.archived_at).map((category) => ({ value: category.id, label: category.name }))} placeholder="Sem categoria" /></div>
              <div className="space-y-1.5"><Label htmlFor="product-sku">SKU</Label><Input id="product-sku" name="sku" maxLength={80} /></div>
              <div className="space-y-1.5"><Label htmlFor="product-barcode">Código de barras</Label><Input id="product-barcode" name="barcode" inputMode="numeric" maxLength={80} /></div>
              <div className="space-y-1.5"><Label htmlFor="product-unit">Unidade base</Label><ComboboxField id="product-unit" value={unit} onValueChange={(nextUnit) => { setUnit(nextUnit); setPrecision(["kg", "g", "L", "ml"].includes(nextUnit) ? "3" : "0"); }} options={[{ value: "un", label: "Unidade" }, { value: "kg", label: "Quilograma" }, { value: "g", label: "Grama" }, { value: "L", label: "Litro" }, { value: "ml", label: "Mililitro" }, { value: "pacote", label: "Pacote" }, { value: "caixa", label: "Caixa" }]} /></div>
              <div className="space-y-1.5"><Label htmlFor="product-precision">Casas decimais</Label><ComboboxField id="product-precision" name="precision" value={precision} onValueChange={setPrecision} options={[{ value: "0", label: "0" }, { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }]} /></div>
              <div className="space-y-1.5"><Label htmlFor="product-price">Preço de venda (R$)</Label><BrlInput id="product-price" name="salePrice" placeholder="0,00" required /></div>
              <div className="space-y-1.5"><Label htmlFor="product-cost">Custo médio (R$)</Label><BrlInput id="product-cost" name="averageCost" placeholder="0,00" defaultValue="0,00" required /></div>
              <div className="space-y-1.5"><Label htmlFor="product-minimum">Estoque mínimo</Label><Input id="product-minimum" name="minimumStock" type="number" min="0" step="0.001" defaultValue="0" /></div>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5">
              <Checkbox checked={trackLots} onCheckedChange={(value) => setTrackLots(value === true)} />
              <span><span className="block text-[11px] font-medium">Controlar lote e validade</span><span className="mt-0.5 block text-[10px] text-muted-foreground">A venda será baixada seguindo FEFO.</span></span>
            </label>
            {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar produto"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoryDialog({ categories }: { categories: InventoryOverview["categories"] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<InventoryOverview["categories"][number] | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage("");
    startTransition(async () => {
      const name = String(data.get("name") ?? "");
      const result = editing ? await updateCategory({ id: editing.id, name }) : await createCategory(name);
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setEditing(null);
      form.reset();
      router.refresh();
    });
  }

  function changeCategory(category: InventoryOverview["categories"][number], action: "archive" | "restore") {
    setMessage("");
    startTransition(async () => {
      const result = action === "archive" ? await archiveCategory(category.id) : await restoreCategory(category.id);
      if (!result.ok) { setMessage(result.message ?? "Não foi possível atualizar a categoria."); return; }
      if (editing?.id === category.id) setEditing(null);
      router.refresh();
    });
  }

  return <>
    <Button type="button" variant="outline" className="h-9 rounded-md px-3 text-[11px]" onClick={() => { setEditing(null); setMessage(""); setOpen(true); }}>Categorias</Button>
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setEditing(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[460px]"><DialogHeader><DialogTitle className="text-[17px]">Categorias de produtos</DialogTitle><DialogDescription className="text-[11px]">Edite, arquive ou reative categorias sem perder os vínculos históricos.</DialogDescription></DialogHeader>
      <form key={editing?.id ?? "new-category"} onSubmit={submit} className="space-y-3 rounded-md border border-border p-3"><div className="space-y-1.5"><Label htmlFor="category-name">{editing ? "Editar categoria" : "Nova categoria"}</Label><Input id="category-name" name="name" defaultValue={editing?.name ?? ""} required maxLength={100} /></div>{message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}<div className="flex justify-end gap-2">{editing ? <Button type="button" variant="ghost" onClick={() => { setEditing(null); setMessage(""); }}>Cancelar edição</Button> : null}<Button type="submit" disabled={pending}>{pending ? "Salvando…" : editing ? "Salvar alterações" : "Criar categoria"}</Button></div></form>
      <div className="space-y-2">{categories.length ? categories.map((category) => <div key={category.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"><div className="min-w-0"><p className="truncate text-[11px] font-medium">{category.name}</p>{category.archived_at ? <p className="text-[9px] text-muted-foreground">Arquivada</p> : null}</div><div className="flex shrink-0 gap-1">{!category.archived_at ? <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => { setEditing(category); setMessage(""); }}>Editar</Button> : null}<Button type="button" variant="ghost" size="sm" className={`h-7 px-2 text-[10px] ${category.archived_at ? "" : "text-destructive"}`} disabled={pending} onClick={() => changeCategory(category, category.archived_at ? "restore" : "archive")}>{category.archived_at ? "Reativar" : "Arquivar"}</Button></div></div>) : <p className="rounded-md border border-dashed px-3 py-4 text-center text-[10px] text-muted-foreground">Nenhuma categoria cadastrada.</p>}</div>
      <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Fechar</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}

function PackagingDialog({ product, onSaved }: { product: InventoryProduct; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [removePending, startRemoveTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<InventoryProduct["packagings"][number] | null>(null);
  const [removeTarget, setRemoveTarget] = useState<InventoryProduct["packagings"][number] | null>(null);

  function edit(packaging: InventoryProduct["packagings"][number] | null) {
    setEditing(packaging);
    setMessage("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const result = await saveProductPackaging({
        packagingId: editing?.id ?? null,
        productId: product.id,
        label: String(form.get("label") ?? ""),
        barcode: String(form.get("barcode") ?? ""),
        baseQuantity: String(form.get("baseQuantity") ?? ""),
      });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      edit(null);
      onSaved();
    });
  }

  function removePackaging() {
    if (!removeTarget) return;
    startRemoveTransition(async () => {
      const result = await deleteProductPackaging(product.id, removeTarget.id);
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); setRemoveTarget(null); return; }
      setRemoveTarget(null);
      edit(null);
      onSaved();
    });
  }

  return <>
    <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => { edit(null); setOpen(true); }}>Embalagens · {product.packagings.length}</Button>
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) edit(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader><DialogTitle className="text-[17px]">Embalagens de {product.name}</DialogTitle><DialogDescription className="text-[11px]">Defina quantas unidades de {product.unit} cada embalagem contém. O código precisa ser único em todo o catálogo.</DialogDescription></DialogHeader>
        <div className="space-y-2">
          {product.packagings.length ? product.packagings.map((packaging) => <div key={packaging.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5"><div className="min-w-0"><p className="truncate text-[11px] font-medium">{packaging.label}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatQuantity(packaging.base_quantity, product.unit)} {product.unit}{packaging.barcode ? ` · ${packaging.barcode}` : ""}</p></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => edit(packaging)}>Editar</Button><Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-destructive" onClick={() => { setMessage(""); setRemoveTarget(packaging); }}>Remover</Button></div></div>) : <p className="rounded-md border border-dashed px-3 py-4 text-center text-[10px] text-muted-foreground">Nenhuma embalagem cadastrada.</p>}
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-md bg-muted/40 p-3">
          <p className="text-[11px] font-medium">{editing ? "Editar embalagem" : "Nova embalagem"}</p>
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor={`packaging-label-${product.id}`}>Nome</Label><Input key={`label-${editing?.id ?? "new"}`} id={`packaging-label-${product.id}`} name="label" defaultValue={editing?.label ?? ""} placeholder="Saco de 15 kg" maxLength={80} required /></div><div className="space-y-1"><Label htmlFor={`packaging-quantity-${product.id}`}>Unidades base</Label><Input key={`quantity-${editing?.id ?? "new"}`} id={`packaging-quantity-${product.id}`} name="baseQuantity" type="number" min="0.001" step={product.unit_precision ? (1 / 10 ** product.unit_precision).toString() : "1"} defaultValue={editing?.base_quantity ?? ""} required /></div><div className="space-y-1 sm:col-span-2"><Label htmlFor={`packaging-barcode-${product.id}`}>Código de barras · opcional</Label><Input key={`barcode-${editing?.id ?? "new"}`} id={`packaging-barcode-${product.id}`} name="barcode" inputMode="numeric" defaultValue={editing?.barcode ?? ""} maxLength={128} /></div></div>
          {message ? <p role="alert" className="text-[10px] text-destructive">{message}</p> : null}
          <div className="flex justify-end gap-2">{editing ? <Button type="button" variant="ghost" size="sm" onClick={() => edit(null)}>Cancelar edição</Button> : null}<Button type="submit" size="sm" disabled={pending}>{pending ? "Salvando…" : editing ? "Salvar alterações" : "Adicionar embalagem"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={Boolean(removeTarget)} onOpenChange={(value) => { if (!value) setRemoveTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remover esta embalagem?</AlertDialogTitle><AlertDialogDescription>O produto e seus movimentos permanecem registrados. O código de barras ficará disponível para outro item.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={removePending}>Voltar</AlertDialogCancel><AlertDialogAction onClick={removePackaging} disabled={removePending}>{removePending ? "Removendo…" : "Remover embalagem"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

function EditProductDialog({ product, categories, onSaved }: { product: InventoryProduct; categories: InventoryOverview["categories"]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [categoryId, setCategoryId] = useState(product.category_id ?? "__none");

  function begin() {
    setCategoryId(product.category_id ?? "__none");
    setMessage("");
    setOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const result = await updateProduct({
        id: product.id,
        name: form.get("name"),
        description: form.get("description"),
        brand: form.get("brand"),
        sku: form.get("sku"),
        barcode: form.get("barcode"),
        categoryId: categoryId === "__none" ? "" : categoryId,
        salePrice: form.get("salePrice"),
        minimumStock: form.get("minimumStock"),
      });
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível concluir a operação.");
        return;
      }
      setOpen(false);
      onSaved();
    });
  }

  return <>
    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={begin}>Editar</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader><DialogTitle className="text-[17px]">Editar produto</DialogTitle><DialogDescription className="text-[11px]">Atualize os dados de {product.name}. Unidade, controle de lote e custo médio ficam preservados.</DialogDescription></DialogHeader>
        <form key={`${product.id}-${open ? "open" : "closed"}`} onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`edit-product-name-${product.id}`}>Nome</Label><Input id={`edit-product-name-${product.id}`} name="name" defaultValue={product.name} maxLength={160} required /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`edit-product-description-${product.id}`}>Descrição</Label><Input id={`edit-product-description-${product.id}`} name="description" defaultValue={product.description ?? ""} maxLength={500} /></div>
            <div className="space-y-1.5"><Label htmlFor={`edit-product-brand-${product.id}`}>Marca</Label><Input id={`edit-product-brand-${product.id}`} name="brand" defaultValue={product.brand ?? ""} maxLength={100} /></div>
            <div className="space-y-1.5"><Label htmlFor={`edit-product-category-${product.id}`}>Categoria</Label><ComboboxField id={`edit-product-category-${product.id}`} value={categoryId} onValueChange={setCategoryId} options={[{ value: "__none", label: "Sem categoria" }, ...categories.filter((category) => !category.archived_at || category.id === product.category_id).map((category) => ({ value: category.id, label: `${category.name}${category.archived_at ? " (arquivada)" : ""}` }))]} placeholder="Selecione uma categoria" /></div>
            <div className="space-y-1.5"><Label htmlFor={`edit-product-sku-${product.id}`}>SKU</Label><Input id={`edit-product-sku-${product.id}`} name="sku" defaultValue={product.sku ?? ""} maxLength={80} /></div>
            <div className="space-y-1.5"><Label htmlFor={`edit-product-barcode-${product.id}`}>Código de barras</Label><Input id={`edit-product-barcode-${product.id}`} name="barcode" defaultValue={product.barcode ?? ""} maxLength={80} /></div>
            <div className="space-y-1.5"><Label htmlFor={`edit-product-price-${product.id}`}>Preço de venda (R$)</Label><BrlInput id={`edit-product-price-${product.id}`} name="salePrice" defaultValue={formatMoneyInput(product.sale_price_cents)} required /></div>
            <div className="space-y-1.5"><Label htmlFor={`edit-product-minimum-${product.id}`}>Estoque mínimo ({product.unit})</Label><Input id={`edit-product-minimum-${product.id}`} name="minimumStock" inputMode="decimal" defaultValue={String(product.minimum_stock).replace(".", ",")} /></div>
          </div>
          {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar alterações"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

function ArchiveProductButton({ product, onArchived }: { product: InventoryProduct; onArchived: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const canArchive = product.quantity <= 0;

  function archive() {
    setMessage("");
    startTransition(async () => {
      const result = await archiveProduct(product.id);
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível concluir a operação.");
        return;
      }
      setOpen(false);
      onArchived();
    });
  }

  return <>
    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[10px] text-destructive hover:text-destructive" disabled={!canArchive} title={canArchive ? "Arquivar produto" : "Zere o estoque antes de arquivar"} onClick={() => { setMessage(""); setOpen(true); }}>Arquivar</Button>
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Arquivar {product.name}?</AlertDialogTitle><AlertDialogDescription>O produto deixa de aparecer no catálogo e no PDV. Vendas, movimentações e dados históricos continuam registrados.</AlertDialogDescription></AlertDialogHeader>
        {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
        <AlertDialogFooter><AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={archive} disabled={pending}>{pending ? "Arquivando…" : "Arquivar produto"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

function AdjustmentDialog({ product, onSaved }: { product: InventoryProduct; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [lotId, setLotId] = useState("");
  const [operationKey, setOperationKey] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const result = await adjustStock({ productId: product.id, counted: String(form.get("counted") ?? ""), reason: String(form.get("reason") ?? ""), lotId: lotId || null, key: operationKey });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
      onSaved();
    });
  }

  const lotUnavailable = product.track_lots && product.lots.length === 0;
  return <>
    <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => { setLotId(product.lots[0]?.id ?? ""); setOperationKey(crypto.randomUUID()); setOpen(true); }}>Ajustar</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-[440px]"><DialogHeader><DialogTitle className="text-[17px]">Ajustar estoque</DialogTitle><DialogDescription className="text-[11px]">{product.name} · saldo atual {formatQuantity(product.quantity, product.unit)}.</DialogDescription></DialogHeader>
      {lotUnavailable ? <Alert><AlertTitle>Produto controlado por lote</AlertTitle><AlertDescription>Receba um lote antes de fazer o ajuste.</AlertDescription></Alert> : <form onSubmit={submit} className="space-y-4">
        {product.track_lots ? <div className="space-y-1.5"><Label>Lote</Label><ComboboxField value={lotId} onValueChange={setLotId} options={product.lots.map((lot) => ({ value: lot.id, label: `${lot.code} · ${formatQuantity(lot.quantity, product.unit)}` }))} placeholder="Selecione um lote" /></div> : null}
        <div className="space-y-1.5"><Label htmlFor={`adjust-count-${product.id}`}>Quantidade física</Label><Input id={`adjust-count-${product.id}`} name="counted" type="number" min="0" step={product.unit_precision ? (1 / 10 ** product.unit_precision).toString() : "1"} defaultValue={product.track_lots ? product.lots.find((lot) => lot.id === lotId)?.quantity ?? 0 : product.quantity} required /></div>
        <div className="space-y-1.5"><Label htmlFor={`adjust-reason-${product.id}`}>Motivo do ajuste</Label><Input id={`adjust-reason-${product.id}`} name="reason" required maxLength={500} placeholder="Contagem física, avaria…" /></div>
        {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Registrando…" : "Registrar ajuste"}</Button></DialogFooter>
      </form>}
    </DialogContent></Dialog>
  </>;
}

function ReceiptDialog({ overview, onSaved }: { overview: InventoryOverview; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [operationKey, setOperationKey] = useState("");
  const [method, setMethod] = useState("pix");
  const [payNow, setPayNow] = useState(false);
  const [dueOn, setDueOn] = useState("");
  const [items, setItems] = useState<ReceiptLine[]>([{ productId: "", packages: "1", conversionFactor: "1", totalCost: "0,00", lotCode: "", expiresOn: "" }]);

  function updateItem(index: number, key: keyof ReceiptLine, value: string) {
    setItems((previous) => previous.map((item, i) => i === index ? { ...item, [key]: value } : item));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dueOn) {
      setMessage("Informe o vencimento da conta.");
      return;
    }
    const converted = items.map((item) => ({
      productId: item.productId,
      packages: Number(item.packages),
      conversionFactor: Number(item.conversionFactor),
      totalCostCents: parseMoneyToCents(item.totalCost),
      lotCode: item.lotCode,
      expiresOn: item.expiresOn,
    }));
    if (converted.some((item) => !item.productId || item.totalCostCents === null || !Number.isFinite(item.packages) || !Number.isFinite(item.conversionFactor))) {
      setMessage("Informe produto, quantidade, conversão e custo em todos os itens.");
      return;
    }
    if (converted.some((item, i) => overview.products.find((product) => product.id === item.productId)?.track_lots && !items[i].lotCode.trim())) {
      setMessage("Informe o lote para cada produto controlado por validade.");
      return;
    }
    setMessage("");
    startTransition(async () => {
      const result = await receiveGoods({
        key: operationKey,
        supplierId,
        dueOn,
        payNow,
        method,
        sessionId: method === "cash" && payNow ? overview.openCashSession : null,
        items: converted.map((item, index) => ({ ...item, lotCode: items[index].lotCode, expiresOn: items[index].expiresOn })),
      });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
      onSaved();
    });
  }

  return <>
    <Button variant="outline" className="h-9 gap-2 rounded-md px-3 text-[11px]" onClick={() => { setOperationKey(crypto.randomUUID()); setDueOn(""); setMessage(""); setOpen(true); }}><LuTruck className="size-3.5" /> Receber mercadoria</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[760px]"><DialogHeader><DialogTitle className="text-[18px]">Receber mercadoria</DialogTitle><DialogDescription className="text-[11px]">O custo, os lotes, o saldo e a conta a pagar serão registrados na mesma operação.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Fornecedor</Label><ComboboxField value={supplierId} onValueChange={setSupplierId} options={overview.suppliers.map((supplier) => ({ value: supplier.id, label: `${supplier.name}${supplier.cnpj ? ` · ${formatCnpj(supplier.cnpj)}` : ""}` }))} placeholder="Sem fornecedor" /></div>
          <div className="space-y-1.5"><Label htmlFor="receipt-due">Vencimento da conta</Label><DatePickerField id="receipt-due" name="dueOn" value={dueOn} onValueChange={setDueOn} required /></div>
        </div>
        <div className="space-y-3">
          {items.map((item, index) => {
            const product = overview.products.find((entry) => entry.id === item.productId);
            return <div key={index} className="rounded-lg border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2"><Label>Produto</Label><ComboboxField value={item.productId} onValueChange={(value) => updateItem(index, "productId", value)} options={overview.products.map((entry) => ({ value: entry.id, label: `${entry.name} · ${entry.unit}` }))} placeholder="Selecione um produto" /></div>
                <div className="space-y-1.5"><Label>Embalagens recebidas</Label><Input type="number" min="0.001" step="0.001" value={item.packages} onChange={(event) => updateItem(index, "packages", event.target.value)} required /></div>
                <div className="space-y-1.5"><Label>Unidades base por embalagem</Label><Input type="number" min="0.001" step="0.001" value={item.conversionFactor} onChange={(event) => updateItem(index, "conversionFactor", event.target.value)} required /></div>
                <div className="space-y-1.5"><Label>Custo total do item (R$)</Label><BrlInput value={item.totalCost} onValueChange={(value) => updateItem(index, "totalCost", value)} required /></div>
                {product?.track_lots ? <><div className="space-y-1.5"><Label>Código do lote</Label><Input value={item.lotCode} onChange={(event) => updateItem(index, "lotCode", event.target.value)} required maxLength={120} /></div><div className="space-y-1.5"><Label htmlFor={`receipt-expires-${index}`}>Validade</Label><DatePickerField id={`receipt-expires-${index}`} value={item.expiresOn} onValueChange={(value) => updateItem(index, "expiresOn", value)} /></div></> : null}
              </div>
              {items.length > 1 ? <div className="mt-2 flex justify-end"><Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] text-muted-foreground" onClick={() => setItems((previous) => previous.filter((_, i) => i !== index))}>Remover item</Button></div> : null}
            </div>;
          })}
          <Button type="button" variant="outline" size="sm" className="h-8 text-[10px]" onClick={() => setItems((previous) => [...previous, { productId: "", packages: "1", conversionFactor: "1", totalCost: "0,00", lotCode: "", expiresOn: "" }])}><LuPlus className="size-3.5" /> Adicionar item</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/50 p-3">
          <label className="flex items-center gap-2 text-[11px]"><Checkbox checked={payNow} onCheckedChange={(value) => setPayNow(value === true)} /> Pagar agora</label>
          {payNow ? <><ComboboxField value={method} onValueChange={setMethod} options={[{ value: "pix", label: "Pix" }, { value: "debit_card", label: "Cartão de débito" }, { value: "credit_card", label: "Cartão de crédito" }, { value: "transfer", label: "Transferência" }, { value: "cash", label: "Dinheiro" }]} className="h-8 w-40" inputClassName="text-[11px]" />{method === "cash" && !overview.openCashSession ? <span className="text-[10px] text-destructive">Abra o caixa para pagar em dinheiro.</span> : null}</> : null}
        </div>
        {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending || (payNow && method === "cash" && !overview.openCashSession)}>{pending ? "Registrando…" : "Confirmar recebimento"}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </>;
}

function BulkConversionDialog({ products, onSaved }: { products: InventoryProduct[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [sourceProductId, setSourceProductId] = useState("");
  const [targetProductId, setTargetProductId] = useState("");
  const [sourceQuantity, setSourceQuantity] = useState("1");
  const [targetPerSource, setTargetPerSource] = useState("1");
  const [key, setKey] = useState("");
  const source = products.find((product) => product.id === sourceProductId);
  const bulkUnits = ["kg", "g", "L", "ml"];
  const targets = products.filter((product) => product.id !== sourceProductId && bulkUnits.includes(product.unit) && !bulkUnits.includes(source?.unit ?? "") && product.track_lots === source?.track_lots);
  const target = targets.find((product) => product.id === targetProductId);

  function begin() {
    const firstSource = products[0];
    setSourceProductId(firstSource?.id ?? "");
    setTargetProductId("");
    setSourceQuantity("1");
    setTargetPerSource("1");
    setKey(crypto.randomUUID());
    setMessage("");
    setOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const result = await convertToBulk({ sourceProductId, targetProductId, sourceQuantity, targetPerSource, reason: String(form.get("reason") ?? ""), key });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
      onSaved();
    });
  }

  return <>
    <Button type="button" variant="outline" className="h-8 px-2.5 text-[10px]" onClick={begin}>Converter para granel</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[500px]"><DialogHeader><DialogTitle className="text-[17px]">Converter estoque</DialogTitle><DialogDescription className="text-[11px]">A saída do produto fechado e a entrada do produto a granel ficam no mesmo lançamento. Lotes e custo médio são preservados.</DialogDescription></DialogHeader>
      {products.length < 2 ? <p className="rounded-md border border-dashed p-4 text-center text-[10px] text-muted-foreground">Cadastre ao menos dois produtos com unidades diferentes para converter estoque.</p> : <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5"><Label>Produto de origem</Label><ComboboxField value={sourceProductId} onValueChange={(value) => { setSourceProductId(value); setTargetProductId(""); }} options={products.map((product) => ({ value: product.id, label: `${product.name} · ${product.unit}` }))} placeholder="Selecione o produto fechado" /></div>
        <div className="space-y-1.5"><Label>Produto a granel</Label><ComboboxField value={targetProductId} onValueChange={setTargetProductId} options={targets.map((product) => ({ value: product.id, label: `${product.name} · ${product.unit}` }))} placeholder="Selecione o produto de destino" disabled={!source} />{source && !targets.length ? <p className="text-[10px] text-muted-foreground">Cadastre um produto com outra unidade e o mesmo controle de lote.</p> : null}</div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="bulk-source-quantity">Quantidade de origem ({source?.unit ?? "un"})</Label><Input id="bulk-source-quantity" type="number" min="0.001" step={source?.unit_precision ? (1 / 10 ** source.unit_precision).toString() : "1"} value={sourceQuantity} onChange={(event) => setSourceQuantity(event.target.value)} required /><p className="text-[9px] text-muted-foreground">Disponível: {source ? formatQuantity(source.quantity, source.unit) : "—"}</p></div><div className="space-y-1.5"><Label htmlFor="bulk-target-factor">Quantidade convertida ({target?.unit ?? "un"})</Label><Input id="bulk-target-factor" type="number" min="0.001" step={target?.unit_precision ? (1 / 10 ** target.unit_precision).toString() : "1"} value={targetPerSource} onChange={(event) => setTargetPerSource(event.target.value)} required /><p className="text-[9px] text-muted-foreground">Cada unidade de origem gera esta quantidade.</p></div></div>
        {source && target ? <div className="rounded-md bg-muted/50 px-3 py-2 text-[10px]">{sourceQuantity || "0"} {source.unit} → {formatQuantity((Number(sourceQuantity.replace(",", ".")) || 0) * (Number(targetPerSource.replace(",", ".")) || 0), target.unit)} {target.unit}</div> : null}
        <div className="space-y-1.5"><Label htmlFor="bulk-reason">Motivo</Label><Input id="bulk-reason" name="reason" defaultValue="Conversão para venda a granel" maxLength={500} required /></div>
        {message ? <p role="alert" className="text-[10px] text-destructive">{message}</p> : null}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending || !source || !target || !key}>{pending ? "Registrando…" : "Confirmar conversão"}</Button></DialogFooter>
      </form>}
    </DialogContent></Dialog>
  </>;
}

function CountDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [countId, setCountId] = useState("");
  const [operationKey, setOperationKey] = useState("");
  const [lines, setLines] = useState<CountLine[]>([]);

  async function begin() {
    setLoading(true);
    setMessage("");
    const result = await startInventoryCount();
    if (!result.ok) setMessage(result.message ?? "Não foi possível concluir a operação.");
    else { setCountId(result.countId); setOperationKey(crypto.randomUUID()); setLines(result.lines); }
    setLoading(false);
  }

  function change(itemId: string, value: string) {
    const parsed = Number(value);
    setLines((previous) => previous.map((line) => line.itemId === itemId ? { ...line, counted: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0 } : line));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!countId) return;
    setMessage("");
    startTransition(async () => {
      const result = await completeInventoryCount(countId, lines.map((line) => ({ itemId: line.itemId, counted: line.counted })), operationKey);
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setOpen(false);
      setCountId("");
      setLines([]);
      onSaved();
    });
  }

  return <>
    <Button variant="outline" className="h-9 gap-2 rounded-md px-3 text-[11px]" disabled={loading} onClick={() => { setOpen(true); void begin(); }}><LuClipboardList className="size-3.5" /> Nova contagem</Button>
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setCountId(""); setLines([]); setMessage(""); } }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[700px]"><DialogHeader><DialogTitle className="text-[18px]">Contagem de estoque</DialogTitle><DialogDescription className="text-[11px]">O sistema compara a versão do saldo no início e impede aplicar uma contagem desatualizada.</DialogDescription></DialogHeader>
      {loading ? <div className="flex items-center gap-2 py-8 text-[11px] text-muted-foreground"><LuRefreshCw className="size-4 animate-spin" /> Preparando a fotografia do estoque…</div> : lines.length ? <form onSubmit={submit} className="space-y-3">
        <div className="max-h-[52dvh] space-y-2 overflow-y-auto pr-1">{lines.map((line) => <div key={line.itemId} className="grid grid-cols-[minmax(0,1fr)_110px_130px] items-center gap-3 rounded-md border border-border px-3 py-2.5"><div className="min-w-0"><p className="truncate text-[11px] font-medium">{line.product}</p><p className="text-[10px] text-muted-foreground">Esperado: {formatQuantity(line.expected, line.unit)}{line.lotCode ? ` · lote ${line.lotCode}` : ""}</p></div><span className="text-right text-[10px] text-muted-foreground">Físico</span><Input aria-label={`Contagem de ${line.product}`} type="number" min="0" step={line.precision ? (1 / 10 ** line.precision).toString() : "1"} value={line.counted} onChange={(event) => change(line.itemId, event.target.value)} /></div>)}</div>
        {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Aplicando…" : "Salvar e aplicar"}</Button></DialogFooter>
      </form> : <div className="py-8 text-center text-[11px] text-muted-foreground">{message || "Não há produtos ativos para contar."}</div>}
    </DialogContent></Dialog>
  </>;
}

const movementKinds: Record<string, string> = { sale: "Venda", receipt: "Recebimento", correction: "Ajuste", count: "Contagem", return: "Devolução", bulk_out: "Saída para granel", bulk_in: "Entrada do granel", conversion: "Conversão" };

export function InventoryView({ overview }: { overview: InventoryOverview }) {
  const router = useRouter();
  const [tab, setTab] = useState("products");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const productColumns = useMemo<DataTableColumn<InventoryProduct>[]>(() => [
    { accessorKey: "name", header: "Produto", cell: ({ row }) => <div className="min-w-48"><p className="font-medium">{row.original.name}</p><p className="mt-1 max-w-56 truncate text-[10px] text-muted-foreground">{[row.original.description, row.original.brand, row.original.barcode].filter(Boolean).join(" · ") || row.original.sku || "Sem descrição"}</p></div> },
    { accessorKey: "category", header: "Categoria", cell: ({ row }) => row.original.category ?? <span className="text-muted-foreground">—</span> },
    { accessorKey: "sale_price_cents", header: "Preço de venda", cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatMoney(row.original.sale_price_cents)} / {row.original.unit}</span> },
    { accessorKey: "quantity", header: "Disponível", cell: ({ row }) => <div><span className="font-medium tabular-nums">{formatQuantity(row.original.quantity, row.original.unit)}</span><p className="mt-1 text-[10px] text-muted-foreground">Mínimo: {formatQuantity(row.original.minimum_stock, row.original.unit)}</p></div> },
    { id: "status", accessorFn: (row) => row.quantity <= row.minimum_stock ? "baixo" : "em estoque", header: "Situação", cell: ({ row }) => { const low = row.original.quantity <= row.original.minimum_stock; return <Badge variant="outline" className={low ? "rounded-md border-amber-200 bg-amber-50 px-2 text-[10px] font-normal text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200" : "rounded-md border-emerald-200 bg-emerald-50 px-2 text-[10px] font-normal text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"}><span className={`mr-1.5 size-1.5 rounded-full ${low ? "bg-amber-600" : "bg-emerald-600"}`} />{low ? "Estoque baixo" : "Em estoque"}</Badge>; } },
    { id: "actions", header: "", enableSorting: false, cell: ({ row }) => <div className="flex flex-wrap items-center gap-1"><EditProductDialog product={row.original} categories={overview.categories} onSaved={() => router.refresh()} /><PackagingDialog product={row.original} onSaved={() => router.refresh()} /><AdjustmentDialog product={row.original} onSaved={() => router.refresh()} /><ArchiveProductButton product={row.original} onArchived={() => router.refresh()} /></div> },
  ], [overview.categories, router]);
  const movementColumns = useMemo<DataTableColumn<InventoryMovement>[]>(() => [
    { accessorKey: "product", header: "Produto" },
    { accessorKey: "kind", header: "Tipo", cell: ({ row }) => movementKinds[row.original.kind] ?? row.original.kind },
    { accessorKey: "quantity_delta", header: "Variação", cell: ({ row }) => <span className={row.original.quantity_delta < 0 ? "tabular-nums text-destructive" : "tabular-nums"}>{row.original.quantity_delta > 0 ? "+" : ""}{formatQuantity(row.original.quantity_delta)}</span> },
    { accessorKey: "reason", header: "Motivo" },
    { accessorKey: "created_at", header: "Data", cell: ({ row }) => formatShortDate(row.original.created_at) },
  ], []);

  const lowStock = overview.products.filter((product) => product.quantity <= product.minimum_stock).length;
  const stockValueCents = overview.products.reduce((total, product) => total + Math.round(product.quantity * product.average_cost_cents), 0);
  const visibleProducts = lowStockOnly ? overview.products.filter((product) => product.quantity <= product.minimum_stock) : overview.products;

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-[24px] font-semibold tracking-[-0.04em]">Estoque</h1><p className="mt-1.5 text-[12px] text-muted-foreground">Saiba o que chegou, o que saiu e o que precisa repor.</p></div><div className="flex flex-wrap gap-2"><ReceiptDialog overview={overview} onSaved={() => router.refresh()} /><ProductDialog categories={overview.categories} /></div></div>
    <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="flex items-center justify-between text-[10px] text-muted-foreground">Produtos cadastrados<LuBoxes className="size-4" /></div><p className="mt-4 text-[25px] font-semibold tabular-nums">{overview.products.length}</p><p className="mt-2 text-[10px] text-muted-foreground">Seu catálogo de produtos</p></Card>
      <Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="flex items-center justify-between text-[10px] text-muted-foreground">Precisam de reposição<LuCircleAlert className="size-4" /></div><p className="mt-4 text-[25px] font-semibold tabular-nums">{lowStock}</p><p className="mt-2 text-[10px] text-muted-foreground">Abaixo do estoque mínimo</p></Card>
      <Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="flex items-center justify-between text-[10px] text-muted-foreground">Valor em estoque<LuPackageCheck className="size-4" /></div><p className="mt-4 text-[25px] font-semibold tabular-nums">{formatMoney(stockValueCents)}</p><p className="mt-2 text-[10px] text-muted-foreground">Considerando o custo médio</p></Card>
      <Card className="gap-0 rounded-[10px] border-border/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="flex items-center justify-between text-[10px] text-muted-foreground">Movimentações<LuHistory className="size-4" /></div><p className="mt-4 text-[25px] font-semibold tabular-nums">{overview.movementCount}</p><p className="mt-2 text-[10px] text-muted-foreground">Entradas, vendas e ajustes</p></Card>
    </section>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="h-9"><TabsTrigger value="products" className="gap-2 text-[11px]"><LuBoxes className="size-3.5" /> Produtos</TabsTrigger><TabsTrigger value="movements" className="gap-2 text-[11px]"><LuHistory className="size-3.5" /> Movimentações</TabsTrigger><TabsTrigger value="count" className="gap-2 text-[11px]"><LuClipboardList className="size-3.5" /> Contagem</TabsTrigger></TabsList>
      <TabsContent value="products" className="mt-4"><Card className="gap-0 rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><DataTable columns={productColumns} data={visibleProducts} searchPlaceholder="Buscar produto ou código…" emptyMessage="Nenhum produto encontrado." toolbarActions={<div className="flex items-center gap-2"><CategoryDialog categories={overview.categories} /><BulkConversionDialog products={overview.products} onSaved={() => router.refresh()} /><Button type="button" variant={lowStockOnly ? "secondary" : "outline"} className="h-8 px-2.5 text-[10px]" onClick={() => setLowStockOnly((current) => !current)}>{lowStockOnly ? "Todos os produtos" : "Estoque baixo"}</Button></div>} /></Card></TabsContent>
      <TabsContent value="movements" className="mt-4"><Card className="gap-0 rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><DataTable columns={movementColumns} data={overview.movements} searchPlaceholder="Buscar produto, tipo ou motivo…" emptyMessage="Nenhuma movimentação registrada." toolbarActions={<span className="px-2 text-[10px] text-muted-foreground">{overview.movementCount} movimentações</span>} /></Card></TabsContent>
      <TabsContent value="count" className="mt-4"><Card className="gap-0 rounded-[10px] border-border/90 p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-[13px] font-semibold">Contagem de estoque</h2><p className="mt-1 text-[11px] text-muted-foreground">A fotografia do saldo detecta movimentações concorrentes antes de aplicar diferenças.</p></div><CountDialog onSaved={() => router.refresh()} /></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-md border border-border p-3"><p className="text-[10px] text-muted-foreground">Itens ativos</p><p className="mt-1 text-[17px] font-semibold">{overview.products.length}</p></div><div className="rounded-md border border-border p-3"><p className="text-[10px] text-muted-foreground">Produtos por lote</p><p className="mt-1 text-[17px] font-semibold">{overview.products.filter((product) => product.track_lots).length}</p></div><div className="rounded-md border border-border p-3"><p className="text-[10px] text-muted-foreground">Aplicação</p><p className="mt-1 text-[11px]">Versionada e atômica</p></div></div></Card></TabsContent>
    </Tabs>
  </div>;
}

export function InventoryLoadError({ message }: { message: string }) {
  return <Alert variant="destructive"><AlertTitle>Falha ao carregar o estoque</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>;
}
