// Shared brand constants and HTML helpers for all Soibi notification emails.

export const BRAND = {
  black: '#382B25',
  brown: '#6B5145',
  gold: '#A8845D',
  lavender: '#E2D8E8',
  offWhite: '#FBF8F3',
  gray: '#E9E1D8',
  logoUrl: 'https://res.cloudinary.com/wqro8h83/image/upload/v1789034885/Clip_path_group_qmknoq.svg',
} as const;

export function formatPrice(kobo: number): string {
  return `₦${kobo.toLocaleString('en-NG')}`;
}

export function val(v: string | number | null | undefined, fallback = '—'): string {
  if (v === null || v === undefined || v === '') return fallback;
  return String(v);
}

export function metaRow(label: string, value: string, highlight = false): string {
  return `
  <tr>
    <td style="padding:2px 10px 2px 0;font-size:12px;color:#888;font-family:Arial,sans-serif;white-space:nowrap;vertical-align:top;">
      ${label}:
    </td>
    <td style="padding:2px 0;font-size:12px;color:${highlight ? BRAND.gold : BRAND.black};font-weight:${highlight ? '600' : '400'};font-family:Arial,sans-serif;vertical-align:top;">
      ${value}
    </td>
  </tr>`;
}

export function emailShell(opts: {
  title: string;
  heading: string;
  badgeLabel: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${opts.title}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-wrapper { padding: 16px !important; }
      .email-card   { padding: 24px 16px !important; }
      .header-title { font-size: 22px !important; }
      .product-image { width: 88px !important; height: 88px !important; }
    }
    :root { color-scheme: light; supported-color-schemes: light; }
    @media (prefers-color-scheme: dark) {
      body, .email-background { background-color: ${BRAND.offWhite} !important; }
      .email-container { background-color: #ffffff !important; }
      .email-content { color: ${BRAND.black} !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.offWhite};font-family:Arial,Helvetica,sans-serif;color:${BRAND.black};">

  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         class="email-background" style="background-color:${BRAND.offWhite};border-collapse:collapse;">
    <tr>
      <td align="center" class="email-wrapper" style="padding:40px 16px;">

        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               class="email-container" style="max-width:620px;border-collapse:collapse;background:#ffffff;border-radius:4px;overflow:hidden;border:1px solid ${BRAND.gray};">

          <!-- Header -->
          <tr>
            <td align="center" class="email-card"
                style="background-color:${BRAND.offWhite};padding:40px 40px 32px;border-bottom:1px solid ${BRAND.gray};">
              <img src="${BRAND.logoUrl}" alt="Soibi" width="130"
                   style="width:130px;max-width:130px;height:auto;display:block;margin:0 auto 20px;" />
              <p style="margin:0 0 8px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${BRAND.brown};font-family:Arial,sans-serif;">
                THE SOIBI FASHION
              </p>
              <h1 class="header-title"
                  style="margin:0;font-size:26px;font-weight:400;color:${BRAND.black};font-family:Georgia,'Times New Roman',serif;letter-spacing:0.5px;">
                ${opts.heading}
              </h1>
              <div style="width:48px;height:2px;background:${BRAND.lavender};margin:18px auto 0;"></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="email-card" style="padding:36px 40px;">

              <!-- Badge -->
              <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:28px;">
                <tr>
                    <td style="background:${BRAND.lavender};border-left:3px solid ${BRAND.brown};padding:10px 16px;border-radius:0 4px 4px 0;">
                      <span style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${BRAND.brown};font-family:Arial,sans-serif;font-weight:600;">
                      ${opts.badgeLabel}
                    </span>
                  </td>
                </tr>
              </table>

              ${opts.bodyHtml}

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center"
                style="padding:28px 40px;background:${BRAND.offWhite};border-top:1px solid ${BRAND.gray};">
              <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${BRAND.gold};font-family:Arial,sans-serif;">
                Soibi
              </p>
              <p style="margin:0;font-size:11px;color:#aaa;font-family:Arial,sans-serif;">
                This is an internal notification. Do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

export function customerDetailsBlock(opts: {
  name: string;
  email: string;
  phone: string | null;
  contactMethod: string;
}): string {
  const contactLabel = opts.contactMethod === 'whatsapp' ? 'WhatsApp' : 'Email';
  return `
  <h2 style="margin:0 0 14px 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#888;font-family:Arial,sans-serif;font-weight:400;">
    Customer Details
  </h2>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="border-collapse:collapse;background:${BRAND.offWhite};border-radius:6px;margin-bottom:32px;">
    <tr>
      <td style="padding:20px 24px;">
        <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#888;font-family:Arial,sans-serif;width:160px;vertical-align:top;">Name</td>
            <td style="padding:5px 0;font-size:13px;color:${BRAND.black};font-family:Arial,sans-serif;font-weight:600;vertical-align:top;">${val(opts.name)}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#888;font-family:Arial,sans-serif;vertical-align:top;">Email</td>
            <td style="padding:5px 0;font-size:13px;color:${BRAND.black};font-family:Arial,sans-serif;vertical-align:top;">
              <a href="mailto:${opts.email}" style="color:${BRAND.black};text-decoration:none;">${opts.email}</a>
            </td>
          </tr>
          ${opts.phone
            ? `<tr>
                 <td style="padding:5px 0;font-size:13px;color:#888;font-family:Arial,sans-serif;vertical-align:top;">Phone</td>
                 <td style="padding:5px 0;font-size:13px;color:${BRAND.black};font-family:Arial,sans-serif;vertical-align:top;">${opts.phone}</td>
               </tr>`
            : ''}
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#888;font-family:Arial,sans-serif;vertical-align:top;">Preferred Contact</td>
            <td style="padding:5px 0;font-size:13px;color:${BRAND.black};font-family:Arial,sans-serif;vertical-align:top;">${contactLabel}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

export function totalBlock(totalSnapshot: number, currency: string | null = null): string {
  return `
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
              ${currency ? `${currency} ${totalSnapshot.toLocaleString('en-NG')}` : formatPrice(totalSnapshot)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

export function ctaButton(href: string, label: string): string {
  return `
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto;">
    <tr>
      <td align="center" style="border-radius:4px;background:${BRAND.gold};">
        <a href="${href}"
           style="display:inline-block;padding:14px 36px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${BRAND.black};font-family:Arial,sans-serif;font-weight:700;text-decoration:none;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}
