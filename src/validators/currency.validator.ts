import { z } from 'zod';
const fields = { code: z.string().trim().regex(/^[A-Za-z]{3}$/, 'code must be a three-letter ISO-style code').transform((value) => value.toUpperCase()), name: z.string().trim().min(1).max(255), symbol: z.string().trim().min(1).max(20), isActive: z.boolean().optional() };
export const createCurrencySchema = z.object({ ...fields, isDefault: z.boolean().optional() });
export const updateCurrencySchema = z.object(fields).partial().refine((data) => Object.keys(data).length > 0, 'At least one currency field is required');
