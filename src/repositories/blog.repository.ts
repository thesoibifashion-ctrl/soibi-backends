import { pool } from '../database/pool.js';
import type { BlogPost, CreateBlogPostInput, UpdateBlogPostInput } from '../types/blog.types.js';

const fields = 'id, title, slug, excerpt, content, cover_image_url, status, published_at, created_at, updated_at';

function rowToBlogPost(row: Record<string, unknown>): BlogPost {
  return {
    id: row['id'] as string,
    title: row['title'] as string,
    slug: row['slug'] as string,
    excerpt: (row['excerpt'] as string | null) ?? null,
    content: row['content'] as string,
    coverImageUrl: (row['cover_image_url'] as string | null) ?? null,
    status: row['status'] as BlogPost['status'],
    publishedAt: row['published_at'] ? (row['published_at'] as Date).toISOString() : null,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  };
}

export async function findPublishedBlogPosts(): Promise<BlogPost[]> {
  const result = await pool.query(`SELECT ${fields} FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC NULLS LAST, created_at DESC`);
  return (result.rows as Record<string, unknown>[]).map(rowToBlogPost);
}

export async function findPublishedBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const result = await pool.query(`SELECT ${fields} FROM blog_posts WHERE slug = $1 AND status = 'published'`, [slug]);
  return result.rows.length ? rowToBlogPost(result.rows[0] as Record<string, unknown>) : null;
}

export async function findBlogPostById(id: string): Promise<BlogPost | null> {
  const result = await pool.query(`SELECT ${fields} FROM blog_posts WHERE id = $1`, [id]);
  return result.rows.length ? rowToBlogPost(result.rows[0] as Record<string, unknown>) : null;
}

export async function findAllBlogPosts(): Promise<BlogPost[]> {
  const result = await pool.query(`SELECT ${fields} FROM blog_posts ORDER BY created_at DESC`);
  return (result.rows as Record<string, unknown>[]).map(rowToBlogPost);
}

export async function createBlogPost(input: CreateBlogPostInput): Promise<BlogPost> {
  const status = input.status ?? 'draft';
  const publishedAt = input.publishedAt ?? (status === 'published' ? new Date().toISOString() : null);
  const result = await pool.query(
    `INSERT INTO blog_posts (title, slug, excerpt, content, cover_image_url, status, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${fields}`,
    [input.title, input.slug, input.excerpt ?? null, input.content, input.coverImageUrl ?? null, status, publishedAt],
  );
  return rowToBlogPost(result.rows[0] as Record<string, unknown>);
}

export async function updateBlogPost(id: string, input: UpdateBlogPostInput): Promise<BlogPost | null> {
  const columns: Record<string, string> = { title: 'title', slug: 'slug', excerpt: 'excerpt', content: 'content', coverImageUrl: 'cover_image_url', status: 'status', publishedAt: 'published_at' };
  const values: unknown[] = [];
  const updates: string[] = [];
  for (const [key, column] of Object.entries(columns)) {
    const value = input[key as keyof UpdateBlogPostInput];
    if (value !== undefined) { values.push(value); updates.push(`${column} = $${values.length}`); }
  }
  if (input.status === 'published' && input.publishedAt === undefined) updates.push('published_at = COALESCE(published_at, now())');
  values.push(id);
  const result = await pool.query(`UPDATE blog_posts SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING ${fields}`, values);
  return result.rows.length ? rowToBlogPost(result.rows[0] as Record<string, unknown>) : null;
}

export async function deleteBlogPostById(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM blog_posts WHERE id = $1 RETURNING id', [id]);
  return result.rows.length > 0;
}
