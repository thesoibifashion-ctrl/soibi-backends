import { z } from 'zod';

const email = z.string().trim().email('email must be a valid email address').max(255);

export const requestCodeSchema = z.object({ email });
export const verifyCodeSchema = z.object({
  email,
  code: z.string().regex(/^\d{6}$/, 'code must be a six-digit number'),
});
