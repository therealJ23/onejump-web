// The Express app: security middleware, sessions, the JSON API and the static front end.
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { MySqlSessionStore } from './auth/sessionStore.js';
import { loadAuth, csrfProtect, requireCoach, requireOwner, requireClient, requirePlatformAdmin } from './auth/middleware.js';
import { HttpError } from './lib/errors.js';
import { TenantAccessError } from './db/tenant.js';
import { StorageService } from './storage/StorageService.js';
import { router as authRoutes } from './routes/auth.js';
import { router as onboardingRoutes } from './routes/onboarding.js';
import { router as joinRoutes } from './routes/join.js';
import { router as clientRoutes } from './routes/clients.js';
import { router as exerciseRoutes } from './routes/exercises.js';
import { router as programRoutes } from './routes/programs.js';
import { router as workoutRoutes } from './routes/workouts.js';
import { router as meRoutes } from './routes/me.js';
import { router as checkinRoutes } from './routes/checkins.js';
import { router as messageRoutes } from './routes/messages.js';
import { router as todayRoutes } from './routes/today.js';
import { router as insightRoutes } from './routes/insights.js';
import { router as automationRoutes } from './routes/automations.js';
import { router as paymentRoutes } from './routes/payments.js';
import { router as billingRoutes } from './routes/billing.js';
import { router as leadRoutes } from './routes/leads.js';
import { router as workspaceRoutes } from './routes/workspace.js';
import { router as adminRoutes } from './routes/admin.js';
import { router as webhookRoutes } from './routes/webhooks.js';
import { router as devRoutes } from './routes/dev.js';
import { router as assistRoutes } from './routes/assist.js';
import { router as nutritionRoutes } from './routes/nutrition.js';
import { router as clientNutritionRoutes } from './routes/clientNutrition.js';
import { router as meNutritionRoutes } from './routes/meNutrition.js';
import { router as meVoiceRoutes } from './routes/meVoice.js';
import { router as foodRoutes } from './routes/foods.js';
import { router as voiceRoutes } from './routes/voice.js';
import { router as briefingRoutes } from './routes/briefing.js';
import { unauthorized } from './lib/errors.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp({ sessionStore } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProd) app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:', 'https://*.r2.cloudflarestorage.com'],
        'media-src': ["'self'", 'blob:', 'https://*.r2.cloudflarestorage.com'],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'upgrade-insecure-requests': config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.isProd,
  }));

  // Stripe webhooks need the raw body for signature checks: mount before the JSON parser.
  app.use('/api/webhooks', express.raw({ type: 'application/json', limit: '1mb' }), webhookRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use(session({
    name: 'oj.sid',
    secret: config.sessionSecret,
    store: sessionStore || new MySqlSessionStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 14 * 864e5 },
  }));
  app.use(loadAuth);

  app.use('/api', rateLimit({ windowMs: 60e3, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => config.isTest }));
  app.use('/api', csrfProtect);

  app.get('/api/health', (_req, res) => res.json({ ok: true, ai: config.ai.provider, payments: config.payments.provider, email: config.email.provider, storage: StorageService.provider() }));
  app.use('/api/auth', authRoutes);
  app.use('/api/join', joinRoutes);
  app.use('/api/onboarding', requireOwner, onboardingRoutes);
  app.use('/api/clients', requireCoach, clientNutritionRoutes, clientRoutes);
  app.use('/api/exercises', requireCoach, exerciseRoutes);
  app.use('/api/programs', requireCoach, programRoutes);
  app.use('/api/workouts', requireCoach, workoutRoutes);
  app.use('/api/checkins', requireCoach, checkinRoutes);
  app.use('/api/threads', requireCoach, messageRoutes);
  app.use('/api/today', requireCoach, todayRoutes);
  app.use('/api/insights', requireCoach, insightRoutes);
  app.use('/api/automations', requireCoach, automationRoutes);
  app.use('/api/payments', requireCoach, paymentRoutes);
  app.use('/api/billing', requireOwner, billingRoutes);
  app.use('/api/leads', requireCoach, leadRoutes);
  app.use('/api/assist', requireCoach, assistRoutes);
  app.use('/api/nutrition', requireCoach, nutritionRoutes);
  app.use('/api/voice', requireCoach, voiceRoutes);
  app.use('/api/briefing', requireCoach, briefingRoutes);
  const foodLimit = rateLimit({ windowMs: 60e3, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => config.isTest, message: { error: 'Too many food searches. Wait a minute and try again.' } });
  app.use('/api/foods', (req, _res, next) => next(req.auth && req.db ? undefined : unauthorized()), foodLimit, foodRoutes);
  app.use('/api/me', requireClient, meNutritionRoutes, meVoiceRoutes, meRoutes);
  app.use('/api/admin', requirePlatformAdmin, adminRoutes);
  if (!config.isProd) app.use('/api/dev', devRoutes);
  app.use('/api', requireCoach, workspaceRoutes);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // Private files (local storage) through short-lived signed links.
  app.get('/files/:key', (req, res) => StorageService.serveLocal(req, res));

  // Pages
  const page = file => (_req, res) => res.sendFile(path.join(publicDir, file));
  app.get(['/app', '/app/{*rest}'], page('app.html'));
  app.get(['/client', '/client/{*rest}'], page('client.html'));
  app.get(['/admin', '/admin/{*rest}'], page('admin.html'));
  app.get(['/join/:slug', '/invite/:token'], page('join.html'));
  app.get('/login/magic', page('magic.html'));
  app.get('/coach/:slug', page('coach.html'));
  if (!config.isProd) app.get('/dev/outbox', page('outbox.html'));
  app.get('/vendor/zxing-browser.min.js', (_req, res) => { res.set('Cache-Control', 'public, max-age=86400'); res.sendFile(path.join(publicDir, '..', 'node_modules', '@zxing', 'browser', 'umd', 'zxing-browser.min.js')); });
  app.get('/client-sw.js', (_req, res) => { res.set('Service-Worker-Allowed', '/client'); res.sendFile(path.join(publicDir, 'js', 'client', 'sw.js')); });
  app.use(express.static(publicDir, { extensions: ['html'], index: 'index.html', maxAge: config.isProd ? '1h' : 0 }));
  app.use((_req, res) => res.status(404).sendFile(path.join(publicDir, '404.html')));

  // Errors
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (res.headersSent) { console.error(`[error] ${req.method} ${req.originalUrl} (after response):`, err?.message || err); return; }
    let status = err.status || err.statusCode || 500;
    let body = { error: err.message || 'Something went wrong.' };
    if (err instanceof HttpError) body = { error: err.message, ...err.extra };
    else if (err instanceof TenantAccessError) { status = 403; body = { error: 'You don’t have access to that.' }; }
    else if (err?.code === 'P2025') { status = 404; body = { error: 'That item wasn’t found in your workspace.' }; }
    else if (err?.code === 'P2002') { status = 409; body = { error: 'That already exists.' }; }
    else if (err?.type === 'entity.parse.failed') { status = 400; body = { error: 'Invalid JSON.' }; }
    else if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') { status = 413; body = { error: 'That file is too large.' }; }
    else if (err?.name === 'MulterError') { status = 400; body = { error: 'That upload couldn’t be read. Try again.' }; }
    if (status >= 500) {
      console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
      body = { error: 'Something went wrong on our side. Try again in a moment.' };
    }
    if (req.originalUrl.startsWith('/api') || req.accepts(['json', 'html']) === 'json') return res.status(status).json(body);
    res.status(status).send(body.error);
  });

  return app;
}
