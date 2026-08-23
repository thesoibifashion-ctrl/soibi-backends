import { z } from 'zod';

const email = z.string().trim().email('email must be a valid email address').max(255);
const password = z.string().min(12, 'password must be at least 12 characters').max(128);

export const registerSchema = z.object({
  email,
  password,
  fullName: z.string().trim().min(1, 'fullName is required').max(255),
});

export const loginSchema = z.object({ email, password });
