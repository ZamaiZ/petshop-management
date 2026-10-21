"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { LuBarcode, LuCreditCard, LuMinus, LuPackage, LuPlus, LuSearch, LuShoppingBag, LuTrash2, LuTruck } from "react-icons/lu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CepLookupField, type CepAddress } from "@/components/ui/cep-lookup-field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { BrlInput } from "@/components/ui/brl-input";
import { Label } from "@/components/ui/label";
import { ComboboxField } from "@/components/ui/combobox-field";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatMoneyInput, formatQuantity, formatShortDate } from "@/lib/format";
import { formatBrazilianPhone } from "@/lib/phone";
import { localDateKey } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/inputs";
import { parseQuantityForUnit } from "@/lib/business-rules";
import { completeSale } from "../actions";
import type { getSaleComposerData } from "../queries";

export type ComposerData = NonNullable<Awaited<ReturnType<typeof getSaleComposerData>>["data"]>;
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
  return formatMoneyInput(cents);
}

function readMoney(value: string) {
  const parsed = parseMoneyToCents(value || "0");
  return parsed === null ? null : parsed;
}

export function SaleComposer({ data, timezone, initialDelivery = false, onCompleted }: { data: ComposerData; timezone: string; initialDelivery?: boolean; onCompleted: (saleId: string) => void }) {
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

  function applyCepAddress(found: CepAddress, previous: CepAddress | null) {
    setSelectedAddressId("");
    setAddress((current) => ({
      ...current,
      street: !current.street.trim() || (previous && current.street.trim() === previous.street.trim()) ? found.street : current.street,
      district: !current.district.trim() || (previous && current.district.trim() === previous.district.trim()) ? found.district : current.district,
      city: !current.city.trim() || (previous && current.city.trim() === previous.city.trim()) ? found.city : current.city,
      state: !current.state.trim() || (previous && current.state.trim() === previous.state.trim()) ? found.state : current.state,
    }));
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
      setCart([]);
      setPaymentOpen(false);
      onCompleted(result.saleId);
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

  return <div className="space-y-5 pb-24 xl:pb-0">
    <div><h1 className="text-[24px] font-semibold tracking-[-0.04em]">Nova venda</h1><p className="mt-1.5 text-[12px] text-muted-foreground">Busque, leia o código de barras ou escolha um produto.</p></div>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="gap-0 overflow-hidden rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row"><div className="relative min-w-0 flex-1"><LuSearch className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={handleScannerKey} placeholder="Nome ou código de barras..." aria-label="Buscar produto ou código de barras" className="h-9 pl-9 text-[11px]" /></div><Button variant={scannerMode ? "default" : "outline"} className="h-9 gap-2 px-3 text-[11px]" onClick={() => { setScannerMode((active) => !active); searchRef.current?.focus(); }}><LuBarcode className="size-4" /> Leitor</Button></div>
        <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3">{(["products", "services"] as const).map((tab) => <Button key={tab} size="sm" variant={catalogTab === tab ? "default" : "outline"} className="h-8 shrink-0 px-3 text-[10px]" onClick={() => setCatalogTab(tab)}>{tab === "products" ? "Produtos" : "Serviços"}</Button>)}</div>
        {catalogTab === "products" ? <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3"><Button size="sm" variant={categoryId === "all" ? "default" : "outline"} className="h-8 shrink-0 px-3 text-[10px]" onClick={() => setCategoryId("all")}>Todos</Button>{data.categories.map((category) => <Button key={category.id} size="sm" variant={categoryId === category.id ? "default" : "outline"} className="h-8 shrink-0 px-3 text-[10px]" onClick={() => setCategoryId(category.id)}>{category.name}</Button>)}</div> : <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center"><Label htmlFor="appointment-link" className="shrink-0 text-xs font-medium">Vincular atendimento concluído (opcional)</Label><ComboboxField id="appointment-link" disabled={hasLinkedAppointment} value={appointmentId || "none"} onValueChange={(value) => { setAppointmentId(value === "none" ? "" : value); const appointment = data.appointments.find((item) => item.id === value); if (appointment) chooseCustomer(appointment.customer_id); changed(); }} options={[{ value: "none", label: "Sem atendimento vinculado" }, ...data.appointments.map((appointment) => ({ value: appointment.id, label: `${appointment.pet} · ${data.customers.find((customer) => customer.id === appointment.customer_id)?.name ?? "Cliente"} · ${formatShortDate(appointment.starts_at, timezone)}` }))]} placeholder="Sem atendimento vinculado" className="h-9 max-w-[320px]" inputClassName="text-xs" /><span className="text-xs text-muted-foreground">Vincule um serviço já concluído para registrar a venda junto ao atendimento.</span>{hasLinkedAppointment ? <span className="text-xs text-muted-foreground">Remova o serviço vinculado para trocar o atendimento.</span> : null}</div>}
        <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
          {catalogTab === "products" ? visibleProducts.map((product) => <div key={product.id} className="rounded-[9px] border border-border bg-background p-3"><button type="button" disabled={product.quantity <= 0} onClick={() => addProduct(product)} className="w-full text-left disabled:cursor-not-allowed disabled:opacity-50"><span className="grid size-9 place-items-center rounded-md border border-border bg-muted/40 text-muted-foreground"><LuPackage className="size-4" /></span><span className="mt-3 block line-clamp-2 min-h-8 text-[11px] font-semibold">{product.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{formatQuantity(product.quantity, product.unit)} disponíveis</span><span className="mt-2 block text-[11px] font-semibold tabular-nums">{formatMoney(product.sale_price_cents)} / {product.unit}</span></button>{product.packagings.length ? <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-2">{product.packagings.map((packaging) => { const available = Math.floor(product.quantity / packaging.base_quantity + 1e-9); return <Button key={packaging.id} type="button" variant="outline" size="sm" disabled={available <= 0} onClick={() => addPackagedProduct(product, packaging)} className="h-7 px-2 text-[9px]">{packaging.label} · {formatMoney(Math.round(product.sale_price_cents * packaging.base_quantity))}</Button>; })}</div> : null}</div>) : visibleServices.map((service) => <button key={service.id} type="button" onClick={() => addService(service)} className="rounded-[9px] border border-border bg-background p-3 text-left transition-colors hover:border-foreground/35 hover:bg-muted/20"><span className="grid size-9 place-items-center rounded-md border border-border bg-muted/40 text-muted-foreground"><LuShoppingBag className="size-4" /></span><span className="mt-3 block line-clamp-2 min-h-8 text-[11px] font-semibold">{service.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{service.duration_minutes} min</span><span className="mt-2 block text-[11px] font-semibold tabular-nums">{formatMoney(service.price_cents)}</span></button>)}
          {catalogTab === "products" && !visibleProducts.length ? <p className="col-span-full py-12 text-center text-[11px] text-muted-foreground">Nenhum produto corresponde à busca.</p> : null}
          {catalogTab === "services" && !visibleServices.length ? <p className="col-span-full py-12 text-center text-[11px] text-muted-foreground">Nenhum serviço cadastrado corresponde à busca.</p> : null}
        </div>
      </Card>
      <Card className="order-2 gap-0 overflow-hidden rounded-[10px] border-border/90 p-0 shadow-[0_1px_2px_rgba(16,24,40,0.03)] xl:order-2 xl:sticky xl:top-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-4"><div><h2 className="text-[13px] font-semibold">Venda em andamento</h2><p className="mt-1 text-[10px] text-muted-foreground">{cart.length} {cart.length === 1 ? "item" : "itens"}</p></div><span className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground"><LuShoppingBag className="size-4" /></span></div>
        <div className="space-y-4 p-4">
          <div className="space-y-1.5"><Label htmlFor="sale-customer" className="text-[10px] text-muted-foreground">Cliente · opcional</Label><ComboboxField id="sale-customer" disabled={hasLinkedAppointment} value={customerId || "walk-in"} onValueChange={(value) => { const nextCustomerId = value === "walk-in" ? "" : value; chooseCustomer(nextCustomerId); if (selectedAppointment && selectedAppointment.customer_id !== nextCustomerId) setAppointmentId(""); changed(); }} options={[{ value: "walk-in", label: "Cliente avulso" }, ...data.customers.map((customer) => ({ value: customer.id, label: `${customer.name}${customer.phone ? ` · ${formatBrazilianPhone(customer.phone)}` : ""}` }))]} className="h-9" inputClassName="text-[11px]" />{hasLinkedAppointment ? <p className="text-[9px] text-muted-foreground">Cliente vinculado ao atendimento; remova o serviço para alterar.</p> : null}</div>
          {delivery && customerAddresses.length ? <div className="space-y-1.5"><Label htmlFor="sale-saved-address" className="text-xs">Endereço salvo</Label><ComboboxField id="sale-saved-address" value={selectedAddressId || "custom"} onValueChange={(value) => { const selected = customerAddresses.find((item) => item.id === value); setSelectedAddressId(value === "custom" ? "" : value); setAddress(selected ? { label: selected.label ?? "Entrega", street: selected.street, number: selected.number ?? "", complement: selected.complement ?? "", district: selected.district ?? "", city: selected.city, state: selected.state ?? "", postal_code: selected.postal_code?.replace(/\D/g, "").slice(0, 8) ?? "", reference: selected.reference ?? "" } : emptyDeliveryAddress); changed(); }} options={[{ value: "custom", label: "Outro endereço" }, ...customerAddresses.map((item) => ({ value: item.id, label: `${item.label || item.street} · ${[item.city, item.state].filter(Boolean).join(" / ")}` }))]} className="h-9" inputClassName="text-xs" /></div> : null}
          {cart.length ? <div className="max-h-[38dvh] space-y-3 overflow-y-auto pr-1">{cart.map((line) => <div key={line.key} className="border-b border-border pb-3 last:border-0"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-medium">{line.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatMoney(line.unitPriceCents)} / {line.unit}</p></div><Button variant="ghost" size="icon-xs" aria-label={`Remover ${line.name}`} onClick={() => changeQuantity(line, 0)}><LuTrash2 className="size-3.5" /></Button></div><div className="mt-2 flex items-center justify-between gap-3"><div className="flex items-center gap-1.5"><Button variant="outline" size="icon-xs" aria-label="Diminuir quantidade" onClick={() => changeQuantity(line, line.quantity - Math.pow(10, -line.precision))}><LuMinus className="size-3" /></Button><QuantityField key={`${line.key}-${line.quantity}`} line={line} onChange={(quantity) => changeQuantity(line, quantity)} /><Button variant="outline" size="icon-xs" aria-label="Aumentar quantidade" onClick={() => changeQuantity(line, line.quantity + Math.pow(10, -line.precision))}><LuPlus className="size-3" /></Button></div><span className="text-[11px] font-semibold tabular-nums">{formatMoney(Math.round(line.quantity * line.unitPriceCents))}</span></div></div>)}</div> : <div className="flex min-h-[170px] flex-col items-center justify-center text-center"><span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground"><LuShoppingBag className="size-4" /></span><p className="mt-3 text-[11px] font-medium">Sua venda começa aqui.</p><p className="mt-1 text-[10px] text-muted-foreground">Adicione produtos ou serviços.</p></div>}
          <div className="space-y-2 border-t border-dashed border-border pt-3 text-[11px]"><div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{formatMoney(subtotalCents)}</span></div><div className="flex items-center justify-between gap-3"><Label htmlFor="sale-discount" className="text-[10px] text-muted-foreground">Desconto</Label><BrlInput id="sale-discount" value={discount} onValueChange={(value) => { setDiscount(value); changed(); }} className="h-7 w-[110px] text-right text-[10px]" /></div>{delivery ? <div className="flex items-center justify-between gap-3"><Label htmlFor="sale-delivery-fee" className="text-[10px] text-muted-foreground">Valor da entrega (R$)</Label><BrlInput id="sale-delivery-fee" value={deliveryFee} onValueChange={(value) => { setDeliveryFee(value); changed(); }} className="h-8 w-[120px] text-right text-[11px]" /></div> : null}<div className="flex justify-between border-t border-border pt-3 text-[14px] font-semibold"><span>Total</span><span className="tabular-nums">{formatMoney(Math.max(0, totalCents))}</span></div></div>
          <div className="space-y-3 rounded-md bg-muted/40 p-3">
            <div className="flex items-center gap-2"><Checkbox id="sale-delivery" checked={delivery} onCheckedChange={(checked) => { setDelivery(checked === true); changed(); }} /><Label htmlFor="sale-delivery" className="flex cursor-pointer items-center gap-2 text-xs font-medium"><LuTruck className="size-4" aria-hidden="true" />Registrar entrega</Label></div>
            {delivery ? <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5"><Label htmlFor="delivery-postal-code">CEP</Label><CepLookupField id="delivery-postal-code" value={address.postal_code} onValueChange={(postal_code) => updateDeliveryAddress({ postal_code })} onAddressFound={applyCepAddress} /></div>
              <div className="col-span-2 space-y-1.5"><Label htmlFor="delivery-street">Logradouro</Label><Input id="delivery-street" value={address.street} onChange={(event) => updateDeliveryAddress({ street: event.currentTarget.value })} className="h-10" required /></div>
              <div className="space-y-1.5"><Label htmlFor="delivery-number">Número</Label><Input id="delivery-number" value={address.number} onChange={(event) => updateDeliveryAddress({ number: event.currentTarget.value })} className="h-10" /></div>
              <div className="space-y-1.5"><Label htmlFor="delivery-complement">Complemento (opcional)</Label><Input id="delivery-complement" value={address.complement} onChange={(event) => updateDeliveryAddress({ complement: event.currentTarget.value })} className="h-10" /></div>
              <div className="space-y-1.5"><Label htmlFor="delivery-district">Bairro</Label><Input id="delivery-district" value={address.district} onChange={(event) => updateDeliveryAddress({ district: event.currentTarget.value })} className="h-10" /></div>
              <div className="space-y-1.5"><Label htmlFor="delivery-city">Cidade</Label><Input id="delivery-city" value={address.city} onChange={(event) => updateDeliveryAddress({ city: event.currentTarget.value })} className="h-10" required /></div>
              <div className="space-y-1.5"><Label htmlFor="delivery-state">UF</Label><Input id="delivery-state" value={address.state} onChange={(event) => updateDeliveryAddress({ state: event.currentTarget.value.toUpperCase().slice(0, 2) })} maxLength={2} className="h-10" /></div>
              <div className="col-span-2 space-y-1.5"><Label htmlFor="delivery-reference">Observação ou referência</Label><Textarea id="delivery-reference" value={address.reference} onChange={(event) => updateDeliveryAddress({ reference: event.currentTarget.value })} rows={2} maxLength={200} className="min-h-16" /></div>
            </div> : null}
          </div>
          <Button className="hidden h-10 w-full gap-2 text-[11px] xl:flex" disabled={!cart.length || totalCents <= 0} onClick={openPayment}>Ir para pagamento <LuCreditCard className="size-4" /></Button>
          {message && !paymentOpen ? <p role="alert" className="text-[10px] text-destructive">{message}</p> : null}
          <p className="flex items-center justify-center gap-1.5 text-center text-[9px] text-muted-foreground"><LuBarcode className="size-3" /> Leitor USB: leia o código e pressione Enter</p>
        </div>
      </Card>
    </div>
    <div className="fixed inset-x-4 bottom-3 z-40 rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur xl:hidden sm:inset-x-8">
      <div className="mb-2 flex items-center justify-between text-[11px]"><span className="text-muted-foreground">{cart.length} {cart.length === 1 ? "item" : "itens"}</span><span className="font-semibold tabular-nums">Total {formatMoney(Math.max(0, totalCents))}</span></div>
      <Button className="h-10 w-full gap-2 text-[11px]" disabled={!cart.length || totalCents <= 0} onClick={openPayment}>Ir para pagamento <LuCreditCard className="size-4" /></Button>
    </div>
    <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[520px]">
          <DialogHeader><DialogTitle className="text-[17px]">Pagamento</DialogTitle><DialogDescription className="text-[11px]">Total {formatMoney(Math.max(0, totalCents))}. Divida o valor entre formas de pagamento ou deixe saldo para receber.</DialogDescription></DialogHeader>
          <form onSubmit={submitPayment} className="space-y-4">
            <div className="space-y-3">{payments.map((payment, index) => <div key={payment.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"><div className="space-y-1"><Label className="text-[9px] text-muted-foreground">Forma {index + 1}</Label><ComboboxField value={payment.method} onValueChange={(value) => changePayment(payment.id, { method: value as PaymentLine["method"], tendered: value === "cash" ? payment.amount : payment.tendered })} options={[{ value: "pix", label: "Pix" }, { value: "debit_card", label: "Cartão de débito" }, { value: "credit_card", label: "Cartão de crédito" }, { value: "cash", label: "Dinheiro" }]} className="h-8" inputClassName="text-[10px]" /></div><div className="space-y-1"><Label className="text-[9px] text-muted-foreground">Valor</Label><BrlInput value={payment.amount} onValueChange={(value) => changePayment(payment.id, { amount: value, ...(payment.method === "cash" ? { tendered: value } : {}) })} className="h-8 text-[10px]" required /></div>{payment.method === "cash" ? <div className="space-y-1"><Label className="text-[9px] text-muted-foreground">Recebido</Label><BrlInput value={payment.tendered} onValueChange={(value) => changePayment(payment.id, { tendered: value })} className="h-8 text-[10px]" required /></div> : <div className="flex items-end pb-2 text-[9px] text-muted-foreground">{paymentNames[payment.method]}</div>}<Button type="button" variant="ghost" size="icon-sm" aria-label="Remover forma de pagamento" className="self-end" onClick={() => { changed(); setPayments((current) => current.filter((row) => row.id !== payment.id)); }}><LuMinus className="size-3.5" /></Button></div>)}</div>
            <Button type="button" variant="outline" className="h-8 gap-1.5 px-2.5 text-[10px]" onClick={addPayment}><LuPlus className="size-3.5" /> Adicionar forma de pagamento</Button>
            {remainingCents > 0 ? <div className="space-y-2 rounded-md bg-muted/40 p-3"><div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">A receber</span><span className="font-semibold tabular-nums">{formatMoney(remainingCents)}</span></div><div className="space-y-1"><Label htmlFor="sale-due-date" className="text-[10px]">Vencimento</Label><DatePickerField id="sale-due-date" value={dueOn} onValueChange={(value) => { setDueOn(value); changed(); }} min={localDateKey(new Date(), timezone)} required className="h-8 text-[10px]" /></div></div> : null}
            {remainingCents < 0 ? <p role="alert" className="text-[10px] text-destructive">A soma dos pagamentos excede o total em {formatMoney(Math.abs(remainingCents))}.</p> : null}
            {payments.some((payment) => payment.method === "cash") && !data.cashSessionId ? <p role="alert" className="text-[10px] text-destructive">O caixa precisa estar aberto para receber dinheiro. Pix e cartão continuam disponíveis.</p> : null}
            {message ? <p role="alert" className="text-[11px] text-destructive">{message}</p> : null}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>Voltar</Button><Button type="submit" disabled={pending || !cart.length || remainingCents < 0 || (payments.some((payment) => payment.method === "cash") && !data.cashSessionId)}>{pending ? "Concluindo..." : "Concluir venda"}</Button></DialogFooter>
          </form>
      </DialogContent>
    </Dialog>
  </div>;
}

function QuantityField({ line, onChange }: { line: CartLine; onChange: (quantity: number) => void }) {
  const [value, setValue] = useState(String(line.quantity));

  function commit() {
    const quantity = parseQuantityForUnit(value, line.precision > 0 ? "kg" : "un");
    if (quantity === null || quantity <= 0) setValue(String(line.quantity));
    else onChange(quantity);
  }

  return <Input aria-label={`Quantidade de ${line.name}`} type="text" inputMode="decimal" min="0" max={line.available ?? undefined} value={value} onChange={(event) => setValue(event.target.value)} onBlur={commit} className="h-7 w-[72px] text-center text-[10px] tabular-nums" />;
}
