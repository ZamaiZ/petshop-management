export function normalizeCnpj(value: string) {
  const characters = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = characters.slice(0, 12);
  const digits = characters.slice(12).replace(/\D/g, "").slice(0, 2);
  return body + digits;
}

export function formatCnpj(value: string) {
  const normalized = normalizeCnpj(value);
  let formatted = normalized.slice(0, 2);
  if (normalized.length > 2) formatted += `.${normalized.slice(2, 5)}`;
  if (normalized.length > 5) formatted += `.${normalized.slice(5, 8)}`;
  if (normalized.length > 8) formatted += `/${normalized.slice(8, 12)}`;
  if (normalized.length > 12) formatted += `-${normalized.slice(12, 14)}`;
  return formatted;
}

function cnpjDigit(value: string, weights: number[]) {
  const sum = [...value].reduce((total, character, index) => total + (character.charCodeAt(0) - 48) * weights[index], 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value: string) {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || new Set(cnpj).size === 1) return false;

  const first = cnpjDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = cnpjDigit(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${first}${second}`);
}
