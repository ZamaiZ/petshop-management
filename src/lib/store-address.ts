import { z } from "zod";

export const storeAddressSchema = z.object({
  postal_code: z.string().trim().regex(/^(?:\d{8})?$/),
  street: z.string().trim().max(200),
  number: z.string().trim().max(40),
  complement: z.string().trim().max(120),
  district: z.string().trim().max(120),
  city: z.string().trim().max(100),
  state: z.string().trim().regex(/^[A-Za-z]{0,2}$/).transform((value) => value.toUpperCase()),
  reference: z.string().trim().max(200),
});

export const requiredStoreAddressSchema = storeAddressSchema.extend({
  postal_code: z.string().trim().regex(/^\d{8}$/),
  street: z.string().trim().min(1).max(200),
  number: z.string().trim().min(1).max(40),
  district: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
});
