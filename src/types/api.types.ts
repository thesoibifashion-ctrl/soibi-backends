// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  message: string;
  data: T;
}

export interface ApiError {
  success: false;
  message: string;
  error: Record<string, unknown>;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ─── Auth Types ──────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;           // profiles.id and JWT subject
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: 'customer' | 'admin' | 'super_admin';
  isActive: boolean;
}

import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: AuthUser; // guaranteed present on routes protected by requireAuth
}

// Loose version used for route/middleware signatures where user may not yet be set.
export interface MaybeAuthenticatedRequest extends Request {
  user?: AuthUser;
}

// ─── HTTP Status Codes ────────────────────────────────────────────────────────

export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];
