// Who is asking, and for which business. Everything downstream uses req.auth and req.db.
import { dbFor } from '../db/tenant.js';
import { unauthorized, forbidden, paymentRequired, HttpError } from '../lib/errors.js';
import { randomToken, safeEqual } from '../lib/crypto.js';

/** Builds req.auth and req.db from the session (if logged in). */
export function loadAuth(req, _res, next) {
  const s = req.session;
  if (s && s.userId && s.businessId && s.role && !s.pending2fa) {
    req.auth = { userId: s.userId, businessId: s.businessId, role: s.role, clientId: s.clientId || null, isPlatformAdmin: !!s.isPlatformAdmin };
    req.db = dbFor(req.auth);
  } else if (s && s.userId && s.isPlatformAdmin && !s.pending2fa) {
    req.auth = { userId: s.userId, businessId: null, role: null, clientId: null, isPlatformAdmin: true };
  }
  next();
}

export function requireUser(req, _res, next) {
  if (!req.auth) return next(unauthorized());
  next();
}
export function requireCoach(req, _res, next) {
  if (!req.auth || !req.db) return next(unauthorized());
  if (!['OWNER', 'COACH'].includes(req.auth.role)) return next(forbidden());
  next();
}
export function requireOwner(req, _res, next) {
  if (!req.auth || !req.db) return next(unauthorized());
  if (req.auth.role !== 'OWNER') return next(forbidden('Only the workspace owner can do that.'));
  next();
}
export function requireClient(req, _res, next) {
  if (!req.auth || !req.db) return next(unauthorized());
  if (req.auth.role !== 'CLIENT') return next(forbidden());
  next();
}
export function requirePlatformAdmin(req, _res, next) {
  if (!req.auth || !req.auth.isPlatformAdmin) return next(forbidden());
  next();
}

const RANK = { TRIAL: 2, STARTER: 1, PRO: 2, STUDIO: 3 };
/** Plan gating. A trial is Pro. Going over a limit never locks clients out; it only gates coach features. */
export function requirePlan(plan, feature = 'This feature') {
  return async (req, _res, next) => {
    try {
      const b = await req.db.business.findFirst({ select: { plan: true, planStatus: true, trialEndsAt: true } });
      const effective = effectivePlan(b);
      if (RANK[effective] >= RANK[plan]) return next();
      next(paymentRequired(`${feature} is part of ${plan === 'PRO' ? 'Pro' : 'Studio'}.`, { upgrade: plan }));
    } catch (e) { next(e); }
  };
}
/** An expired trial behaves like Starter until the coach picks a plan. */
export function effectivePlan(b) {
  if (!b) return 'STARTER';
  if (b.plan === 'TRIAL') return b.trialEndsAt && new Date(b.trialEndsAt) < new Date() ? 'STARTER' : 'TRIAL';
  return b.plan;
}

// ---------------------------------------------------------------- CSRF
// Synchronizer token: one random token per session, sent back in the X-CSRF-Token header
// on every state-changing request. Cookies are SameSite=Lax as a second layer.
export function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = randomToken(24);
  return req.session.csrf;
}
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
export function csrfProtect(req, _res, next) {
  if (SAFE.has(req.method)) return next();
  const sent = req.get('x-csrf-token');
  if (!sent || !req.session?.csrf || !safeEqual(sent, req.session.csrf)) return next(new HttpError(403, 'Your session expired. Refresh the page and try again.', { code: 'csrf' }));
  next();
}
