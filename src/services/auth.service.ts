import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomInt } from 'node:crypto';
import { env } from '../config/env.js';
import {
  createProfile,
  findProfileById,
  findProfileByEmail,
  findProfileCredentialsByEmail,
  findProfileByGoogleSubject,
  linkGoogleSubject,
  updateProfile as updateProfileRecord,
} from '../repositories/profile.repository.js';
import { consumeEmailLoginCode, createEmailLoginCode } from '../repositories/email-login-code.repository.js';
import { AppError } from '../utils/AppError.js';
import type { AuthUser } from '../types/api.types.js';

const OTP_SALT_ROUNDS = 12;

export interface AuthSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: AuthUser;
}

interface GoogleTokenResponse {
  access_token?: unknown;
}

interface GoogleUserInfo {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
}

function createSession(user: AuthUser): AuthSession {
  const accessToken = jwt.sign({}, env.jwtSecret, {
    algorithm: 'HS256',
    subject: user.id,
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });

  return { accessToken, tokenType: 'Bearer', expiresIn: env.jwtExpiresIn, user };
}

export async function requestEmailLoginCode(email: string): Promise<string> {
  const code = String(randomInt(100000, 1_000_000));
  const created = await createEmailLoginCode(email, await bcrypt.hash(code, OTP_SALT_ROUNDS), new Date(Date.now() + 10 * 60 * 1000));
  if (!created) throw AppError.tooManyRequests('Please wait 60 seconds before requesting another code');
  return code;
}

export async function verifyEmailLoginCode(email: string, code: string): Promise<AuthSession> {
  const valid = await consumeEmailLoginCode(email, (hash) => bcrypt.compare(code, hash));
  if (!valid) throw AppError.unauthorized('Invalid or expired sign-in code');

  let user = await findProfileByEmail(email);
  if (!user) {
    try {
      user = await createProfile({
        email,
        passwordHash: null,
        fullName: email.split('@')[0] || 'Soibi customer',
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      user = await findProfileByEmail(email);
      if (!user) throw error;
    }
  }
  if (!user.isActive) throw AppError.forbidden('Account is disabled');
  return createSession(user);
}

export function getGoogleAuthorizationUrl(state: string): string {
  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizationUrl.search = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleOAuthRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  }).toString();
  return authorizationUrl.toString();
}

export async function loginWithGoogleAuthorizationCode(code: string): Promise<AuthSession> {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleOAuthRedirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) throw AppError.unauthorized('Google sign-in could not be completed');
  const token = await tokenResponse.json() as GoogleTokenResponse;
  if (typeof token.access_token !== 'string' || token.access_token.length === 0) {
    throw AppError.unauthorized('Google sign-in could not be completed');
  }

  const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!userInfoResponse.ok) throw AppError.unauthorized('Google profile could not be verified');

  const googleUser = await userInfoResponse.json() as GoogleUserInfo;
  if (
    typeof googleUser.sub !== 'string' || googleUser.sub.length === 0 ||
    typeof googleUser.email !== 'string' || googleUser.email.length === 0 ||
    googleUser.email_verified !== true
  ) {
    throw AppError.unauthorized('Google account must have a verified email address');
  }

  let user = await findProfileByGoogleSubject(googleUser.sub);
  if (!user) {
    const profileWithEmail = await findProfileCredentialsByEmail(googleUser.email);
    if (profileWithEmail) {
      user = await linkGoogleSubject(profileWithEmail.id, googleUser.sub);
      if (!user) throw AppError.conflict('This email is already linked to another Google account');
    } else {
      try {
        user = await createProfile({
          email: googleUser.email,
          passwordHash: null,
          fullName: googleDisplayName(googleUser.name, googleUser.email),
          avatarUrl: typeof googleUser.picture === 'string' ? googleUser.picture : null,
          googleSubject: googleUser.sub,
        });
      } catch (error: unknown) {
        if (!isUniqueViolation(error)) throw error;
        user = await findProfileByGoogleSubject(googleUser.sub);
        if (!user) throw error;
      }
    }
  }

  if (!user.isActive) throw AppError.forbidden('Account is disabled');
  return createSession(user);
}

export async function resolveUserFromToken(token: string): Promise<AuthUser> {
  let subject: string | undefined;
  try {
    const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    subject = typeof decoded === 'string' ? undefined : decoded.sub;
  } catch {
    throw AppError.unauthorized('Invalid or expired token');
  }

  if (!subject) throw AppError.unauthorized('Invalid or expired token');

  const profile = await findProfileById(subject);
  if (!profile) throw AppError.unauthorized('Invalid or expired token');
  if (!profile.isActive) throw AppError.forbidden('Account is disabled');
  return profile;
}

export async function updateAuthenticatedProfile(profileId: string, data: Parameters<typeof updateProfileRecord>[1]): Promise<AuthUser> {
  const profile = await updateProfileRecord(profileId, data);
  if (!profile) throw AppError.notFound('Profile not found');
  return profile;
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function googleDisplayName(name: unknown, email: string): string {
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : email.split('@')[0] ?? 'Google user';
}
