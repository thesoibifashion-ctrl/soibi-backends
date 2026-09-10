import { z } from 'zod';

const fields = {
  title: z.string().trim().min(1, 'title is required').max(255),
  slug: z.string().trim().min(1, 'slug is required').max(255),
  excerpt: z.string().trim().max(10_000).nullable().optional(),
  content: z.string().trim().min(1, 'content is required'),
  coverImageUrl: z.string().url('coverImageUrl must be a valid URL').nullable().optional(),
  status: z.enum(['draft', 'published']).optional(),
  publishedAt: z.string().datetime('publishedAt must be an ISO date-time').nullable().optional(),
};

export const createBlogPostSchema = z.object(fields);
export const updateBlogPostSchema = z.object(fields).partial().refine(
  (data) => Object.keys(data).length > 0,
  'At least one blog field is required',
);
