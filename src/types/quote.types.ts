// ─── Status ───────────────────────────────────────────────────────────────────
// Status is now a flexible string — the admin decides the actual business values.
// The legacy enum values remain the defaults but are no longer enforced by DB.
export const QUOTE_STATUSES = ['pending', 'reviewing', 'approved', 'completed', 'cancelled'] as const;
export type QuoteStatus = string;  // flexible — not restricted to the above
export type QuoteStatusLegacy = (typeof QUOTE_STATUSES)[number];

export const CUSTOMER_QUOTE_STATUSES = ['pending', 'completed'] as const;
export type CustomerQuoteStatus = (typeof CUSTOMER_QUOTE_STATUSES)[number];

// ─── Submission input (validated by Zod before reaching service) ──────────────

export interface QuoteItemInput {
  productId: string | null;   // null = fully custom shoe with no product record
  productNameSnapshot?: string | null;
  imageUrlSnapshot?: string | null;
  shoeNameSnapshot?: string | null;
  toeStyleSnapshot?: string | null;
  size?: number | null;
  variantLabelSnapshot?: string | null;
  materialNameSnapshot?: string | null;
  colorNameSnapshot?: string | null;
  quantity: number;
  unitPriceSnapshot?: number | null;
  customMeasurements?: Record<string, unknown> | null;
  customNotes?: string | null;
}

export interface CreateQuoteInput {
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  customerNotes?: string | null;
  items?: QuoteItemInput[];   // optional — customer may create an empty draft first
  contactMethod?: 'email' | 'whatsapp';
  phoneNumber?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  paymentUrl?: string | null;
  receiptUrl?: string | null;
}

export interface UpdateCustomerQuoteInput {
  customerNotes?: string | null;
  items?: QuoteItemInput[];
  customerStatus?: CustomerQuoteStatus;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  paymentUrl?: string | null;
  receiptUrl?: string | null;
}

// ─── Status update input ──────────────────────────────────────────────────────

export interface UpdateQuoteStatusInput {
  status: QuoteStatus;
  note?: string | null;
}

// ─── DB / response shapes ─────────────────────────────────────────────────────

export interface QuoteStatusHistoryEntry {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string | null;       // profiles.id
  changedByName: string | null;   // profiles.full_name — joined for display
  note: string | null;
  createdAt: string;
}

export interface QuoteItem {
  id: string;
  productId: string | null;
  productNameSnapshot: string | null;
  imageUrlSnapshot: string | null;
  shoeNameSnapshot: string | null;
  toeStyleSnapshot: string | null;
  size: number | null;
  variantLabelSnapshot: string | null;
  materialNameSnapshot: string | null;
  colorNameSnapshot: string | null;
  quantity: number;
  unitPriceSnapshot: number | null;
  customMeasurements: Record<string, unknown> | null;
  customNotes: string | null;
  createdAt: string;
}

export interface QuoteRequest {
  id: string;
  referenceNumber: string;
  profileId: string | null;
  status: QuoteStatus;
  customerStatus: CustomerQuoteStatus;
  contactMethod: 'email' | 'whatsapp' | null;
  customerNotes: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  paymentUrl: string | null;
  receiptUrl: string | null;
  receiptPublicId: string | null;
  shippingTrackingNumber: string | null;
  shippingTrackingUrl: string | null;
  shippingDetails: Record<string, unknown> | null;
  submittedAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: QuoteItem[];
  statusHistory: QuoteStatusHistoryEntry[];
}

// Admin view includes customer contact details
export interface QuoteRequestAdmin extends QuoteRequest {
  adminNotes: string | null;
  customerName: string | null;    // from profiles.full_name or guest_name
  customerEmail: string | null;   // from profiles.email or guest_email
  customerPhone: string | null;   // from profiles.phone or guest_phone
}

// Summary for list views — no items or history
export type QuoteRequestSummary = Omit<QuoteRequest, 'items' | 'statusHistory'>;
export type QuoteRequestAdminSummary = Omit<QuoteRequestAdmin, 'items' | 'statusHistory'>;

export interface UpdateQuotePaymentInput {
  paymentUrl?: string | null;
  receiptUrl?: string | null;
  receiptPublicId?: string | null;
}

export interface UpdateQuoteFulfillmentInput {
  shippingTrackingNumber?: string | null;
  shippingTrackingUrl?: string | null;
  shippingDetails?: Record<string, unknown> | null;
}
