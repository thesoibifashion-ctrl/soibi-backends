import { pool } from '../database/pool.js';

export interface RefreshTokenRecord {
  id: string;
  familyId: string;
  profileId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export async function createRefreshToken(input: { familyId: string; profileId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
  await pool.query(
    `INSERT INTO refresh_tokens (family_id, profile_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [input.familyId, input.profileId, input.tokenHash, input.expiresAt],
  );
}

export async function rotateRefreshToken(input: {
  tokenHash: string;
  replacementHash: string;
  replacementExpiresAt: Date;
}): Promise<{ status: 'ok'; profileId: string; familyId: string } | { status: 'invalid' | 'expired' | 'revoked' }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, family_id, profile_id, expires_at, revoked_at
       FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`, [input.tokenHash],
    );
    const row = found.rows[0] as Record<string, unknown> | undefined;
    if (!row) { await client.query('COMMIT'); return { status: 'invalid' }; }
    const familyId = row['family_id'] as string;
    const revokedAt = row['revoked_at'] as Date | null;
    const expiresAt = new Date(row['expires_at'] as string | Date);
    if (revokedAt) {
      // A revoked token presented again signals replay; invalidate its family.
      await client.query('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1', [familyId]);
      await client.query('COMMIT');
      return { status: 'revoked' };
    }
    if (expiresAt.getTime() <= Date.now()) {
      await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row['id']]);
      await client.query('COMMIT');
      return { status: 'expired' };
    }

    const replacement = await client.query(
      `INSERT INTO refresh_tokens (family_id, profile_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [familyId, row['profile_id'], input.replacementHash, input.replacementExpiresAt],
    );
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`,
      [row['id'], (replacement.rows[0] as Record<string, unknown>)['id']],
    );
    await client.query('COMMIT');
    return { status: 'ok', profileId: row['profile_id'] as string, familyId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT family_id FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE', [tokenHash]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (row) await client.query('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1', [row['family_id']]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
