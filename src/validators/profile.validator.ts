import { z } from 'zod';

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, 'fullName must not be empty').max(255).optional(),
  phone: z.string().trim().min(1, 'phone must not be empty').max(50).nullable().optional(),
  preferredContactMethod: z.enum(['email', 'whatsapp'], {
    error: "preferredContactMethod must be 'email' or 'whatsapp'",
  }).optional(),
  country: z.string().trim().min(1).max(100).nullable().optional(),
  state: z.string().trim().min(1).max(100).nullable().optional(),
  city: z.string().trim().min(1).max(100).nullable().optional(),
  address: z.string().trim().min(1).max(2000).nullable().optional(),
}).strict().refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  'At least one profile field must be provided',
);

export const createMobileUploadSessionSchema = z.object({
  sessionId: z.string().trim().min(1, 'sessionId is required').max(255),
});

export const uploadMobileReceiptSchema = z.object({
  receiptUrl: z.string().trim().url('receiptUrl must be a valid URL'),
  receiptPublicId: z.string().trim().min(1, 'receiptPublicId is required').max(255),
});
