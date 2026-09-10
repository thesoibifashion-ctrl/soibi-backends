import { AppError } from '../utils/AppError.js';
import {
  createBlogPost, deleteBlogPostById, findAllBlogPosts, findPublishedBlogPostBySlug, findPublishedBlogPosts, updateBlogPost,
} from '../repositories/blog.repository.js';
import type { BlogPost, CreateBlogPostInput, UpdateBlogPostInput } from '../types/blog.types.js';

export const getPublishedBlogPosts = (): Promise<BlogPost[]> => findPublishedBlogPosts();
export async function getPublishedBlogPost(slug: string): Promise<BlogPost> {
  const post = await findPublishedBlogPostBySlug(slug);
  if (!post) throw AppError.notFound('Blog post not found');
  return post;
}
export const getAllManagedBlogPosts = (): Promise<BlogPost[]> => findAllBlogPosts();
export const createManagedBlogPost = (input: CreateBlogPostInput): Promise<BlogPost> => createBlogPost(input);
export async function updateManagedBlogPost(id: string, input: UpdateBlogPostInput): Promise<BlogPost> {
  const post = await updateBlogPost(id, input);
  if (!post) throw AppError.notFound('Blog post not found');
  return post;
}
export async function removeManagedBlogPost(id: string): Promise<void> {
  if (!await deleteBlogPostById(id)) throw AppError.notFound('Blog post not found');
}
