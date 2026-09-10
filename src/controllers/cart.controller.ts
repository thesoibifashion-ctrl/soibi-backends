import type { Response, NextFunction } from 'express';
import type { MaybeAuthenticatedRequest } from '../types/api.types.js';
import {
  addItemToCart,
  clearMyCart,
  getMyCart,
  getMyCartHistory,
  removeMyCartItem,
  submitGuestCart,
  submitMyCart,
  updateMyCartItem,
  getAllCartOrdersAdmin,
  getCartOrderByIdAdmin,
  changeCartOrderStatus,
  setCartOrderPayment,
  getMyCartHistoryById,
  submitMyCartReceipt,
  trackCartOrderByNumber,
  setCartOrderFulfillment,
  updateMyCartDetails,
} from '../services/cart.service.js';
import { addCartItemSchema, updateCartItemSchema, updateCartDetailsSchema, submitCartSchema, updateCartOrderPaymentSchema, updateCartOrderStatusSchema, submitReceiptSchema, updateFulfillmentSchema } from '../validators/cart.validator.js';
import { AppError } from '../utils/AppError.js';
import { HttpStatus } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';

function resolvedProfileId(req: MaybeAuthenticatedRequest): string {
  if (!req.user) throw AppError.unauthorized('Not authenticated');
  return req.user.id;
}

export async function getCart(
  req: MaybeAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cart = await getMyCart(resolvedProfileId(req));
    sendSuccess(res, 'Cart retrieved', cart);
  } catch (err) {
    next(err);
  }
}

export async function addCartItem(
  req: MaybeAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = addCartItemSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }
    const cart = await addItemToCart(resolvedProfileId(req), parsed.data);
    sendSuccess(res, 'Item added to cart', cart, HttpStatus.CREATED);
  } catch (err) {
    next(err);
  }
}

export async function updateCartItem(
  req: MaybeAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = updateCartItemSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }
    await updateMyCartItem(resolvedProfileId(req), req.params['id'] as string, parsed.data);
    sendSuccess(res, 'Cart item updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteCartItem(
  req: MaybeAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await removeMyCartItem(resolvedProfileId(req), req.params['id'] as string);
    sendSuccess(res, 'Cart item removed');
  } catch (err) {
    next(err);
  }
}

export async function clearCart(
  req: MaybeAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await clearMyCart(resolvedProfileId(req));
    sendSuccess(res, 'Cart cleared');
  } catch (err) {
    next(err);
  }
}

export async function updateCartDetails(req: MaybeAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateCartDetailsSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    sendSuccess(res, 'Cart updated', await updateMyCartDetails(resolvedProfileId(req), parsed.data));
  } catch (err) { next(err); }
}

export async function getCartHistory(
  req: MaybeAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const history = await getMyCartHistory(resolvedProfileId(req));
    sendSuccess(res, 'Cart history retrieved', history);
  } catch (err) {
    next(err);
  }
}

export async function getCartHistoryItem(req: MaybeAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await getMyCartHistoryById(req.params['id'] as string, resolvedProfileId(req));
    sendSuccess(res, 'Cart order retrieved', order);
  } catch (err) { next(err); }
}

export async function submitCartReceipt(req: MaybeAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = submitReceiptSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    const order = await submitMyCartReceipt(req.params['id'] as string, resolvedProfileId(req), parsed.data);
    sendSuccess(res, 'Order receipt updated', order);
  } catch (err) { next(err); }
}

export async function submitCart(
  req: MaybeAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = submitCartSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }
    const result = req.user
      ? await submitMyCart(req.user, parsed.data)
      : await submitGuestCart(parsed.data);
    sendSuccess(res, 'Cart submitted successfully', result);
  } catch (err) {
    next(err);
  }
}

export async function listAdminCartOrders(req: MaybeAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const getString = (key: string) => typeof req.query[key] === 'string' ? req.query[key] as string : undefined;
    const orders = await getAllCartOrdersAdmin({
      profileId: getString('customerId'),
      productId: getString('productId'),
      status: getString('status'),
    });
    sendSuccess(res, 'Cart orders retrieved', orders);
  } catch (err) { next(err); }
}

export async function getAdminCartOrder(req: MaybeAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, 'Cart order retrieved', await getCartOrderByIdAdmin(req.params['id'] as string)); }
  catch (err) { next(err); }
}

export async function updateAdminCartOrderStatus(req: MaybeAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateCartOrderStatusSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    const order = await changeCartOrderStatus(req.params['id'] as string, resolvedProfileId(req), parsed.data);
    sendSuccess(res, 'Cart order status updated', order);
  } catch (err) { next(err); }
}

export async function updateAdminCartOrderPayment(req: MaybeAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateCartOrderPaymentSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    const order = await setCartOrderPayment(req.params['id'] as string, parsed.data);
    sendSuccess(res, 'Cart order payment updated', order);
  } catch (err) { next(err); }
}

export async function updateAdminCartOrderFulfillment(req: MaybeAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateFulfillmentSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    sendSuccess(res, 'Cart order fulfillment updated', await setCartOrderFulfillment(req.params['id'] as string, parsed.data));
  } catch (err) { next(err); }
}

export async function trackMyCartOrder(req: MaybeAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await trackCartOrderByNumber(req.params['orderNumber'] as string);
    sendSuccess(res, 'Order tracking retrieved', {
      orderNumber: order.orderNumber, orderType: 'cart', status: order.status,
      statusHistory: (order.statusHistory ?? []).map((entry) => ({ status: entry.newStatus, previousStatus: entry.oldStatus, createdAt: entry.createdAt })),
      submittedAt: order.completedAt, createdAt: order.createdAt, items: order.items, total: order.totalSnapshot, currency: order.currency,
      selectedCurrency: order.selectedCurrency,
      // A tracking number is the public capability token: expose only the order
      // data needed to track this one order, never contact/address details.
      shippingTrackingNumber: order.shippingTrackingNumber, shippingTrackingUrl: order.shippingTrackingUrl,
    });
  } catch (err) { next(err); }
}
