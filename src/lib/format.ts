const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numberFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export function formatMoney(cents: number) {
  return moneyFormatter.format(cents / 100);
}

export function formatMoneyInput(cents: number) {
  const value = Math.trunc(cents);
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const reais = String(Math.floor(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${reais},${String(absolute % 100).padStart(2, "0")}`;
}

export function formatQuantity(value: number, unit?: string) {
  const quantity = numberFormatter.format(value);
  return unit ? `${quantity} ${unit}` : quantity;
}

export function formatShortDate(value: string, timeZone = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone }).format(new Date(value));
}

export function formatCivilDate(value: string, timeZone = "America/Sao_Paulo") {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone }).format(date);
}

export function localDateKey(date = new Date(), timeZone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatTime(value: string, timeZone = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(value));
}
