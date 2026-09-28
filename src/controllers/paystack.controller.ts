import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import type { MaybeAuthenticatedRequest } from '../types/api.types.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/response.js';
import { env } from '../config/env.js';
import { pool } from '../database/pool.js';
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
  handlePaystackWebhook,
} from '../services/paystack.service.js';

/**
 * POST /api/payments/paystack/initialize
 * Body: { historyId: string }
 * Authenticated (customer token) or public for guest orders.
 *
 * Looks up the order, derives the email and amount, then initializes
 * a Paystack transaction. Returns access_code and reference.
 */
export async function initializePayment(
  req: MaybeAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { historyId } = req.body as { historyId?: string };
    if (!historyId) throw AppError.badRequest('historyId is required');

    // Fetch the order — join profiles to get the email for authenticated orders
    const result = await pool.query<{
      id: string;
      profile_id: string | null;
      guest_email: string | null;
      total_snapshot: string;
      payment_status: string;
      paystack_reference: string | null;
      order_number: string | null;
      currency: string | null;
      selected_currency: string | null;
    }>(
      `SELECT ch.id, ch.profile_id, ch.guest_email, ch.total_snapshot,
              ch.payment_status, ch.paystack_reference, ch.order_number,
              ch.currency, ch.selected_currency
       FROM cart_history ch
       WHERE ch.id = $1`,
      [historyId],
    );

    if (result.rows.length === 0) throw AppError.notFound('Order not found');
    const order = result.rows[0]!;

    // Prevent re-initializing an already-paid order
    if (order.payment_status === 'paid') {
      throw AppError.badRequest('This order has already been paid');
    }

    // Resolve the customer email
    let email: string | null = order.guest_email;
    if (!email && order.profile_id) {
      const profileResult = await pool.query<{ email: string }>(
        `SELECT email FROM profiles WHERE id = $1`,
        [order.profile_id],
      );
      email = profileResult.rows[0]?.email ?? null;
    }
    // If a token was supplied, prefer the authenticated user's email
    if (req.user?.email) email = req.user.email;

    if (!email) throw AppError.badRequest('No email address found for this order');

    // Enforce ownership: authenticated users may only pay their own orders
    if (req.user && order.profile_id && order.profile_id !== req.user.id) {
      throw AppError.forbidden('You do not have access to this order');
    }

    // Convert to smallest unit (×100) — works for NGN kobo, USD cents, GBP pence, etc.
    const orderCurrency = (order.selected_currency ?? order.currency ?? 'NGN').toUpperCase();
    const amountSmallestUnit = Math.round(parseFloat(order.total_snapshot) * 100);
    if (amountSmallestUnit <= 0) throw AppError.badRequest('Order amount must be greater than zero');

    const txResult = await initializePaystackTransaction(historyId, email, amountSmallestUnit, orderCurrency, {
      orderNumber: order.order_number,
    });

    sendSuccess(res, 'Payment initialized', {
      accessCode: txResult.accessCode,
      reference: txResult.reference,
      authorizationUrl: txResult.authorizationUrl,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/payments/paystack/verify/:reference
 * Public — the frontend calls this after the Paystack popup closes.
 * The backend re-verifies with Paystack; the frontend result is never trusted.
 */
export async function verifyPayment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const reference = req.params['reference'] as string;
    if (!reference) throw AppError.badRequest('reference is required');

    const result = await verifyPaystackTransaction(reference);
    sendSuccess(res, 'Payment verification complete', result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/paystack/webhook
 * Public — called by Paystack servers only.
 * Signature is verified using HMAC-SHA512 before any processing.
 */
export async function paystackWebhook(
  req: Request & { rawBody?: Buffer },
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const signature = req.headers['x-paystack-signature'];
    if (!signature || Array.isArray(signature)) {
      res.sendStatus(400);
      return;
    }

    if (!req.rawBody) {
      res.sendStatus(400);
      return;
    }

    // Verify HMAC-SHA512 using the raw body Buffer
    const hash = crypto
      .createHmac('sha512', env.paystackSecretKey)
      .update(req.rawBody)
      .digest('hex');

    if (hash !== signature) {
      res.sendStatus(401);
      return;
    }

    const { event, data } = req.body as { event: string; data: Record<string, unknown> };
    await handlePaystackWebhook(event, data);

    // Paystack requires a 200 response quickly
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}
