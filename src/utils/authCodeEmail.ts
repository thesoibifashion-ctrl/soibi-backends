import { BRAND, emailShell } from './emailBrand.js';

export function buildAuthCodeEmail(code: string): string {
  return emailShell({
    title: 'Your Soibi sign-in code',
    heading: 'Sign in to Soibi',
    badgeLabel: 'Secure sign-in',
    bodyHtml: `
      <p style="margin:0 0 20px;font-size:15px;color:${BRAND.black};font-family:Arial,sans-serif;line-height:1.6;">
        Use this one-time code to sign in. It expires in 10 minutes.
      </p>
      <p style="margin:0 0 24px;padding:18px;text-align:center;letter-spacing:8px;font-size:28px;font-weight:700;color:${BRAND.black};background:${BRAND.offWhite};border-radius:6px;font-family:Arial,sans-serif;">${code}</p>
      <p style="margin:0;font-size:13px;color:#777;font-family:Arial,sans-serif;line-height:1.5;">
        If you did not request this code, you can safely ignore this email.
      </p>`,
  });
}
