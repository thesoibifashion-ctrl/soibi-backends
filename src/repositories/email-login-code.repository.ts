import { pool } from '../database/pool.js';

export async function createEmailLoginCode(email: string, codeHash: string, expiresAt: Date): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize requests for one address, including simultaneous requests.
    await client.query('SELECT pg_advisory_xact_lock(hashtext(lower($1)))', [email]);
    const recent = await client.query(
      `SELECT 1 FROM email_login_codes
       WHERE lower(email) = lower($1) AND created_at > now() - interval '60 seconds'
       LIMIT 1`,
      [email],
    );
    if (recent.rows.length > 0) {
      await client.query('COMMIT');
      return false;
    }
    await client.query(
      `INSERT INTO email_login_codes (email, code_hash, expires_at)
       VALUES (lower($1), $2, $3)`,
      [email, codeHash, expiresAt],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function consumeEmailLoginCode(email: string, matches: (hash: string) => Promise<boolean>): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, code_hash FROM email_login_codes
       WHERE lower(email) = lower($1) AND used_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [email],
    );
    if (result.rows.length === 0 || !await matches((result.rows[0] as Record<string, unknown>)['code_hash'] as string)) {
      await client.query('COMMIT');
      return false;
    }
    await client.query('UPDATE email_login_codes SET used_at = now() WHERE id = $1', [(result.rows[0] as Record<string, unknown>)['id']]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
