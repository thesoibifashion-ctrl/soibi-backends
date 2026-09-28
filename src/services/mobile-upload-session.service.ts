import {
  getMobileUploadSession as getSessionRecord,
  saveMobileUploadReceipt,
  upsertMobileUploadSession as upsertSessionRecord,
} from '../repositories/mobile-upload-session.repository.js';
import { AppError } from '../utils/AppError.js';

export const createOrGetMobileUploadSession = upsertSessionRecord;

export async function getMobileUploadSession(sessionId: string) {
  const session = await getSessionRecord(sessionId);
  if (!session) throw AppError.notFound('Mobile upload session not found or expired');
  return session;
}

export async function uploadMobileReceipt(sessionId: string, receiptUrl: string, receiptPublicId: string) {
  const session = await saveMobileUploadReceipt(sessionId, receiptUrl, receiptPublicId);
  if (!session) throw AppError.notFound('Mobile upload session not found or expired');
  return session;
}
