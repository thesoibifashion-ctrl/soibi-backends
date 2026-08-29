import { pool } from '../database/pool.js';
import type { PoolClient } from 'pg';
import { AppError } from '../utils/AppError.js';
import type {
  Product,
  ProductSummary,
  ProductImage,
  CollectionRef,
  MaterialRef,
  ColorRef,
  ProductVariant,
  ProductMeasurement,
  ProductPrice,
} from '../types/catalog.types.js';
import type {
  AdminProduct,
  AdminProductDetails,
  AdminProductCatalogueItem,
  CreateProductImageInput,
  CreateProductInput,
  ManagedProductImage,
  CreateProductVariantInput,
  ManagedProductVariant,
  UpdateProductInput,
  UpdateProductVariantInput,
} from '../types/admin-catalog.types.js';
import type { ProductPriceInput } from '../types/currency.types.js';

export interface ProductFilter {
  color?: string;
  collection?: string;
  category?: string;
  gender?: 'male' | 'female' | 'unisex';
  size?: string;
  material?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'size_asc' | 'size_desc' | 'collection_sort';
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function parseJsonAgg<T>(value: unknown): T[] {
  if (!value || value === '[null]') return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as T[];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  }
  return [];
}

function rowToProductSummary(row: Record<string, unknown>): ProductSummary {
  const images = parseJsonAgg<ProductImage>(row['images']);
  const collections = parseJsonAgg<CollectionRef>(row['collections']);
  const materials = parseJsonAgg<MaterialRef>(row['materials']);
  const colors = parseJsonAgg<ColorRef>(row['colors']);
  const sizes = parseJsonAgg<number | string>(row['sizes']).map((size) => Number(size));
  const measurements = parseJsonAgg<Record<string, unknown>>(row['measurements']);
  const prices = parseJsonAgg<Record<string, unknown>>(row['prices']);

  return {
    id: row['id'] as string,
    name: row['name'] as string,
    slug: row['slug'] as string,
    description: (row['description'] as string | null) ?? null,
    category: (row['category'] as string | null) ?? null,
    gender: (row['gender'] as Product['gender']) ?? null,
    basePrice: parseFloat(row['base_price'] as string),
    isCustomizable: row['is_customizable'] as boolean,
    isFeatured: row['is_featured'] as boolean,
    isHero: row['is_hero'] as boolean,
    sortOrder: row['sort_order'] as number,
    metaTitle: (row['meta_title'] as string | null) ?? null,
    metaDescription: (row['meta_description'] as string | null) ?? null,
    images: images.map((img) => ({
      id: img['id' as keyof typeof img] as unknown as string,
      imageUrl: img['image_url' as keyof typeof img] as unknown as string,
      imagePublicId: img['image_public_id' as keyof typeof img] as unknown as string,
      altText: (img['alt_text' as keyof typeof img] as unknown as string | null) ?? null,
      sortOrder: img['sort_order' as keyof typeof img] as unknown as number,
      isPrimary: img['is_primary' as keyof typeof img] as unknown as boolean,
    })),
    collections: collections.map((c) => ({
      id: c['id' as keyof typeof c] as unknown as string,
      name: c['name' as keyof typeof c] as unknown as string,
      slug: c['slug' as keyof typeof c] as unknown as string,
    })),
    materials: materials.map((m) => ({
      id: m['id' as keyof typeof m] as unknown as string,
      name: m['name' as keyof typeof m] as unknown as string,
      slug: m['slug' as keyof typeof m] as unknown as string,
    })),
    colors: colors.map((col) => ({
      id: col['id' as keyof typeof col] as unknown as string,
      name: col['name' as keyof typeof col] as unknown as string,
      hexCode: (col['hex_code' as keyof typeof col] as unknown as string | null) ?? null,
      hex: (col['hex_code' as keyof typeof col] as unknown as string | null) ?? null,
    })),
    sizes,
    measurements: measurements.map((measurement): ProductMeasurement => ({
      id: measurement['id'] as string,
      measurementId: measurement['measurement_id'] as string,
      title: measurement['title'] as string,
      value: measurement['value'] as string,
      imageUrl: measurement['image_url'] as string,
      sortOrder: measurement['sort_order'] as number,
    })),
    prices: prices.map((price): ProductPrice => ({
      currencyId: price['currency_id'] as string, currency: price['currency'] as string,
      name: price['name'] as string, symbol: price['symbol'] as string,
      amount: parseFloat(price['amount'] as string),
    })),
  };
}

function rowToProduct(row: Record<string, unknown>): Product {
  const summary = rowToProductSummary(row);
  const variants = parseJsonAgg<Record<string, unknown>>(row['variants']);
  return {
    ...summary,
    variants: variants.map((variant): ProductVariant => ({
      id: variant['id'] as string,
      sizeLabel: (variant['size_label'] as string | null) ?? null,
      sizeValue: variant['size_value'] == null ? null : parseFloat(variant['size_value'] as string),
      sku: (variant['sku'] as string | null) ?? null,
      priceAdjustment: parseFloat(variant['price_adjustment'] as string),
      isAvailable: variant['is_available'] as boolean,
      sortOrder: variant['sort_order'] as number,
      color: variant['color_id'] == null ? null : {
        id: variant['color_id'] as string,
        name: variant['color_name'] as string,
        hexCode: (variant['color_hex'] as string | null) ?? null,
        hex: (variant['color_hex'] as string | null) ?? null,
      },
    })),
  };
}

// ─── Shared SQL fragments ─────────────────────────────────────────────────────

// Aggregates all related data for a product into JSON arrays.
// Used in every SELECT to avoid N+1 queries.
const PRODUCT_AGGREGATES = `
  COALESCE(
    json_agg(DISTINCT jsonb_build_object(
      'id',               pi.id,
      'image_url',        pi.image_url,
      'image_public_id',  pi.image_public_id,
      'alt_text',         pi.alt_text,
      'sort_order',       pi.sort_order,
      'is_primary',       pi.is_primary
    )) FILTER (WHERE pi.id IS NOT NULL),
    '[]'
  ) AS images,

  COALESCE(
    json_agg(DISTINCT jsonb_build_object(
      'id',   c.id,
      'name', c.name,
      'slug', c.slug
    )) FILTER (WHERE c.id IS NOT NULL),
    '[]'
  ) AS collections,

  COALESCE(
    json_agg(DISTINCT jsonb_build_object(
      'id',   m.id,
      'name', m.name,
      'slug', m.slug
    )) FILTER (WHERE m.id IS NOT NULL),
    '[]'
  ) AS materials,

  COALESCE(
    json_agg(DISTINCT jsonb_build_object(
      'id',       col.id,
      'name',     col.name,
      'hex_code', col.hex_code
    )) FILTER (WHERE col.id IS NOT NULL),
    '[]'
  ) AS colors,

  COALESCE(
    (SELECT json_agg(jsonb_build_object(
      'id', pm.id, 'measurement_id', pm.measurement_id, 'title', measurement.title,
      'value', pm.value, 'image_url', measurement.image_url, 'sort_order', pm.sort_order
    ) ORDER BY pm.sort_order ASC, pm.id ASC)
     FROM product_measurements pm
     JOIN measurements measurement ON measurement.id = pm.measurement_id
     WHERE pm.product_id = p.id),
    '[]'
  ) AS measurements,

  COALESCE(
    (SELECT json_agg(jsonb_build_object(
      'currency_id', currency.id, 'currency', currency.code, 'name', currency.name,
      'symbol', currency.symbol, 'amount', product_price.amount
    ) ORDER BY currency.is_default DESC, currency.code ASC)
     FROM product_prices product_price
     JOIN currencies currency ON currency.id = product_price.currency_id
     WHERE product_price.product_id = p.id AND currency.is_active = true),
    '[]'
  ) AS prices,

  COALESCE(
    (SELECT json_agg(s.value ORDER BY s.value)
     FROM product_sizes ps
     JOIN sizes s ON s.id = ps.size_id
     WHERE ps.product_id = p.id AND s.is_active = true),
    '[]'
  ) AS sizes
`;

const PRODUCT_JOINS = `
  LEFT JOIN product_images pi        ON pi.product_id = p.id
  LEFT JOIN product_collections pc   ON pc.product_id = p.id
  LEFT JOIN collections c            ON c.id = pc.collection_id AND c.status = 'published'
  LEFT JOIN product_materials pm     ON pm.product_id = p.id
  LEFT JOIN materials m              ON m.id = pm.material_id AND m.is_active = true
  LEFT JOIN product_colors pcol      ON pcol.product_id = p.id
  LEFT JOIN colors col               ON col.id = pcol.color_id AND col.is_active = true
`;

// Legacy variants remain independently managed and are only returned on detail
// responses. Product sizes are sourced exclusively from product_sizes above.
const PRODUCT_VARIANT_AGGREGATE = `
  COALESCE(
    (SELECT json_agg(jsonb_build_object(
      'id', v.id, 'size_label', v.size_label, 'size_value', v.size_value,
      'sku', v.sku, 'price_adjustment', v.price_adjustment,
      'is_available', v.is_available, 'sort_order', v.sort_order,
      'color_id', vc.id, 'color_name', vc.name, 'color_hex', vc.hex_code
    ) ORDER BY v.sort_order ASC)
     FROM product_variants v
     LEFT JOIN colors vc ON vc.id = v.color_id
     WHERE v.product_id = p.id),
    '[]'
  ) AS variants
`;

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function findPublishedProducts(filters: ProductFilter = {}): Promise<ProductSummary[]> {
  const values: unknown[] = [];
  const where = ["p.status = 'published'", 'p.deleted_at IS NULL'];
  const add = (sql: string, value: string) => { values.push(value); where.push(sql.replace('?', `$${values.length}`)); };
  if (filters.category) add('p.category ILIKE ?', filters.category);
  if (filters.gender) add('p.gender = ?', filters.gender);
  if (filters.color) add(`EXISTS (SELECT 1 FROM product_colors fpc JOIN colors fc ON fc.id = fpc.color_id WHERE fpc.product_id = p.id AND fc.hex_code = ?)`, filters.color);
  if (filters.size) add(`EXISTS (SELECT 1 FROM product_sizes fps JOIN sizes fs ON fs.id = fps.size_id WHERE fps.product_id = p.id AND fs.value = ?::numeric AND fs.is_active = true)`, filters.size);
  if (filters.material) add(`EXISTS (SELECT 1 FROM product_materials fpm JOIN materials fm ON fm.id = fpm.material_id WHERE fpm.product_id = p.id AND lower(fm.slug) = lower(?))`, filters.material);
  if (filters.collection) add(`EXISTS (SELECT 1 FROM product_collections fpc JOIN collections fc ON fc.id = fpc.collection_id WHERE fpc.product_id = p.id AND fc.slug = ?)`, filters.collection);
  // size_asc / size_desc: order by the minimum size assigned to each product.
  // Products with no sizes sort last (NULLS LAST).
  // collection_sort: order by the product's sort_order within its collection(s).
  // When multiple collections match, the lowest sort_order wins.
  const orderBy = filters.sort === 'newest'       ? 'p.created_at DESC, p.id DESC'
    : filters.sort === 'price_asc'                ? 'p.base_price ASC, p.name ASC'
    : filters.sort === 'price_desc'               ? 'p.base_price DESC, p.name ASC'
    : filters.sort === 'size_asc'                 ? '(SELECT MIN(s2.value) FROM product_sizes ps2 JOIN sizes s2 ON s2.id = ps2.size_id WHERE ps2.product_id = p.id AND s2.is_active = true) ASC NULLS LAST, p.name ASC'
    : filters.sort === 'size_desc'                ? '(SELECT MAX(s2.value) FROM product_sizes ps2 JOIN sizes s2 ON s2.id = ps2.size_id WHERE ps2.product_id = p.id AND s2.is_active = true) DESC NULLS LAST, p.name ASC'
    : filters.sort === 'collection_sort'          ? 'MIN(pc.sort_order) ASC NULLS LAST, p.sort_order ASC, p.name ASC'
    : 'p.sort_order ASC, p.name ASC';
  const result = await pool.query(
    `SELECT
       p.id, p.name, p.slug, p.description, p.category, p.gender, p.base_price,
       p.is_customizable, p.is_featured, p.is_hero, p.sort_order,
       p.meta_title, p.meta_description,
       ${PRODUCT_AGGREGATES}
     FROM products p
     ${PRODUCT_JOINS}
     WHERE ${where.join(' AND ')}
     GROUP BY p.id
     ORDER BY ${orderBy}`,
    values,
  );
  return (result.rows as Record<string, unknown>[]).map(rowToProductSummary);
}

export async function findProductBySlug(slug: string): Promise<Product | null> {
  const result = await pool.query(
    `SELECT
       p.id, p.name, p.slug, p.description, p.category, p.gender, p.base_price,
       p.is_customizable, p.is_featured, p.is_hero, p.sort_order,
       p.meta_title, p.meta_description,
       ${PRODUCT_AGGREGATES},
       ${PRODUCT_VARIANT_AGGREGATE}
     FROM products p
     ${PRODUCT_JOINS}
     WHERE p.slug = $1
       AND p.status = 'published'
       AND p.deleted_at IS NULL
     GROUP BY p.id`,
    [slug],
  );
  if (result.rows.length === 0) return null;
  return rowToProduct(result.rows[0] as Record<string, unknown>);
}

export async function recordProductView(productId: string): Promise<void> {
  await pool.query(
    `INSERT INTO product_view_daily (product_id, viewed_on, view_count)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (product_id, viewed_on) DO UPDATE SET view_count = product_view_daily.view_count + 1`,
    [productId],
  );
}

export async function findFeaturedProducts(): Promise<ProductSummary[]> {
  const result = await pool.query(
    `SELECT
       p.id, p.name, p.slug, p.description, p.category, p.gender, p.base_price,
       p.is_customizable, p.is_featured, p.is_hero, p.sort_order,
       p.meta_title, p.meta_description,
       ${PRODUCT_AGGREGATES}
     FROM products p
     ${PRODUCT_JOINS}
     WHERE p.is_featured = true
       AND p.status = 'published'
       AND p.deleted_at IS NULL
     GROUP BY p.id
     ORDER BY p.sort_order ASC`,
  );
  return (result.rows as Record<string, unknown>[]).map(rowToProductSummary);
}

export async function findHeroProducts(): Promise<ProductSummary[]> {
  const result = await pool.query(
    `SELECT
       p.id, p.name, p.slug, p.description, p.category, p.gender, p.base_price,
       p.is_customizable, p.is_featured, p.is_hero, p.sort_order,
       p.meta_title, p.meta_description,
       ${PRODUCT_AGGREGATES}
     FROM products p
     ${PRODUCT_JOINS}
     WHERE p.is_hero = true
       AND p.status = 'published'
       AND p.deleted_at IS NULL
     GROUP BY p.id
     ORDER BY p.sort_order ASC`,
  );
  return (result.rows as Record<string, unknown>[]).map(rowToProductSummary);
}

export async function findPublishedProductsByIds(ids: string[]): Promise<ProductSummary[]> {
  if (ids.length === 0) return [];
  const result = await pool.query(
    `SELECT
       p.id, p.name, p.slug, p.description, p.category, p.gender, p.base_price,
       p.is_customizable, p.is_featured, p.is_hero, p.sort_order,
       p.meta_title, p.meta_description,
       ${PRODUCT_AGGREGATES}
     FROM products p
     ${PRODUCT_JOINS}
     WHERE p.id = ANY($1::uuid[])
       AND p.status = 'published'
       AND p.deleted_at IS NULL
     GROUP BY p.id
     ORDER BY p.sort_order ASC`,
    [ids],
  );
  return (result.rows as Record<string, unknown>[]).map(rowToProductSummary);
}

// ─── Admin mutations ─────────────────────────────────────────────────────────

function rowToAdminProduct(row: Record<string, unknown>): AdminProduct {
  return {
    id: row['id'] as string,
    name: (row['name'] as string | null) ?? null,
    slug: (row['slug'] as string | null) ?? null,
    description: (row['description'] as string | null) ?? null,
    category: (row['category'] as string | null) ?? null,
    gender: (row['gender'] as AdminProduct['gender']) ?? null,
    basePrice: row['base_price'] == null ? null : parseFloat(row['base_price'] as string),
    isCustomizable: (row['is_customizable'] as boolean | null) ?? null,
    status: row['status'] as AdminProduct['status'],
    isFeatured: (row['is_featured'] as boolean | null) ?? null,
    isHero: (row['is_hero'] as boolean | null) ?? null,
    sortOrder: row['sort_order'] == null ? null : row['sort_order'] as number,
    metaTitle: (row['meta_title'] as string | null) ?? null,
    metaDescription: (row['meta_description'] as string | null) ?? null,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  };
}

function rowToAdminProductCatalogue(row: Record<string, unknown>): AdminProductCatalogueItem {
  const images = parseJsonAgg<Record<string, unknown>>(row['images']);
  const collections = parseJsonAgg<Record<string, unknown>>(row['collections']);
  const materials = parseJsonAgg<Record<string, unknown>>(row['materials']);
  const colors = parseJsonAgg<Record<string, unknown>>(row['colors']);
  const sizes = parseJsonAgg<number | string>(row['sizes']).map(Number);
  const measurements = parseJsonAgg<Record<string, unknown>>(row['measurements']);
  const prices = parseJsonAgg<Record<string, unknown>>(row['prices']);
  return {
    ...rowToAdminProduct(row),
    images: images.map((image) => ({
      id: image['id'] as string,
      imageUrl: image['image_url'] as string,
      imagePublicId: image['image_public_id'] as string,
      altText: (image['alt_text'] as string | null) ?? null,
      sortOrder: image['sort_order'] as number,
      isPrimary: image['is_primary'] as boolean,
    })),
    collections: collections.map((collection) => ({
      id: collection['id'] as string,
      name: collection['name'] as string,
      slug: collection['slug'] as string,
    })),
    materials: materials.map((material) => ({
      id: material['id'] as string,
      name: material['name'] as string,
      slug: material['slug'] as string,
    })),
    colors: colors.map((color) => ({
      id: color['id'] as string,
      name: color['name'] as string,
      hexCode: (color['hex_code'] as string | null) ?? null,
      hex: (color['hex_code'] as string | null) ?? null,
    })),
    sizes,
    measurements: measurements.map((measurement) => ({
      id: measurement['id'] as string,
      measurementId: measurement['measurement_id'] as string,
      title: measurement['title'] as string,
      value: measurement['value'] as string,
      imageUrl: measurement['image_url'] as string,
      sortOrder: measurement['sort_order'] as number,
    })),
    prices: prices.map((price) => ({ currencyId: price['currency_id'] as string, currency: price['currency'] as string, name: price['name'] as string, symbol: price['symbol'] as string, amount: parseFloat(price['amount'] as string) })),
  };
}

const ADMIN_PRODUCT_AGGREGATES = PRODUCT_AGGREGATES
  .replace('AND s.is_active = true', '')
  .replace('AND currency.is_active = true', '');
const ADMIN_PRODUCT_JOINS = `
  LEFT JOIN product_images pi        ON pi.product_id = p.id
  LEFT JOIN product_collections pc   ON pc.product_id = p.id
  LEFT JOIN collections c            ON c.id = pc.collection_id
  LEFT JOIN product_materials pm     ON pm.product_id = p.id
  LEFT JOIN materials m              ON m.id = pm.material_id
  LEFT JOIN product_colors pcol      ON pcol.product_id = p.id
  LEFT JOIN colors col               ON col.id = pcol.color_id
`;

export async function findAllProductsForAdmin(): Promise<AdminProductCatalogueItem[]> {
  const result = await pool.query(
    `SELECT
       p.id, p.name, p.slug, p.description, p.category, p.gender, p.base_price,
       p.is_customizable, p.status, p.is_featured, p.is_hero, p.sort_order,
       p.meta_title, p.meta_description, p.created_at, p.updated_at,
       ${ADMIN_PRODUCT_AGGREGATES}
     FROM products p
     ${ADMIN_PRODUCT_JOINS}
     WHERE p.deleted_at IS NULL
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
  );
  return (result.rows as Record<string, unknown>[]).map(rowToAdminProductCatalogue);
}

async function getProductOptions(client: PoolClient, productId: string): Promise<Pick<AdminProductDetails, 'colors' | 'materials' | 'sizes' | 'measurements' | 'prices'>> {
  const result = await client.query(
    `SELECT
       COALESCE((SELECT json_agg(jsonb_build_object('id', c.id, 'name', c.name, 'hex_code', c.hex_code) ORDER BY c.name)
                 FROM product_colors pc JOIN colors c ON c.id = pc.color_id
                 WHERE pc.product_id = $1 AND c.is_active = true), '[]') AS colors,
       COALESCE((SELECT json_agg(jsonb_build_object('id', m.id, 'name', m.name, 'slug', m.slug) ORDER BY m.name)
                 FROM product_materials pm JOIN materials m ON m.id = pm.material_id
                 WHERE pm.product_id = $1 AND m.is_active = true), '[]') AS materials,
       COALESCE((SELECT json_agg(s.value ORDER BY s.value)
                 FROM product_sizes ps JOIN sizes s ON s.id = ps.size_id
                 WHERE ps.product_id = $1 AND s.is_active = true), '[]') AS sizes,
       COALESCE((SELECT json_agg(jsonb_build_object(
                   'id', pm.id, 'measurement_id', pm.measurement_id, 'title', measurement.title,
                   'value', pm.value, 'image_url', measurement.image_url, 'sort_order', pm.sort_order
                 ) ORDER BY pm.sort_order ASC, pm.id ASC)
                 FROM product_measurements pm JOIN measurements measurement ON measurement.id = pm.measurement_id
                 WHERE pm.product_id = $1), '[]') AS measurements,
       COALESCE((SELECT json_agg(jsonb_build_object('currency_id', currency.id, 'currency', currency.code, 'name', currency.name, 'symbol', currency.symbol, 'amount', product_price.amount) ORDER BY currency.is_default DESC, currency.code ASC)
                 FROM product_prices product_price JOIN currencies currency ON currency.id = product_price.currency_id
                 WHERE product_price.product_id = $1), '[]') AS prices`,
    [productId],
  );
  const row = result.rows[0] as Record<string, unknown>;
  const colors = parseJsonAgg<ColorRef>(row['colors']).map((color) => ({
    id: color['id' as keyof typeof color] as unknown as string,
    name: color['name' as keyof typeof color] as unknown as string,
    hexCode: (color['hex_code' as keyof typeof color] as unknown as string | null) ?? null,
    hex: (color['hex_code' as keyof typeof color] as unknown as string | null) ?? null,
  }));
  const materials = parseJsonAgg<MaterialRef>(row['materials']).map((material) => ({
    id: material['id' as keyof typeof material] as unknown as string,
    name: material['name' as keyof typeof material] as unknown as string,
    slug: material['slug' as keyof typeof material] as unknown as string,
  }));
  const measurements = parseJsonAgg<Record<string, unknown>>(row['measurements']).map((measurement) => ({
    id: measurement['id'] as string,
    measurementId: measurement['measurement_id'] as string,
    title: measurement['title'] as string,
    value: measurement['value'] as string,
    imageUrl: measurement['image_url'] as string,
    sortOrder: measurement['sort_order'] as number,
  }));
  const prices = parseJsonAgg<Record<string, unknown>>(row['prices']).map((price) => ({ currencyId: price['currency_id'] as string, currency: price['currency'] as string, name: price['name'] as string, symbol: price['symbol'] as string, amount: parseFloat(price['amount'] as string) }));
  return { colors, materials, sizes: parseJsonAgg<number | string>(row['sizes']).map(Number), measurements, prices };
}

async function replaceProductOptions(
  client: PoolClient,
  productId: string,
  input: Pick<UpdateProductInput, 'colors' | 'materials' | 'sizes' | 'measurements'>,
): Promise<void> {
  if (input.colors !== undefined) {
    await client.query('DELETE FROM product_colors WHERE product_id = $1', [productId]);
    for (const color of input.colors) {
      const result = await client.query(
        `INSERT INTO colors (name, hex_code, is_active) VALUES ($1, $2, true)
         ON CONFLICT (name) DO UPDATE SET hex_code = COALESCE(colors.hex_code, EXCLUDED.hex_code), is_active = true
         RETURNING id`,
        [color.name, color.hex],
      );
      await client.query('INSERT INTO product_colors (product_id, color_id) VALUES ($1, $2)', [productId, (result.rows[0] as Record<string, unknown>)['id']]);
    }
  }
  if (input.materials !== undefined) {
    await client.query('DELETE FROM product_materials WHERE product_id = $1', [productId]);
    for (const material of input.materials) {
      const result = await client.query(
        `INSERT INTO materials (name, slug, is_active) VALUES ($1, $2, true)
         ON CONFLICT (name) DO UPDATE SET is_active = true RETURNING id`,
        [material.name, material.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')],
      );
      await client.query('INSERT INTO product_materials (product_id, material_id) VALUES ($1, $2)', [productId, (result.rows[0] as Record<string, unknown>)['id']]);
    }
  }
  if (input.sizes !== undefined) {
    await client.query('DELETE FROM product_sizes WHERE product_id = $1', [productId]);
    for (const size of input.sizes) {
      const result = await client.query(
        `INSERT INTO sizes (value, is_active) VALUES ($1, true)
         ON CONFLICT (value) DO UPDATE SET is_active = true RETURNING id`,
        [size],
      );
      await client.query('INSERT INTO product_sizes (product_id, size_id) VALUES ($1, $2)', [productId, (result.rows[0] as Record<string, unknown>)['id']]);
    }
  }
  if (input.measurements !== undefined) {
    await client.query('DELETE FROM product_measurements WHERE product_id = $1', [productId]);
    for (const measurement of input.measurements) {
      const result = await client.query(
        `INSERT INTO product_measurements (product_id, measurement_id, value, sort_order)
         SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM measurements WHERE id = $2)
         RETURNING id`,
        [productId, measurement.measurementId, measurement.value, measurement.sortOrder ?? 0],
      );
      if (!result.rows.length) throw AppError.badRequest(`Measurement not found: ${measurement.measurementId}`);
    }
  }
}

async function replaceProductPrices(client: PoolClient, productId: string, prices: ProductPriceInput[]): Promise<void> {
  const activeCurrencies = await client.query('SELECT id FROM currencies WHERE id = ANY($1::uuid[]) AND is_active = true', [prices.map((price) => price.currencyId)]);
  if (activeCurrencies.rows.length !== prices.length) throw AppError.badRequest('Every product price must reference an active currency');
  await client.query('DELETE FROM product_prices WHERE product_id = $1', [productId]);
  for (const price of prices) await client.query('INSERT INTO product_prices (product_id, currency_id, amount) VALUES ($1, $2, $3)', [productId, price.currencyId, price.amount]);
}

function rowToManagedProductImage(row: Record<string, unknown>): ManagedProductImage {
  return {
    id: row['id'] as string,
    imageUrl: row['image_url'] as string,
    imagePublicId: row['image_public_id'] as string,
    altText: (row['alt_text'] as string | null) ?? null,
    sortOrder: row['sort_order'] as number,
    isPrimary: row['is_primary'] as boolean,
  };
}

export async function createProduct(input: CreateProductInput): Promise<AdminProductDetails> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO products
         (name, slug, description, category, gender, base_price, is_customizable, status, is_featured, is_hero, sort_order, meta_title, meta_description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, name, slug, description, category, gender, base_price, is_customizable, status,
                 is_featured, is_hero, sort_order, meta_title, meta_description, created_at, updated_at`,
      [
        input.name ?? null,
        input.slug ?? null,
        input.description ?? null,
        input.category ?? null,
        input.gender ?? null,
        input.basePrice ?? null,
        input.isCustomizable ?? null,
        input.status ?? 'draft',
        input.isFeatured ?? null,
        input.isHero ?? null,
        input.sortOrder ?? null,
        input.metaTitle ?? null,
        input.metaDescription ?? null,
      ],
    );
    const product = result.rows[0] as Record<string, unknown>;
    const productId = product['id'] as string;

    await replaceProductOptions(client, productId, {
      colors: input.colors ?? [], materials: input.materials ?? [], sizes: input.sizes ?? [], measurements: input.measurements ?? [],
    });
    if (input.prices !== undefined) await replaceProductPrices(client, productId, input.prices);

    const response = { ...rowToAdminProduct(product), ...(await getProductOptions(client, productId)) };
    await client.query('COMMIT');
    return response;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateProductById(
  id: string,
  input: UpdateProductInput,
): Promise<AdminProductDetails | null> {
  const fieldMap: Record<string, string> = {
    name: 'name', slug: 'slug', description: 'description', category: 'category', gender: 'gender', basePrice: 'base_price',
    isCustomizable: 'is_customizable', status: 'status', isFeatured: 'is_featured', isHero: 'is_hero', sortOrder: 'sort_order',
    metaTitle: 'meta_title', metaDescription: 'meta_description',
  };
  const entries = (Object.entries(input) as [string, unknown][])
    .filter(([key, value]) => value !== undefined && key in fieldMap);
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([key], index) => `${fieldMap[key]} = $${index + 1}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = assignments.length > 0
      ? await client.query(
        `UPDATE products SET ${assignments.join(', ')}
         WHERE id = $${values.length + 1} AND deleted_at IS NULL
         RETURNING id, name, slug, description, category, gender, base_price, is_customizable, status,
                   is_featured, is_hero, sort_order, meta_title, meta_description, created_at, updated_at`,
        [...values, id],
      )
      : await client.query(
        `UPDATE products SET updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id, name, slug, description, category, gender, base_price, is_customizable, status,
                   is_featured, is_hero, sort_order, meta_title, meta_description, created_at, updated_at`,
        [id],
      );
    if (result.rows.length === 0) { await client.query('ROLLBACK'); return null; }
    await replaceProductOptions(client, id, input);
    if (input.prices !== undefined) await replaceProductPrices(client, id, input.prices);
    const product = rowToAdminProduct(result.rows[0] as Record<string, unknown>);
    const options = await getProductOptions(client, id);
    await client.query('COMMIT');
    return { ...product, ...options };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getProductPricesForAdmin(productId: string): Promise<ProductPrice[] | null> {
  const exists = await pool.query('SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL', [productId]);
  if (!exists.rows.length) return null;
  const result = await pool.query(`SELECT pp.currency_id, c.code AS currency, c.name, c.symbol, pp.amount FROM product_prices pp JOIN currencies c ON c.id = pp.currency_id WHERE pp.product_id = $1 ORDER BY c.is_default DESC, c.code ASC`, [productId]);
  return result.rows.map((row) => ({ currencyId: row.currency_id as string, currency: row.currency as string, name: row.name as string, symbol: row.symbol as string, amount: parseFloat(row.amount as string) }));
}
export async function replaceProductPricesById(productId: string, prices: ProductPriceInput[]): Promise<ProductPrice[] | null> {
  const client = await pool.connect(); try { await client.query('BEGIN'); const exists = await client.query('SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [productId]); if (!exists.rows.length) { await client.query('ROLLBACK'); return null; } await replaceProductPrices(client, productId, prices); const details = await getProductOptions(client, productId); await client.query('COMMIT'); return details.prices; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function upsertProductPrice(productId: string, price: ProductPriceInput): Promise<ProductPrice | null> {
  const client = await pool.connect(); try { await client.query('BEGIN'); const exists = await client.query('SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL', [productId]); if (!exists.rows.length) { await client.query('ROLLBACK'); return null; } const currency = await client.query('SELECT id, code, name, symbol FROM currencies WHERE id = $1 AND is_active = true', [price.currencyId]); if (!currency.rows.length) throw AppError.badRequest('Currency not found or inactive'); await client.query('INSERT INTO product_prices (product_id, currency_id, amount) VALUES ($1, $2, $3) ON CONFLICT (product_id, currency_id) DO UPDATE SET amount = EXCLUDED.amount', [productId, price.currencyId, price.amount]); await client.query('COMMIT'); const row = currency.rows[0] as Record<string, unknown>; return { currencyId: row['id'] as string, currency: row['code'] as string, name: row['name'] as string, symbol: row['symbol'] as string, amount: price.amount }; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function removeProductPrice(productId: string, currencyId: string): Promise<boolean> { const result = await pool.query('DELETE FROM product_prices WHERE product_id = $1 AND currency_id = $2 RETURNING product_id', [productId, currencyId]); return result.rows.length > 0; }

export async function softDeleteProductById(id: string): Promise<boolean> {
  const result = await pool.query(
    `WITH deleted_product AS (
       UPDATE products SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id
     ), removed_measurements AS (
       DELETE FROM product_measurements WHERE product_id IN (SELECT id FROM deleted_product)
     )
     SELECT id FROM deleted_product`,
    [id],
  );
  return result.rows.length > 0;
}

export async function createProductImage(
  productId: string,
  input: CreateProductImageInput,
): Promise<ManagedProductImage | null> {
  const result = await pool.query(
    `INSERT INTO product_images
       (product_id, image_url, image_public_id, alt_text, sort_order, is_primary)
     SELECT $1, $2, $3, $4, $5, $6
     WHERE EXISTS (SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL)
     RETURNING id, image_url, image_public_id, alt_text, sort_order, is_primary`,
    [
      productId,
      input.imageUrl,
      input.imagePublicId,
      input.altText ?? null,
      input.sortOrder ?? 0,
      input.isPrimary ?? false,
    ],
  );
  if (result.rows.length === 0) return null;
  return rowToManagedProductImage(result.rows[0] as Record<string, unknown>);
}

export async function deleteProductImageById(productId: string, imageId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING id',
    [imageId, productId],
  );
  return result.rows.length > 0;
}

function rowToManagedProductVariant(row: Record<string, unknown>): ManagedProductVariant {
  return {
    id: row['id'] as string,
    productId: row['product_id'] as string,
    colorId: (row['color_id'] as string | null) ?? null,
    sizeLabel: (row['size_label'] as string | null) ?? null,
    sizeValue: row['size_value'] == null ? null : parseFloat(row['size_value'] as string),
    sku: (row['sku'] as string | null) ?? null,
    priceAdjustment: parseFloat(row['price_adjustment'] as string),
    isAvailable: row['is_available'] as boolean,
    sortOrder: row['sort_order'] as number,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  };
}

export async function assignProductToCollection(productId: string, collectionId: string): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO product_collections (product_id, collection_id)
     SELECT $1, $2
     WHERE EXISTS (SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL)
       AND EXISTS (SELECT 1 FROM collections WHERE id = $2)
     ON CONFLICT (product_id, collection_id) DO NOTHING
     RETURNING product_id`,
    [productId, collectionId],
  );
  return result.rows.length > 0;
}

export async function removeProductFromCollection(productId: string, collectionId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM product_collections
     WHERE product_id = $1 AND collection_id = $2
     RETURNING product_id`,
    [productId, collectionId],
  );
  return result.rows.length > 0;
}

export async function createProductVariant(
  productId: string,
  input: CreateProductVariantInput,
): Promise<ManagedProductVariant | null> {
  const result = await pool.query(
    `INSERT INTO product_variants
       (product_id, color_id, size_label, size_value, sku, price_adjustment, is_available, sort_order)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8
     WHERE EXISTS (SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL)
     RETURNING id, product_id, color_id, size_label, size_value, sku, price_adjustment,
               is_available, sort_order, created_at, updated_at`,
    [
      productId,
      input.colorId ?? null,
      input.sizeLabel ?? null,
      input.sizeValue ?? null,
      input.sku ?? null,
      input.priceAdjustment ?? 0,
      input.isAvailable ?? true,
      input.sortOrder ?? 0,
    ],
  );
  if (result.rows.length === 0) return null;
  return rowToManagedProductVariant(result.rows[0] as Record<string, unknown>);
}

export async function updateProductVariantById(
  productId: string,
  variantId: string,
  input: UpdateProductVariantInput,
): Promise<ManagedProductVariant | null> {
  const fieldMap: Record<keyof UpdateProductVariantInput, string> = {
    sizeLabel: 'size_label', sizeValue: 'size_value', sku: 'sku',
    priceAdjustment: 'price_adjustment', colorId: 'color_id',
    isAvailable: 'is_available', sortOrder: 'sort_order',
  };
  const entries = (Object.entries(input) as [keyof UpdateProductVariantInput, unknown][])
    .filter(([, value]) => value !== undefined);
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([key], index) => `${fieldMap[key]} = $${index + 1}`);
  const result = await pool.query(
    `UPDATE product_variants
     SET ${assignments.join(', ')}
     WHERE id = $${values.length + 1} AND product_id = $${values.length + 2}
     RETURNING id, product_id, color_id, size_label, size_value, sku, price_adjustment,
               is_available, sort_order, created_at, updated_at`,
    [...values, variantId, productId],
  );
  if (result.rows.length === 0) return null;
  return rowToManagedProductVariant(result.rows[0] as Record<string, unknown>);
}

export async function deleteProductVariantById(productId: string, variantId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM product_variants WHERE id = $1 AND product_id = $2 RETURNING id',
    [variantId, productId],
  );
  return result.rows.length > 0;
}
