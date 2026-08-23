import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import {
  createProfile,
  findProfileById,
  findProfileCredentialsByEmail,
  findProfileByGoogleSubject,
  linkGoogleSubject,
} from '../repositories/profile.repository.js';
import { AppError } from '../utils/AppError.js';
import type { AuthUser } from '../types/api.types.js';

const PASSWORD_SALT_ROUNDS = 12;

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

export async function registerUser(data: {
  email: string;
  password: string;
  fullName: string;
}): Promise<AuthSession> {
  const existing = await findProfileCredentialsByEmail(data.email);
  if (existing) throw AppError.conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(data.password, PASSWORD_SALT_ROUNDS);
  try {
    const user = await createProfile({ email: data.email, passwordHash, fullName: data.fullName });
    return createSession(user);
  } catch (error: unknown) {
    if (isUniqueViolation(error)) throw AppError.conflict('An account with this email already exists');
    throw error;
  }
}

export async function loginUser(email: string, password: string): Promise<AuthSession> {
  const profile = await findProfileCredentialsByEmail(email);
  const validPassword = profile?.passwordHash ? await bcrypt.compare(password, profile.passwordHash) : false;

  if (!profile || !validPassword) throw AppError.unauthorized('Invalid email or password');
  if (!profile.isActive) throw AppError.forbidden('Account is disabled');

  const { passwordHash: _passwordHash, ...user } = profile;
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

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function googleDisplayName(name: unknown, email: string): string {
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : email.split('@')[0] ?? 'Google user';
}
