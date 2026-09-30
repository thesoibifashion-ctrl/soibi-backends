import {
  createQuoteWithItems,
  findQuotesByProfileId,
  findQuoteByIdAndProfileId,
  findAllQuotesAdmin,
  findQuoteByIdAdmin,
  findQuoteCurrentStatus,
  updateQuoteStatus,
  updateCustomerQuoteWithItems,
  findPendingDraftByProfileId,
  updateQuotePayment,
  findQuoteByReferenceNumber,
  findGuestQuoteByReferenceAndEmail,
  updateQuoteReceiptByProfileId,
  updateQuoteFulfillment,
} from '../repositories/quote.repository.js';
import { pool } from '../database/pool.js';
import { AppError } from '../utils/AppError.js';
import { sendEmail } from '../utils/mailer.js';
import { buildQuoteSubmissionEmail } from '../utils/quoteSubmissionEmail.js';
import { buildCustomerQuoteEmail, buildCustomerStatusEmail } from '../utils/customerEmails.js';
import { getNotificationSettings } from '../utils/notificationSettings.js';
import { env } from '../config/env.js';
import type {
  CreateQuoteInput,
  UpdateQuoteStatusInput,
  QuoteRequest,
  QuoteRequestAdmin,
  QuoteRequestSummary,
  QuoteRequestAdminSummary,
  QuoteStatus,
  UpdateCustomerQuoteInput,
  UpdateQuotePaymentInput,
  UpdateQuoteFulfillmentInput,
} from '../types/quote.types.js';
import type { AuthUser } from '../types/api.types.js';

// ─── Admin notification email ─────────────────────────────────────────────────

async function sendQuoteAdminEmail(quote: QuoteRequestAdmin, isGuest: boolean, notificationEmail: string): Promise<void> {
  const html = buildQuoteSubmissionEmail({
    customerName: quote.customerName ?? 'Unknown',
    customerEmail: quote.customerEmail ?? '',
    customerPhone: quote.customerPhone ?? null,
    contactMethod: quote.contactMethod ?? 'email',
    referenceNumber: quote.referenceNumber,
    quoteId: quote.id,
    status: quote.status,
    submittedAt: quote.submittedAt,
    customerNotes: quote.customerNotes,
    items: quote.items,
    isGuest,
  });
  await sendEmail({
    to: notificationEmail,
    subject: `New Quote Submission — ${quote.referenceNumber}`,
    html,
  });
}

// ─── Customer confirmation email ──────────────────────────────────────────────

async function sendQuoteCustomerEmail(
  quote: QuoteRequestAdmin,
  customerEmail: string,
  isGuest: boolean,
): Promise<void> {
  const html = buildCustomerQuoteEmail({
    customerName: quote.customerName ?? 'Valued Customer',
    referenceNumber: quote.referenceNumber,
    status: quote.status,
    submittedAt: quote.submittedAt,
    customerNotes: quote.customerNotes,
    isGuest,
    items: quote.items,
  });
  await sendEmail({
    to: customerEmail,
    subject: `Your Quote Request — ${quote.referenceNumber}`,
    html,
  });
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export async function submitQuote(
  profileId: string | null,
  input: CreateQuoteInput,
  user?: AuthUser,
): Promise<QuoteRequest> {
  const settings = await getNotificationSettings();

  // ── Guest path ──────────────────────────────────────────────────────────────
  if (!profileId) {
    if (!input.guestName || !input.guestEmail) {
      throw AppError.badRequest('guestName and guestEmail are required for guest quotes');
    }

    const quoteId = await createQuoteWithItems({
      profileId: null,
      guestName: input.guestName,
      guestEmail: input.guestEmail,
      guestPhone: input.guestPhone ?? null,
      customerNotes: input.customerNotes ?? null,
      items: input.items ?? [],
      contactMethod: null,
      phoneNumber: null,
      state: input.state ?? null, city: input.city ?? null, address: input.address ?? null,
      paymentUrl: input.paymentUrl ?? null, receiptUrl: input.receiptUrl ?? null,
    });

    const quote = await findQuoteByIdAdmin(quoteId);
    if (!quote) throw new AppError('Quote created but could not be retrieved', 500);

    if (settings.notifyAdminOnQuote) {
      sendQuoteAdminEmail({ ...quote, contactMethod: 'whatsapp' }, true, settings.notificationEmail)
        .catch((err: unknown) => console.error('[quote] Failed to send admin email:', err));
    }
    if (settings.notifyCustomerOnQuote && input.guestEmail) {
      sendQuoteCustomerEmail({ ...quote, contactMethod: 'whatsapp' }, input.guestEmail, true)
        .catch((err: unknown) => console.error('[quote] Failed to send customer email:', err));
    }

    return quote;
  }

  // ── Authenticated path ──────────────────────────────────────────────────────
  const contactMethod = input.contactMethod ?? 'email';
  const phoneNumber = input.phoneNumber ?? null;

  if (contactMethod === 'whatsapp' && !phoneNumber) {
    const profileResult = await pool.query(`SELECT phone FROM profiles WHERE id = $1`, [profileId]);
    const savedPhone = ((profileResult.rows[0] as Record<string, unknown>)?.['phone'] as string | null) ?? null;
    if (!savedPhone) {
      throw AppError.badRequest('A phone number is required when WhatsApp is selected as the contact method');
    }
  }

  const existingDraftId = await findPendingDraftByProfileId(profileId);
  const quoteId = existingDraftId
    ? await mergeIntoDraft(existingDraftId, profileId, input)
    : await createQuoteWithItems({
        profileId,
        guestName: null,
        guestEmail: null,
        guestPhone: null,
        customerNotes: input.customerNotes ?? null,
        items: input.items ?? [],
        contactMethod,
        phoneNumber: contactMethod === 'whatsapp' ? phoneNumber : null,
        state: input.state ?? null, city: input.city ?? null, address: input.address ?? null,
        paymentUrl: input.paymentUrl ?? null, receiptUrl: input.receiptUrl ?? null,
      });

  return finishAuthenticatedQuote(quoteId, profileId, settings);
}

async function mergeIntoDraft(draftId: string, profileId: string, input: CreateQuoteInput): Promise<string> {
  await updateCustomerQuoteWithItems({ quoteId: draftId, profileId, customerNotes: input.customerNotes, items: input.items });
  return draftId;
}

async function finishAuthenticatedQuote(
  quoteId: string,
  profileId: string,
  settings: Awaited<ReturnType<typeof getNotificationSettings>>,
): Promise<QuoteRequest> {
  const quote = await findQuoteByIdAndProfileId(quoteId, profileId);
  if (!quote) throw new AppError('Quote created but could not be retrieved', 500);

  const adminQuote = await findQuoteByIdAdmin(quoteId);
  if (adminQuote) {
    if (settings.notifyAdminOnQuote) {
      sendQuoteAdminEmail(adminQuote, false, settings.notificationEmail)
        .catch((err: unknown) => console.error('[quote] Failed to send admin email:', err));
    }
    if (settings.notifyCustomerOnQuote && adminQuote.customerEmail) {
      sendQuoteCustomerEmail(adminQuote, adminQuote.customerEmail, false)
        .catch((err: unknown) => console.error('[quote] Failed to send customer email:', err));
    }
  }

  return quote;
}

export async function getMyQuotes(profileId: string): Promise<QuoteRequestSummary[]> {
  return findQuotesByProfileId(profileId);
}

export async function getMyQuoteById(id: string, profileId: string): Promise<QuoteRequest> {
  const quote = await findQuoteByIdAndProfileId(id, profileId);
  if (!quote) throw AppError.notFound('Quote not found');
  return quote;
}

export async function updateMyQuote(id: string, profileId: string, input: UpdateCustomerQuoteInput): Promise<QuoteRequest> {
  try {
    const updated = await updateCustomerQuoteWithItems({ quoteId: id, profileId, ...input });
    if (!updated) throw AppError.notFound('Quote not found');
  } catch (error) {
    if (error instanceof Error && error.message === 'Customer quote is already completed') {
      throw AppError.badRequest('Completed customer quotes cannot be updated');
    }
    throw error;
  }
  const quote = await findQuoteByIdAndProfileId(id, profileId);
  if (!quote) throw AppError.notFound('Quote not found after update');
  return quote;
}

export async function submitMyQuoteReceipt(
  id: string,
  profileId: string,
  input: Pick<UpdateQuotePaymentInput, 'receiptUrl' | 'receiptPublicId'>,
): Promise<QuoteRequest> {
  if (!await updateQuoteReceiptByProfileId(id, profileId, input)) throw AppError.notFound('Quote not found');
  return getMyQuoteById(id, profileId);
}

// ─── Tracking (public) ────────────────────────────────────────────────────────

export async function trackQuoteByReference(referenceNumber: string): Promise<QuoteRequest> {
  const quote = await findQuoteByReferenceNumber(referenceNumber);
  if (!quote) throw AppError.notFound('Quote not found');
  return quote;
}

export async function trackMyQuoteByReference(referenceNumber: string, profileId: string): Promise<QuoteRequest> {
  const quote = await trackQuoteByReference(referenceNumber);
  if (quote.profileId !== profileId) throw AppError.notFound('Quote not found');
  return quote;
}

export async function trackGuestQuoteByReference(referenceNumber: string, email: string): Promise<QuoteRequest> {
  const quote = await findGuestQuoteByReferenceAndEmail(referenceNumber, email);
  if (!quote) throw AppError.notFound('Quote not found');
  return quote;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function getAllQuotesAdmin(status?: QuoteStatus): Promise<QuoteRequestAdminSummary[]> {
  return findAllQuotesAdmin(status);
}

export async function getQuoteByIdAdmin(id: string): Promise<QuoteRequestAdmin> {
  const quote = await findQuoteByIdAdmin(id);
  if (!quote) throw AppError.notFound('Quote not found');
  return quote;
}

export async function changeQuoteStatus(
  quoteId: string,
  changedByProfileId: string,
  input: UpdateQuoteStatusInput,
): Promise<QuoteRequestAdmin> {
  const currentStatus = await findQuoteCurrentStatus(quoteId);
  if (currentStatus === null) throw AppError.notFound('Quote not found');
  if (currentStatus === input.status) throw AppError.badRequest(`Quote is already in status: ${input.status}`);

  const updatedStatus = await updateQuoteStatus({
    quoteId,
    oldStatus: currentStatus,
    newStatus: input.status,
    changedByProfileId,
    note: input.note ?? null,
  });
  if (!updatedStatus) throw AppError.conflict('Quote status was changed by another request; please retry');

  const updated = await findQuoteByIdAdmin(quoteId);
  if (!updated) throw AppError.notFound('Quote not found after update');

  // Send customer status email (fire-and-forget)
  const settings = await getNotificationSettings();
  if (settings.notifyCustomerOnOrderStatus && updated.customerEmail) {
    const trackingUrl = `${env.liveUrl.replace(/\/+$/, '')}/tracking/quote/${encodeURIComponent(updated.referenceNumber)}`;
    const html = buildCustomerStatusEmail({
      customerName: updated.customerName ?? 'Valued Customer',
      orderNumber: updated.referenceNumber,
      orderType: 'Quote',
      newStatus: input.status,
      note: input.note ?? null,
      trackingUrl,
    });
    sendEmail({
      to: updated.customerEmail,
      subject: `Your Quote Status Update — ${updated.referenceNumber}`,
      html,
    }).catch((err: unknown) => console.error('[quote] Failed to send status email:', err));
  }

  return updated;
}

export async function setQuotePayment(id: string, input: UpdateQuotePaymentInput): Promise<QuoteRequestAdmin> {
  const updated = await updateQuotePayment(id, input);
  if (!updated) throw AppError.notFound('Quote not found');
  const quote = await findQuoteByIdAdmin(id);
  if (!quote) throw AppError.notFound('Quote not found after update');
  return quote;
}

export async function setQuoteFulfillment(id: string, input: UpdateQuoteFulfillmentInput): Promise<QuoteRequestAdmin> {
  if (!await updateQuoteFulfillment(id, input)) throw AppError.notFound('Quote not found');
  return getQuoteByIdAdmin(id);
}
