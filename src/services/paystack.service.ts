import axios from 'axios';
import { pool } from '../database/pool.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const PAYSTACK_BASE = 'https://api.paystack.co';

const paystackHttp = axios.create({
  baseURL: PAYSTACK_BASE,
  headers: { Authorization: `Bearer ${env.paystackSecretKey}` },
});

export interface PaystackInitResult {
  accessCode: string;
  reference: string;
  authorizationUrl: string;
}

/**
 * Initializes a Paystack transaction for the given cart_history order.
 * Amount must be in the smallest unit of the order currency (e.g. kobo for NGN, cents for USD).
 */
export async function initializePaystackTransaction(
  historyId: string,
  email: string,
  amountSmallestUnit: number,
  currency: string,
  metadata?: Record<string, unknown>,
): Promise<PaystackInitResult> {
  // Generate a unique reference tied to this order
  const reference = `SOIBI-${historyId}-${Date.now()}`;

  const response = await paystackHttp.post<{
    status: boolean;
    data: { access_code: string; reference: string; authorization_url: string };
  }>('/transaction/initialize', {
    email,
    amount: amountSmallestUnit,
    reference,
    currency,
    callback_url: `${env.frontendUrl}/checkout`,
    metadata: { historyId, ...metadata },
  });

  if (!response.data.status) {
    throw AppError.badRequest('Paystack transaction initialization failed');
  }

  // Persist the reference on the order so verification can look it up
  await pool.query(
    `UPDATE cart_history SET paystack_reference = $1 WHERE id = $2`,
    [reference, historyId],
  );

  return {
    accessCode: response.data.data.access_code,
    reference: response.data.data.reference,
    authorizationUrl: response.data.data.authorization_url,
  };
}

export interface PaystackVerifyResult {
  historyId: string;
  orderNumber: string | null;
  paymentStatus: string;
  paystackStatus: string;
  amountPaid: number;
  currency: string;
}

/**
 * Verifies a Paystack transaction by reference.
 * Only marks the order as paid when Paystack confirms success.
 * Safe to call more than once — already-paid orders are returned as-is.
 */
export async function verifyPaystackTransaction(reference: string): Promise<PaystackVerifyResult> {
  // Look up the order by reference before calling Paystack
  const orderResult = await pool.query<{
    id: string;
    order_number: string | null;
    payment_status: string;
    total_snapshot: string;
    currency: string | null;
    selected_currency: string | null;
  }>(
    `SELECT id, order_number, payment_status, total_snapshot, currency, selected_currency
     FROM cart_history WHERE paystack_reference = $1`,
    [reference],
  );

  if (orderResult.rows.length === 0) {
    throw AppError.notFound('No order found for this payment reference');
  }

  const order = orderResult.rows[0]!;

  // Idempotency: already verified — return current state without re-calling Paystack
  if (order.payment_status === 'paid') {
    return {
      historyId: order.id,
      orderNumber: order.order_number,
      paymentStatus: 'paid',
      paystackStatus: 'success',
      amountPaid: 0,
      currency: order.selected_currency ?? order.currency ?? 'NGN',
    };
  }

  // Verify with Paystack
  const response = await paystackHttp.get<{
    status: boolean;
    data: {
      status: string;
      amount: number;
      currency: string;
      metadata?: { historyId?: string };
    };
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);

  if (!response.data.status) {
    throw AppError.badRequest('Paystack verification request failed');
  }

  const tx = response.data.data;

  // Confirm the reference belongs to this order (defence-in-depth)
  if (tx.metadata?.historyId && tx.metadata.historyId !== order.id) {
    throw AppError.badRequest('Payment reference does not match the order');
  }

  // Use the currency stored on the order — the same one sent to Paystack at initialization
  const orderCurrency = (order.selected_currency ?? order.currency ?? 'NGN').toUpperCase();
  const expectedSmallestUnit = Math.round(parseFloat(order.total_snapshot) * 100);
  const isVerified =
    tx.status === 'success' &&
    tx.currency.toUpperCase() === orderCurrency &&
    tx.amount === expectedSmallestUnit;

  if (isVerified) {
    await pool.query(
      `UPDATE cart_history SET payment_status = 'paid' WHERE id = $1 AND payment_status != 'paid'`,
      [order.id],
    );
  }

  return {
    historyId: order.id,
    orderNumber: order.order_number,
    paymentStatus: isVerified ? 'paid' : 'unpaid',
    paystackStatus: tx.status,
    amountPaid: tx.amount,
    currency: tx.currency,
  };
}

/**
 * Handles an inbound Paystack webhook event.
 * Only processes charge.success; all other events are acknowledged and ignored.
 * Safe to call more than once for the same reference.
 */
export async function handlePaystackWebhook(event: string, data: Record<string, unknown>): Promise<void> {
  if (event !== 'charge.success') return;

  const reference = data['reference'] as string | undefined;
  if (!reference) return;

  const orderResult = await pool.query<{ id: string; payment_status: string; total_snapshot: string; currency: string | null; selected_currency: string | null }>(
    `SELECT id, payment_status, total_snapshot, currency, selected_currency FROM cart_history WHERE paystack_reference = $1`,
    [reference],
  );

  if (orderResult.rows.length === 0) return;
  const order = orderResult.rows[0]!;
  if (order.payment_status === 'paid') return; // already processed

  const amount = data['amount'] as number | undefined;
  const currency = data['currency'] as string | undefined;
  const orderCurrency = (order.selected_currency ?? order.currency ?? 'NGN').toUpperCase();
  const expectedSmallestUnit = Math.round(parseFloat(order.total_snapshot) * 100);

  if (
    (data['status'] as string | undefined) !== 'success' ||
    currency?.toUpperCase() !== orderCurrency ||
    amount !== expectedSmallestUnit
  ) return;

  await pool.query(
    `UPDATE cart_history SET payment_status = 'paid' WHERE id = $1 AND payment_status != 'paid'`,
    [order.id],
  );
}
