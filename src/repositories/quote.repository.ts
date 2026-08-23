import { pool } from '../database/pool.js';
import type {
  QuoteRequest,
  QuoteRequestAdmin,
  QuoteRequestSummary,
  QuoteRequestAdminSummary,
  QuoteItem,
  QuoteStatus,
  QuoteItemInput,
  CustomerQuoteStatus,
  UpdateQuotePaymentInput,
} from '../types/quote.types.js';
import { findStatusHistoryByQuoteId } from './quote-status.repository.js';

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToQuoteItem(row: Record<string, unknown>): QuoteItem {
  return {
    id: row['id'] as string,
    productId: (row['product_id'] as string | null) ?? null,
    productNameSnapshot: (row['product_name_snapshot'] as string | null) ?? null,
    imageUrlSnapshot: (row['image_url_snapshot'] as string | null) ?? null,
    shoeNameSnapshot: (row['shoe_name_snapshot'] as string | null) ?? null,
    toeStyleSnapshot: (row['toe_style_snapshot'] as string | null) ?? null,
    size: row['size'] == null ? null : parseFloat(row['size'] as string),
    variantLabelSnapshot: (row['variant_label_snapshot'] as string | null) ?? null,
    materialNameSnapshot: (row['material_name_snapshot'] as string | null) ?? null,
    colorNameSnapshot: (row['color_name_snapshot'] as string | null) ?? null,
    quantity: row['quantity'] as number,
    unitPriceSnapshot: row['unit_price_snapshot'] == null ? null : parseFloat(row['unit_price_snapshot'] as string),
    customMeasurements: (row['custom_measurements'] as Record<string, unknown> | null) ?? null,
    customNotes: (row['custom_notes'] as string | null) ?? null,
    createdAt: (row['created_at'] as Date).toISOString(),
  };
}

function rowToSummary(row: Record<string, unknown>): QuoteRequestSummary {
  return {
    id: row['id'] as string,
    referenceNumber: row['reference_number'] as string,
    profileId: (row['profile_id'] as string | null) ?? null,
    status: row['status'] as QuoteStatus,
    customerStatus: row['customer_status'] as CustomerQuoteStatus,
    contactMethod: (row['contact_method'] as 'email' | 'whatsapp' | null) ?? null,
    customerNotes: (row['customer_notes'] as string | null) ?? null,
    state: (row['state'] as string | null) ?? null,
    city: (row['city'] as string | null) ?? null,
    address: (row['address'] as string | null) ?? null,
    paymentUrl: (row['payment_url'] as string | null) ?? null,
    receiptUrl: (row['receipt_url'] as string | null) ?? null,
    receiptPublicId: (row['receipt_public_id'] as string | null) ?? null,
    shippingTrackingNumber: (row['shipping_tracking_number'] as string | null) ?? null,
    shippingTrackingUrl: (row['shipping_tracking_url'] as string | null) ?? null,
    shippingDetails: (row['shipping_details'] as Record<string, unknown> | null) ?? null,
    submittedAt: (row['submitted_at'] as Date).toISOString(),
    reviewedAt: row['reviewed_at'] ? (row['reviewed_at'] as Date).toISOString() : null,
    completedAt: row['completed_at'] ? (row['completed_at'] as Date).toISOString() : null,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  };
}

function rowToAdminSummary(row: Record<string, unknown>): QuoteRequestAdminSummary {
  return {
    ...rowToSummary(row),
    adminNotes: (row['admin_notes'] as string | null) ?? null,
    customerName: (row['customer_name'] as string | null) ?? null,
    customerEmail: (row['customer_email'] as string | null) ?? null,
    customerPhone: (row['customer_phone'] as string | null) ?? null,
  };
}

// ─── Pending draft lookup ─────────────────────────────────────────────────────

export async function findPendingDraftByProfileId(profileId: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT id FROM quote_requests
     WHERE profile_id = $1 AND customer_status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [profileId],
  );
  if (result.rows.length === 0) return null;
  return (result.rows[0] as Record<string, unknown>)['id'] as string;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createQuoteWithItems(data: {
  profileId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  customerNotes: string | null;
  items: QuoteItemInput[];
  contactMethod: 'email' | 'whatsapp' | null;
  phoneNumber: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  paymentUrl: string | null;
  receiptUrl: string | null;
}): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const year = new Date().getFullYear();
    await client.query('SELECT pg_advisory_xact_lock($1)', [year]);
    const countResult = await client.query(
      `SELECT COUNT(*) AS total FROM quote_requests WHERE EXTRACT(YEAR FROM created_at) = $1`,
      [year],
    );
    const count = parseInt((countResult.rows[0] as Record<string, unknown>)['total'] as string, 10);
    const referenceNumber = `SBS-${year}-${String(count + 1).padStart(5, '0')}`;

    if (data.profileId && data.phoneNumber) {
      await client.query(
        `UPDATE profiles SET phone = $1, updated_at = now() WHERE id = $2`,
        [data.phoneNumber, data.profileId],
      );
    }

    const quoteResult = await client.query(
      `INSERT INTO quote_requests
         (reference_number, profile_id, guest_name, guest_email, guest_phone,
          customer_notes, status, customer_status, contact_method, state, city, address, payment_url, receipt_url)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'pending', $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [referenceNumber, data.profileId, data.guestName, data.guestEmail,
       data.guestPhone, data.customerNotes, data.contactMethod, data.state, data.city, data.address, data.paymentUrl, data.receiptUrl],
    );

    const quoteId = (quoteResult.rows[0] as Record<string, unknown>)['id'] as string;

    for (const item of data.items) {
      await client.query(
        `INSERT INTO quote_items
           (quote_request_id, product_id, product_name_snapshot, image_url_snapshot,
            shoe_name_snapshot, toe_style_snapshot, size, variant_label_snapshot,
            material_name_snapshot, color_name_snapshot, quantity,
            unit_price_snapshot, custom_measurements, custom_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [quoteId, item.productId, item.productNameSnapshot, item.imageUrlSnapshot ?? null,
         item.shoeNameSnapshot ?? null, item.toeStyleSnapshot ?? null, item.size ?? null,
         item.variantLabelSnapshot ?? null, item.materialNameSnapshot ?? null,
         item.colorNameSnapshot ?? null, item.quantity, item.unitPriceSnapshot,
         item.customMeasurements ? JSON.stringify(item.customMeasurements) : null,
         item.customNotes ?? null],
      );
    }

    await client.query(
      `INSERT INTO quote_status_history (quote_request_id, old_status, new_status, changed_by, note)
       VALUES ($1, NULL, 'pending', $2, NULL)`,
      [quoteId, data.profileId],
    );

    await client.query('COMMIT');
    return quoteId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Customer queries ─────────────────────────────────────────────────────────

export async function findQuotesByProfileId(profileId: string): Promise<QuoteRequestSummary[]> {
  const result = await pool.query(
    `SELECT id, reference_number, profile_id, status, customer_notes,
            customer_status, contact_method, state, city, address, payment_url, receipt_url, receipt_public_id, shipping_tracking_number, shipping_tracking_url, shipping_details,
            submitted_at, reviewed_at, completed_at, created_at, updated_at
     FROM quote_requests WHERE profile_id = $1 ORDER BY created_at DESC`,
    [profileId],
  );
  return (result.rows as Record<string, unknown>[]).map(rowToSummary);
}

export async function findQuoteByIdAndProfileId(id: string, profileId: string): Promise<QuoteRequest | null> {
  const result = await pool.query(
    `SELECT id, reference_number, profile_id, status, customer_status, contact_method,
            customer_notes, state, city, address, payment_url, receipt_url, receipt_public_id, shipping_tracking_number, shipping_tracking_url, shipping_details,
            submitted_at, reviewed_at, completed_at, created_at, updated_at
     FROM quote_requests WHERE id = $1 AND profile_id = $2`,
    [id, profileId],
  );
  if (result.rows.length === 0) return null;
  const summary = rowToSummary(result.rows[0] as Record<string, unknown>);
  const [items, statusHistory] = await Promise.all([
    findQuoteItemsByQuoteId(id),
    findStatusHistoryByQuoteId(id),
  ]);
  return { ...summary, items, statusHistory };
}

// ─── Tracking (public — by reference number, no sensitive data) ───────────────

export async function findQuoteByReferenceNumber(referenceNumber: string): Promise<QuoteRequest | null> {
  const result = await pool.query(
    `SELECT id, reference_number, profile_id, status, customer_status, contact_method,
            customer_notes, state, city, address, payment_url, receipt_url, receipt_public_id, shipping_tracking_number, shipping_tracking_url, shipping_details,
            submitted_at, reviewed_at, completed_at, created_at, updated_at
     FROM quote_requests WHERE reference_number = $1`,
    [referenceNumber],
  );
  if (result.rows.length === 0) return null;
  const summary = rowToSummary(result.rows[0] as Record<string, unknown>);
  const [items, statusHistory] = await Promise.all([
    findQuoteItemsByQuoteId(summary.id),
    findStatusHistoryByQuoteId(summary.id),
  ]);
  return { ...summary, items, statusHistory };
}

export async function findGuestQuoteByReferenceAndEmail(referenceNumber: string, email: string): Promise<QuoteRequest | null> {
  const result = await pool.query(
    `SELECT id, reference_number, profile_id, status, customer_status, contact_method,
            customer_notes, state, city, address, payment_url, receipt_url, receipt_public_id, shipping_tracking_number, shipping_tracking_url, shipping_details,
            submitted_at, reviewed_at, completed_at, created_at, updated_at
     FROM quote_requests WHERE reference_number = $1 AND profile_id IS NULL AND lower(guest_email) = lower($2)`,
    [referenceNumber, email],
  );
  if (result.rows.length === 0) return null;
  const summary = rowToSummary(result.rows[0] as Record<string, unknown>);
  const [items, statusHistory] = await Promise.all([findQuoteItemsByQuoteId(summary.id), findStatusHistoryByQuoteId(summary.id)]);
  return { ...summary, items, statusHistory };
}

// ─── Admin queries ────────────────────────────────────────────────────────────

export async function findAllQuotesAdmin(status?: QuoteStatus): Promise<QuoteRequestAdminSummary[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (status) { conditions.push(`qr.status = $${values.length + 1}`); values.push(status); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT
       qr.id, qr.reference_number, qr.profile_id, qr.status, qr.customer_status,
       qr.customer_notes, qr.admin_notes, qr.contact_method, qr.state, qr.city, qr.address,
       qr.payment_url, qr.receipt_url, qr.receipt_public_id, qr.shipping_tracking_number, qr.shipping_tracking_url, qr.shipping_details,
       qr.submitted_at, qr.reviewed_at, qr.completed_at, qr.created_at, qr.updated_at,
       COALESCE(p.full_name, qr.guest_name)  AS customer_name,
       COALESCE(p.email,     qr.guest_email) AS customer_email,
       COALESCE(p.phone,     qr.guest_phone) AS customer_phone
     FROM quote_requests qr
     LEFT JOIN profiles p   ON p.id = qr.profile_id
     ${where}
     ORDER BY qr.created_at DESC`,
    values,
  );
  return (result.rows as Record<string, unknown>[]).map(rowToAdminSummary);
}

export async function findQuoteByIdAdmin(id: string): Promise<QuoteRequestAdmin | null> {
  const result = await pool.query(
    `SELECT
       qr.id, qr.reference_number, qr.profile_id, qr.status, qr.customer_status,
       qr.customer_notes, qr.admin_notes, qr.contact_method, qr.state, qr.city, qr.address,
       qr.payment_url, qr.receipt_url, qr.receipt_public_id, qr.shipping_tracking_number, qr.shipping_tracking_url, qr.shipping_details,
       qr.submitted_at, qr.reviewed_at, qr.completed_at, qr.created_at, qr.updated_at,
       COALESCE(p.full_name, qr.guest_name)  AS customer_name,
       COALESCE(p.email,     qr.guest_email) AS customer_email,
       COALESCE(p.phone,     qr.guest_phone) AS customer_phone
     FROM quote_requests qr
     LEFT JOIN profiles p   ON p.id = qr.profile_id
     WHERE qr.id = $1`,
    [id],
  );
  if (result.rows.length === 0) return null;
  const summary = rowToAdminSummary(result.rows[0] as Record<string, unknown>);
  const [items, statusHistory] = await Promise.all([
    findQuoteItemsByQuoteId(id),
    findStatusHistoryByQuoteId(id),
  ]);
  return { ...summary, items, statusHistory };
}

// ─── Status update ────────────────────────────────────────────────────────────

export async function updateQuoteStatus(data: {
  quoteId: string;
  oldStatus: QuoteStatus;
  newStatus: QuoteStatus;
  changedByProfileId: string;
  note: string | null;
}): Promise<QuoteStatus | null> {
  const result = await pool.query(
    `WITH updated_quote AS (
       UPDATE quote_requests
       SET status = $1::text,
           reviewed_at  = CASE WHEN $1::text = 'reviewing' AND reviewed_at IS NULL THEN now() ELSE reviewed_at END,
           completed_at = CASE WHEN $1::text = 'completed' AND completed_at IS NULL THEN now() ELSE completed_at END
       WHERE id = $2 AND status = $3
       RETURNING id, status
     ), inserted_history AS (
       INSERT INTO quote_status_history (quote_request_id, old_status, new_status, changed_by, note)
       SELECT id, $3::text, $1::text, $4, $5 FROM updated_quote
     )
     SELECT status FROM updated_quote`,
    [data.newStatus, data.quoteId, data.oldStatus, data.changedByProfileId, data.note],
  );
  if (result.rows.length === 0) return null;
  return (result.rows[0] as Record<string, unknown>)['status'] as QuoteStatus;
}

export async function findQuoteCurrentStatus(id: string): Promise<QuoteStatus | null> {
  const result = await pool.query(`SELECT status FROM quote_requests WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return (result.rows[0] as Record<string, unknown>)['status'] as QuoteStatus;
}

// ─── Payment / receipt update ─────────────────────────────────────────────────

export async function updateQuotePayment(id: string, input: UpdateQuotePaymentInput): Promise<boolean> {
  const setClauses: string[] = ['updated_at = now()'];
  const values: unknown[] = [];
  let idx = 1;
  if (input.paymentUrl !== undefined) { setClauses.push(`payment_url = $${idx++}`); values.push(input.paymentUrl); }
  if (input.receiptUrl !== undefined) { setClauses.push(`receipt_url = $${idx++}`); values.push(input.receiptUrl); }
  if (input.receiptPublicId !== undefined) { setClauses.push(`receipt_public_id = $${idx++}`); values.push(input.receiptPublicId); }
  values.push(id);
  const result = await pool.query(
    `UPDATE quote_requests SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id`,
    values,
  );
  return result.rows.length > 0;
}

export async function updateQuoteReceiptByProfileId(
  id: string,
  profileId: string,
  input: Pick<UpdateQuotePaymentInput, 'receiptUrl' | 'receiptPublicId'>,
): Promise<boolean> {
  const setClauses: string[] = ['updated_at = now()'];
  const values: unknown[] = [];
  let idx = 1;
  if (input.receiptUrl !== undefined) { setClauses.push(`receipt_url = $${idx++}`); values.push(input.receiptUrl); }
  if (input.receiptPublicId !== undefined) { setClauses.push(`receipt_public_id = $${idx++}`); values.push(input.receiptPublicId); }
  if (values.length === 0) return false;
  values.push(id, profileId);
  const result = await pool.query(
    `UPDATE quote_requests SET ${setClauses.join(', ')} WHERE id = $${idx++} AND profile_id = $${idx} RETURNING id`,
    values,
  );
  return result.rows.length > 0;
}

export async function updateQuoteFulfillment(id: string, input: import('../types/quote.types.js').UpdateQuoteFulfillmentInput): Promise<boolean> {
  const setClauses: string[] = ['updated_at = now()'];
  const values: unknown[] = [];
  let idx = 1;
  if (input.shippingTrackingNumber !== undefined) { setClauses.push(`shipping_tracking_number = $${idx++}`); values.push(input.shippingTrackingNumber); }
  if (input.shippingTrackingUrl !== undefined) { setClauses.push(`shipping_tracking_url = $${idx++}`); values.push(input.shippingTrackingUrl); }
  if (input.shippingDetails !== undefined) { setClauses.push(`shipping_details = $${idx++}`); values.push(input.shippingDetails === null ? null : JSON.stringify(input.shippingDetails)); }
  if (values.length === 0) return false;
  values.push(id);
  const result = await pool.query(`UPDATE quote_requests SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id`, values);
  return result.rows.length > 0;
}

// ─── Items ────────────────────────────────────────────────────────────────────

async function findQuoteItemsByQuoteId(quoteRequestId: string): Promise<QuoteItem[]> {
  const result = await pool.query(
    `SELECT id, product_id, product_name_snapshot, image_url_snapshot, shoe_name_snapshot,
            toe_style_snapshot, size, variant_label_snapshot, material_name_snapshot,
            color_name_snapshot, quantity, unit_price_snapshot, custom_measurements,
            custom_notes, created_at
     FROM quote_items WHERE quote_request_id = $1 ORDER BY created_at ASC`,
    [quoteRequestId],
  );
  return (result.rows as Record<string, unknown>[]).map(rowToQuoteItem);
}

export async function updateCustomerQuoteWithItems(data: {
  quoteId: string;
  profileId: string;
  customerNotes?: string | null;
  customerStatus?: CustomerQuoteStatus;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  paymentUrl?: string | null;
  receiptUrl?: string | null;
  items?: QuoteItemInput[];
}): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const quote = await client.query(
      `SELECT customer_status FROM quote_requests WHERE id = $1 AND profile_id = $2 FOR UPDATE`,
      [data.quoteId, data.profileId],
    );
    if (quote.rows.length === 0) { await client.query('ROLLBACK'); return false; }
    if ((quote.rows[0] as Record<string, unknown>)['customer_status'] !== 'pending') {
      await client.query('ROLLBACK');
      throw new Error('Customer quote is already completed');
    }
    if (data.items !== undefined) {
      await client.query('DELETE FROM quote_items WHERE quote_request_id = $1', [data.quoteId]);
      for (const item of data.items) {
        await client.query(
          `INSERT INTO quote_items
             (quote_request_id, product_id, product_name_snapshot, image_url_snapshot,
              shoe_name_snapshot, toe_style_snapshot, size, variant_label_snapshot,
              material_name_snapshot, color_name_snapshot, quantity, unit_price_snapshot,
              custom_measurements, custom_notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [data.quoteId, item.productId, item.productNameSnapshot ?? null,
           item.imageUrlSnapshot ?? null, item.shoeNameSnapshot ?? null,
           item.toeStyleSnapshot ?? null, item.size ?? null,
           item.variantLabelSnapshot ?? null, item.materialNameSnapshot ?? null,
           item.colorNameSnapshot ?? null, item.quantity, item.unitPriceSnapshot ?? null,
           item.customMeasurements ? JSON.stringify(item.customMeasurements) : null,
           item.customNotes ?? null],
        );
      }
    }
    const result = await client.query(
      `UPDATE quote_requests
       SET customer_notes  = CASE WHEN $1 THEN $2 ELSE customer_notes END,
           customer_status = COALESCE($3, customer_status),
           state = CASE WHEN $4 THEN $5 ELSE state END,
           city = CASE WHEN $6 THEN $7 ELSE city END,
           address = CASE WHEN $8 THEN $9 ELSE address END,
           payment_url = CASE WHEN $10 THEN $11 ELSE payment_url END,
           receipt_url = CASE WHEN $12 THEN $13 ELSE receipt_url END
       WHERE id = $14 AND profile_id = $15
       RETURNING id`,
      [data.customerNotes !== undefined, data.customerNotes ?? null,
       data.customerStatus ?? null, data.state !== undefined, data.state ?? null,
       data.city !== undefined, data.city ?? null, data.address !== undefined, data.address ?? null,
       data.paymentUrl !== undefined, data.paymentUrl ?? null, data.receiptUrl !== undefined, data.receiptUrl ?? null,
       data.quoteId, data.profileId],
    );
    await client.query('COMMIT');
    return result.rows.length > 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}
