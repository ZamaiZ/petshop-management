import { randomUUID } from "node:crypto";

type ErrorShape = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  constraint?: unknown;
  name?: unknown;
};

const safeIdentifiers = [
  "invalid_idempotency_request",
  "idempotency_payload_mismatch",
  "idempotency_state_invalid",
  "invalid_sale",
  "invalid_delivery",
  "invalid_quantity",
  "invalid_item",
  "invalid_packaging_quantity",
  "invalid_quantity_precision",
  "appointment_sale_mismatch",
  "appointment_quantity_must_be_one",
  "appointment_already_billed",
  "insufficient_stock",
  "insufficient_lot_stock",
  "expired_lot",
  "invalid_discount",
  "invalid_payment",
  "invalid_tender",
  "insufficient_change_fund",
  "payment_above_total",
  "customer_required_for_credit",
  "cash_session_not_open",
  "appointment_conflict",
  "pet_customer_mismatch",
  "invalid_appointment_transition",
  "version_conflict",
  "appointment_not_reschedulable",
  "reason_required",
  "invalid_appointment_slot",
  "customer_not_found",
  "pet_not_found",
  "appointments_no_overlap",
] as const;

function safeIdentifier(error: ErrorShape) {
  const raw = [error.constraint, error.message, error.details].filter((value): value is string => typeof value === "string").join(" ");
  return safeIdentifiers.find((identifier) => raw.includes(identifier)) ?? null;
}

function safeConstraint(error: ErrorShape) {
  const direct = typeof error.constraint === "string" ? error.constraint : "";
  const raw = [error.message, error.details].filter((value): value is string => typeof value === "string").join(" ");
  const extracted = direct || raw.match(/constraint\s+["']([A-Za-z][A-Za-z0-9_]{0,99})["']/i)?.[1] || "";
  return /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(extracted) ? extracted : null;
}

function safeAmbiguousColumn(error: ErrorShape) {
  const message = typeof error.message === "string" ? error.message : "";
  const column = message.match(/column reference\s+["']([A-Za-z][A-Za-z0-9_]{0,99})["']\s+is ambiguous/i)?.[1] ?? "";
  return /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(column) ? column : null;
}

export function logServerActionError(action: string, stage: string, error: unknown) {
  const reference = randomUUID();
  const shape = error && typeof error === "object" ? error as ErrorShape : {};
  const code = typeof shape.code === "string" && /^[0-9A-Z]{2,12}$/.test(shape.code) ? shape.code : null;
  const name = typeof shape.name === "string" && /^[A-Za-z][A-Za-z0-9]{0,50}$/.test(shape.name) ? shape.name : null;

  console.error(JSON.stringify({
    event: "server_action_error",
    reference,
    action,
    stage,
    code,
    identifier: safeIdentifier(shape),
    constraint: safeConstraint(shape),
    ambiguousColumn: safeAmbiguousColumn(shape),
    errorType: name,
  }));

  return reference;
}
