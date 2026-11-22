import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { pool } from '../database/pool.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { sendEmail } from '../utils/mailer.js';
import { getNotificationSettings } from '../utils/notificationSettings.js';
import { buildCartSubmissionEmail } from '../utils/cartSubmissionEmail.js';
import { buildCustomerPaymentEmail } from '../utils/customerEmails.js';
import type { CartHistoryItem } from '../types/cart.types.js';

const PAYSTACK_BASE = 'https://api.paystack.co';
const PAYSTACK_TIMEOUT_MS = 15_000;
const ATTEMPT_LEASE_MS = 60_000;
const MIN_ABANDONED_ATTEMPT_AGE_MS = 30 * 60_000;

const paystackHttp = axios.create({
  baseURL: PAYSTACK_BASE,
  timeout: PAYSTACK_TIMEOUT_MS,
  headers: { Authorization: `Bearer ${env.paystackSecretKey}` },
});

export interface PaystackInitResult {
  status: 'ready' | 'paid';
  accessCode?: string;
  reference?: string;
  authorizationUrl?: string;
}

type PaystackTransaction = {
  status: string;
  amount: number;
  currency: string;
  reference?: string;
  metadata?: { historyId?: string };
};

type PaymentAttempt = {
  id: string;
  cart_history_id: string;
  paystack_reference: string;
  status: string;
  access_code: string | null;
  authorization_url: string | null;
  amount_kobo: string;
  currency: string;
  recovery_attempted: boolean;
  created_at: Date;
  claimed_at: Date | null;
};

type AxiosLikeError = {
  isAxiosError: true;
  message: string;
  response?: { status?: number; data?: unknown };
};

function getAxiosError(error: unknown): AxiosLikeError | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { isAxiosError?: unknown };
  return candidate.isAxiosError === true ? error as AxiosLikeError : null;
}

function leaseExpired(date: Date | null): boolean {
  return !date || Date.now() - date.getTime() > ATTEMPT_LEASE_MS;
}

async function verifyAtPaystack(reference: string): Promise<PaystackTransaction | null> {
  try {
    const response = await paystackHttp.get<{ status: boolean; message?: string; data: PaystackTransaction }>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    if (!response.data.status) {
      if (/not found|does not exist/i.test(response.data.message ?? '')) return null;
      throw AppError.badRequest('Paystack verification request failed');
    }
    return response.data.data;
  } catch (error) {
    if (getAxiosError(error)?.response?.status === 404) return null;
    throw error;
  }
}

async function markOrderPaid(historyId: string, attemptId?: string): Promise<void> {
  const client = await pool.connect();
  let changedToPaid = false;
  try {
    await client.query('BEGIN');
    const orderResult = await client.query<{
      id: string;
      profile_id: string | null;
      original_cart_id: string | null;
      source_cart_item_ids: string[] | null;
      items: unknown[];
      status: string;
      payment_status: string;
    }>(
      `SELECT id, profile_id, original_cart_id, source_cart_item_ids, items, status, payment_status
       FROM cart_history WHERE id = $1 FOR UPDATE`,
      [historyId],
    );
    const order = orderResult.rows[0];
    if (!order) throw AppError.notFound('Order not found');
    if (order.payment_status === 'paid') {
      await client.query('COMMIT');
      return;
    }

    if (order.profile_id !== null) {
      if (order.original_cart_id) {
        const sourceResult = await client.query<{ id: string; profile_id: string | null; status: string }>(
          `SELECT id, profile_id, status FROM carts WHERE id = $1 FOR UPDATE`, [order.original_cart_id],
        );
        const sourceCart = sourceResult.rows[0];
        if (sourceCart?.status === 'active' && sourceCart.profile_id === order.profile_id) {
          if (!order.source_cart_item_ids || order.source_cart_item_ids.length !== order.items.length) {
            throw new Error(`Cannot finalize paid order ${historyId}: source cart ${order.original_cart_id} item IDs are missing`);
          }
          await client.query(`SELECT id FROM cart_items WHERE cart_id = $1 FOR UPDATE`, [sourceCart.id]);
          await client.query(`UPDATE carts SET status = 'submitted', updated_at = now() WHERE id = $1`, [sourceCart.id]);
          const newCart = await client.query<{ id: string }>(
            `INSERT INTO carts (profile_id, status) VALUES ($1, 'active') RETURNING id`, [order.profile_id],
          );
          await client.query(
            `UPDATE cart_items SET cart_id = $2, updated_at = now()
             WHERE cart_id = $1 AND id <> ALL($3::uuid[])`,
            [sourceCart.id, newCart.rows[0]!.id, order.source_cart_item_ids],
          );
        } else {
          console.warn('[paystack] Paid order source cart is not active; manual reconciliation required', {
            orderId: historyId,
            sourceCartId: order.original_cart_id,
            sourceCartStatus: !sourceCart ? 'missing' : sourceCart.profile_id !== order.profile_id ? 'owner_mismatch' : sourceCart.status,
          });
        }
      } else {
        console.warn('[paystack] Paid profile order has no source cart; manual reconciliation required', {
          orderId: historyId,
          sourceCartId: null,
        });
      }
    }

    if (attemptId) {
      await client.query(
        `UPDATE payment_attempts SET status = 'paid', updated_at = now() WHERE id = $1`,
        [attemptId],
      );
      await client.query(
        `UPDATE payment_attempts SET status = 'superseded', updated_at = now()
         WHERE cart_history_id = $1 AND id <> $2 AND status IN ('initializing', 'ready')`,
        [historyId, attemptId],
      );
    }
    const changesOrderStatus = ['pending_payment', 'payment_abandoned'].includes(order.status);
    await client.query(
      `UPDATE cart_history SET payment_status = 'paid',
         status = CASE WHEN status IN ('pending_payment', 'payment_abandoned') THEN 'submitted' ELSE status END,
         completed_at = CASE WHEN status IN ('pending_payment', 'payment_abandoned') THEN now() ELSE completed_at END
       WHERE id = $1`, [historyId],
    );
    if (changesOrderStatus) {
      await client.query(
        `INSERT INTO cart_order_status_history (cart_history_id, old_status, new_status, changed_by, note)
         VALUES ($1, $2, 'submitted', $3, 'Paystack payment confirmed')`,
        [historyId, order.status, order.profile_id],
      );
    }
    await client.query('COMMIT');
    changedToPaid = true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (changedToPaid) {
    void sendPaystackPaidEmails(historyId).catch((error: unknown) => {
      console.error('[paystack] Paid email event failed', { orderId: historyId, event: 'paystack_paid', error });
    });
  }
}

async function sendPaystackPaidEmails(historyId: string): Promise<void> {
  const result = await pool.query<{
    order_number: string; status: string; profile_id: string | null; customer_name: string | null;
    customer_email: string | null; customer_phone: string | null; contact_method: string | null;
    items: CartHistoryItem[]; total_snapshot: string | number;
  }>(
    `SELECT ch.order_number, ch.status, ch.profile_id, COALESCE(p.full_name, ch.guest_name) AS customer_name,
            COALESCE(p.email, ch.guest_email) AS customer_email, COALESCE(p.phone, ch.guest_phone) AS customer_phone,
            ch.contact_method, ch.items, ch.total_snapshot
     FROM cart_history ch LEFT JOIN profiles p ON p.id = ch.profile_id
     WHERE ch.id = $1`, [historyId],
  );
  const order = result.rows[0];
  if (!order || ['pending_payment', 'payment_abandoned'].includes(order.status)) return;
  const settings = await getNotificationSettings();
  const orderNumber = order.order_number ?? historyId;
  const emails: Array<{ event: string; promise: Promise<void> }> = [];
  if (settings.notifyCustomerOnCart && order.customer_email) {
    emails.push({ event: 'paystack_customer_paid', promise: sendEmail({
      to: order.customer_email,
      subject: 'Payment received',
      html: buildCustomerPaymentEmail({
        customerName: order.customer_name ?? 'Valued Customer', orderNumber,
        title: 'Payment received', message: 'We have received your payment. Our team will be in touch with the next steps shortly.',
        items: order.items, total: Number(order.total_snapshot), currency: 'NGN',
      }),
    }) });
  }
  if (settings.notifyAdminOnCart) {
    emails.push({ event: 'paystack_admin_paid', promise: sendEmail({
      to: settings.notificationEmail,
      subject: 'New paid order (Paystack)',
      html: buildCartSubmissionEmail({
        customerName: order.customer_name ?? 'Guest Customer', customerEmail: order.customer_email ?? 'Not provided',
        contactMethod: order.contact_method === 'whatsapp' ? 'whatsapp' : 'email', phoneNumber: order.customer_phone,
        orderNumber, historyId, items: order.items, totalSnapshot: Number(order.total_snapshot), currency: 'NGN', submittedCartId: historyId,
      }),
    }) });
  }
  const results = await Promise.allSettled(emails.map(({ promise }) => promise));
  results.forEach((entry, index) => {
    if (entry.status === 'rejected') console.error('[paystack] Paid email failed', {
      orderId: historyId, event: emails[index]?.event, error: entry.reason,
    });
  });
}

function transactionMatches(tx: PaystackTransaction, historyId: string, amountKobo: number): boolean {
  return tx.status === 'success' &&
    tx.currency?.toUpperCase() === 'NGN' &&
    tx.amount === amountKobo &&
    (!tx.metadata?.historyId || tx.metadata.historyId === historyId);
}

function isDuplicateReferenceError(error: unknown): boolean {
  const axiosError = getAxiosError(error);
  if (!axiosError) return false;
  const body = axiosError.response?.data as { message?: string } | undefined;
  return /duplicate.*reference|reference.*already.*used/i.test(body?.message ?? axiosError.message);
}

function hasPaystackResponse(error: unknown): boolean {
  const axiosError = getAxiosError(error);
  if (axiosError) return axiosError.response !== undefined;
  // initializeRemote raises AppError only after receiving a Paystack response.
  return error instanceof AppError;
}

function initializationRetryConflict(): AppError {
  return AppError.conflict('Payment initialization is in progress. Please try again shortly.');
}

function readyResult(attempt: PaymentAttempt): PaystackInitResult {
  return {
    status: 'ready',
    accessCode: attempt.access_code!,
    reference: attempt.paystack_reference,
    authorizationUrl: attempt.authorization_url!,
  };
}

async function initializeRemote(
  historyId: string,
  email: string,
  amountKobo: number,
  reference: string,
  metadata?: Record<string, unknown>,
): Promise<{ accessCode: string; reference: string; authorizationUrl: string }> {
  const response = await paystackHttp.post<{
    status: boolean;
    data: { access_code: string; reference: string; authorization_url: string };
  }>('/transaction/initialize', {
    email,
    amount: amountKobo,
    reference,
    currency: 'NGN',
    callback_url: `${env.frontendUrl}/checkout`,
    metadata: { historyId, ...metadata },
  });
  if (!response.data.status) throw AppError.badRequest('Paystack transaction initialization failed');
  if (response.data.data.reference !== reference) {
    throw AppError.badRequest('Paystack returned a different payment reference');
  }
  return {
    accessCode: response.data.data.access_code,
    reference,
    authorizationUrl: response.data.data.authorization_url,
  };
}

async function saveReady(attemptId: string, details: { accessCode: string; authorizationUrl: string }): Promise<void> {
  const result = await pool.query(
    `UPDATE payment_attempts
     SET status = 'ready', access_code = $1, authorization_url = $2, claimed_at = NULL, updated_at = now()
     WHERE id = $3 AND status = 'initializing'`,
    [details.accessCode, details.authorizationUrl, attemptId],
  );
  if (result.rowCount !== 1) throw AppError.conflict('Payment attempt changed while initializing');
}

async function markAttempt(attemptId: string, status: 'failed' | 'abandoned' | 'superseded'): Promise<void> {
  await pool.query(
    `UPDATE payment_attempts SET status = $1, claimed_at = NULL, updated_at = now() WHERE id = $2 AND status != 'paid'`,
    [status, attemptId],
  );
}

async function returnOrCloseReady(attempt: PaymentAttempt, historyId: string, amountKobo: number): Promise<PaystackInitResult | null> {
  if (!attempt.authorization_url || !attempt.access_code) {
    await markAttempt(attempt.id, 'superseded');
    return null;
  }
  let tx: PaystackTransaction | null;
  try {
    tx = await verifyAtPaystack(attempt.paystack_reference);
  } catch {
    // A provider outage should not prevent resuming a locally saved checkout URL.
    return {
      status: 'ready',
      accessCode: attempt.access_code,
      reference: attempt.paystack_reference,
      authorizationUrl: attempt.authorization_url,
    };
  }
  if (tx && transactionMatches(tx, historyId, amountKobo)) {
    await markOrderPaid(historyId, attempt.id);
    return { status: 'paid' };
  }
  if (tx?.status === 'success' &&
      (tx.amount !== amountKobo || tx.currency?.toUpperCase() !== 'NGN')) {
    console.error('[paystack] Successful transaction amount/currency mismatch', {
      orderId: historyId,
      reference: attempt.paystack_reference,
      amount: tx.amount,
      currency: tx.currency,
      expectedAmount: amountKobo,
      expectedCurrency: 'NGN',
    });
    throw AppError.badRequest('Paystack payment amount or currency does not match the order');
  }
  if (!tx || tx.status === 'failed') {
    await markAttempt(attempt.id, 'superseded');
    return null;
  }
  if (tx.status === 'abandoned') {
    if (Date.now() - attempt.created_at.getTime() < MIN_ABANDONED_ATTEMPT_AGE_MS) return readyResult(attempt);
    await markAttempt(attempt.id, 'superseded');
    return null;
  }
  return {
    status: 'ready',
    accessCode: attempt.access_code,
    reference: attempt.paystack_reference,
    authorizationUrl: attempt.authorization_url,
  };
}

/** Initializes, resumes, or safely recovers a transaction attempt for an order. */
export async function initializePaystackTransaction(
  historyId: string,
  email: string,
  amountKobo: number,
  metadata?: Record<string, unknown>,
): Promise<PaystackInitResult> {
  for (;;) {
    const orderState = await pool.query<{ payment_status: string }>(
      `SELECT payment_status FROM cart_history WHERE id = $1`, [historyId],
    );
    if (!orderState.rows[0]) throw AppError.notFound('Order not found');
    if (orderState.rows[0].payment_status === 'paid') return { status: 'paid' };

    const activeResult = await pool.query<PaymentAttempt>(
      `SELECT * FROM payment_attempts
       WHERE cart_history_id = $1 AND status IN ('initializing', 'ready')`,
      [historyId],
    );
    const active = activeResult.rows[0];

    if (active?.status === 'ready') {
      const resumed = await returnOrCloseReady(active, historyId, amountKobo);
      if (resumed) return resumed;
      continue;
    }

    if (active?.status === 'initializing') {
      if (!leaseExpired(active.created_at) || !leaseExpired(active.claimed_at)) {
        throw initializationRetryConflict();
      }
      const claim = await pool.query<PaymentAttempt>(
        `UPDATE payment_attempts SET claimed_at = now(), updated_at = now()
         WHERE id = $1 AND status = 'initializing'
           AND (claimed_at IS NULL OR claimed_at < now() - interval '60 seconds')
         RETURNING *`,
        [active.id],
      );
      if (!claim.rows[0]) throw initializationRetryConflict();
      const attempt = claim.rows[0];

      try {
        const tx = await verifyAtPaystack(attempt.paystack_reference);
        if (tx && transactionMatches(tx, historyId, amountKobo)) {
          await markOrderPaid(historyId, attempt.id);
          return { status: 'paid' };
        }
        if (!tx && !attempt.recovery_attempted) {
          const recoveryClaim = await pool.query(
            `UPDATE payment_attempts SET recovery_attempted = true, updated_at = now()
             WHERE id = $1 AND status = 'initializing' AND recovery_attempted = false`,
            [attempt.id],
          );
          if (recoveryClaim.rowCount === 1) {
            let details: { accessCode: string; reference: string; authorizationUrl: string } | null = null;
            try {
              details = await initializeRemote(historyId, email, amountKobo, attempt.paystack_reference, metadata);
            } catch (error) {
              if (isDuplicateReferenceError(error)) {
                await markAttempt(attempt.id, 'superseded');
              } else if (hasPaystackResponse(error)) {
                await markAttempt(attempt.id, 'failed');
                throw error;
              } else {
                throw initializationRetryConflict();
              }
            }
            if (details) {
              await saveReady(attempt.id, details);
              return { status: 'ready', ...details };
            }
          }
        }
        await markAttempt(attempt.id, 'superseded');
      } catch (error) {
        if (getAxiosError(error)?.response?.status === 404) {
          await markAttempt(attempt.id, 'superseded');
        } else {
          await pool.query(`UPDATE payment_attempts SET claimed_at = NULL, updated_at = now() WHERE id = $1 AND status = 'initializing'`, [attempt.id]);
          throw error;
        }
      }
      continue;
    }

    // Import and settle the single-reference legacy model before creating attempts.
    const legacyResult = await pool.query<{ id: string; paystack_reference: string; payment_status: string; total_snapshot: string }>(
      `SELECT id, paystack_reference, payment_status, total_snapshot
       FROM cart_history ch
       WHERE id = $1 AND paystack_reference IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM payment_attempts pa WHERE pa.paystack_reference = ch.paystack_reference)`,
      [historyId],
    );
    const legacy = legacyResult.rows[0];
    if (legacy) {
      const legacyAmount = Math.round(parseFloat(legacy.total_snapshot) * 100);
      const tx = await verifyAtPaystack(legacy.paystack_reference);
      await pool.query(
        `INSERT INTO payment_attempts
           (cart_history_id, paystack_reference, status, amount_kobo, currency)
         VALUES ($1, $2, 'superseded', $3, 'NGN') ON CONFLICT (paystack_reference) DO NOTHING`,
        [historyId, legacy.paystack_reference, legacyAmount],
      );
      if (tx && transactionMatches(tx, historyId, legacyAmount)) {
        const attempt = await pool.query<{ id: string }>(
          `SELECT id FROM payment_attempts WHERE paystack_reference = $1`, [legacy.paystack_reference],
        );
        await markOrderPaid(historyId, attempt.rows[0]?.id);
        return { status: 'paid' };
      }
      continue;
    }

    const reference = `SOIBI-${historyId}-${Date.now()}-${randomUUID().replaceAll('-', '')}`;
    let inserted: { id: string } | undefined;
    try {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO payment_attempts (cart_history_id, paystack_reference, status, amount_kobo, currency)
         SELECT id, $2, 'initializing', $3, 'NGN' FROM cart_history
         WHERE id = $1 AND payment_status != 'paid'
         RETURNING id`,
        [historyId, reference, amountKobo],
      );
      inserted = result.rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505') continue;
      throw error;
    }
    if (!inserted) {
      const current = await pool.query<{ payment_status: string }>(
        `SELECT payment_status FROM cart_history WHERE id = $1`, [historyId],
      );
      if (current.rows[0]?.payment_status === 'paid') return { status: 'paid' };
      if (!current.rows[0]) throw AppError.notFound('Order not found');
      throw AppError.conflict('Payment initialization is in progress. Please try again shortly.');
    }

    let details: { accessCode: string; reference: string; authorizationUrl: string };
    try {
      details = await initializeRemote(historyId, email, amountKobo, reference, metadata);
    } catch (error) {
      if (hasPaystackResponse(error)) {
        await markAttempt(inserted.id, 'failed');
        throw error;
      }
      throw initializationRetryConflict();
    }
    await saveReady(inserted.id, details);
    return { status: 'ready', ...details };
  }
}

export interface PaystackVerifyResult {
  historyId: string;
  orderNumber: string | null;
  paymentStatus: 'paid' | 'unpaid';
  paystackStatus: string;
  amountPaid: number;
  currency: string;
}

async function findOrderForReference(reference: string): Promise<{
  id: string; order_number: string | null; payment_status: string; total_snapshot: string;
  currency: string | null; selected_currency: string | null; attempt_id: string | null;
} | null> {
  const attempt = await pool.query<{
    id: string; order_number: string | null; payment_status: string; total_snapshot: string;
    currency: string | null; selected_currency: string | null; attempt_id: string;
  }>(
    `SELECT ch.id, ch.order_number, ch.payment_status, ch.total_snapshot, ch.currency, ch.selected_currency, pa.id AS attempt_id
     FROM payment_attempts pa JOIN cart_history ch ON ch.id = pa.cart_history_id
     WHERE pa.paystack_reference = $1`, [reference],
  );
  if (attempt.rows[0]) return attempt.rows[0];
  const legacy = await pool.query<{
    id: string; order_number: string | null; payment_status: string; total_snapshot: string;
    currency: string | null; selected_currency: string | null;
  }>(
    `SELECT id, order_number, payment_status, total_snapshot, currency, selected_currency
     FROM cart_history WHERE paystack_reference = $1`, [reference],
  );
  if (!legacy.rows[0]) return null;

  const legacyOrder = legacy.rows[0];
  await pool.query(
    `INSERT INTO payment_attempts (cart_history_id, paystack_reference, status, amount_kobo, currency)
     VALUES ($1, $2, 'superseded', $3, 'NGN') ON CONFLICT (paystack_reference) DO NOTHING`,
    [legacyOrder.id, reference, Math.round(parseFloat(legacyOrder.total_snapshot) * 100)],
  );
  const imported = await pool.query<{ attempt_id: string }>(
    `SELECT id AS attempt_id FROM payment_attempts WHERE paystack_reference = $1`, [reference],
  );
  return { ...legacyOrder, attempt_id: imported.rows[0]?.attempt_id ?? null };
}

export async function verifyPaystackTransaction(reference: string): Promise<PaystackVerifyResult> {
  const order = await findOrderForReference(reference);
  if (!order) throw AppError.notFound('No order found for this payment reference');
  if (order.payment_status === 'paid') {
    return {
      historyId: order.id, orderNumber: order.order_number, paymentStatus: 'paid',
      paystackStatus: 'success', amountPaid: 0, currency: 'NGN',
    };
  }

  const response = await paystackHttp.get<{ status: boolean; data: PaystackTransaction }>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  if (!response.data.status) throw AppError.badRequest('Paystack verification request failed');
  const tx = response.data.data;
  if (tx.metadata?.historyId && tx.metadata.historyId !== order.id) {
    throw AppError.badRequest('Payment reference does not match the order');
  }
  const expectedSmallestUnit = Math.round(parseFloat(order.total_snapshot) * 100);
  const isVerified = transactionMatches(tx, order.id, expectedSmallestUnit);
  if (isVerified) await markOrderPaid(order.id, order.attempt_id ?? undefined);
  else if (order.attempt_id && tx.status === 'failed') await markAttempt(order.attempt_id, 'failed');

  return {
    historyId: order.id, orderNumber: order.order_number,
    paymentStatus: isVerified ? 'paid' : 'unpaid', paystackStatus: tx.status,
    amountPaid: tx.amount, currency: tx.currency,
  };
}

/** Processes signed Paystack charge.success events idempotently. */
export async function handlePaystackWebhook(event: string, data: Record<string, unknown>): Promise<void> {
  if (event !== 'charge.success') return;
  const reference = data['reference'] as string | undefined;
  if (!reference) return;
  const order = await findOrderForReference(reference);
  if (!order || order.payment_status === 'paid') return;
  await verifyPaystackTransaction(reference);
}
