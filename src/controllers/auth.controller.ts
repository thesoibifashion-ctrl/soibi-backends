import type { Response, NextFunction, Request } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthenticatedRequest, MaybeAuthenticatedRequest } from '../types/api.types.js';
import { HttpStatus } from '../types/api.types.js';
import { requestCodeSchema, verifyCodeSchema } from '../validators/auth.validator.js';
import {
  getGoogleAuthorizationUrl,
  loginWithGoogleAuthorizationCode,
  requestEmailLoginCode,
  verifyEmailLoginCode,
} from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/response.js';
import { env } from '../config/env.js';
import { sendEmail } from '../utils/mailer.js';
import { buildAuthCodeEmail } from '../utils/authCodeEmail.js';
import { updateAuthenticatedProfile } from '../services/auth.service.js';
import { updateProfileSchema } from '../validators/profile.validator.js';

const GOOGLE_STATE_COOKIE = 'google_oauth_state';
const googleStateCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.isProduction,
  maxAge: 10 * 60 * 1000, 
  path: '/api/auth/google',
};

const clearGoogleStateCookieOptions = {
  httpOnly: googleStateCookieOptions.httpOnly,
  sameSite: googleStateCookieOptions.sameSite,
  secure: googleStateCookieOptions.secure,
  path: googleStateCookieOptions.path,
};

export async function requestCode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = requestCodeSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    const code = await requestEmailLoginCode(parsed.data.email);
    await sendEmail({ to: parsed.data.email, subject: 'Your Soibi sign-in code', html: buildAuthCodeEmail(code) });
    sendSuccess(res, 'Sign-in code sent');
  } catch (error) {
    next(error);
  }
}

export async function verifyCode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = verifyCodeSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    const session = await verifyEmailLoginCode(parsed.data.email, parsed.data.code);
    sendSuccess(res, 'Signed in', session);
  } catch (error) {
    next(error);
  }
}

export function beginGoogleOAuth(_req: Request, res: Response): void {
  const state = randomBytes(32).toString('hex');
  res.cookie(GOOGLE_STATE_COOKIE, state, googleStateCookieOptions);
  res.redirect(getGoogleAuthorizationUrl(state));
}

export async function completeGoogleOAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const state = req.query['state'];
    const cookieState = req.signedCookies[GOOGLE_STATE_COOKIE];
    res.clearCookie(GOOGLE_STATE_COOKIE, clearGoogleStateCookieOptions);

    if (!sameState(state, cookieState)) {
      throw AppError.unauthorized('Invalid or expired Google sign-in state');
    }

    if (typeof req.query['error'] === 'string') {
      throw AppError.unauthorized('Google sign-in was cancelled or denied');
    }

    const code = req.query['code'];
    if (typeof code !== 'string' || code.length === 0) {
      throw AppError.badRequest('Google sign-in did not return an authorization code');
    }

    const session = await loginWithGoogleAuthorizationCode(code);
    sendSuccess(res, 'Signed in with Google', session);
  } catch (error) {
    next(error);
  }
}

export function getMe(req: MaybeAuthenticatedRequest, res: Response): void {
  // req.user is guaranteed by requireAuth — assert non-null.
  const user = req.user as AuthenticatedRequest['user'];
  sendSuccess(res, 'Profile retrieved', user);
}

export async function patchMe(req: MaybeAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    const user = req.user as AuthenticatedRequest['user'];
    sendSuccess(res, 'Profile updated', await updateAuthenticatedProfile(user.id, parsed.data));
  } catch (error) {
    next(error);
  }
}

function sameState(state: unknown, cookieState: unknown): boolean {
  if (typeof state !== 'string' || typeof cookieState !== 'string') return false;
  const stateBuffer = Buffer.from(state);
  const cookieStateBuffer = Buffer.from(cookieState);
  return stateBuffer.length === cookieStateBuffer.length && timingSafeEqual(stateBuffer, cookieStateBuffer);
}
