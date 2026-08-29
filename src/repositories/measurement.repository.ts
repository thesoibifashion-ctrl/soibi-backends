import { pool } from '../database/pool.js';
import type {
  CreateMeasurementInput,
  Measurement,
  ProductMeasurement,
  ProductMeasurementInput,
  UpdateMeasurementInput,
  UpdateProductMeasurementInput,
} from '../types/measurement.types.js';

function rowToMeasurement(row: Record<string, unknown>): Measurement {
  return {
    id: row['id'] as string,
    title: row['title'] as string,
    imageUrl: row['image_url'] as string,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  };
}

function rowToProductMeasurement(row: Record<string, unknown>): ProductMeasurement {
  return {
    id: row['id'] as string,
    measurementId: row['measurement_id'] as string,
    title: row['title'] as string,
    value: row['value'] as string,
    imageUrl: row['image_url'] as string,
    sortOrder: row['sort_order'] as number,
  };
}

export async function findMeasurements(): Promise<Measurement[]> {
  const result = await pool.query('SELECT id, title, image_url, created_at, updated_at FROM measurements ORDER BY title ASC');
  return (result.rows as Record<string, unknown>[]).map(rowToMeasurement);
}

export async function createMeasurement(input: CreateMeasurementInput): Promise<Measurement> {
  const result = await pool.query(
    'INSERT INTO measurements (title, image_url) VALUES ($1, $2) RETURNING id, title, image_url, created_at, updated_at',
    [input.title, input.imageUrl],
  );
  return rowToMeasurement(result.rows[0] as Record<string, unknown>);
}

export async function updateMeasurementById(id: string, input: UpdateMeasurementInput): Promise<Measurement | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.title !== undefined) { values.push(input.title); fields.push(`title = $${values.length}`); }
  if (input.imageUrl !== undefined) { values.push(input.imageUrl); fields.push(`image_url = $${values.length}`); }
  const result = await pool.query(
    `UPDATE measurements SET ${fields.join(', ')} WHERE id = $${values.length + 1}
     RETURNING id, title, image_url, created_at, updated_at`,
    [...values, id],
  );
  return result.rows.length ? rowToMeasurement(result.rows[0] as Record<string, unknown>) : null;
}

export async function deleteMeasurementById(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM measurements WHERE id = $1 RETURNING id', [id]);
  return result.rows.length > 0;
}

export async function findProductMeasurements(productId: string): Promise<ProductMeasurement[] | null> {
  const product = await pool.query('SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL', [productId]);
  if (!product.rows.length) return null;
  const result = await pool.query(
    `SELECT pm.id, pm.measurement_id, pm.value, pm.sort_order, m.title, m.image_url
     FROM product_measurements pm JOIN measurements m ON m.id = pm.measurement_id
     WHERE pm.product_id = $1 ORDER BY pm.sort_order ASC, pm.id ASC`,
    [productId],
  );
  return (result.rows as Record<string, unknown>[]).map(rowToProductMeasurement);
}

export async function createProductMeasurement(productId: string, input: ProductMeasurementInput): Promise<ProductMeasurement | 'product_not_found' | 'measurement_not_found' | 'duplicate'> {
  const result = await pool.query(
    `INSERT INTO product_measurements (product_id, measurement_id, value, sort_order)
     SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL)
       AND EXISTS (SELECT 1 FROM measurements WHERE id = $2)
     ON CONFLICT (product_id, measurement_id) DO NOTHING
     RETURNING id, measurement_id, value, sort_order`,
    [productId, input.measurementId, input.value, input.sortOrder ?? 0],
  );
  if (result.rows.length) {
    const assignment = result.rows[0] as Record<string, unknown>;
    const definition = await pool.query('SELECT title, image_url FROM measurements WHERE id = $1', [input.measurementId]);
    return rowToProductMeasurement({ ...assignment, ...(definition.rows[0] as Record<string, unknown>) });
  }
  const product = await pool.query('SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL', [productId]);
  if (!product.rows.length) return 'product_not_found';
  const measurement = await pool.query('SELECT 1 FROM measurements WHERE id = $1', [input.measurementId]);
  return measurement.rows.length ? 'duplicate' : 'measurement_not_found';
}

export async function updateProductMeasurementById(productId: string, measurementId: string, input: UpdateProductMeasurementInput): Promise<ProductMeasurement | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.value !== undefined) { values.push(input.value); fields.push(`value = $${values.length}`); }
  if (input.sortOrder !== undefined) { values.push(input.sortOrder); fields.push(`sort_order = $${values.length}`); }
  values.push(productId, measurementId);
  const result = await pool.query(
    `UPDATE product_measurements SET ${fields.join(', ')}
     WHERE product_id = $${values.length - 1} AND measurement_id = $${values.length}
     RETURNING id, measurement_id, value, sort_order`,
    values,
  );
  if (!result.rows.length) return null;
  const definition = await pool.query('SELECT title, image_url FROM measurements WHERE id = $1', [measurementId]);
  return rowToProductMeasurement({ ...(result.rows[0] as Record<string, unknown>), ...(definition.rows[0] as Record<string, unknown>) });
}

export async function deleteProductMeasurementById(productId: string, measurementId: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM product_measurements WHERE product_id = $1 AND measurement_id = $2 RETURNING id', [productId, measurementId]);
  return result.rows.length > 0;
}
