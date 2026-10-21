export function parseMoneyToCents(value: string) {
  const normalized = value.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!normalized) return null;

  const decimal = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized;
  if (!/^\d+(?:\.\d{1,2})?$/.test(decimal)) return null;
  const amount = Number(decimal);
  if (!Number.isFinite(amount) || amount > Number.MAX_SAFE_INTEGER / 100) return null;
  return Math.round(amount * 100);
}

export function parseQuantity(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^(?:\d+)(?:\.\d{1,3})?$/.test(normalized)) return null;
  const quantity = Number(normalized);
  return Number.isFinite(quantity) ? quantity : null;
}
