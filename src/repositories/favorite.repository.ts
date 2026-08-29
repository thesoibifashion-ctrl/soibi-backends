import { pool } from '../database/pool.js';
import type { Favorite } from '../types/favorite.types.js';

function parseImages(value: unknown): Favorite['product']['images'] {
  if (Array.isArray(value)) {
    return value.map((image) => ({
      id: image['id'] as string,
      imageUrl: image['image_url'] as string,
      imagePublicId: image['image_public_id'] as string,
      altText: (image['alt_text'] as string | null) ?? null,
      sortOrder: image['sort_order'] as number,
      isPrimary: image['is_primary'] as boolean,
    }));
  }
  if (typeof value === 'string') return parseImages(JSON.parse(value) as unknown);
  return [];
}

function parsePrices(value: unknown): Favorite['product']['prices'] {
  if (Array.isArray(value)) return value.map((price) => ({ currencyId: price['currency_id'] as string, currency: price['currency'] as string, name: price['name'] as string, symbol: price['symbol'] as string, amount: parseFloat(price['amount'] as string) }));
  if (typeof value === 'string') return parsePrices(JSON.parse(value) as unknown);
  return [];
}

function rowToFavorite(row: Record<string, unknown>): Favorite {
  return {
    id: row['id'] as string,
    productId: row['product_id'] as string,
    createdAt: (row['created_at'] as Date).toISOString(),
    product: {
      id: row['product_id'] as string,
      name: row['name'] as string,
      slug: row['slug'] as string,
      description: (row['description'] as string | null) ?? null,
      category: (row['category'] as string | null) ?? null,
      gender: (row['gender'] as 'male' | 'female' | 'unisex' | null) ?? null,
      basePrice: parseFloat(row['base_price'] as string),
      isCustomizable: row['is_customizable'] as boolean,
      isFeatured: row['is_featured'] as boolean,
      isHero: row['is_hero'] as boolean,
      sortOrder: row['sort_order'] as number,
      metaTitle: (row['meta_title'] as string | null) ?? null,
      metaDescription: (row['meta_description'] as string | null) ?? null,
      images: parseImages(row['images']),
      collections: [],
      materials: [],
      colors: [],
      prices: parsePrices(row['prices']),
    },
  };
}

export async function findFavoritesByProfileId(profileId: string): Promise<Favorite[]> {
  const result = await pool.query(
    `SELECT f.id, f.product_id, f.created_at,
            p.name, p.slug, p.description, p.category, p.gender, p.base_price, p.is_customizable,
            p.is_featured, p.is_hero, p.sort_order, p.meta_title, p.meta_description,
            COALESCE(
              json_agg(jsonb_build_object(
                'id', pi.id, 'image_url', pi.image_url, 'image_public_id', pi.image_public_id,
                'alt_text', pi.alt_text, 'sort_order', pi.sort_order, 'is_primary', pi.is_primary
              ) ORDER BY pi.sort_order ASC) FILTER (WHERE pi.id IS NOT NULL),
              '[]'
            ) AS images
            ,COALESCE((SELECT json_agg(jsonb_build_object('currency_id', c.id, 'currency', c.code, 'name', c.name, 'symbol', c.symbol, 'amount', pp.amount) ORDER BY c.is_default DESC, c.code ASC)
                       FROM product_prices pp JOIN currencies c ON c.id = pp.currency_id
                       WHERE pp.product_id = p.id AND c.is_active = true), '[]') AS prices
     FROM favorites f
     JOIN products p ON p.id = f.product_id
     LEFT JOIN product_images pi ON pi.product_id = p.id
     WHERE f.profile_id = $1 AND p.deleted_at IS NULL
     GROUP BY f.id, p.id
     ORDER BY f.created_at DESC`,
    [profileId],
  );
  return (result.rows as Record<string, unknown>[]).map(rowToFavorite);
}

export async function addFavorite(profileId: string, productId: string): Promise<'added' | 'duplicate' | 'missing'> {
  const result = await pool.query(
    `INSERT INTO favorites (profile_id, product_id)
     SELECT $1, p.id
     FROM products p
     WHERE p.id = $2 AND p.deleted_at IS NULL
     ON CONFLICT (profile_id, product_id) DO NOTHING
     RETURNING id`,
    [profileId, productId],
  );
  if (result.rows.length > 0) return 'added';

  const productResult = await pool.query(
    'SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL',
    [productId],
  );
  return productResult.rows.length === 0 ? 'missing' : 'duplicate';
}

export async function deleteFavorite(profileId: string, productId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM favorites WHERE profile_id = $1 AND product_id = $2 RETURNING id',
    [profileId, productId],
  );
  return result.rows.length > 0;
}
