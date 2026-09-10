// Customer-facing email templates for Soibi.
// These are sent to the customer, not to the admin.

import {
  BRAND,
  formatPrice,
  val,
  metaRow,
  emailShell,
  ctaButton,
} from './emailBrand.js';
import { env } from '../config/env.js';
import type { QuoteItem } from '../types/quote.types.js';
import type { CartHistoryItem } from '../types/cart.types.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function customerEmailShell(opts: {
  title: string;
  heading: string;
  badgeLabel: string;
  bodyHtml: string;
}): string {
  // Same shell but footer says "Do not reply" is replaced with a support note
  return emailShell(opts).replace(
    'This is an internal notification. Do not reply to this email.',
    `Questions? Contact us at <a href="mailto:${env.notificationEmail}" style="color:#aaa;">${env.notificationEmail}</a>`,
  );
}

function orderSummaryBlock(opts: {
  orderNumber: string;
  orderType: 'Quote' | 'Order';
  status: string;
  submittedAt: string;
  notes: string | null;
  trackingUrl: string;
}): string {
  const date = new Date(opts.submittedAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  return `
  <h2 style="margin:0 0 14px 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;font-weight:400;">
    ${opts.orderType} Details
  </h2>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="border-collapse:collapse;background:${BRAND.offWhite};border-radius:6px;margin-bottom:32px;">
    <tr>
      <td style="padding:20px 24px;">
        <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
          ${metaRow('Reference', opts.orderNumber, true)}
          ${metaRow('Status', opts.status)}
          ${metaRow('Submitted', date)}
          ${opts.notes ? metaRow('Your Notes', opts.notes) : ''}
        </table>
      </td>
    </tr>
  </table>
  ${ctaButton(opts.trackingUrl, `Track My ${opts.orderType}`)}
  <div style="margin-bottom:32px;"></div>`;
}

function itemSummaryBlock(items: Array<QuoteItem | CartHistoryItem>): string {
  if (items.length === 0) return '';
  const rows = items.map((item) => {
    const quoteItem = 'productNameSnapshot' in item ? item : item;
    const name = quoteItem.productNameSnapshot ?? ('shoeNameSnapshot' in quoteItem ? quoteItem.shoeNameSnapshot : null) ?? 'Custom Item';
    const size = 'size' in quoteItem ? quoteItem.size : quoteItem.selectedSize;
    const color = 'colorNameSnapshot' in quoteItem ? quoteItem.colorNameSnapshot : quoteItem.selectedColor;
    const material = 'materialNameSnapshot' in quoteItem ? quoteItem.materialNameSnapshot : quoteItem.selectedMaterial;
    const currency = 'currency' in quoteItem ? quoteItem.currency : null;
    const price = quoteItem.unitPriceSnapshot == null
      ? 'To be confirmed'
      : currency ? `${currency} ${quoteItem.unitPriceSnapshot.toLocaleString('en-NG')}` : formatPrice(quoteItem.unitPriceSnapshot);
    return `<tr>
      <td style="padding:8px 0;font-family:Arial,sans-serif;color:${BRAND.black};">${val(name)}</td>
      <td style="padding:8px 0;font-family:Arial,sans-serif;color:#666;text-align:center;">${quoteItem.quantity}</td>
      <td style="padding:8px 0;font-family:Arial,sans-serif;color:#666;text-align:right;">${price}</td>
      <td style="padding:8px 0;font-family:Arial,sans-serif;color:#666;text-align:right;">${[size != null ? `Size ${size}` : null, color, material].filter(Boolean).join(' · ')}</td>
    </tr>`;
  }).join('');
  return `<h2 style="margin:0 0 14px 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;font-weight:400;">Items</h2>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:32px;">
    <thead><tr><th align="left" style="padding-bottom:8px;font-size:11px;color:#888;font-family:Arial,sans-serif;">ITEM</th><th style="padding-bottom:8px;font-size:11px;color:#888;font-family:Arial,sans-serif;">QTY</th><th align="right" style="padding-bottom:8px;font-size:11px;color:#888;font-family:Arial,sans-serif;">PRICE</th><th align="right" style="padding-bottom:8px;font-size:11px;color:#888;font-family:Arial,sans-serif;">DETAILS</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ─── Quote confirmation (customer) ────────────────────────────────────────────

export interface CustomerQuoteEmailData {
  customerName: string;
  referenceNumber: string;
  status: string;
  submittedAt: string;
  customerNotes: string | null;
  isGuest: boolean;
  items: QuoteItem[];
}

export function buildCustomerQuoteEmail(data: CustomerQuoteEmailData): string {
  const trackingUrl = `${env.frontendUrl}/tracking/quote/${encodeURIComponent(data.referenceNumber)}`;
  const total = data.items.reduce((sum, item) => sum + (item.unitPriceSnapshot ?? 0) * item.quantity, 0);

  const bodyHtml = `
    <p style="margin:0 0 24px 0;font-size:15px;color:${BRAND.black};font-family:Arial,sans-serif;line-height:1.6;">
      Hi ${val(data.customerName)},<br /><br />
      Thank you for your quote request. We have received it and will be in touch shortly.
    </p>
    ${orderSummaryBlock({
      orderNumber: data.referenceNumber,
      orderType: 'Quote',
      status: data.status,
      submittedAt: data.submittedAt,
      notes: data.customerNotes,
      trackingUrl,
    })}
    ${itemSummaryBlock(data.items)}
    ${total > 0 ? `<p style="margin:0 0 24px 0;font-size:16px;color:${BRAND.black};font-family:Arial,sans-serif;"><strong>Estimated Total: ${formatPrice(total)}</strong></p>` : ''}
  `;

  return customerEmailShell({
    title: 'Quote Received — Soibi',
    heading: 'Quote Received',
    badgeLabel: data.isGuest ? 'Guest Quote' : 'Your Quote',
    bodyHtml,
  });
}

// ─── Cart / order confirmation (customer) ─────────────────────────────────────

export interface CustomerCartEmailData {
  customerName: string;
  orderNumber: string;
  historyId: string;
  status: string;
  submittedAt: string;
  totalSnapshot: number;
  currency: string | null;
  items: CartHistoryItem[];
}

export function buildCustomerCartEmail(data: CustomerCartEmailData): string {
  const trackingUrl = `${env.frontendUrl}/tracking/cart/${encodeURIComponent(data.orderNumber)}`;

  const bodyHtml = `
    <p style="margin:0 0 24px 0;font-size:15px;color:${BRAND.black};font-family:Arial,sans-serif;line-height:1.6;">
      Hi ${val(data.customerName)},<br /><br />
      Thank you for your order. We have received it and will be in touch shortly.
    </p>
    ${orderSummaryBlock({
      orderNumber: data.orderNumber,
      orderType: 'Order',
      status: data.status,
      submittedAt: data.submittedAt,
      notes: null,
      trackingUrl,
    })}
    ${itemSummaryBlock(data.items)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-collapse:collapse;margin-top:8px;margin-bottom:32px;">
      <tr>
        <td style="padding:18px 24px;background:${BRAND.black};border-radius:6px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:${BRAND.gold};font-family:Arial,sans-serif;">
                Order Total
              </td>
              <td align="right" style="font-size:22px;font-weight:700;color:#ffffff;font-family:Georgia,serif;">
                ${data.currency ? `${data.currency} ${data.totalSnapshot.toLocaleString('en-NG')}` : formatPrice(data.totalSnapshot)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  return customerEmailShell({
    title: 'Order Received — Soibi',
    heading: 'Order Received',
    badgeLabel: 'Your Order',
    bodyHtml,
  });
}

// ─── Order status update (customer) ──────────────────────────────────────────

export interface CustomerStatusEmailData {
  customerName: string;
  orderNumber: string;
  orderType: 'Quote' | 'Order';
  newStatus: string;
  note: string | null;
  trackingUrl: string;
}

const STATUS_MESSAGES: Record<string, string> = {
  confirmed: 'Congratulations, your order has been confirmed.',
  processing: 'Congratulations, your order is being processed.',
  shipped: 'Congratulations, your order is being shipped.',
  completed: 'Your order has been completed. Thank you for choosing Soibi!',
  approved: 'Your quote has been approved. We will be in touch shortly.',
  reviewing: 'Your quote is currently being reviewed by our team.',
  cancelled: 'Your order has been cancelled. Please contact us if you have any questions.',
};

export function buildCustomerStatusEmail(data: CustomerStatusEmailData): string {
  const message = STATUS_MESSAGES[data.newStatus.toLowerCase()]
    ?? `Your order status has been updated to: ${data.newStatus}`;

  const bodyHtml = `
    <p style="margin:0 0 24px 0;font-size:15px;color:${BRAND.black};font-family:Arial,sans-serif;line-height:1.6;">
      Hi ${val(data.customerName)},<br /><br />
      ${message}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-collapse:collapse;background:${BRAND.offWhite};border-radius:6px;margin-bottom:32px;">
      <tr>
        <td style="padding:20px 24px;">
          <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
            ${metaRow('Reference', data.orderNumber, true)}
            ${metaRow('New Status', data.newStatus)}
            ${data.note ? metaRow('Note', data.note) : ''}
          </table>
        </td>
      </tr>
    </table>
    ${ctaButton(data.trackingUrl, `Track My ${data.orderType}`)}
    <div style="margin-bottom:32px;"></div>
  `;

  return customerEmailShell({
    title: `${data.orderType} Status Update — Soibi`,
    heading: `${data.orderType} Update`,
    badgeLabel: `Status: ${data.newStatus}`,
    bodyHtml,
  });
}

// ─── Contact confirmation (customer) ─────────────────────────────────────────

export function buildCustomerContactEmail(name: string, subject: string | null): string {
  const bodyHtml = `
    <p style="margin:0 0 24px 0;font-size:15px;color:${BRAND.black};font-family:Arial,sans-serif;line-height:1.6;">
      Hi ${val(name)},<br /><br />
      Thank you for reaching out to Soibi. We have received your message
      ${subject ? `regarding <strong>${subject}</strong>` : ''} and will get back to you as soon as possible.
    </p>
    <p style="margin:0;font-size:13px;color:#888;font-family:Arial,sans-serif;">
      If your enquiry is urgent, please contact us directly via WhatsApp or email.
    </p>
  `;

  return customerEmailShell({
    title: 'Message Received — Soibi',
    heading: 'Message Received',
    badgeLabel: 'Contact Confirmation',
    bodyHtml,
  });
}

// ─── Academy confirmation (applicant) ────────────────────────────────────────

export function buildCustomerAcademyEmail(fullName: string): string {
  const bodyHtml = `
    <p style="margin:0 0 24px 0;font-size:15px;color:${BRAND.black};font-family:Arial,sans-serif;line-height:1.6;">
      Hi ${val(fullName)},<br /><br />
      Thank you for applying to the Soibi Academy. We have received your application
      and will review it shortly. You will hear from us soon.
    </p>
    <p style="margin:0;font-size:13px;color:#888;font-family:Arial,sans-serif;">
      We look forward to potentially welcoming you to the Soibi Academy family.
    </p>
  `;

  return customerEmailShell({
    title: 'Application Received — Soibi Academy',
    heading: 'Application Received',
    badgeLabel: 'Soibi Academy',
    bodyHtml,
  });
}
