import { pool } from '../database/pool.js';

export interface MobileUploadSession {
  status: 'pending' | 'uploaded';
  receiptUrl: string | null;
  receiptPublicId: string | null;
}

function rowToSession(row: Record<string, unknown>): MobileUploadSession {
  return {
    status: row['status'] as MobileUploadSession['status'],
    receiptUrl: (row['receipt_url'] as string | null) ?? null,
    receiptPublicId: (row['receipt_public_id'] as string | null) ?? null,
  };
}

export async function upsertMobileUploadSession(sessionId: string): Promise<MobileUploadSession> {
  const result = await pool.query(
    `INSERT INTO mobile_upload_sessions (session_id)
     VALUES ($1)
     ON CONFLICT (session_id) DO UPDATE
       SET receipt_url = NULL,
           receipt_public_id = NULL,
           status = 'pending',
           created_at = now(),
           expires_at = now() + interval '30 minutes'
       WHERE mobile_upload_sessions.expires_at <= now()
     RETURNING status, receipt_url, receipt_public_id`,
    [sessionId],
  );
  if (result.rows.length > 0) return rowToSession(result.rows[0] as Record<string, unknown>);
  const current = await getMobileUploadSession(sessionId);
  if (!current) throw new Error('Mobile upload session expired while being created');
  return current;
}

export async function getMobileUploadSession(sessionId: string): Promise<MobileUploadSession | null> {
  const result = await pool.query(
    `SELECT status, receipt_url, receipt_public_id
     FROM mobile_upload_sessions
     WHERE session_id = $1 AND expires_at > now()`,
    [sessionId],
  );
  if (result.rows.length === 0) return null;
  return rowToSession(result.rows[0] as Record<string, unknown>);
}

export async function saveMobileUploadReceipt(
  sessionId: string,
  receiptUrl: string,
  receiptPublicId: string,
): Promise<MobileUploadSession | null> {
  const result = await pool.query(
    `UPDATE mobile_upload_sessions
     SET receipt_url = $2, receipt_public_id = $3, status = 'uploaded'
     WHERE session_id = $1 AND expires_at > now()
     RETURNING status, receipt_url, receipt_public_id`,
    [sessionId, receiptUrl, receiptPublicId],
  );
  if (result.rows.length === 0) return null;
  return rowToSession(result.rows[0] as Record<string, unknown>);
}
