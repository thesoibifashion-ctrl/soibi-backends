import {
  addItemToActiveCart,
  clearActiveCart,
  deleteCartItem,
  findCartHistoryByProfileId,
  findCartHistoryById,
  findCartHistoryByOrderNumber,
  findOrCreateActiveCart,
  submitActiveCart,
  submitGuestCart as persistGuestCart,
  updateCartItem,
  findAllCartOrdersAdmin,
  findCartOrderByIdAdmin,
  updateCartOrderStatus,
  updateCartOrderPayment,
  findCartOrderStatusHistory,
  updateCartOrderReceiptByProfileId,
  updateCartOrderFulfillment,
  updateActiveCartDetails,
} from '../repositories/cart.repository.js';
import { AppError } from '../utils/AppError.js';
import { sendEmail } from '../utils/mailer.js';
import { buildCartSubmissionEmail } from '../utils/cartSubmissionEmail.js';
import { buildCustomerCartEmail, buildCustomerStatusEmail } from '../utils/customerEmails.js';
import { getNotificationSettings } from '../utils/notificationSettings.js';
import { assertActiveCurrencyCodes } from './currency.service.js';
import { env } from '../config/env.js';
import type {
  AddCartItemInput,
  AdminCartOrder,
  Cart,
  CartHistory,
  CartSubmitInput,
  CartSubmitResult,
  UpdateCartItemInput,
  UpdateCartOrderPaymentInput,
  UpdateCartOrderStatusInput,
  UpdateOrderFulfillmentInput,
  UpdateCartDetailsInput,
} from '../types/cart.types.js';
import type { AuthUser } from '../types/api.types.js';

export async function getMyCart(profileId: string): Promise<Cart> {
  return findOrCreateActiveCart(profileId);
}

export async function addItemToCart(profileId: string, input: AddCartItemInput): Promise<Cart> {
  await assertActiveCurrencyCodes([input.currency]);
  return addItemToActiveCart(profileId, input);
}

export async function updateMyCartItem(profileId: string, itemId: string, input: UpdateCartItemInput): Promise<void> {
  const updated = await updateCartItem(profileId, itemId, input);
  if (!updated) throw AppError.notFound('Cart item not found');
}

export async function removeMyCartItem(profileId: string, itemId: string): Promise<void> {
  const deleted = await deleteCartItem(profileId, itemId);
  if (!deleted) throw AppError.notFound('Cart item not found');
}

export async function clearMyCart(profileId: string): Promise<void> {
  await clearActiveCart(profileId);
}

export async function updateMyCartDetails(profileId: string, input: UpdateCartDetailsInput): Promise<Cart> {
  if (!await updateActiveCartDetails(profileId, input)) throw AppError.notFound('Active cart not found');
  return getMyCart(profileId);
}

export async function getMyCartHistory(profileId: string): Promise<CartHistory[]> {
  return findCartHistoryByProfileId(profileId);
}

export async function getMyCartHistoryById(id: string, profileId: string): Promise<CartHistory> {
  const order = await findCartHistoryById(id);
  if (!order || order.profileId !== profileId) throw AppError.notFound('Order not found');
  return order;
}

export async function submitMyCartReceipt(
  id: string,
  profileId: string,
  input: Pick<UpdateCartOrderPaymentInput, 'receiptUrl' | 'receiptPublicId'>,
): Promise<CartHistory> {
  if (!await updateCartOrderReceiptByProfileId(id, profileId, input)) throw AppError.notFound('Order not found');
  return getMyCartHistoryById(id, profileId);
}

export async function submitMyCart(user: AuthUser, input: CartSubmitInput): Promise<CartSubmitResult> {
  const phoneNumber = input.phoneNumber ?? null;

  let result: Awaited<ReturnType<typeof submitActiveCart>>;
  try {
    result = await submitActiveCart(user.id, input.contactMethod, phoneNumber);
  } catch (err) {
    if (err instanceof Error && err.message === 'NO_ACTIVE_CART') {
      throw AppError.notFound('No active cart found');
    }
    throw err;
  }

  // Fire-and-forget emails
  sendCartEmails(user, input, result).catch((err: unknown) => {
    console.error('[cart] Failed to send submission emails:', err);
  });

  return {
    submittedCartId: result.submittedCartId,
    historyId: result.historyId,
    orderNumber: result.orderNumber,
    newActiveCartId: result.newActiveCartId,
  };
}

export async function submitGuestCart(input: CartSubmitInput): Promise<CartSubmitResult> {
  if (!input.items?.length) throw AppError.badRequest('items must contain at least one item');
  await assertActiveCurrencyCodes(input.items.map((item) => item.currency));
  let result: Awaited<ReturnType<typeof persistGuestCart>>;
  result = await persistGuestCart(input);

  sendGuestCartEmails(input, result).catch((err: unknown) => {
    console.error('[cart] Failed to send guest submission emails:', err);
  });

  return {
    submittedCartId: null,
    historyId: result.historyId,
    orderNumber: result.orderNumber,
    newActiveCartId: null,
  };
}

async function sendCartEmails(
  user: AuthUser,
  input: CartSubmitInput,
  result: { historyId: string; orderNumber: string; resolvedPhone: string | null },
): Promise<void> {
  const settings = await getNotificationSettings();
  const historyRows = await findCartHistoryByProfileId(user.id);
  const historyRecord = historyRows.find((h) => h.id === result.historyId);
  if (!historyRecord) return;

  const emails: Promise<void>[] = [];
  if (settings.notifyAdminOnCart) {
    const html = buildCartSubmissionEmail({
      customerName: user.fullName,
      customerEmail: user.email,
      contactMethod: input.contactMethod,
      phoneNumber: result.resolvedPhone,
      orderNumber: result.orderNumber,
      historyId: result.historyId,
      items: historyRecord.items,
      totalSnapshot: historyRecord.totalSnapshot,
      currency: historyRecord.currency,
      submittedCartId: result.historyId,
    });
    emails.push(sendEmail({
      to: settings.notificationEmail,
      subject: `New Cart Submission — ${result.orderNumber}`,
      html,
    }));
  }

  if (settings.notifyCustomerOnCart) {
    const html = buildCustomerCartEmail({
      customerName: user.fullName,
      orderNumber: result.orderNumber,
      historyId: result.historyId,
      status: 'submitted',
      submittedAt: historyRecord.completedAt,
      totalSnapshot: historyRecord.totalSnapshot,
      currency: historyRecord.currency,
      items: historyRecord.items,
    });
    emails.push(sendEmail({
      to: user.email,
      subject: `Your Order — ${result.orderNumber}`,
      html,
    }));
  }
  const results = await Promise.allSettled(emails);
  results.filter((entry) => entry.status === 'rejected').forEach((entry) => console.error('[cart] Submission email failed:', entry.reason));
}

async function sendGuestCartEmails(
  input: CartSubmitInput,
  result: { historyId: string; orderNumber: string },
): Promise<void> {
  const settings = await getNotificationSettings();
  const order = await findCartHistoryByOrderNumber(result.orderNumber);
  if (!order) return;
  const customerName = input.guestName ?? 'Guest Customer';
  const customerEmail = input.guestEmail ?? 'Not provided';
  const phoneNumber = input.guestPhone ?? input.phoneNumber ?? null;
  const emails: Promise<void>[] = [];

  if (settings.notifyAdminOnCart) {
    emails.push(sendEmail({
      to: settings.notificationEmail,
      subject: `New Cart Submission — ${result.orderNumber}`,
      html: buildCartSubmissionEmail({ customerName, customerEmail, contactMethod: input.contactMethod,
        phoneNumber, orderNumber: result.orderNumber, historyId: result.historyId, items: order.items,
        totalSnapshot: order.totalSnapshot, currency: order.currency, submittedCartId: result.historyId }),
    }));
  }
  if (settings.notifyCustomerOnCart && input.guestEmail) {
    emails.push(sendEmail({
      to: input.guestEmail,
      subject: `Your Order — ${result.orderNumber}`,
      html: buildCustomerCartEmail({ customerName, orderNumber: result.orderNumber, historyId: result.historyId,
        status: order.status, submittedAt: order.completedAt, totalSnapshot: order.totalSnapshot, currency: order.currency, items: order.items }),
    }));
  }
  const results = await Promise.allSettled(emails);
  results.filter((entry) => entry.status === 'rejected').forEach((entry) => console.error('[cart] Guest submission email failed:', entry.reason));
}

// ─── Tracking (public) ────────────────────────────────────────────────────────

export async function trackCartOrderByNumber(orderNumber: string): Promise<CartHistory> {
  const order = await findCartHistoryByOrderNumber(orderNumber);
  if (!order) throw AppError.notFound('Order not found');
  return order;
}

export async function trackMyCartOrderByNumber(orderNumber: string, profileId: string): Promise<CartHistory> {
  const order = await trackCartOrderByNumber(orderNumber);
  if (order.profileId !== profileId) throw AppError.notFound('Order not found');
  return order;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function getAllCartOrdersAdmin(filters: {
  profileId?: string;
  productId?: string;
  status?: string;
}): Promise<AdminCartOrder[]> {
  return findAllCartOrdersAdmin(filters);
}

export async function getCartOrderByIdAdmin(id: string): Promise<AdminCartOrder> {
  const order = await findCartOrderByIdAdmin(id);
  if (!order) throw AppError.notFound('Order not found');
  return order;
}

export async function changeCartOrderStatus(
  cartHistoryId: string,
  changedByProfileId: string,
  input: UpdateCartOrderStatusInput,
): Promise<AdminCartOrder> {
  const order = await findCartOrderByIdAdmin(cartHistoryId);
  if (!order) throw AppError.notFound('Order not found');
  if (order.status === input.status) throw AppError.badRequest(`Order is already in status: ${input.status}`);

  const updated = await updateCartOrderStatus({
    cartHistoryId,
    oldStatus: order.status,
    newStatus: input.status,
    changedByProfileId,
    note: input.note ?? null,
  });
  if (!updated) throw AppError.conflict('Order status was changed by another request; please retry');

  const updatedOrder = await findCartOrderByIdAdmin(cartHistoryId);
  if (!updatedOrder) throw AppError.notFound('Order not found after update');

  // Send customer status email (fire-and-forget)
  const settings = await getNotificationSettings();
  if (settings.notifyCustomerOnOrderStatus && updatedOrder.customerEmail) {
    const trackingUrl = `${env.frontendUrl}/tracking/${encodeURIComponent(updatedOrder.orderNumber ?? cartHistoryId)}`;
    const html = buildCustomerStatusEmail({
      customerName: updatedOrder.customerName ?? 'Valued Customer',
      orderNumber: updatedOrder.orderNumber ?? cartHistoryId,
      orderType: 'Order',
      newStatus: input.status,
      note: input.note ?? null,
      trackingUrl,
    });
    sendEmail({
      to: updatedOrder.customerEmail,
      subject: `Your Order Status Update — ${updatedOrder.orderNumber ?? cartHistoryId}`,
      html,
    }).catch((err: unknown) => console.error('[cart] Failed to send status email:', err));
  }

  return updatedOrder;
}

export async function setCartOrderPayment(id: string, input: UpdateCartOrderPaymentInput): Promise<AdminCartOrder> {
  const updated = await updateCartOrderPayment(id, input);
  if (!updated) throw AppError.notFound('Order not found');
  const order = await findCartOrderByIdAdmin(id);
  if (!order) throw AppError.notFound('Order not found after update');
  return order;
}

export async function setCartOrderFulfillment(id: string, input: UpdateOrderFulfillmentInput): Promise<AdminCartOrder> {
  if (!await updateCartOrderFulfillment(id, input)) throw AppError.notFound('Order not found');
  return getCartOrderByIdAdmin(id);
}
