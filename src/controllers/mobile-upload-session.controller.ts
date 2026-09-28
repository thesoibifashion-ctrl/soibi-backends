import type { Request, Response, NextFunction } from 'express';
import { HttpStatus } from '../types/api.types.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/response.js';
import {
  createOrGetMobileUploadSession,
  getMobileUploadSession,
  uploadMobileReceipt,
} from '../services/mobile-upload-session.service.js';
import {
  createMobileUploadSessionSchema,
  uploadMobileReceiptSchema,
} from '../validators/profile.validator.js';

export async function createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createMobileUploadSessionSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    const session = await createOrGetMobileUploadSession(parsed.data.sessionId);
    sendSuccess(res, 'Mobile upload session ready', { status: session.status }, HttpStatus.CREATED);
  } catch (error) { next(error); }
}

export async function readSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await getMobileUploadSession(req.params['sessionId'] as string);
    sendSuccess(res, 'Mobile upload session retrieved', session);
  } catch (error) { next(error); }
}

export async function patchSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = uploadMobileReceiptSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    const session = await uploadMobileReceipt(
      req.params['sessionId'] as string,
      parsed.data.receiptUrl,
      parsed.data.receiptPublicId,
    );
    sendSuccess(res, 'Mobile receipt uploaded', session);
  } catch (error) { next(error); }
}
