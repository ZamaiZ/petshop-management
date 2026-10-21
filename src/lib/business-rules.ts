export const BUSINESS_TIME_ZONE = "America/Sao_Paulo" as const;

export function quantityPrecision(unit: string) {
  return unit === "kg" || unit === "L" ? 3 : 0;
}

export function hasValidQuantityPrecision(value: number | string, unit: string) {
  const precision = quantityPrecision(unit);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return false;
    const scaled = value * 10 ** precision;
    return Math.abs(scaled - Math.round(scaled)) <= Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
  }
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) return false;
  const fractionDigits = normalized.split(".")[1]?.length ?? 0;
  return fractionDigits <= precision;
}

export function parseQuantityForUnit(value: string, unit: string) {
  const normalized = value.trim().replace(",", ".");
  if (!hasValidQuantityPrecision(normalized, unit)) return null;
  const quantity = Number(normalized);
  return Number.isFinite(quantity) ? quantity : null;
}
