import { pool } from '../database/pool.js';
import type {
  AddCartItemInput,
  AdminCartOrder,
  Cart,
  CartHistory,
  CartItem,
  CartOrderStatusHistoryEntry,
  UpdateCartItemInput,
  UpdateCartOrderPaymentInput,
  UpdateOrderFulfillmentInput,
} from '../types/cart.types.js';

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
    profileId: row['profile_id'] as string,
    status: (row['status'] as string) ?? 'submitted',
    contactMethod: (row['contact_method'] as string | null) ?? null,
    state: (row['state'] as string | null) ?? null,
    city: (row['city'] as string | null) ?? null,
    address: (row['address'] as string | null) ?? null,
    items: row['items'] as CartHistory['items'],
    totalSnapshot: parseFloat(row['total_snapshot'] as string),
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
            unit_price_snapshot, created_at, updated_at
     FROM cart_items WHERE cart_id = $1 ORDER BY created_at ASC`,
    [cartId],
  );
  return (result.rows as Record<string, unknown>[]).map(rowToCartItem);
}

export async function findActiveCartByProfileId(profileId: string): Promise<Cart | null> {
  const result = await pool.query(
    `SELECT id, profile_id, status, state, city, address, payment_url, receipt_url, created_at, updated_at
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
     RETURNING id, profile_id, status, state, city, address, payment_url, receipt_url, created_at, updated_at`,
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
      `SELECT id, profile_id, status, state, city, address, payment_url, receipt_url, created_at, updated_at
       FROM carts WHERE profile_id = $1 AND status = 'active' FOR UPDATE`,
      [profileId],
    );
    if (existing.rows.length > 0) {
      cartRow = existing.rows[0] as Record<string, unknown>;
    } else {
      const created = await client.query(
        `INSERT INTO carts (profile_id, status) VALUES ($1, 'active')
         RETURNING id, profile_id, status, state, city, address, payment_url, receipt_url, created_at, updated_at`,
        [profileId],
      );
      cartRow = created.rows[0] as Record<string, unknown>;
    }
    const cartId = cartRow['id'] as string;

    const dupResult = await client.query(
      `SELECT id, quantity FROM cart_items
       WHERE cart_id = $1
         AND product_id IS NOT DISTINCT FROM $2
         AND selected_size IS NOT DISTINCT FROM $3
         AND lower(COALESCE(selected_color, '')) = lower(COALESCE($4, ''))
         AND lower(COALESCE(selected_material, '')) = lower(COALESCE($5, ''))`,
      [cartId, input.productId ?? null, input.selectedSize ?? null,
       input.selectedColor ?? null, input.selectedMaterial ?? null],
    );

    if (dupResult.rows.length > 0) {
      await client.query(
        'UPDATE cart_items SET quantity = quantity + $1, updated_at = now() WHERE id = $2',
        [input.quantity, (dupResult.rows[0] as Record<string, unknown>)['id']],
      );
    } else {
      await client.query(
        `INSERT INTO cart_items
           (cart_id, product_id, variant_id, material_id, color_id, size_id, product_name_snapshot, image_url_snapshot,
            quantity, selected_size, selected_color, selected_material, variant_label_snapshot, custom_measurements, custom_notes, unit_price_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [cartId, input.productId ?? null, input.variantId ?? null, input.materialId ?? null,
         input.colorId ?? null, input.sizeId ?? null, input.productNameSnapshot ?? null,
         input.imageUrlSnapshot ?? null, input.quantity, input.selectedSize ?? null,
         input.selectedColor ?? null, input.selectedMaterial ?? null, input.variantLabelSnapshot ?? null,
         input.customMeasurements ? JSON.stringify(input.customMeasurements) : null, input.customNotes ?? null, input.unitPriceSnapshot],
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
  const columns: Record<string, string> = { state: 'state', city: 'city', address: 'address', paymentUrl: 'payment_url', receiptUrl: 'receipt_url' };
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
      `SELECT id, state, city, address, payment_url, receipt_url FROM carts WHERE profile_id = $1 AND status = 'active' FOR UPDATE`,
      [profileId],
    );
    if (cartResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return Promise.reject(new Error('NO_ACTIVE_CART'));
    }
    const cartId = (cartResult.rows[0] as Record<string, unknown>)['id'] as string;

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
              quantity, selected_size, selected_color, selected_material, variant_label_snapshot, custom_measurements, custom_notes, unit_price_snapshot
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
    }));

    const totalSnapshot = items.reduce((sum, item) => sum + item.unitPriceSnapshot * item.quantity, 0);

    // Generate order number — lock by year to prevent duplicates
    const year = new Date().getFullYear();
    await client.query('SELECT pg_advisory_xact_lock($1)', [year + 10000]); // offset to avoid collision with quote lock
    const countResult = await client.query(
      `SELECT COUNT(*) AS total FROM cart_history WHERE EXTRACT(YEAR FROM created_at) = $1`,
      [year],
    );
    const count = parseInt((countResult.rows[0] as Record<string, unknown>)['total'] as string, 10);
    const orderNumber = `SBS-${year}-C${String(count + 1).padStart(5, '0')}`;

    const historyResult = await client.query(
      `INSERT INTO cart_history
         (original_cart_id, profile_id, items, total_snapshot, contact_method, order_number, status, completed_at, state, city, address, payment_url, receipt_url)
       VALUES ($1, $2, $3, $4, $5, $6, 'submitted', now(), $7, $8, $9, $10, $11)
       RETURNING id`,
      [cartId, profileId, JSON.stringify(items), totalSnapshot, contactMethod, orderNumber,
       (cartResult.rows[0] as Record<string, unknown>)['state'], (cartResult.rows[0] as Record<string, unknown>)['city'], (cartResult.rows[0] as Record<string, unknown>)['address'],
       (cartResult.rows[0] as Record<string, unknown>)['payment_url'], (cartResult.rows[0] as Record<string, unknown>)['receipt_url']],
    );
    const historyId = (historyResult.rows[0] as Record<string, unknown>)['id'] as string;

    // Write initial status history entry
    await client.query(
      `INSERT INTO cart_order_status_history (cart_history_id, old_status, new_status, changed_by, note)
       VALUES ($1, NULL, 'submitted', $2, NULL)`,
      [historyId, profileId],
    );

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

// ─── Customer cart history ────────────────────────────────────────────────────

export async function findCartHistoryByProfileId(profileId: string): Promise<CartHistory[]> {
  const result = await pool.query(
    `SELECT id, order_number, original_cart_id, profile_id, status, contact_method,
            items, total_snapshot, state, city, address, payment_url, receipt_url, receipt_public_id, shipping_tracking_number, shipping_tracking_url, shipping_details,
            completed_at, created_at
     FROM cart_history WHERE profile_id = $1 ORDER BY completed_at DESC`,
    [profileId],
  );
  return (result.rows as Record<string, unknown>[]).map(rowToCartHistory);
}

export async function findCartHistoryById(id: string): Promise<CartHistory | null> {
  const result = await pool.query(
    `SELECT id, order_number, original_cart_id, profile_id, status, contact_method,
            items, total_snapshot, state, city, address, payment_url, receipt_url, receipt_public_id, shipping_tracking_number, shipping_tracking_url, shipping_details,
            completed_at, created_at
     FROM cart_history WHERE id = $1`,
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
    `SELECT id, order_number, original_cart_id, profile_id, status, contact_method,
            items, total_snapshot, state, city, address, payment_url, receipt_url, receipt_public_id, shipping_tracking_number, shipping_tracking_url, shipping_details,
            completed_at, created_at
     FROM cart_history WHERE order_number = $1`,
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
}): Promise<AdminCartOrder[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (filters.profileId) { conditions.push(`ch.profile_id = $${idx++}`); values.push(filters.profileId); }
  if (filters.status) { conditions.push(`ch.status = $${idx++}`); values.push(filters.status); }
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
       ch.id, ch.order_number, ch.original_cart_id, ch.profile_id, ch.status,
       ch.contact_method, ch.items, ch.total_snapshot, ch.state, ch.city, ch.address,
       ch.payment_url, ch.receipt_url, ch.receipt_public_id, ch.shipping_tracking_number, ch.shipping_tracking_url, ch.shipping_details,
       ch.completed_at, ch.created_at,
       p.full_name  AS customer_name,
       p.email      AS customer_email,
       p.phone      AS customer_phone
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
       ch.id, ch.order_number, ch.original_cart_id, ch.profile_id, ch.status,
       ch.contact_method, ch.items, ch.total_snapshot, ch.state, ch.city, ch.address,
       ch.payment_url, ch.receipt_url, ch.receipt_public_id, ch.shipping_tracking_number, ch.shipping_tracking_url, ch.shipping_details,
       ch.completed_at, ch.created_at,
       p.full_name  AS customer_name,
       p.email      AS customer_email,
       p.phone      AS customer_phone
     FROM cart_history ch
     LEFT JOIN profiles p   ON p.id = ch.profile_id
     WHERE ch.id = $1`,
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
       UPDATE cart_history SET status = $1 WHERE id = $2 AND status = $3 RETURNING id
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

export async function updateCartOrderPayment(id: string, input: UpdateCartOrderPaymentInput): Promise<boolean> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (input.paymentUrl !== undefined) { setClauses.push(`payment_url = $${idx++}`); values.push(input.paymentUrl); }
  if (input.receiptUrl !== undefined) { setClauses.push(`receipt_url = $${idx++}`); values.push(input.receiptUrl); }
  if (input.receiptPublicId !== undefined) { setClauses.push(`receipt_public_id = $${idx++}`); values.push(input.receiptPublicId); }
  if (input.state !== undefined) { setClauses.push(`state = $${idx++}`); values.push(input.state); }
  if (input.city !== undefined) { setClauses.push(`city = $${idx++}`); values.push(input.city); }
  if (input.address !== undefined) { setClauses.push(`address = $${idx++}`); values.push(input.address); }
  if (setClauses.length === 0) return false;
  values.push(id);
  const result = await pool.query(
    `UPDATE cart_history SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id`,
    values,
  );
  return result.rows.length > 0;
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
  if (setClauses.length === 0) return false;
  values.push(id, profileId);
  const result = await pool.query(
    `UPDATE cart_history SET ${setClauses.join(', ')} WHERE id = $${idx++} AND profile_id = $${idx} RETURNING id`,
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
  const result = await pool.query(`UPDATE cart_history SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id`, values);
  return result.rows.length > 0;
}
