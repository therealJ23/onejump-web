// Reads environment variables once. Everything secret stays on the server.
import 'dotenv/config';

const env = process.env;
const isTest = env.NODE_ENV === 'test' || env.VITEST === 'true';
const isProd = env.NODE_ENV === 'production';

function bool(v, def = false) {
  if (v == null || v === '') return def;
  return /^(1|true|yes|on)$/i.test(String(v));
}

export const config = {
  env: env.NODE_ENV || 'development',
  isProd,
  isTest,
  appUrl: (env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  port: Number(env.PORT || 3000),
  databaseUrl: isTest ? (env.TEST_DATABASE_URL || env.DATABASE_URL) : env.DATABASE_URL,
  migrateDatabaseUrl: isTest ? (env.TEST_MIGRATE_DATABASE_URL || env.TEST_DATABASE_URL) : (env.MIGRATE_DATABASE_URL || env.DATABASE_URL),
  databaseSsl: bool(env.DATABASE_SSL) || !!env.DATABASE_CA_CERT,
  databaseCaCert: env.DATABASE_CA_CERT || '',
  sessionSecret: env.SESSION_SECRET || (isProd ? '' : 'dev-only-secret-change-me-dev-only-secret'),
  ai: {
    provider: (env.AI_PROVIDER || 'mock').toLowerCase(),
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
    openaiKey: env.OPENAI_API_KEY || '',
    openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',
    monthlyBudgetUsd: Number(env.AI_MONTHLY_BUDGET_USD || 5),
  },
  payments: {
    provider: (env.PAYMENTS_PROVIDER || (env.STRIPE_SECRET_KEY ? 'stripe' : 'mock')).toLowerCase(),
    stripeSecretKey: env.STRIPE_SECRET_KEY || '',
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    connectWebhookSecret: env.STRIPE_CONNECT_WEBHOOK_SECRET || '',
    prices: { STARTER: env.STRIPE_PRICE_STARTER || '', PRO: env.STRIPE_PRICE_PRO || '', STUDIO: env.STRIPE_PRICE_STUDIO || '' },
  },
  email: {
    provider: (env.EMAIL_PROVIDER || (env.RESEND_API_KEY ? 'resend' : 'console')).toLowerCase(),
    resendKey: env.RESEND_API_KEY || '',
    from: env.EMAIL_FROM || 'OneJump <hello@onejumpfit.com>',
  },
  storage: {
    provider: (env.STORAGE_PROVIDER || (env.R2_ACCESS_KEY_ID ? 'r2' : 'local')).toLowerCase(),
    r2AccountId: env.R2_ACCOUNT_ID || '',
    r2AccessKeyId: env.R2_ACCESS_KEY_ID || '',
    r2Secret: env.R2_SECRET_ACCESS_KEY || '',
    r2Bucket: env.R2_BUCKET || 'onejump-private',
    localDir: env.LOCAL_STORAGE_DIR || 'var/uploads',
  },
  jobsEnabled: !isTest && bool(env.JOBS_ENABLED, true),
};

export function assertProductionConfig() {
  if (!config.isProd) return;
  const missing = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.sessionSecret || config.sessionSecret.length < 32) missing.push('SESSION_SECRET (32+ chars)');
  if (config.payments.provider === 'stripe' && !config.payments.stripeSecretKey) missing.push('STRIPE_SECRET_KEY');
  if (config.ai.provider === 'anthropic' && !config.ai.anthropicKey) missing.push('ANTHROPIC_API_KEY');
  if (config.email.provider === 'resend' && !config.email.resendKey) missing.push('RESEND_API_KEY');
  if (missing.length) throw new Error(`Missing production settings: ${missing.join(', ')}`);
  if (config.email.provider === 'console') console.warn('[config] EMAIL_PROVIDER=console in production: invites and login links are NOT emailed. Set up Resend.');
  if (config.storage?.provider === 'local') console.warn('[config] STORAGE_PROVIDER=local in production: uploaded photos are lost on every deploy. Set up Cloudflare R2.');
  if (config.payments.provider === 'mock') console.warn('[config] PAYMENTS_PROVIDER=mock in production: no real payments.');
}
