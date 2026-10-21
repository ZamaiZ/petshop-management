export function normalizeBrazilianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits;
}

export function formatBrazilianPhone(value: string | null | undefined) {
  const digits = normalizeBrazilianPhone(value ?? "");
  if (!digits) return "";
  if (digits.length > 11) return digits;
  if (digits.length <= 2) return `(${digits}`;

  const area = digits.slice(0, 2);
  const number = digits.slice(2);
  const splitAt = digits.length === 11 || (digits.length < 10 && number.startsWith("9")) ? 5 : 4;
  const formattedNumber = number.length > splitAt
    ? `${number.slice(0, splitAt)}-${number.slice(splitAt)}`
    : number;
  return `(${area}) ${formattedNumber}`;
}
