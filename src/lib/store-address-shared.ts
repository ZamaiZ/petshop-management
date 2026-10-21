export const STORE_ADDRESS_FIELDS = [
  "postal_code",
  "street",
  "number",
  "complement",
  "district",
  "city",
  "state",
  "reference",
] as const;

export type StoreAddressField = (typeof STORE_ADDRESS_FIELDS)[number];
export type StoreAddress = Record<StoreAddressField, string>;

export function readStoreAddress(value: unknown): StoreAddress {
  const address = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(STORE_ADDRESS_FIELDS.map((field) => [
    field,
    field === "postal_code"
      ? (typeof address[field] === "string" ? address[field].replace(/\D/g, "").slice(0, 8) : "")
      : (typeof address[field] === "string" ? address[field] : ""),
  ])) as StoreAddress;
}
