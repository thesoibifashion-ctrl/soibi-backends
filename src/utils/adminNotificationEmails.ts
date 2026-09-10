import { BRAND, val, metaRow, emailShell, ctaButton } from './emailBrand.js';
import { env } from '../config/env.js';

// ─── Contact submission admin notification ────────────────────────────────────

export function buildAdminContactEmail(data: {
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
}): string {
  const adminUrl = `${env.adminUrl}/contact`;
  const bodyHtml = `
    <h2 style="margin:0 0 14px 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;font-weight:400;">
      Contact Details
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-collapse:collapse;background:${BRAND.offWhite};border-radius:6px;margin-bottom:32px;">
      <tr>
        <td style="padding:20px 24px;">
          <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
            ${metaRow('Name', val(data.name))}
            ${metaRow('Email', `<a href="mailto:${data.email}" style="color:${BRAND.black};">${data.email}</a>`)}
            ${data.phone ? metaRow('Phone', data.phone) : ''}
            ${data.subject ? metaRow('Subject', data.subject) : ''}
          </table>
        </td>
      </tr>
    </table>
    <h2 style="margin:0 0 14px 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;font-weight:400;">
      Message
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-collapse:collapse;background:${BRAND.offWhite};border-radius:6px;margin-bottom:32px;">
      <tr>
        <td style="padding:20px 24px;font-size:14px;color:${BRAND.black};font-family:Arial,sans-serif;line-height:1.6;">
          ${data.message.replace(/\n/g, '<br />')}
        </td>
      </tr>
    </table>
    ${ctaButton(adminUrl, 'View Submission')}
  `;

  return emailShell({
    title: 'New Contact Submission — Soibi',
    heading: 'New Contact Message',
    badgeLabel: 'Contact Form',
    bodyHtml,
  });
}

// ─── Academy registration admin notification ──────────────────────────────────

export function buildAdminAcademyEmail(data: {
  fullName: string;
  email: string;
  phone: string;
  country: string | null;
  experienceLevel: string | null;
  motivation: string | null;
}): string {
  const adminUrl = `${env.adminUrl}/academy`;
  const bodyHtml = `
    <h2 style="margin:0 0 14px 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;font-weight:400;">
      Applicant Details
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-collapse:collapse;background:${BRAND.offWhite};border-radius:6px;margin-bottom:32px;">
      <tr>
        <td style="padding:20px 24px;">
          <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
            ${metaRow('Name', val(data.fullName))}
            ${metaRow('Email', `<a href="mailto:${data.email}" style="color:${BRAND.black};">${data.email}</a>`)}
            ${metaRow('Phone', data.phone)}
            ${data.country ? metaRow('Country', data.country) : ''}
            ${data.experienceLevel ? metaRow('Experience', data.experienceLevel) : ''}
          </table>
        </td>
      </tr>
    </table>
    ${data.motivation ? `
    <h2 style="margin:0 0 14px 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;font-weight:400;">
      Motivation
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-collapse:collapse;background:${BRAND.offWhite};border-radius:6px;margin-bottom:32px;">
      <tr>
        <td style="padding:20px 24px;font-size:14px;color:${BRAND.black};font-family:Arial,sans-serif;line-height:1.6;">
          ${data.motivation.replace(/\n/g, '<br />')}
        </td>
      </tr>
    </table>` : '<div style="margin-bottom:32px;"></div>'}
    ${ctaButton(adminUrl, 'View Application')}
  `;

  return emailShell({
    title: 'New Academy Application — Soibi',
    heading: 'New Academy Application',
    badgeLabel: 'Soibi Academy',
    bodyHtml,
  });
}
