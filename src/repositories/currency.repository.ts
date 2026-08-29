import { pool } from '../database/pool.js';
import type { Currency, ManagedCurrency } from '../types/currency.types.js';

function rowToCurrency(row: Record<string, unknown>, managed = false): Currency | ManagedCurrency {
  const currency: Currency = {
    id: row['id'] as string, code: row['code'] as string, name: row['name'] as string,
    symbol: row['symbol'] as string, isDefault: row['is_default'] as boolean, isActive: row['is_active'] as boolean,
  };
  return managed ? { ...currency, createdAt: (row['created_at'] as Date).toISOString(), updatedAt: (row['updated_at'] as Date).toISOString() } : currency;
}

const RETURNING = 'id, code, name, symbol, is_default, is_active, created_at, updated_at';

export async function findActiveCurrencies(): Promise<Currency[]> {
  const result = await pool.query(`SELECT ${RETURNING} FROM currencies WHERE is_active = true ORDER BY is_default DESC, code ASC`);
  return result.rows.map((row) => rowToCurrency(row as Record<string, unknown>) as Currency);
}
export async function findAllCurrencies(): Promise<ManagedCurrency[]> {
  const result = await pool.query(`SELECT ${RETURNING} FROM currencies ORDER BY is_default DESC, code ASC`);
  return result.rows.map((row) => rowToCurrency(row as Record<string, unknown>, true) as ManagedCurrency);
}
export async function createCurrency(input: Pick<Currency, 'code' | 'name' | 'symbol'> & { isActive?: boolean; isDefault?: boolean }): Promise<ManagedCurrency> {
  const client = await pool.connect();
  try { await client.query('BEGIN');
    if (input.isDefault) await client.query('UPDATE currencies SET is_default = false WHERE is_default = true');
    const result = await client.query(`INSERT INTO currencies (code, name, symbol, is_active, is_default) VALUES ($1, $2, $3, $4, $5) RETURNING ${RETURNING}`,
      [input.code, input.name, input.symbol, input.isActive ?? true, input.isDefault ?? false]);
    await client.query('COMMIT'); return rowToCurrency(result.rows[0] as Record<string, unknown>, true) as ManagedCurrency;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function updateCurrency(id: string, input: Partial<Pick<Currency, 'code' | 'name' | 'symbol' | 'isActive'>>): Promise<ManagedCurrency | null> {
  const fields: Record<string, string> = { code: 'code', name: 'name', symbol: 'symbol', isActive: 'is_active' };
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([key], index) => `${fields[key]} = $${index + 1}`);
  const result = await pool.query(`UPDATE currencies SET ${assignments.join(', ')} WHERE id = $${values.length + 1} RETURNING ${RETURNING}`, [...values, id]);
  return result.rows.length ? rowToCurrency(result.rows[0] as Record<string, unknown>, true) as ManagedCurrency : null;
}
export async function setDefaultCurrency(id: string): Promise<ManagedCurrency | null> {
  const client = await pool.connect();
  try { await client.query('BEGIN');
    await client.query('UPDATE currencies SET is_default = false WHERE id <> $1 AND is_default = true', [id]);
    const result = await client.query(`UPDATE currencies SET is_default = true, is_active = true WHERE id = $1 RETURNING ${RETURNING}`, [id]);
    if (!result.rows.length) { await client.query('ROLLBACK'); return null; }
    await client.query('COMMIT'); return rowToCurrency(result.rows[0] as Record<string, unknown>, true) as ManagedCurrency;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function deactivateCurrency(id: string): Promise<boolean | 'default'> {
  const result = await pool.query('UPDATE currencies SET is_active = false WHERE id = $1 AND is_default = false AND is_active = true RETURNING id', [id]);
  if (result.rows.length) return true;
  const current = await pool.query('SELECT is_default FROM currencies WHERE id = $1', [id]);
  return current.rows.length && (current.rows[0] as Record<string, unknown>)['is_default'] ? 'default' : false;
}
