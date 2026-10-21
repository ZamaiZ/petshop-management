"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { LuBarcode, LuCheck, LuCreditCard, LuMinus, LuPackage, LuPlus, LuSearch, LuShoppingBag, LuTrash2, LuTruck } from "react-icons/lu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatQuantity, formatShortDate } from "@/lib/format";
import { localDateKey } from "@/lib/format";
import { parseMoneyToCents, parseQuantity } from "@/lib/inputs";
import { completeSale } from "../actions";
import type { getSaleComposerData } from "../queries";

type ComposerData = NonNullable<Awaited<ReturnType<typeof getSaleComposerData>>["data"]>;
type CartLine = {
  key: string;
  productId: string | null;
  packagingId: string | null;
  serviceId: string | null;
  appointmentId: string | null;
  name: string;
  unit: string;
  precision: number;
  quantity: number;
  unitPriceCents: number;
  available: number | null;
};
type PaymentLine = { id: string; method: "cash" | "pix" | "debit_card" | "credit_card"; amount: string; tendered: string };
type DeliveryAddress = { label: string; street: string; number: string; complement: string; district: string; city: string; state: string; postal_code: string; reference: string };

const paymentNames = { cash: "Dinheiro", pix: "Pix", debit_card: "Cartão de débito", credit_card: "Cartão de crédito" };
const emptyDeliveryAddress: DeliveryAddress = { label: "Entrega", street: "", number: "", complement: "", district: "", city: "", state: "", postal_code: "", reference: "" };

function moneyInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function readMoney(value: string) {
  const parsed = parseMoneyToCents(value || "0");
  return parsed === null ? null : parsed;
}

export function SaleComposer({ data, timezone, initialDelivery = false }: { data: ComposerData; timezone: string; initialDelivery?: boolean }) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [catalogTab, setCatalogTab] = useState<"products" | "services">("products");
  const [scannerMode, setScannerMode] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState("0,00");
  const [delivery, setDelivery] = useState(initialDelivery);
  const [deliveryFee, setDeliveryFee] = useState("0,00");
  const [address, setAddress] = useState<DeliveryAddress>(emptyDeliveryAddress);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [dueOn, setDueOn] = useState("");
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();

  const selectedAppointment = data.appointments.find((appointment) => appointment.id === appointmentId);
  const hasLinkedAppointment = cart.some((line) => line.appointmentId !== null);
  const customerAddresses = data.addresses.filter((item) => item.customer_id === customerId);
  const visibleProducts = useMemo(() => data.products.filter((product) => {
    const matchesCategory = categoryId === "all" || product.category_id === categoryId;
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const matchesSearch = !query || [product.name, product.barcode, product.sku, ...product.packagings.flatMap((packaging) => [packaging.label, packaging.barcode])].some((value) => value?.toLocaleLowerCase("pt-BR").includes(query));
    return matchesCategory && matchesSearch;
  }), [categoryId, data.products, search]);
  const visibleServices = useMemo(() => data.services.filter((service) => !search || service.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))), [data.services, search]);
  const subtotalCents = cart.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPriceCents), 0);
  const discountCents = readMoney(discount);
  const deliveryFeeCents = readMoney(deliveryFee);
  const totalCents = subtotalCents - Math.max(0, discountCents ?? 0) + (delivery ? Math.max(0, deliveryFeeCents ?? 0) : 0);
  const paymentsCents = payments.reduce((sum, payment) => sum + (readMoney(payment.amount) ?? 0), 0);
  const remainingCents = totalCents - paymentsCents;

  function changed() {
    setKey(crypto.randomUUID());
    setMessage("");
    setSuccess("");
  }

  function chooseCustomer(nextCustomerId: string) {
    if (nextCustomerId !== customerId) {
      setSelectedAddressId("");
      setAddress(emptyDeliveryAddress);
    }
    setCustomerId(nextCustomerId);
  }

  function updateDeliveryAddress(values: Partial<DeliveryAddress>) {
    setSelectedAddressId("");
    setAddress((current) => ({ ...current, ...values }));
    changed();
  }

  function addProduct(product: ComposerData["products"][number]) {
    addPackagedProduct(product, null);
  }

  function addPackagedProduct(product: ComposerData["products"][number], packaging: ComposerData["products"][number]["packagings"][number] | null) {
    const baseQuantity = packaging?.base_quantity ?? 1;
    const available = packaging ? Math.floor(product.quantity / baseQuantity + 1e-9) : product.quantity;
    if (available <= 0) return;
    changed();
    const existing = cart.find((line) => line.productId === product.id && line.packagingId === (packaging?.id ?? null) && line.appointmentId === null);
    if (existing) {
      setCart((current) => current.map((line) => line.key === existing.key ? { ...line, quantity: Math.min(line.quantity + 1, available) } : line));
      return;
    }
    setCart((current) => [...current, {
      key: crypto.randomUUID(), productId: product.id, packagingId: packaging?.id ?? null, serviceId: null, appointmentId: null,
      name: packaging ? `${product.name} · ${packaging.label}` : product.name,
      unit: packaging?.label ?? product.unit,
      precision: packaging ? 0 : product.unit_precision,
      quantity: Math.min(1, available),
      unitPriceCents: product.sale_price_cents * baseQuantity,
      available,
    }]);
  }

  function addService(service: ComposerData["services"][number]) {
    changed();
    const appointment = selectedAppointment?.service_id === service.id && selectedAppointment.customer_id === customerId ? selectedAppointment : null;
    if (appointment && cart.some((line) => line.appointmentId === appointment.id)) return;
    const uniqueKey = appointment?.id ?? service.id;
    const existing = cart.find((line) => line.serviceId === service.id && line.appointmentId === null);
    if (!appointment && existing) {
      setCart((current) => current.map((line) => line.key === existing.key ? { ...line, quantity: line.quantity + 1 } : line));
      return;
    }
    setCart((current) => [...current, { key: `${uniqueKey}-${crypto.randomUUID()}`, productId: null, packagingId: null, serviceId: service.id, appointmentId: appointment?.id ?? null, name: appointment ? `${service.name} · ${appointment.pet}` : service.name, unit: "un", precision: 0, quantity: 1, unitPriceCents: appointment?.price_cents ?? service.price_cents, available: null }]);
    if (appointment && customerId !== appointment.customer_id) setCustomerId(appointment.customer_id);
  }

  function changeQuantity(line: CartLine, quantity: number) {
    changed();
    if (quantity <= 0) setCart((current) => current.filter((item) => item.key !== line.key));
    else setCart((current) => current.map((item) => item.key === line.key ? { ...item, quantity: Math.min(quantity, item.available ?? quantity) } : item));
  }

  function openPayment() {
    setMessage("");
    setSuccess("");
    setKey(crypto.randomUUID());
    setPayments([{ id: crypto.randomUUID(), method: "pix", amount: moneyInput(Math.max(totalCents, 0)), tendered: moneyInput(Math.max(totalCents, 0)) }]);
    setDueOn("");
    setPaymentOpen(true);
  }

  function changePayment(id: string, values: Partial<Omit<PaymentLine, "id">>) {
    changed();
    setPayments((current) => current.map((payment) => payment.id === id ? { ...payment, ...values } : payment));
  }

  function addPayment() {
    changed();
    setPayments((current) => [...current, { id: crypto.randomUUID(), method: "pix", amount: "0,00", tendered: "0,00" }]);
  }

  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (totalCents < 0 || discountCents === null || deliveryFeeCents === null) { setMessage("Confira os valores da venda."); return; }
    if (remainingCents < 0) { setMessage("Os pagamentos não podem exceder o total da venda."); return; }
    if ((remainingCents > 0 || delivery) && !customerId) { setMessage("Selecione um cliente para saldo a receber ou entrega."); return; }
    if (remainingCents > 0 && !dueOn) { setMessage("Informe o vencimento do saldo a receber."); return; }
    if (delivery && (!address.street.trim() || !address.city.trim())) { setMessage("Informe a rua e a cidade para a entrega."); return; }
    if (payments.some((payment) => payment.method === "cash") && !data.cashSessionId) { setMessage("Abra o caixa para receber dinheiro."); return; }
    startTransition(async () => {
      const result = await completeSale({
        key, customerId: customerId || null,
        items: cart.map((line) => ({ productId: line.productId, serviceId: line.serviceId, appointmentId: line.appointmentId, packagingId: line.packagingId, quantity: line.quantity })),
        payments: payments.map(({ method, amount, tendered }) => ({ method, amount, tendered })),
        discount, dueOn, deliveryFee: delivery ? deliveryFee : "0,00", deliveryAddress: delivery ? address : null,
        cashSessionId: data.cashSessionId,
      });
      if (!result.ok) { setMessage(result.message ?? "Não foi possível concluir a venda."); return; }
      if (!result.saleId) { setMessage("Não foi possível concluir a venda."); return; }
      setSuccess(`Venda registrada com sucesso. Código ${result.saleId.slice(0, 8)}.`);
      setCart([]);
      setPaymentOpen(false);
      router.refresh();
    });
  }

  function handleScannerKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    const query = search.trim();
    if (!query) return;
    const exactProduct = data.products.find((product) => product.barcode === query || product.sku === query);
    if (exactProduct) { addProduct(exactProduct); setSearch(""); return; }
    const packagedProduct = data.products.find((product) => product.packagings.some((packaging) => packaging.barcode === query));
    const exactPackaging = packagedProduct?.packagings.find((packaging) => packaging.barcode === query);
    if (packagedProduct && exactPackaging) { addPackagedProduct(packagedProduct, exactPackaging); setSearch(""); return; }
    const exactService = data.services.find((service) => service.name.toLocaleLowerCase("pt-BR") === query.toLocaleLowerCase("pt-BR"));
    if (exactService) { addService(exactService); setSearch(""); return; }
    setMessage("Código não encontrado no catálogo.");
  }

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-[24px] font-semibold tracking-[-0.04em]">Nova venda</h1><p className="mt-1.5 text-[12px] text-muted-foreground">Busque, leia o código de barras ou escolha um produto.</p></div><ButtonLink href="/vendas" variant="outline" className="h-9 px-3 text-[11px]">Voltar às vendas</ButtonLink></div>
    {success ? <Alert><LuCheck className="size-4" /><AlertDescription className="flex flex-wrap items-center justify-between gap-3">{success}<ButtonLink href="/vendas" variant="outline" size="sm">Ver vendas</ButtonLink></AlertDescription></Alert> : null}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="gap-0 overflow-hidden rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row"><div className="relative min-w-0 flex-1"><LuSearch className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={handleScannerKey} placeholder="Nome ou código de barras..." aria-label="Buscar produto ou código de barras" className="h-9 pl-9 text-[11px]" /></div><Button variant={scannerMode ? "default" : "outline"} className="h-9 gap-2 px-3 text-[11px]" onClick={() => { setScannerMode((active) => !active); searchRef.current?.focus(); }}><LuBarcode className="size-4" /> Leitor</Button></div>
        <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3">{(["products", "services"] as const).map((tab) => <Button key={tab} size="sm" variant={catalogTab === tab ? "default" : "outline"} className="h-8 shrink-0 px-3 text-[10px]" onClick={() => setCatalogTab(tab)}>{tab === "products" ? "Produtos" : "Serviços"}</Button>)}</div>
        {catalogTab === "products" ? <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3"><Button size="sm" variant={categoryId === "all" ? "default" : "outline"} className="h-8 shrink-0 px-3 text-[10px]" onClick={() => setCategoryId("all")}>Todos</Button>{data.categories.map((category) => <Button key={category.id} size="sm" variant={categoryId === category.id ? "default" : "outline"} className="h-8 shrink-0 px-3 text-[10px]" onClick={() => setCategoryId(category.id)}>{category.name}</Button>)}</div> : <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center"><Label htmlFor="appointment-link" className="shrink-0 text-[10px] text-muted-foreground">Atendimento pronto</Label><Select disabled={hasLinkedAppointment} value={appointmentId || "none"} onValueChange={(value) => { setAppointmentId(value === "none" ? "" : value ?? ""); const appointment = data.appointments.find((item) => item.id === value); if (appointment) chooseCustomer(appointment.customer_id); changed(); }}><SelectTrigger id="appointment-link" className="h-8 w-full max-w-[320px] text-[10px]"><SelectValue placeholder="Sem atendimento vinculado" /></SelectTrigger><SelectContent><SelectItem value="none">Sem atendimento vinculado</SelectItem>{data.appointments.map((appointment) => <SelectItem key={appointment.id} value={appointment.id}>{appointment.pet} · {data.customers.find((customer) => customer.id === appointment.customer_id)?.name ?? "Cliente"} · {formatShortDate(appointment.starts_at, timezone)}</SelectItem>)}</SelectContent></Select>{hasLinkedAppointment ? <span className="text-[9px] text-muted-foreground">Remova o serviço vinculado para trocar o atendimento.</span> : null}</div>}
        <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
          {catalogTab === "products" ? visibleProducts.map((product) => <div key={product.id} className="rounded-[9px] border border-border bg-background p-3"><button type="button" disabled={product.quantity <= 0} onClick={() => addProduct(product)} className="w-full text-left disabled:cursor-not-allowed disabled:opacity-50"><span className="grid size-9 place-items-center rounded-md border border-border bg-muted/40 text-muted-foreground"><LuPackage className="size-4" /></span><span className="mt-3 block line-clamp-2 min-h-8 text-[11px] font-semibold">{product.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{formatQuantity(product.quantity, product.unit)} disponíveis</span><span className="mt-2 block text-[11px] font-semibold tabular-nums">{formatMoney(product.sale_price_cents)} / {product.unit}</span></button>{product.packagings.length ? <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-2">{product.packagings.map((packaging) => { const available = Math.floor(product.quantity / packaging.base_quantity + 1e-9); return <Button key={packaging.id} type="button" variant="outline" size="sm" disabled={available <= 0} onClick={() => addPackagedProduct(product, packaging)} className="h-7 px-2 text-[9px]">{packaging.label} · {formatMoney(Math.round(product.sale_price_cents * packaging.base_quantity))}</Button>; })}</div> : null}</div>) : visibleServices.map((service) => <button key={service.id} type="button" onClick={() => addService(service)} className="rounded-[9px] border border-border bg-background p-3 text-left transition-colors hover:border-foreground/35 hover:bg-muted/20"><span className="grid size-9 place-items-center rounded-md border border-border bg-muted/40 text-muted-foreground"><LuShoppingBag className="size-4" /></span><span className="mt-3 block line-clamp-2 min-h-8 text-[11px] font-semibold">{service.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{service.duration_minutes} min</span><span className="mt-2 block text-[11px] font-semibold tabular-nums">{formatMoney(service.price_cents)}</span></button>)}
          {catalogTab === "products" && !visibleProducts.length ? <p className="col-span-full py-12 text-center text-[11px] text-muted-foreground">Nenhum produto corresponde à busca.</p> : null}
          {catalogTab === "services" && !visibleServices.length ? <p className="col-span-full py-12 text-center text-[11px] text-muted-foreground">Nenhum serviço cadastrado corresponde à busca.</p> : null}
        </div>
      </Card>
      <Card className="gap-0 overflow-hidden rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)] xl:sticky xl:top-[88px]">
        <div className="flex items-center justify-between border-b border-border px-4 py-4"><div><h2 className="text-[13px] font-semibold">Venda em andamento</h2><p className="mt-1 text-[10px] text-muted-foreground">{cart.length} {cart.length === 1 ? "item" : "itens"}</p></div><span className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground"><LuShoppingBag className="size-4" /></span></div>
        <div className="space-y-4 p-4">
          <div className="space-y-1.5"><Label htmlFor="sale-customer" className="text-[10px] text-muted-foreground">Cliente · opcional</Label><Select disabled={hasLinkedAppointment} value={customerId || "walk-in"} onValueChange={(value) => { const nextCustomerId = value === "walk-in" ? "" : value ?? ""; chooseCustomer(nextCustomerId); if (selectedAppointment && selectedAppointment.customer_id !== nextCustomerId) setAppointmentId(""); changed(); }}><SelectTrigger id="sale-customer" className="h-9 w-full text-[11px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="walk-in">Cliente avulso</SelectItem>{data.customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</SelectItem>)}</SelectContent></Select>{hasLinkedAppointment ? <p className="text-[9px] text-muted-foreground">Cliente vinculado ao atendimento; remova o serviço para alterar.</p> : null}</div>
          {delivery && customerAddresses.length ? <div className="space-y-1.5"><Label htmlFor="sale-saved-address" className="text-[10px] text-muted-foreground">Endereço salvo</Label><Select value={selectedAddressId || "custom"} onValueChange={(value) => { const selected = customerAddresses.find((item) => item.id === value); setSelectedAddressId(value === "custom" ? "" : value ?? ""); setAddress(selected ? { label: selected.label ?? "Entrega", street: selected.street, number: selected.number ?? "", complement: selected.complement ?? "", district: selected.district ?? "", city: selected.city, state: selected.state ?? "", postal_code: selected.postal_code ?? "", reference: selected.reference ?? "" } : emptyDeliveryAddress); changed(); }}><SelectTrigger id="sale-saved-address" className="h-8 w-full text-[10px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="custom">Outro endereço</SelectItem>{customerAddresses.map((item) => <SelectItem key={item.id} value={item.id}>{item.label || item.street} · {[item.city, item.state].filter(Boolean).join(" / ")}</SelectItem>)}</SelectContent></Select></div> : null}
          {cart.length ? <div className="max-h-[38dvh] space-y-3 overflow-y-auto pr-1">{cart.map((line) => <div key={line.key} className="border-b border-border pb-3 last:border-0"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-medium">{line.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatMoney(line.unitPriceCents)} / {line.unit}</p></div><Button variant="ghost" size="icon-xs" aria-label={`Remover ${line.name}`} onClick={() => changeQuantity(line, 0)}><LuTrash2 className="size-3.5" /></Button></div><div className="mt-2 flex items-center justify-between gap-3"><div className="flex items-center gap-1.5"><Button variant="outline" size="icon-xs" aria-label="Diminuir quantidade" onClick={() => changeQuantity(line, line.quantity - Math.pow(10, -line.precision))}><LuMinus className="size-3" /></Button><QuantityField key={`${line.key}-${line.quantity}`} line={line} onChange={(quantity) => changeQuantity(line, quantity)} /><Button variant="outline" size="icon-xs" aria-label="Aumentar quantidade" onClick={() => changeQuantity(line, line.quantity + Math.pow(10, -line.precision))}><LuPlus className="size-3" /></Button></div><span className="text-[11px] font-semibold tabular-nums">{formatMoney(Math.round(line.quantity * line.unitPriceCents))}</span></div></div>)}</div> : <div className="flex min-h-[170px] flex-col items-center justify-center text-center"><span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground"><LuShoppingBag className="size-4" /></span><p className="mt-3 text-[11px] font-medium">Sua venda começa aqui.</p><p className="mt-1 text-[10px] text-muted-foreground">Adicione produtos ou serviços.</p></div>}
          <div className="space-y-2 border-t border-dashed border-border pt-3 text-[11px]"><div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{formatMoney(subtotalCents)}</span></div><div className="flex items-center justify-between gap-3"><Label htmlFor="sale-discount" className="text-[10px] text-muted-foreground">Desconto</Label><Input id="sale-discount" inputMode="decimal" value={discount} onChange={(event) => { setDiscount(event.target.value); changed(); }} className="h-7 w-[110px] text-right text-[10px]" /></div>{delivery ? <div className="flex items-center justify-between gap-3"><Label htmlFor="sale-delivery-fee" className="text-[10px] text-muted-foreground">Taxa de entrega</Label><Input id="sale-delivery-fee" inputMode="decimal" value={deliveryFee} onChange={(event) => { setDeliveryFee(event.target.value); changed(); }} className="h-7 w-[110px] text-right text-[10px]" /></div> : null}<div className="flex justify-between border-t border-border pt-3 text-[14px] font-semibold"><span>Total</span><span className="tabular-nums">{formatMoney(Math.max(0, totalCents))}</span></div></div>
          <div className="space-y-3 rounded-md bg-muted/40 p-3"><div className="flex items-center gap-2"><Checkbox id="sale-delivery" checked={delivery} onCheckedChange={(checked) => { setDelivery(checked === true); changed(); }} /><Label htmlFor="sale-delivery" className="flex cursor-pointer items-center gap-2 text-[10px]"><LuTruck className="size-3.5" /> Registrar entrega</Label></div>{delivery ? <div className="grid grid-cols-2 gap-2"><div className="col-span-2 space-y-1"><Label htmlFor="delivery-street" className="text-[9px]">Rua e avenida</Label><Input id="delivery-street" value={address.street} onChange={(event) => { updateDeliveryAddress({ street: event.target.value }); }} className="h-8 text-[10px]" required /></div><div className="space-y-1"><Label htmlFor="delivery-number" className="text-[9px]">Número</Label><Input id="delivery-number" value={address.number} onChange={(event) => { updateDeliveryAddress({ number: event.target.value }); }} className="h-8 text-[10px]" /></div><div className="space-y-1"><Label htmlFor="delivery-district" className="text-[9px]">Bairro</Label><Input id="delivery-district" value={address.district} onChange={(event) => { updateDeliveryAddress({ district: event.target.value }); }} className="h-8 text-[10px]" /></div><div className="col-span-2 space-y-1"><Label htmlFor="delivery-city" className="text-[9px]">Cidade</Label><Input id="delivery-city" value={address.city} onChange={(event) => { updateDeliveryAddress({ city: event.target.value }); }} className="h-8 text-[10px]" required /></div><Textarea aria-label="Complemento e referência" placeholder="Complemento ou referência" value={[address.complement, address.reference].filter(Boolean).join(" · ")} onChange={(event) => { updateDeliveryAddress({ complement: event.target.value, reference: "" }); }} rows={2} className="col-span-2 min-h-16 text-[10px]" /></div> : null}</div>
          <Button className="h-10 w-full gap-2 text-[11px]" disabled={!cart.length || totalCents <= 0} onClick={openPayment}>Ir para pagamento <LuCreditCard className="size-4" /></Button>
          {message && !paymentOpen ? <p role="alert" className="text-[10px] text-destructive">{message}</p> : null}
          <p className="flex items-center justify-center gap-1.5 text-center text-[9px] text-muted-foreground"><LuBarcode className="size-3" /> Leitor USB: leia o código e pressione Enter</p>
        </div>
      </Card>
    </div>
    <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[520px]">
        {success ? <><DialogHeader><DialogTitle className="text-[17px]">Venda concluída</DialogTitle><DialogDescription className="text-[11px]">{success}</DialogDescription></DialogHeader><DialogFooter><Button onClick={() => { setPaymentOpen(false); router.push("/vendas"); }}>Voltar para vendas</Button></DialogFooter></> : <>
          <DialogHeader><DialogTitle className="text-[17px]">Pagamento</DialogTitle><DialogDescription className="text-[11px]">Total {formatMoney(Math.max(0, totalCents))}. Divida o valor entre formas de pagamento ou deixe saldo para receber.</DialogDescription></DialogHeader>
          <form onSubmit={submitPayment} className="space-y-4">
            <div className="space-y-3">{payments.map((payment, index) => <div key={payment.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"><div className="space-y-1"><Label className="text-[9px] text-muted-foreground">Forma {index + 1}</Label><Select value={payment.method} onValueChange={(value) => changePayment(payment.id, { method: (value as PaymentLine["method"]) ?? "pix", tendered: value === "cash" ? payment.amount : payment.tendered })}><SelectTrigger className="h-8 text-[10px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pix">Pix</SelectItem><SelectItem value="debit_card">Cartão de débito</SelectItem><SelectItem value="credit_card">Cartão de crédito</SelectItem><SelectItem value="cash">Dinheiro</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label className="text-[9px] text-muted-foreground">Valor</Label><Input inputMode="decimal" value={payment.amount} onChange={(event) => changePayment(payment.id, { amount: event.target.value, ...(payment.method === "cash" ? { tendered: event.target.value } : {}) })} className="h-8 text-[10px]" required /></div>{payment.method === "cash" ? <div className="space-y-1"><Label className="text-[9px] text-muted-foreground">Recebido</Label><Input inputMode="decimal" value={payment.tendered} onChange={(event) => changePayment(payment.id, { tendered: event.target.value })} className="h-8 text-[10px]" required /></div> : <div className="flex items-end pb-2 text-[9px] text-muted-foreground">{paymentNames[payment.method]}</div>}<Button type="button" variant="ghost" size="icon-sm" aria-label="Remover forma de pagamento" className="self-end" onClick={() => { changed(); setPayments((current) => current.filter((row) => row.id !== payment.id)); }}><LuMinus className="size-3.5" /></Button></div>)}</div>
            <Button type="button" variant="outline" className="h-8 gap-1.5 px-2.5 text-[10px]" onClick={addPayment}><LuPlus className="size-3.5" /> Adicionar forma de pagamento</Button>
            {remainingCents > 0 ? <div className="space-y-2 rounded-md bg-muted/40 p-3"><div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">A receber</span><span className="font-semibold tabular-nums">{formatMoney(remainingCents)}</span></div><div className="space-y-1"><Label htmlFor="sale-due-date" className="text-[10px]">Vencimento</Label><Input id="sale-due-date" type="date" min={localDateKey(new Date(), timezone)} value={dueOn} onChange={(event) => { setDueOn(event.target.value); changed(); }} required className="h-8 text-[10px]" /></div></div> : null}
            {remainingCents < 0 ? <p role="alert" className="text-[10px] text-destructive">A soma dos pagamentos excede o total em {formatMoney(Math.abs(remainingCents))}.</p> : null}
            {payments.some((payment) => payment.method === "cash") && !data.cashSessionId ? <p role="alert" className="text-[10px] text-destructive">O caixa precisa estar aberto para receber dinheiro. Pix e cartão continuam disponíveis.</p> : null}
            {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>Voltar</Button><Button type="submit" disabled={pending || !cart.length || remainingCents < 0 || (payments.some((payment) => payment.method === "cash") && !data.cashSessionId)}>{pending ? "Concluindo..." : "Concluir venda"}</Button></DialogFooter>
          </form>
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}

function QuantityField({ line, onChange }: { line: CartLine; onChange: (quantity: number) => void }) {
  const [value, setValue] = useState(String(line.quantity));

  function commit() {
    const quantity = parseQuantity(value);
    if (quantity === null || quantity <= 0) setValue(String(line.quantity));
    else onChange(quantity);
  }

  return <Input aria-label={`Quantidade de ${line.name}`} type="text" inputMode="decimal" min="0" max={line.available ?? undefined} value={value} onChange={(event) => setValue(event.target.value)} onBlur={commit} className="h-7 w-[72px] text-center text-[10px] tabular-nums" />;
}
