import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';

// Small per-process guard for auth abuse. Deployments with multiple instances
// should also apply an IP limit at the edge/load balancer.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function authRateLimit(maximum = 20, windowMs = 15 * 60 * 1000) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${req.ip ?? 'unknown'}:${req.path}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maximum) {
      next(AppError.tooManyRequests('Too many authentication attempts. Please try again later.'));
      return;
    }
    next();
  };
}
