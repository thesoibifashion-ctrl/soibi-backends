import 'dotenv/config';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const env = {
  port: parseInt(process.env['PORT'] ?? '5000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',

  databaseUrl: requireEnv('DATABASE_URL'),
  databaseSsl: process.env['DATABASE_SSL'] === 'true',
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: process.env['JWT_EXPIRES_IN'] ?? '7d',

  googleClientId: requireEnv('GOOGLE_CLIENT_ID'),
  googleClientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
  googleOAuthRedirectUri: requireEnv('GOOGLE_OAUTH_REDIRECT_URI'),
  googleOAuthStateSecret: requireEnv('GOOGLE_OAUTH_STATE_SECRET'),

  frontendUrl: requireEnv('FRONTEND_URL'),
  adminUrl: requireEnv('ADMIN_URL'),
  liveUrl: requireEnv('LIVE_URL'),

  resendApiKey: requireEnv('RESEND_API_KEY'),
  resendFromEmail: requireEnv('RESEND_FROM_EMAIL'),
  notificationEmail: process.env['NOTIFICATION_EMAIL'] ?? 'signaturebysarah1@gmail.com',

  get isProduction() {
    return this.nodeEnv === 'production';
  },
} as const;