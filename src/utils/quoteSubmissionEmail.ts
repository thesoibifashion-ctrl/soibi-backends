import type { QuoteItem } from '../types/quote.types.js';
import {
  BRAND,
  formatPrice,
  val,
  metaRow,
  emailShell,
  customerDetailsBlock,
  ctaButton,
} from './emailBrand.js';
import { env } from '../config/env.js';

function quoteItemRow(item: QuoteItem): string {
  const name = val(item.productNameSnapshot, val(item.shoeNameSnapshot, 'Custom Item'));
  const image = item.imageUrlSnapshot
    ? `<img src="${item.imageUrlSnapshot}" alt="${name}" width="72" height="72"
            style="width:72px;height:72px;object-fit:cover;border-radius:4px;display:block;border:1px solid ${BRAND.gray};" />`
    : `<div style="width:72px;height:72px;background:${BRAND.gray};border-radius:4px;">
         <span style="color:#999;font-size:10px;display:block;padding:28px 0;text-align:center;">No image</span>
       </div>`;

  const productLink = item.productId ? `${env.adminUrl}/products/${item.productId}` : null;
  const itemTotal =
    item.unitPriceSnapshot != null
      ? formatPrice(item.unitPriceSnapshot * item.quantity)
      : null;

  return `
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="border-collapse:collapse;margin-bottom:12px;background:${BRAND.offWhite};border-radius:6px;border:1px solid ${BRAND.gray};">
    <tr>
      <td width="88" valign="top" style="padding:16px 0 16px 16px;vertical-align:top;">${image}</td>
      <td valign="top" style="padding:16px;vertical-align:top;">
        <p style="margin:0 0 6px 0;font-size:15px;font-weight:600;color:${BRAND.black};font-family:Georgia,serif;">
          ${productLink
            ? `<a href="${productLink}" style="color:${BRAND.black};text-decoration:none;">${name}</a>`
            : name}
        </p>
        <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          ${metaRow('Quantity', String(item.quantity))}
          ${item.size != null ? metaRow('Size', String(item.size)) : ''}
          ${item.colorNameSnapshot ? metaRow('Color', item.colorNameSnapshot) : ''}
          ${item.materialNameSnapshot ? metaRow('Material', item.materialNameSnapshot) : ''}
          ${item.toeStyleSnapshot ? metaRow('Toe Style', item.toeStyleSnapshot) : ''}
          ${item.unitPriceSnapshot != null ? metaRow('Unit Price', formatPrice(item.unitPriceSnapshot)) : ''}
          ${itemTotal ? metaRow('Item Total', itemTotal, true) : ''}
        </table>
      </td>
    </tr>
  </table>`;
}

export interface QuoteSubmissionEmailData {
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  contactMethod: 'email' | 'whatsapp';
  referenceNumber: string;
  quoteId: string;
  status: string;
  submittedAt: string;
  customerNotes: string | null;
  items: QuoteItem[];
  isGuest: boolean;
}

export function buildQuoteSubmissionEmail(data: QuoteSubmissionEmailData): string {
  const itemCount = data.items.reduce((s, i) => s + i.quantity, 0);
  const totalSnapshot = data.items.reduce(
    (s, i) => s + (i.unitPriceSnapshot ?? 0) * i.quantity,
    0,
  );
  const submittedDate = new Date(data.submittedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const bodyHtml = `
    ${customerDetailsBlock({
      name: data.customerName,
      email: data.customerEmail,
      phone: data.customerPhone,
      contactMethod: data.contactMethod,
    })}

    <!-- Quote details -->
    <h2 style="margin:0 0 14px 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;font-weight:400;">
      Quote Details
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-collapse:collapse;background:${BRAND.offWhite};border-radius:6px;margin-bottom:32px;">
      <tr>
        <td style="padding:20px 24px;">
          <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
            <tr>
              <td style="padding:5px 0;font-size:13px;color:#888;font-family:Arial,sans-serif;width:160px;vertical-align:top;">Reference</td>
              <td style="padding:5px 0;font-size:13px;color:${BRAND.black};font-family:Arial,sans-serif;font-weight:600;vertical-align:top;">${data.referenceNumber}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;font-size:13px;color:#888;font-family:Arial,sans-serif;vertical-align:top;">Status</td>
              <td style="padding:5px 0;font-size:13px;color:${BRAND.gold};font-family:Arial,sans-serif;font-weight:600;text-transform:capitalize;vertical-align:top;">${data.status}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;font-size:13px;color:#888;font-family:Arial,sans-serif;vertical-align:top;">Submitted</td>
              <td style="padding:5px 0;font-size:13px;color:${BRAND.black};font-family:Arial,sans-serif;vertical-align:top;">${submittedDate}</td>
            </tr>
            ${data.customerNotes
              ? `<tr>
                   <td style="padding:5px 0;font-size:13px;color:#888;font-family:Arial,sans-serif;vertical-align:top;">Customer Notes</td>
                   <td style="padding:5px 0;font-size:13px;color:${BRAND.black};font-family:Arial,sans-serif;vertical-align:top;">${data.customerNotes}</td>
                 </tr>`
              : ''}
          </table>
        </td>
      </tr>
    </table>

    <!-- Items -->
    <h2 style="margin:0 0 14px 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;font-weight:400;">
      Quote Items (${itemCount} ${itemCount === 1 ? 'item' : 'items'})
    </h2>
    ${data.items.map(quoteItemRow).join('\n')}

    <!-- Total (only shown when at least one item has a price) -->
    ${totalSnapshot > 0
      ? `<table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border-collapse:collapse;margin-top:8px;margin-bottom:32px;">
           <tr>
             <td style="padding:18px 24px;background:${BRAND.black};border-radius:6px;">
               <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                 <tr>
                   <td style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:${BRAND.gold};font-family:Arial,sans-serif;">
                     Estimated Total
                   </td>
                   <td align="right" style="font-size:22px;font-weight:700;color:#ffffff;font-family:Georgia,serif;">
                     ${formatPrice(totalSnapshot)}
                   </td>
                 </tr>
               </table>
             </td>
           </tr>
         </table>`
      : '<div style="margin-bottom:32px;"></div>'}

    ${ctaButton(`${env.adminUrl}/quotes/${data.quoteId}`, 'View Quote')}
  `;

  return emailShell({
    title: 'New Quote Submission — Soibi',
    heading: 'New Quote Submission',
    badgeLabel: data.isGuest ? 'Guest Quote Request' : 'Customer Quote Request',
    bodyHtml,
  });
}
