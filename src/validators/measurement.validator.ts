import { z } from 'zod';

const measurementId = z.string().uuid('measurementId must be a valid UUID');

export const createMeasurementSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(255),
  imageUrl: z.string().trim().url('imageUrl must be a valid URL'),
});

export const updateMeasurementSchema = createMeasurementSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  'At least one measurement field is required',
);

export const productMeasurementAssignmentSchema = z.object({
  measurementId,
  value: z.string().trim().min(1, 'value is required').max(1_000),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateProductMeasurementSchema = z.object({
  value: z.string().trim().min(1, 'value must not be empty').max(1_000).optional(),
  sortOrder: z.number().int().min(0).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  'At least one product measurement field is required',
);
