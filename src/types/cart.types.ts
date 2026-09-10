export const CART_STATUSES = ['active', 'submitted', 'abandoned'] as const;
export type CartStatus = (typeof CART_STATUSES)[number];

export interface CartItem {
  id: string;
  cartId: string;
  productId: string | null;
  variantId: string | null;
  materialId: string | null;
  colorId: string | null;
  sizeId: string | null;
  productNameSnapshot: string | null;
  imageUrlSnapshot: string | null;
  quantity: number;
  selectedSize: number | null;
  selectedColor: string | null;
  selectedMaterial: string | null;
  variantLabelSnapshot: string | null;
  customMeasurements: Record<string, unknown> | null;
  customNotes: string | null;
  unitPriceSnapshot: number;
  currency: string | null;
  pricesSnapshot: ProductPriceSnapshot[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface Cart {
  id: string;
  profileId: string;
  status: CartStatus;
  state: string | null;
  city: string | null;
  address: string | null;
  paymentUrl: string | null;
  receiptUrl: string | null;
  selectedCurrency: string | null;
  items: CartItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CartHistoryItem {
  productId: string | null;
  variantId?: string | null;
  materialId?: string | null;
  colorId?: string | null;
  sizeId?: string | null;
  productNameSnapshot: string | null;
  imageUrlSnapshot: string | null;
  quantity: number;
  selectedSize: number | null;
  selectedColor: string | null;
  selectedMaterial: string | null;
  variantLabelSnapshot?: string | null;
  customMeasurements?: Record<string, unknown> | null;
  customNotes?: string | null;
  unitPriceSnapshot: number;
  currency: string | null;
  pricesSnapshot?: ProductPriceSnapshot[] | null;
}

export interface CartOrderStatusHistoryEntry {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string | null;
  changedByName: string | null;
  note: string | null;
  createdAt: string;
}

export interface CartHistory {
  id: string;
  orderNumber: string | null;
  originalCartId: string | null;
  profileId: string | null;
  isGuest: boolean;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  status: string;
  contactMethod: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  items: CartHistoryItem[];
  totalSnapshot: number;
  currency: string | null;
  selectedCurrency: string | null;
  paymentUrl: string | null;
  receiptUrl: string | null;
  receiptPublicId: string | null;
  shippingTrackingNumber: string | null;
  shippingTrackingUrl: string | null;
  shippingDetails: Record<string, unknown> | null;
  completedAt: string;
  createdAt: string;
  statusHistory?: CartOrderStatusHistoryEntry[];
}

// Admin view includes customer details
export interface AdminCartOrder extends CartHistory {
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
}

export interface AddCartItemInput {
  productId?: string | null;
  variantId?: string | null;
  materialId?: string | null;
  colorId?: string | null;
  sizeId?: string | null;
  productNameSnapshot?: string | null;
  imageUrlSnapshot?: string | null;
  quantity: number;
  selectedSize?: number | null;
  selectedColor?: string | null;
  selectedMaterial?: string | null;
  variantLabelSnapshot?: string | null;
  customMeasurements?: Record<string, unknown> | null;
  customNotes?: string | null;
  unitPriceSnapshot: number;
  currency: string;
  pricesSnapshot?: ProductPriceSnapshot[] | null;
}

export interface UpdateCartItemInput {
  quantity?: number;
  selectedSize?: number | null;
  selectedColor?: string | null;
  selectedMaterial?: string | null;
  variantLabelSnapshot?: string | null;
  customMeasurements?: Record<string, unknown> | null;
  customNotes?: string | null;
}
export interface UpdateCartDetailsInput {
  state?: string | null;
  city?: string | null;
  address?: string | null;
  paymentUrl?: string | null;
  receiptUrl?: string | null;
  selectedCurrency?: string | null;
}

export interface CartSubmitResult {
  submittedCartId: string | null;
  historyId: string;
  orderNumber: string;
  newActiveCartId: string | null;
}

export interface CartSubmitInput {
  contactMethod: 'email' | 'whatsapp';
  phoneNumber?: string | null;
  /** Required only when submitting without an authenticated active cart. */
  items?: AddCartItemInput[];
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  paymentUrl?: string | null;
  receiptUrl?: string | null;
  selectedCurrency?: string | null;
}

export interface ProductPriceSnapshot {
  currencyId: string;
  currency: string;
  name: string;
  symbol: string;
  amount: number;
}

export interface UpdateCartOrderStatusInput {
  status: string;
  note?: string | null;
}

export interface UpdateCartOrderPaymentInput {
  paymentUrl?: string | null;
  receiptUrl?: string | null;
  receiptPublicId?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
}

export interface UpdateOrderFulfillmentInput {
  shippingTrackingNumber?: string | null;
  shippingTrackingUrl?: string | null;
  shippingDetails?: Record<string, unknown> | null;
}
