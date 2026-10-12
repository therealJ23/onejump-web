// Reads environment variables once. Everything secret stays on the server.
import 'dotenv/config';

const env = process.env;
const isTest = env.NODE_ENV === 'test' || env.VITEST === 'true';
const isProd = env.NODE_ENV === 'production';

/** Railway: the MySQL service's MYSQL_URL, pointed at our own database (default "onejump") so the
 *  app never shares tables with anything else on that server. */
function railwayDbUrl() {
  if (!env.MYSQL_URL) return '';
  const u = new URL(env.MYSQL_URL);
  u.pathname = `/${env.DATABASE_NAME || 'onejump'}`;
  return u.toString();
}

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
  databaseUrl: isTest ? (env.TEST_DATABASE_URL || env.DATABASE_URL) : (env.DATABASE_URL || railwayDbUrl()),
  migrateDatabaseUrl: isTest ? (env.TEST_MIGRATE_DATABASE_URL || env.TEST_DATABASE_URL) : (env.MIGRATE_DATABASE_URL || env.DATABASE_URL || railwayDbUrl()),
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
    // On Railway, a Volume keeps uploads across deploys (RAILWAY_VOLUME_MOUNT_PATH is set when one is attached).
    localDir: env.LOCAL_STORAGE_DIR || (env.RAILWAY_VOLUME_MOUNT_PATH ? `${env.RAILWAY_VOLUME_MOUNT_PATH.replace(/\/$/, '')}/uploads` : 'var/uploads'),
  },
  voice: {
    provider: (env.VOICE_PROVIDER || 'mock').toLowerCase(), // mock | deepgram | openai
    tts: (env.VOICE_TTS || 'browser').toLowerCase(), // browser | deepgram
    deepgramKey: env.DEEPGRAM_API_KEY || '',
    deepgramModel: env.DEEPGRAM_MODEL || 'nova-3',
    deepgramVoice: env.DEEPGRAM_TTS_VOICE || 'aura-2-thalia-en',
    openaiTranscribeModel: env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
    monthlyMinutes: Number(env.VOICE_MONTHLY_MINUTES || 300),
  },
  nutrition: {
    // live = USDA FoodData Central + Open Food Facts; mock = the offline sample list (default without a key)
    provider: (env.FOOD_DATA_PROVIDER || (isTest ? 'mock' : env.FDC_API_KEY ? 'live' : 'mock')).toLowerCase(),
    fdcKey: env.FDC_API_KEY || 'DEMO_KEY',
    photoModel: env.NUTRITION_PHOTO_MODEL || 'claude-haiku-4-5-20251001',
    photosMonthly: Number(env.NUTRITION_PHOTOS_MONTHLY || 3000),
    photosPerClientDaily: Number(env.NUTRITION_PHOTOS_PER_CLIENT_DAILY || 20),
    userAgent: env.OFF_USER_AGENT || 'OneJump/1.0 (hello@onejumpfit.com)',
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
  if (config.voice.provider === 'deepgram' && !config.voice.deepgramKey) missing.push('DEEPGRAM_API_KEY');
  if (config.voice.provider === 'openai' && !config.ai.openaiKey) missing.push('OPENAI_API_KEY');
  if (missing.length) throw new Error(`Missing production settings: ${missing.join(', ')}`);
  if (config.email.provider === 'console') console.warn('[config] EMAIL_PROVIDER=console in production: invites and login links are NOT emailed. Set up Resend.');
  if (config.storage?.provider === 'local' && !env.LOCAL_STORAGE_DIR && !env.RAILWAY_VOLUME_MOUNT_PATH) console.warn('[config] STORAGE_PROVIDER=local in production: uploaded photos are lost on every deploy. Attach a Railway Volume or set up Cloudflare R2.');
  if (config.payments.provider === 'mock') console.warn('[config] PAYMENTS_PROVIDER=mock in production: no real payments.');
  if (config.voice.provider === 'mock') console.warn('[config] VOICE_PROVIDER=mock in production: Talk to Assist and voice notes use placeholder transcripts. Set up Deepgram.');
  if (config.nutrition.provider === 'mock') console.warn('[config] FOOD_DATA_PROVIDER=mock in production: food search uses the small offline list. Add FDC_API_KEY.');
}
