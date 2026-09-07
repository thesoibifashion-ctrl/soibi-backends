import type { CartHistoryItem } from '../types/cart.types.js';
import {
  BRAND,
  formatPrice,
  val,
  metaRow,
  emailShell,
  customerDetailsBlock,
  totalBlock,
  ctaButton,
} from './emailBrand.js';
import { env } from '../config/env.js';

function cartItemRow(item: CartHistoryItem): string {
  const name = val(item.productNameSnapshot, 'Custom Item');
  const image = item.imageUrlSnapshot
    ? `<img src="${item.imageUrlSnapshot}" alt="${name}" width="72" height="72"
            style="width:72px;height:72px;object-fit:cover;border-radius:4px;display:block;border:1px solid ${BRAND.gray};" />`
    : `<div style="width:72px;height:72px;background:${BRAND.gray};border-radius:4px;">
         <span style="color:#999;font-size:10px;display:block;padding:28px 0;text-align:center;">No image</span>
       </div>`;

  const productLink = item.productId ? `${env.adminUrl}/products/${item.productId}` : null;
  const formatCartPrice = (amount: number) => item.currency ? `${item.currency} ${amount.toLocaleString('en-NG')}` : formatPrice(amount);
  const itemTotal = formatCartPrice(item.unitPriceSnapshot * item.quantity);

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
          ${item.selectedSize != null ? metaRow('Size', String(item.selectedSize)) : ''}
          ${item.selectedColor ? metaRow('Color', item.selectedColor) : ''}
          ${item.selectedMaterial ? metaRow('Material', item.selectedMaterial) : ''}
          ${metaRow('Unit Price', formatCartPrice(item.unitPriceSnapshot))}
          ${metaRow('Item Total', itemTotal, true)}
        </table>
      </td>
    </tr>
  </table>`;
}

export interface CartSubmissionEmailData {
  customerName: string;
  customerEmail: string;
  contactMethod: 'email' | 'whatsapp';
  phoneNumber: string | null;
  orderNumber: string;
  historyId: string;
  items: CartHistoryItem[];
  totalSnapshot: number;
  currency: string | null;
  submittedCartId: string;
}

export function buildCartSubmissionEmail(data: CartSubmissionEmailData): string {
  const itemCount = data.items.reduce((s, i) => s + i.quantity, 0);

  const bodyHtml = `
    ${customerDetailsBlock({
      name: data.customerName,
      email: data.customerEmail,
      phone: data.phoneNumber,
      contactMethod: data.contactMethod,
    })}

    <h2 style="margin:0 0 14px 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;font-weight:400;">
      Order Items (${itemCount} ${itemCount === 1 ? 'item' : 'items'})
    </h2>
    ${data.items.map(cartItemRow).join('\n')}

    ${totalBlock(data.totalSnapshot, data.currency)}
    ${ctaButton(`${env.adminUrl}/cart/history/${data.historyId}`, 'View Order')}
  `;

  return emailShell({
    title: 'New Cart Submission — Signature By Sarah',
    heading: 'New Cart Submission',
    badgeLabel: 'Customer Cart Order',
    bodyHtml,
  });
}
