import type { NextFunction, Request, Response } from 'express';
import { HttpStatus } from '../types/api.types.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/response.js';
import { createBlogPostSchema, updateBlogPostSchema } from '../validators/blog.validator.js';
import { createManagedBlogPost, getAllManagedBlogPosts, getManagedBlogPostById, getPublishedBlogPost, getPublishedBlogPosts, removeManagedBlogPost, updateManagedBlogPost } from '../services/blog.service.js';

export async function listBlogPosts(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, 'Blog posts retrieved', await getPublishedBlogPosts()); } catch (error) { next(error); }
}
export async function getBlogPost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, 'Blog post retrieved', await getPublishedBlogPost(req.params['slug'] as string)); } catch (error) { next(error); }
}
export async function listAdminBlogPosts(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, 'Blog posts retrieved', await getAllManagedBlogPosts()); } catch (error) { next(error); }
}
export async function getAdminBlogPostById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, 'Blog post retrieved', await getManagedBlogPostById(req.params['id'] as string)); } catch (error) { next(error); }
}
export async function createAdminBlogPost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createBlogPostSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    sendSuccess(res, 'Blog post created', await createManagedBlogPost(parsed.data), HttpStatus.CREATED);
  } catch (error) { next(error); }
}
export async function updateAdminBlogPost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateBlogPostSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    sendSuccess(res, 'Blog post updated', await updateManagedBlogPost(req.params['id'] as string, parsed.data));
  } catch (error) { next(error); }
}
export async function deleteAdminBlogPost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { await removeManagedBlogPost(req.params['id'] as string); sendSuccess(res, 'Blog post deleted'); } catch (error) { next(error); }
}
