import { pool } from '../database/pool.js';
import { timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import type {
  AddCartItemInput,
  AdminCartOrder,
  Cart,
  CartHistory,
  CartItem,
  CartOrderStatusHistoryEntry,
  CartHistoryItem,
  UpdateCartItemInput,
  UpdateCartOrderPaymentInput,
  UpdateOrderFulfillmentInput,
} from '../types/cart.types.js';

type CartHistoryInsert = {
  originalCartId: string | null;
  profileId: string | null;
  isGuest: boolean;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  items: CartHistoryItem[];
  totalSnapshot: number;
  currency: string | null;
  selectedCurrency: string | null;
  contactMethod: 'email' | 'whatsapp';
  state: string | null;
  city: string | null;
  address: string | null;
  paymentUrl: string | null;
  receiptUrl: string | null;
  paymentStatus?: 'unpaid' | 'pending_approval' | 'paid' | 'rejected';
  status?: string;
  writeInitialStatusHistory?: boolean;
  guestPaymentTokenHash?: string | null;
  sourceCartItemIds?: string[] | null;
};

/** Shared persistence for authenticated-cart and one-time guest submissions. */
async function createCartHistory(client: PoolClient, data: CartHistoryInsert): Promise<{ historyId: string; orderNumber: string }> {
  const year = new Date().getFullYear();
  await client.query('SELECT pg_advisory_xact_lock($1)', [year + 10000]);
  const countResult = await client.query(
    `SELECT COUNT(*) AS total FROM cart_history WHERE EXTRACT(YEAR FROM created_at) = $1`, [year],
  );
  const count = parseInt((countResult.rows[0] as Record<string, unknown>)['total'] as string, 10);
  const orderNumber = `SOIBI-${year}-C${String(count + 1).padStart(5, '0')}`;
  const result = await client.query(
    `INSERT INTO cart_history
       (original_cart_id, profile_id, is_guest, guest_name, guest_email, guest_phone, items, total_snapshot, currency,
        contact_method, order_number, status, completed_at, state, city, address, payment_url, receipt_url, selected_currency,
        guest_payment_token_hash, source_cart_item_ids, payment_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13, $14, $15, $16, $17, $18, $19, $20, $21)
     RETURNING id`,
    [data.originalCartId, data.profileId, data.isGuest, data.guestName, data.guestEmail, data.guestPhone,
     JSON.stringify(data.items), data.totalSnapshot, data.currency, data.contactMethod, orderNumber, data.status ?? 'submitted', data.state, data.city,
     data.address, data.paymentUrl, data.receiptUrl, data.selectedCurrency, data.guestPaymentTokenHash ?? null,
     data.sourceCartItemIds ?? null, data.paymentStatus ?? 'unpaid'],
  );
  const historyId = (result.rows[0] as Record<string, unknown>)['id'] as string;
  if (data.writeInitialStatusHistory !== false) {
    await client.query(
      `INSERT INTO cart_order_status_history (cart_history_id, old_status, new_status, changed_by, note)
       VALUES ($1, NULL, $2, $3, NULL)`, [historyId, data.status ?? 'submitted', data.profileId],
    );
  }
  return { historyId, orderNumber };
}

function rowToCartItem(row: Record<string, unknown>): CartItem {
  return {
    id: row['id'] as string,
    cartId: row['cart_id'] as string,
    productId: (row['product_id'] as string | null) ?? null,
    variantId: (row['variant_id'] as string | null) ?? null,
    materialId: (row['material_id'] as string | null) ?? null,
    colorId: (row['color_id'] as string | null) ?? null,
    sizeId: (row['size_id'] as string | null) ?? null,
    productNameSnapshot: (row['product_name_snapshot'] as string | null) ?? null,
    imageUrlSnapshot: (row['image_url_snapshot'] as string | null) ?? null,
    quantity: row['quantity'] as number,
    selectedSize: row['selected_size'] == null ? null : parseFloat(row['selected_size'] as string),
    selectedColor: (row['selected_color'] as string | null) ?? null,
    selectedMaterial: (row['selected_material'] as string | null) ?? null,
    variantLabelSnapshot: (row['variant_label_snapshot'] as string | null) ?? null,
    customMeasurements: (row['custom_measurements'] as Record<string, unknown> | null) ?? null,
    customNotes: (row['custom_notes'] as string | null) ?? null,
    unitPriceSnapshot: parseFloat(row['unit_price_snapshot'] as string),
    currency: (row['currency'] as string | null) ?? null,
    pricesSnapshot: (row['prices_snapshot'] as CartItem['pricesSnapshot']) ?? null,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  };
}

function rowToCart(cartRow: Record<string, unknown>, items: CartItem[]): Cart {
  return {
    id: cartRow['id'] as string,
    profileId: cartRow['profile_id'] as string,
    status: cartRow['status'] as Cart['status'],
    state: (cartRow['state'] as string | null) ?? null,
    city: (cartRow['city'] as string | null) ?? null,
    address: (cartRow['address'] as string | null) ?? null,
    paymentUrl: (cartRow['payment_url'] as string | null) ?? null,
    receiptUrl: (cartRow['receipt_url'] as string | null) ?? null,
    selectedCurrency: (cartRow['selected_currency'] as string | null) ?? null,
    items,
    createdAt: (cartRow['created_at'] as Date).toISOString(),
    updatedAt: (cartRow['updated_at'] as Date).toISOString(),
  };
}

function rowToCartHistory(row: Record<string, unknown>): CartHistory {
  return {
    id: row['id'] as string,
    orderNumber: (row['order_number'] as string | null) ?? null,
    originalCartId: (row['original_cart_id'] as string | null) ?? null,
    profileId: (row['profile_id'] as string | null) ?? null,
    isGuest: (row['is_guest'] as boolean | null) ?? false,
    guestName: (row['guest_name'] as string | null) ?? null,
    guestEmail: (row['guest_email'] as string | null) ?? null,
    guestPhone: (row['guest_phone'] as string | null) ?? null,
    status: (row['status'] as string) ?? 'submitted',
    paymentStatus: (row['payment_status'] as CartHistory['paymentStatus']) ?? 'unpaid',
    paymentRejectionReason: (row['payment_rejection_reason'] as string | null) ?? null,
    contactMethod: (row['contact_method'] as string | null) ?? null,
    state: (row['state'] as string | null) ?? null,
    city: (row['city'] as string | null) ?? null,
    address: (row['address'] as string | null) ?? null,
    items: row['items'] as CartHistory['items'],
    totalSnapshot: parseFloat(row['total_snapshot'] as string),
    currency: (row['currency'] as string | null) ?? null,
    selectedCurrency: (row['selected_currency'] as string | null) ?? null,
    paymentUrl: (row['payment_url'] as string | null) ?? null,
    receiptUrl: (row['receipt_url'] as string | null) ?? null,
    receiptPublicId: (row['receipt_public_id'] as string | null) ?? null,
    shippingTrackingNumber: (row['shipping_tracking_number'] as string | null) ?? null,
    shippingTrackingUrl: (row['shipping_tracking_url'] as string | null) ?? null,
    shippingDetails: (row['shipping_details'] as Record<string, unknown> | null) ?? null,
    completedAt: (row['completed_at'] as Date).toISOString(),
    createdAt: (row['created_at'] as Date).toISOString(),
  };
}

async function fetchCartItems(cartId: string): Promise<CartItem[]> {
  const result = await pool.query(
    `SELECT id, cart_id, product_id, variant_id, material_id, color_id, size_id, product_name_snapshot, image_url_snapshot,
            quantity, selected_size, selected_color, selected_material, variant_label_snapshot, custom_measurements, custom_notes,
            unit_price_snapshot, currency, prices_snapshot, created_at, updated_at
     FROM cart_items WHERE cart_id = $1 ORDER BY created_at ASC`,
    [cartId],
  );
  return (result.rows as Record<string, unknown>[]).map(rowToCartItem);
}

export async function findActiveCartByProfileId(profileId: string): Promise<Cart | null> {
  const result = await pool.query(
    `SELECT id, profile_id, status, state, city, address, payment_url, receipt_url, selected_currency, created_at, updated_at
     FROM carts WHERE profile_id = $1 AND status = 'active'`,
    [profileId],
  );
  if (result.rows.length === 0) return null;
  const cartRow = result.rows[0] as Record<string, unknown>;
  const items = await fetchCartItems(cartRow['id'] as string);
  return rowToCart(cartRow, items);
}

export async function findOrCreateActiveCart(profileId: string): Promise<Cart> {
  const existing = await findActiveCartByProfileId(profileId);
  if (existing) return existing;
  const result = await pool.query(
    `INSERT INTO carts (profile_id, status) VALUES ($1, 'active')
     RETURNING id, profile_id, status, state, city, address, payment_url, receipt_url, selected_currency, created_at, updated_at`,
    [profileId],
  );
  return rowToCart(result.rows[0] as Record<string, unknown>, []);
}

export async function addItemToActiveCart(profileId: string, input: AddCartItemInput): Promise<Cart> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let cartRow: Record<string, unknown>;
    const existing = await client.query(
      `SELECT id, profile_id, status, state, city, address, payment_url, receipt_url, selected_currency, created_at, updated_at
       FROM carts WHERE profile_id = $1 AND status = 'active' FOR UPDATE`,
      [profileId],
    );
    if (existing.rows.length > 0) {
      cartRow = existing.rows[0] as Record<string, unknown>;
    } else {
      const created = await client.query(
        `INSERT INTO carts (profile_id, status) VALUES ($1, 'active')
         RETURNING id, profile_id, status, state, city, address, payment_url, receipt_url, selected_currency, created_at, updated_at`,
        [profileId],
      );
      cartRow = created.rows[0] as Record<string, unknown>;
    }
    const cartId = cartRow['id'] as string;

    const dupResult = await client.query(
      `SELECT id, quantity, currency FROM cart_items
       WHERE cart_id = $1
         AND product_id IS NOT DISTINCT FROM $2
         AND selected_size IS NOT DISTINCT FROM $3
         AND lower(COALESCE(selected_color, '')) = lower(COALESCE($4, ''))
         AND lower(COALESCE(selected_material, '')) = lower(COALESCE($5, ''))
         AND custom_measurements IS NOT DISTINCT FROM $6::jsonb
         AND currency = $7`,
      [cartId, input.productId ?? null, input.selectedSize ?? null,
       input.selectedColor ?? null, input.selectedMaterial ?? null,
       input.customMeasurements === undefined || input.customMeasurements === null
         ? null
         : JSON.stringify(input.customMeasurements), input.currency],
    );

    if (dupResult.rows.length > 0) {
      await client.query(
        `UPDATE cart_items
         SET quantity = quantity + $1,
             prices_snapshot = COALESCE($2::jsonb, prices_snapshot),
             updated_at = now()
         WHERE id = $3`,
        [input.quantity,
          input.pricesSnapshot === undefined || input.pricesSnapshot === null ? null : JSON.stringify(input.pricesSnapshot),
          (dupResult.rows[0] as Record<string, unknown>)['id']],
      );
    } else {
      await client.query(
        `INSERT INTO cart_items
           (cart_id, product_id, variant_id, material_id, color_id, size_id, product_name_snapshot, image_url_snapshot,
            quantity, selected_size, selected_color, selected_material, variant_label_snapshot, custom_measurements, custom_notes, unit_price_snapshot, currency, prices_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [cartId, input.productId ?? null, input.variantId ?? null, input.materialId ?? null,
         input.colorId ?? null, input.sizeId ?? null, input.productNameSnapshot ?? null,
         input.imageUrlSnapshot ?? null, input.quantity, input.selectedSize ?? null,
         input.selectedColor ?? null, input.selectedMaterial ?? null, input.variantLabelSnapshot ?? null,
         input.customMeasurements === undefined || input.customMeasurements === null
           ? null
           : JSON.stringify(input.customMeasurements),
         input.customNotes ?? null, input.unitPriceSnapshot, input.currency,
         input.pricesSnapshot === undefined || input.pricesSnapshot === null ? null : JSON.stringify(input.pricesSnapshot)],
      );
    }

    await client.query('UPDATE carts SET updated_at = now() WHERE id = $1', [cartId]);
    await client.query('COMMIT');
    const items = await fetchCartItems(cartId);
    return rowToCart(cartRow, items);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}

export async function updateCartItem(profileId: string, itemId: string, input: UpdateCartItemInput): Promise<boolean> {
  const setClauses: string[] = ['updated_at = now()'];
  const values: unknown[] = [];
  let idx = 1;
  if (input.quantity !== undefined) { setClauses.push(`quantity = $${idx++}`); values.push(input.quantity); }
  if (input.selectedSize !== undefined) { setClauses.push(`selected_size = $${idx++}`); values.push(input.selectedSize); }
  if (input.selectedColor !== undefined) { setClauses.push(`selected_color = $${idx++}`); values.push(input.selectedColor); }
  if (input.selectedMaterial !== undefined) { setClauses.push(`selected_material = $${idx++}`); values.push(input.selectedMaterial); }
  if (input.variantLabelSnapshot !== undefined) { setClauses.push(`variant_label_snapshot = $${idx++}`); values.push(input.variantLabelSnapshot); }
  if (input.customMeasurements !== undefined) { setClauses.push(`custom_measurements = $${idx++}`); values.push(input.customMeasurements === null ? null : JSON.stringify(input.customMeasurements)); }
  if (input.customNotes !== undefined) { setClauses.push(`custom_notes = $${idx++}`); values.push(input.customNotes); }
  values.push(itemId, profileId);
  const result = await pool.query(
    `UPDATE cart_items ci SET ${setClauses.join(', ')}
     FROM carts c
     WHERE ci.id = $${idx} AND ci.cart_id = c.id AND c.profile_id = $${idx + 1} AND c.status = 'active'
     RETURNING ci.id`,
    values,
  );
  return result.rows.length > 0;
}

export async function deleteCartItem(profileId: string, itemId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM cart_items ci USING carts c
     WHERE ci.id = $1 AND ci.cart_id = c.id AND c.profile_id = $2 AND c.status = 'active'
     RETURNING ci.id`,
    [itemId, profileId],
  );
  if (result.rows.length > 0) {
    await pool.query(
      `UPDATE carts SET updated_at = now() WHERE profile_id = $1 AND status = 'active'`,
      [profileId],
    );
  }
  return result.rows.length > 0;
}

export async function clearActiveCart(profileId: string): Promise<void> {
  await pool.query(
    `DELETE FROM cart_items ci USING carts c
     WHERE ci.cart_id = c.id AND c.profile_id = $1 AND c.status = 'active'`,
    [profileId],
  );
  await pool.query(
    `UPDATE carts SET updated_at = now() WHERE profile_id = $1 AND status = 'active'`,
    [profileId],
  );
}

export async function updateActiveCartDetails(profileId: string, input: import('../types/cart.types.js').UpdateCartDetailsInput): Promise<boolean> {
  const columns: Record<string, string> = { state: 'state', city: 'city', address: 'address', paymentUrl: 'payment_url', receiptUrl: 'receipt_url', selectedCurrency: 'selected_currency' };
  const values: unknown[] = [];
  const setClauses: string[] = ['updated_at = now()'];
  for (const [key, column] of Object.entries(columns)) {
    const value = input[key as keyof typeof input];
    if (value !== undefined) { values.push(value); setClauses.push(`${column} = $${values.length}`); }
  }
  values.push(profileId);
  const result = await pool.query(
    `UPDATE carts SET ${setClauses.join(', ')} WHERE profile_id = $${values.length} AND status = 'active' RETURNING id`, values,
  );
  return result.rows.length > 0;
}

export async function submitActiveCart(
  profileId: string,
  contactMethod: 'email' | 'whatsapp',
  phoneNumber: string | null,
): Promise<{ submittedCartId: string; historyId: string; orderNumber: string; newActiveCartId: string; resolvedPhone: string | null }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cartResult = await client.query(
      `SELECT id, state, city, address, payment_url, receipt_url, selected_currency FROM carts WHERE profile_id = $1 AND status = 'active' FOR UPDATE`,
      [profileId],
    );
    if (cartResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return Promise.reject(new Error('NO_ACTIVE_CART'));
    }
    const cartId = (cartResult.rows[0] as Record<string, unknown>)['id'] as string;

    await client.query(
      `UPDATE cart_history SET status = 'payment_abandoned'
       WHERE original_cart_id = $1 AND status = 'pending_payment'`,
      [cartId],
    );
    await client.query(
      `UPDATE payment_attempts SET status = 'superseded', updated_at = now()
       WHERE cart_history_id IN (
         SELECT id FROM cart_history WHERE original_cart_id = $1 AND status = 'payment_abandoned'
       ) AND status IN ('initializing', 'ready')`,
      [cartId],
    );

    let resolvedPhone: string | null = null;
    if (phoneNumber) {
      await client.query(`UPDATE profiles SET phone = $1, updated_at = now() WHERE id = $2`, [phoneNumber, profileId]);
      resolvedPhone = phoneNumber;
    } else {
      const profileResult = await client.query(`SELECT phone FROM profiles WHERE id = $1`, [profileId]);
      resolvedPhone = ((profileResult.rows[0] as Record<string, unknown>)?.['phone'] as string | null) ?? null;
    }

    const itemsResult = await client.query(
      `SELECT product_id, variant_id, material_id, color_id, size_id, product_name_snapshot, image_url_snapshot,
              quantity, selected_size, selected_color, selected_material, variant_label_snapshot, custom_measurements, custom_notes, unit_price_snapshot, currency, prices_snapshot
       FROM cart_items WHERE cart_id = $1`,
      [cartId],
    );
    const items = (itemsResult.rows as Record<string, unknown>[]).map((r) => ({
      productId: (r['product_id'] as string | null) ?? null,
      variantId: (r['variant_id'] as string | null) ?? null,
      materialId: (r['material_id'] as string | null) ?? null,
      colorId: (r['color_id'] as string | null) ?? null,
      sizeId: (r['size_id'] as string | null) ?? null,
      productNameSnapshot: (r['product_name_snapshot'] as string | null) ?? null,
      imageUrlSnapshot: (r['image_url_snapshot'] as string | null) ?? null,
      quantity: r['quantity'] as number,
      selectedSize: r['selected_size'] == null ? null : parseFloat(r['selected_size'] as string),
      selectedColor: (r['selected_color'] as string | null) ?? null,
      selectedMaterial: (r['selected_material'] as string | null) ?? null,
      variantLabelSnapshot: (r['variant_label_snapshot'] as string | null) ?? null,
      customMeasurements: (r['custom_measurements'] as Record<string, unknown> | null) ?? null,
      customNotes: (r['custom_notes'] as string | null) ?? null,
      unitPriceSnapshot: parseFloat(r['unit_price_snapshot'] as string),
      currency: (r['currency'] as string | null) ?? null,
      pricesSnapshot: (r['prices_snapshot'] as CartHistoryItem['pricesSnapshot']) ?? null,
    }));

    const currencies = [...new Set(items.map((item) => item.currency))];
    const totalSnapshot = items.reduce((sum, item) => sum + item.unitPriceSnapshot * item.quantity, 0);

    const { historyId, orderNumber } = await createCartHistory(client, {
      originalCartId: cartId, profileId, isGuest: false, guestName: null, guestEmail: null, guestPhone: null,
      items, totalSnapshot, currency: currencies[0]!, contactMethod,
      state: (cartResult.rows[0] as Record<string, unknown>)['state'] as string | null,
      city: (cartResult.rows[0] as Record<string, unknown>)['city'] as string | null,
      address: (cartResult.rows[0] as Record<string, unknown>)['address'] as string | null,
      paymentUrl: (cartResult.rows[0] as Record<string, unknown>)['payment_url'] as string | null,
      receiptUrl: (cartResult.rows[0] as Record<string, unknown>)['receipt_url'] as string | null,
      paymentStatus: (cartResult.rows[0] as Record<string, unknown>)['receipt_url'] ? 'pending_approval' : 'unpaid',
      selectedCurrency: (cartResult.rows[0] as Record<string, unknown>)['selected_currency'] as string | null,
    });

    await client.query(`UPDATE carts SET status = 'submitted', updated_at = now() WHERE id = $1`, [cartId]);

    const newCartResult = await client.query(
      `INSERT INTO carts (profile_id, status) VALUES ($1, 'active') RETURNING id`,
      [profileId],
    );
    const newActiveCartId = (newCartResult.rows[0] as Record<string, unknown>)['id'] as string;

    await client.query('COMMIT');
    return { submittedCartId: cartId, historyId, orderNumber, newActiveCartId, resolvedPhone };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}

/** Creates or reuses a hidden Paystack snapshot without submitting the active cart. */
export async function prepareActiveCartPayment(
  profileId: string,
  contactMethod: 'email' | 'whatsapp',
): Promise<{ historyId: string; orderNumber: string; reused: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cartResult = await client.query(
      `SELECT id, state, city, address, payment_url, receipt_url, selected_currency
       FROM carts WHERE profile_id = $1 AND status = 'active' FOR UPDATE`,
      [profileId],
    );
    if (!cartResult.rows[0]) throw new Error('NO_ACTIVE_CART');
    const cart = cartResult.rows[0] as Record<string, unknown>;
    const cartId = cart['id'] as string;
    const itemResult = await client.query(
      `SELECT id, product_id, variant_id, material_id, color_id, size_id, product_name_snapshot, image_url_snapshot,
              quantity, selected_size, selected_color, selected_material, variant_label_snapshot,
              custom_measurements, custom_notes, unit_price_snapshot, currency, prices_snapshot
       FROM cart_items WHERE cart_id = $1 ORDER BY created_at ASC, id ASC FOR UPDATE`,
      [cartId],
    );
    const rows = itemResult.rows as Record<string, unknown>[];
    if (rows.length === 0) throw new Error('EMPTY_ACTIVE_CART');
    const items: CartHistoryItem[] = rows.map((row) => ({
      productId: (row['product_id'] as string | null) ?? null,
      variantId: (row['variant_id'] as string | null) ?? null,
      materialId: (row['material_id'] as string | null) ?? null,
      colorId: (row['color_id'] as string | null) ?? null,
      sizeId: (row['size_id'] as string | null) ?? null,
      productNameSnapshot: (row['product_name_snapshot'] as string | null) ?? null,
      imageUrlSnapshot: (row['image_url_snapshot'] as string | null) ?? null,
      quantity: row['quantity'] as number,
      selectedSize: row['selected_size'] == null ? null : parseFloat(row['selected_size'] as string),
      selectedColor: (row['selected_color'] as string | null) ?? null,
      selectedMaterial: (row['selected_material'] as string | null) ?? null,
      variantLabelSnapshot: (row['variant_label_snapshot'] as string | null) ?? null,
      customMeasurements: (row['custom_measurements'] as Record<string, unknown> | null) ?? null,
      customNotes: (row['custom_notes'] as string | null) ?? null,
      unitPriceSnapshot: parseFloat(row['unit_price_snapshot'] as string),
      currency: (row['currency'] as string | null) ?? null,
      pricesSnapshot: (row['prices_snapshot'] as CartHistoryItem['pricesSnapshot']) ?? null,
    }));
    const totalSnapshot = items.reduce((sum, item) => sum + item.unitPriceSnapshot * item.quantity, 0);
    const sourceCartItemIds = rows.map((row) => row['id'] as string);
    const serializedItems = JSON.stringify(items);

    const pending = await client.query<{ id: string; order_number: string }>(
      `SELECT id, order_number FROM cart_history
       WHERE original_cart_id = $1 AND status = 'pending_payment' FOR UPDATE`,
      [cartId],
    );
    if (pending.rows[0]) {
      const same = await client.query(
        `SELECT id FROM cart_history
         WHERE id = $1 AND items = $2::jsonb AND total_snapshot = $3 AND source_cart_item_ids = $4::uuid[]`,
        [pending.rows[0].id, serializedItems, totalSnapshot, sourceCartItemIds],
      );
      if (same.rows.length > 0) {
        await client.query('COMMIT');
        return { historyId: pending.rows[0].id, orderNumber: pending.rows[0].order_number, reused: true };
      }
      await client.query(`UPDATE cart_history SET status = 'payment_abandoned' WHERE id = $1`, [pending.rows[0].id]);
      await client.query(
        `UPDATE payment_attempts SET status = 'superseded', updated_at = now()
         WHERE cart_history_id = $1 AND status IN ('initializing', 'ready')`,
        [pending.rows[0].id],
      );
    }

    const currencies = [...new Set(items.map((item) => item.currency))];
    const created = await createCartHistory(client, {
      originalCartId: cartId, profileId, isGuest: false, guestName: null, guestEmail: null, guestPhone: null,
      items, totalSnapshot, currency: currencies[0] ?? null, selectedCurrency: (cart['selected_currency'] as string | null) ?? null,
      contactMethod, state: (cart['state'] as string | null) ?? null, city: (cart['city'] as string | null) ?? null,
      address: (cart['address'] as string | null) ?? null, paymentUrl: (cart['payment_url'] as string | null) ?? null,
      receiptUrl: (cart['receipt_url'] as string | null) ?? null, status: 'pending_payment',
      writeInitialStatusHistory: false, sourceCartItemIds,
    });
    await client.query('COMMIT');
    return { ...created, reused: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Creates or reuses a hidden guest Paystack snapshot, validating reuse by its token hash. */
export async function prepareGuestCartPayment(
  input: import('../types/cart.types.js').CartSubmitInput,
  newTokenHash: string,
  previousHistoryId?: string,
  previousTokenHash?: string,
): Promise<{ historyId: string; orderNumber: string; reused: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!input.items?.length) throw new Error('EMPTY_GUEST_CART');
    const items: CartHistoryItem[] = input.items.map((item) => ({
      productId: item.productId ?? null, variantId: item.variantId ?? null,
      materialId: item.materialId ?? null, colorId: item.colorId ?? null,
      sizeId: item.sizeId ?? null, productNameSnapshot: item.productNameSnapshot ?? null,
      imageUrlSnapshot: item.imageUrlSnapshot ?? null, quantity: item.quantity,
      selectedSize: item.selectedSize ?? null, selectedColor: item.selectedColor ?? null,
      selectedMaterial: item.selectedMaterial ?? null, variantLabelSnapshot: item.variantLabelSnapshot ?? null,
      customMeasurements: item.customMeasurements ?? null, customNotes: item.customNotes ?? null,
      unitPriceSnapshot: item.unitPriceSnapshot, currency: item.currency, pricesSnapshot: item.pricesSnapshot ?? null,
    }));
    const totalSnapshot = items.reduce((sum, item) => sum + item.unitPriceSnapshot * item.quantity, 0);
    const serializedItems = JSON.stringify(items);

    if (previousHistoryId) {
      const previousResult = await client.query<{
        id: string; order_number: string; status: string; guest_payment_token_hash: string | null;
      }>(
        `SELECT id, order_number, status, guest_payment_token_hash FROM cart_history
         WHERE id = $1 AND is_guest = true FOR UPDATE`,
        [previousHistoryId],
      );
      const previous = previousResult.rows[0];
      const storedHash = previous?.guest_payment_token_hash;
      const storedBytes = storedHash ? Buffer.from(storedHash.trim(), 'hex') : Buffer.alloc(0);
      const providedBytes = previousTokenHash ? Buffer.from(previousTokenHash, 'hex') : Buffer.alloc(0);
      if (!previous || previous.status !== 'pending_payment' || storedBytes.length !== 32 || providedBytes.length !== 32 || !timingSafeEqual(storedBytes, providedBytes)) {
        throw new Error('INVALID_GUEST_PAYMENT_TOKEN');
      }
      const same = await client.query(
        `SELECT id FROM cart_history WHERE id = $1 AND items = $2::jsonb AND total_snapshot = $3`,
        [previous.id, serializedItems, totalSnapshot],
      );
      if (same.rows.length > 0) {
        await client.query('COMMIT');
        return { historyId: previous.id, orderNumber: previous.order_number, reused: true };
      }
      await client.query(`UPDATE cart_history SET status = 'payment_abandoned' WHERE id = $1`, [previous.id]);
      await client.query(
        `UPDATE payment_attempts SET status = 'superseded', updated_at = now()
         WHERE cart_history_id = $1 AND status IN ('initializing', 'ready')`,
        [previous.id],
      );
    }

    const currencies = [...new Set(items.map((item) => item.currency))];
    const created = await createCartHistory(client, {
      originalCartId: null, profileId: null, isGuest: true,
      guestName: input.guestName ?? null, guestEmail: input.guestEmail ?? null,
      guestPhone: input.guestPhone ?? input.phoneNumber ?? null, items, totalSnapshot,
      currency: currencies[0] ?? null, selectedCurrency: input.selectedCurrency ?? null,
      contactMethod: input.contactMethod, state: input.state ?? null, city: input.city ?? null,
      address: input.address ?? null, paymentUrl: input.paymentUrl ?? null, receiptUrl: input.receiptUrl ?? null,
      status: 'pending_payment', writeInitialStatusHistory: false, guestPaymentTokenHash: newTokenHash,
    });
    await client.query('COMMIT');
    return { ...created, reused: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Persists a one-time guest checkout in the same order-history model as carts. */
export async function submitGuestCart(input: import('../types/cart.types.js').CartSubmitInput): Promise<{ historyId: string; orderNumber: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const items = (input.items ?? []).map((item) => ({
      productId: item.productId ?? null, variantId: item.variantId ?? null,
      materialId: item.materialId ?? null, colorId: item.colorId ?? null, sizeId: item.sizeId ?? null,
      productNameSnapshot: item.productNameSnapshot ?? null, imageUrlSnapshot: item.imageUrlSnapshot ?? null,
      quantity: item.quantity, selectedSize: item.selectedSize ?? null,
      selectedColor: item.selectedColor ?? null, selectedMaterial: item.selectedMaterial ?? null,
      variantLabelSnapshot: item.variantLabelSnapshot ?? null,
      customMeasurements: item.customMeasurements ?? null, customNotes: item.customNotes ?? null,
      unitPriceSnapshot: item.unitPriceSnapshot,
      currency: item.currency,
      pricesSnapshot: item.pricesSnapshot ?? null,
    }));
    const currencies = [...new Set(items.map((item) => item.currency))];
    const totalSnapshot = items.reduce((sum, item) => sum + item.unitPriceSnapshot * item.quantity, 0);

    const { historyId, orderNumber } = await createCartHistory(client, {
      originalCartId: null, profileId: null, isGuest: true,
      guestName: input.guestName ?? null, guestEmail: input.guestEmail ?? null,
      guestPhone: input.guestPhone ?? input.phoneNumber ?? null,
      items, totalSnapshot, currency: currencies[0]!, contactMethod: input.contactMethod, state: input.state ?? null,
      city: input.city ?? null, address: input.address ?? null, paymentUrl: input.paymentUrl ?? null,
      receiptUrl: input.receiptUrl ?? null,
      paymentStatus: input.receiptUrl ? 'pending_approval' : 'unpaid',
      selectedCurrency: input.selectedCurrency ?? null,
    });
    await client.query('COMMIT');
    return { historyId, orderNumber };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}

// ─── Customer cart history ────────────────────────────────────────────────────

export async function findCartHistoryByProfileId(profileId: string): Promise<CartHistory[]> {
  const result = await pool.query(
    `SELECT id, order_number, original_cart_id, profile_id, is_guest, guest_name, guest_email, guest_phone, status, payment_status, contact_method,
            items, total_snapshot, currency, selected_currency, state, city, address, payment_url, receipt_url, receipt_public_id, payment_rejection_reason, shipping_tracking_number, shipping_tracking_url, shipping_details,
            completed_at, created_at
     FROM cart_history WHERE profile_id = $1 AND status NOT IN ('pending_payment', 'payment_abandoned') ORDER BY completed_at DESC`,
    [profileId],
  );
  return (result.rows as Record<string, unknown>[]).map(rowToCartHistory);
}

export async function findCartHistoryById(id: string): Promise<CartHistory | null> {
  const result = await pool.query(
    `SELECT id, order_number, original_cart_id, profile_id, is_guest, guest_name, guest_email, guest_phone, status, payment_status, contact_method,
            items, total_snapshot, currency, selected_currency, state, city, address, payment_url, receipt_url, receipt_public_id, payment_rejection_reason, shipping_tracking_number, shipping_tracking_url, shipping_details,
            completed_at, created_at
     FROM cart_history WHERE id = $1 AND status NOT IN ('pending_payment', 'payment_abandoned')`,
    [id],
  );
  if (result.rows.length === 0) return null;
  const history = rowToCartHistory(result.rows[0] as Record<string, unknown>);
  const statusHistory = await findCartOrderStatusHistory(id);
  return { ...history, statusHistory };
}

// ─── Tracking (public — by order number) ─────────────────────────────────────

export async function findCartHistoryByOrderNumber(orderNumber: string): Promise<CartHistory | null> {
  const result = await pool.query(
    `SELECT id, order_number, original_cart_id, profile_id, is_guest, guest_name, guest_email, guest_phone, status, payment_status, contact_method,
            items, total_snapshot, currency, selected_currency, state, city, address, payment_url, receipt_url, receipt_public_id, payment_rejection_reason, shipping_tracking_number, shipping_tracking_url, shipping_details,
            completed_at, created_at
     FROM cart_history WHERE order_number = $1 AND status NOT IN ('pending_payment', 'payment_abandoned')`,
    [orderNumber],
  );
  if (result.rows.length === 0) return null;
  const history = rowToCartHistory(result.rows[0] as Record<string, unknown>);
  const statusHistory = await findCartOrderStatusHistory(history.id);
  return { ...history, statusHistory };
}

// ─── Admin cart history ───────────────────────────────────────────────────────

export async function findAllCartOrdersAdmin(filters: {
  profileId?: string;
  productId?: string;
  status?: string;
  paymentStatus?: string;
}): Promise<AdminCartOrder[]> {
  const conditions: string[] = ["ch.status NOT IN ('pending_payment', 'payment_abandoned')"];
  const values: unknown[] = [];
  let idx = 1;

  if (filters.profileId) { conditions.push(`ch.profile_id = $${idx++}`); values.push(filters.profileId); }
  if (filters.status) { conditions.push(`ch.status = $${idx++}`); values.push(filters.status); }
  if (filters.paymentStatus) { conditions.push(`ch.payment_status = $${idx++}`); values.push(filters.paymentStatus); }
  if (filters.productId) {
    conditions.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements(ch.items) AS item
      WHERE item->>'productId' = $${idx++}
    )`);
    values.push(filters.productId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `SELECT
       ch.id, ch.order_number, ch.original_cart_id, ch.profile_id, ch.is_guest, ch.guest_name, ch.guest_email, ch.guest_phone, ch.status, ch.payment_status,
       ch.contact_method, ch.items, ch.total_snapshot, ch.currency, ch.selected_currency, ch.state, ch.city, ch.address,
       ch.payment_url, ch.receipt_url, ch.receipt_public_id, ch.payment_rejection_reason, ch.shipping_tracking_number, ch.shipping_tracking_url, ch.shipping_details,
       ch.completed_at, ch.created_at,
       COALESCE(p.full_name, ch.guest_name) AS customer_name,
       COALESCE(p.email, ch.guest_email) AS customer_email,
       COALESCE(p.phone, ch.guest_phone) AS customer_phone
     FROM cart_history ch
     LEFT JOIN profiles p   ON p.id = ch.profile_id
     ${where}
     ORDER BY ch.completed_at DESC`,
    values,
  );

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    ...rowToCartHistory(row),
    customerName: (row['customer_name'] as string | null) ?? null,
    customerEmail: (row['customer_email'] as string | null) ?? null,
    customerPhone: (row['customer_phone'] as string | null) ?? null,
  }));
}

export async function findCartOrderByIdAdmin(id: string): Promise<AdminCartOrder | null> {
  const result = await pool.query(
    `SELECT
       ch.id, ch.order_number, ch.original_cart_id, ch.profile_id, ch.is_guest, ch.guest_name, ch.guest_email, ch.guest_phone, ch.status, ch.payment_status,
       ch.contact_method, ch.items, ch.total_snapshot, ch.currency, ch.selected_currency, ch.state, ch.city, ch.address,
       ch.payment_url, ch.receipt_url, ch.receipt_public_id, ch.payment_rejection_reason, ch.shipping_tracking_number, ch.shipping_tracking_url, ch.shipping_details,
       ch.completed_at, ch.created_at,
       COALESCE(p.full_name, ch.guest_name) AS customer_name,
       COALESCE(p.email, ch.guest_email) AS customer_email,
       COALESCE(p.phone, ch.guest_phone) AS customer_phone
     FROM cart_history ch
     LEFT JOIN profiles p   ON p.id = ch.profile_id
     WHERE ch.id = $1 AND ch.status NOT IN ('pending_payment', 'payment_abandoned')`,
    [id],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  const history = rowToCartHistory(row);
  const statusHistory = await findCartOrderStatusHistory(id);
  return {
    ...history,
    statusHistory,
    customerName: (row['customer_name'] as string | null) ?? null,
    customerEmail: (row['customer_email'] as string | null) ?? null,
    customerPhone: (row['customer_phone'] as string | null) ?? null,
  };
}

// ─── Cart order status history ────────────────────────────────────────────────

export async function findCartOrderStatusHistory(cartHistoryId: string): Promise<CartOrderStatusHistoryEntry[]> {
  const result = await pool.query(
    `SELECT h.id, h.old_status, h.new_status, h.changed_by, h.note, h.created_at,
            p.full_name AS changed_by_name
     FROM cart_order_status_history h
     LEFT JOIN profiles p ON p.id = h.changed_by
     WHERE h.cart_history_id = $1
     ORDER BY h.created_at ASC`,
    [cartHistoryId],
  );
  return (result.rows as Record<string, unknown>[]).map((row) => ({
    id: row['id'] as string,
    oldStatus: (row['old_status'] as string | null) ?? null,
    newStatus: row['new_status'] as string,
    changedBy: (row['changed_by'] as string | null) ?? null,
    changedByName: (row['changed_by_name'] as string | null) ?? null,
    note: (row['note'] as string | null) ?? null,
    createdAt: (row['created_at'] as Date).toISOString(),
  }));
}

export async function updateCartOrderStatus(data: {
  cartHistoryId: string;
  oldStatus: string;
  newStatus: string;
  changedByProfileId: string;
  note: string | null;
}): Promise<boolean> {
  const result = await pool.query(
    `WITH updated AS (
       UPDATE cart_history SET status = $1 WHERE id = $2 AND status = $3
         AND status NOT IN ('pending_payment', 'payment_abandoned') RETURNING id
     ), inserted AS (
       INSERT INTO cart_order_status_history (cart_history_id, old_status, new_status, changed_by, note)
       SELECT id, $3, $1, $4, $5 FROM updated
     )
     SELECT id FROM updated`,
    [data.newStatus, data.cartHistoryId, data.oldStatus, data.changedByProfileId, data.note],
  );
  return result.rows.length > 0;
}

// ─── Cart order payment / receipt ─────────────────────────────────────────────

export async function updateCartOrderPayment(id: string, input: UpdateCartOrderPaymentInput): Promise<{ previousPaymentStatus: CartHistory['paymentStatus']; changed: boolean } | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (input.paymentStatus !== undefined) {
    setClauses.push(`payment_status = $${idx++}`); values.push(input.paymentStatus);
    setClauses.push(`payment_rejection_reason = CASE WHEN $${idx - 1}::varchar = 'rejected' THEN CASE WHEN $${idx++} THEN $${idx++} ELSE payment_rejection_reason END ELSE NULL END`);
    values.push(input.paymentRejectionReason !== undefined, input.paymentRejectionReason ?? null);
  }
  if (input.paymentUrl !== undefined) { setClauses.push(`payment_url = $${idx++}`); values.push(input.paymentUrl); }
  if (input.receiptUrl !== undefined) { setClauses.push(`receipt_url = $${idx++}`); values.push(input.receiptUrl); }
  if (input.receiptPublicId !== undefined) { setClauses.push(`receipt_public_id = $${idx++}`); values.push(input.receiptPublicId); }
  if (input.state !== undefined) { setClauses.push(`state = $${idx++}`); values.push(input.state); }
  if (input.city !== undefined) { setClauses.push(`city = $${idx++}`); values.push(input.city); }
  if (input.address !== undefined) { setClauses.push(`address = $${idx++}`); values.push(input.address); }
  if (setClauses.length === 0) return null;
  values.push(id);
  const idParam = `$${idx}`;
  const result = await pool.query(
    `WITH current AS (
       SELECT id, payment_status FROM cart_history WHERE id = ${idParam}
         AND status NOT IN ('pending_payment', 'payment_abandoned') FOR UPDATE
     ), updated AS (
       UPDATE cart_history SET ${setClauses.join(', ')} FROM current
       WHERE cart_history.id = current.id
       RETURNING current.payment_status AS previous_payment_status, cart_history.payment_status
     ) SELECT * FROM updated`,
    values,
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return {
    previousPaymentStatus: row['previous_payment_status'] as CartHistory['paymentStatus'],
    changed: row['previous_payment_status'] !== row['payment_status'],
  };
}

export async function updateCartOrderReceiptByProfileId(
  id: string,
  profileId: string,
  input: Pick<UpdateCartOrderPaymentInput, 'receiptUrl' | 'receiptPublicId'>,
): Promise<boolean> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (input.receiptUrl !== undefined) { setClauses.push(`receipt_url = $${idx++}`); values.push(input.receiptUrl); }
  if (input.receiptPublicId !== undefined) { setClauses.push(`receipt_public_id = $${idx++}`); values.push(input.receiptPublicId); }
  if (input.receiptUrl || input.receiptPublicId) {
    setClauses.push("payment_status = CASE WHEN payment_status IN ('unpaid', 'rejected') THEN 'pending_approval' ELSE payment_status END");
    setClauses.push("payment_rejection_reason = CASE WHEN payment_status IN ('unpaid', 'rejected') THEN NULL ELSE payment_rejection_reason END");
  }
  if (setClauses.length === 0) return false;
  values.push(id, profileId);
  const result = await pool.query(
    `UPDATE cart_history SET ${setClauses.join(', ')} WHERE id = $${idx++} AND profile_id = $${idx}
     AND status NOT IN ('pending_payment', 'payment_abandoned') RETURNING id`,
    values,
  );
  return result.rows.length > 0;
}

export async function updateCartOrderFulfillment(id: string, input: UpdateOrderFulfillmentInput): Promise<boolean> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (input.shippingTrackingNumber !== undefined) { setClauses.push(`shipping_tracking_number = $${idx++}`); values.push(input.shippingTrackingNumber); }
  if (input.shippingTrackingUrl !== undefined) { setClauses.push(`shipping_tracking_url = $${idx++}`); values.push(input.shippingTrackingUrl); }
  if (input.shippingDetails !== undefined) { setClauses.push(`shipping_details = $${idx++}`); values.push(input.shippingDetails === null ? null : JSON.stringify(input.shippingDetails)); }
  if (setClauses.length === 0) return false;
  values.push(id);
  const result = await pool.query(`UPDATE cart_history SET ${setClauses.join(', ')} WHERE id = $${idx}
    AND status NOT IN ('pending_payment', 'payment_abandoned') RETURNING id`, values);
  return result.rows.length > 0;
}
