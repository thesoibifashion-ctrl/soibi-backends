import { pool } from '../database/pool.js';
import type { AuthUser } from '../types/api.types.js';

type ProfileCredentials = AuthUser & { passwordHash: string | null };

function rowToAuthUser(row: Record<string, unknown>): AuthUser {
  return {
    id: row['id'] as string,
    email: row['email'] as string,
    fullName: row['full_name'] as string,
    phone: (row['phone'] as string | null) ?? null,
    avatarUrl: (row['avatar_url'] as string | null) ?? null,
    role: row['role'] as AuthUser['role'],
    isActive: row['is_active'] as boolean,
  };
}

const profileFields = 'id, email, full_name, phone, avatar_url, role, is_active';

export async function findProfileById(id: string): Promise<AuthUser | null> {
  const result = await pool.query(`SELECT ${profileFields} FROM profiles WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return rowToAuthUser(result.rows[0] as Record<string, unknown>);
}

export async function findProfileCredentialsByEmail(email: string): Promise<ProfileCredentials | null> {
  const result = await pool.query(
    `SELECT ${profileFields}, password_hash FROM profiles WHERE lower(email) = lower($1)`,
    [email],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return { ...rowToAuthUser(row), passwordHash: (row['password_hash'] as string | null) ?? null };
}

export async function findProfileByGoogleSubject(googleSubject: string): Promise<AuthUser | null> {
  const result = await pool.query(
    `SELECT ${profileFields} FROM profiles WHERE google_subject = $1`,
    [googleSubject],
  );
  if (result.rows.length === 0) return null;
  return rowToAuthUser(result.rows[0] as Record<string, unknown>);
}

export async function createProfile(data: {
  email: string;
  passwordHash: string | null;
  fullName: string;
  avatarUrl?: string | null;
  googleSubject?: string | null;
}): Promise<AuthUser> {
  const result = await pool.query(
    `INSERT INTO profiles (email, password_hash, full_name, avatar_url, google_subject)
     VALUES (lower($1), $2, $3, $4, $5)
     RETURNING ${profileFields}`,
    [data.email, data.passwordHash, data.fullName, data.avatarUrl ?? null, data.googleSubject ?? null],
  );
  return rowToAuthUser(result.rows[0] as Record<string, unknown>);
}

export async function linkGoogleSubject(profileId: string, googleSubject: string): Promise<AuthUser | null> {
  const result = await pool.query(
    `UPDATE profiles
     SET google_subject = $1
     WHERE id = $2
       AND (google_subject IS NULL OR google_subject = $1)
     RETURNING ${profileFields}`,
    [googleSubject, profileId],
  );
  if (result.rows.length === 0) return null;
  return rowToAuthUser(result.rows[0] as Record<string, unknown>);
}

export async function updateProfile(
  profileId: string,
  data: Partial<{ fullName: string; phone: string; avatarUrl: string }>,
): Promise<AuthUser | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.fullName !== undefined) {
    fields.push(`full_name = $${idx++}`);
    values.push(data.fullName);
  }
  if (data.phone !== undefined) {
    fields.push(`phone = $${idx++}`);
    values.push(data.phone);
  }
  if (data.avatarUrl !== undefined) {
    fields.push(`avatar_url = $${idx++}`);
    values.push(data.avatarUrl);
  }
  if (fields.length === 0) return findProfileById(profileId);

  values.push(profileId);
  const result = await pool.query(
    `UPDATE profiles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING ${profileFields}`,
    values,
  );
  if (result.rows.length === 0) return null;
  return rowToAuthUser(result.rows[0] as Record<string, unknown>);
}
