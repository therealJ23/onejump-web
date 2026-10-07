// Sign up, log in (password + optional TOTP for coaches), email login links for clients, log out.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { users, memberships, businesses, magicLinks, audit } from '../db/system.js';
import { dbForBusiness } from '../db/tenant.js';
import { hashPassword, verifyPassword, burnTime } from '../auth/password.js';
import { newSecret, verifyCode, setupPayload } from '../auth/totp.js';
import { csrfToken, requireUser, effectivePlan } from '../auth/middleware.js';
import { body, z, email, name, password } from '../lib/validate.js';
import { badRequest, conflict, unauthorized, HttpError } from '../lib/errors.js';
import { randomToken, sha256, encrypt, decrypt } from '../lib/crypto.js';
import { EmailService } from '../email/EmailService.js';
import { ensureAutomations } from '../core/automationTemplates.js';

export const router = Router();

const limiter = (limit, windowMin = 15) => rateLimit({
  windowMs: windowMin * 60e3, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, _res, next) => next(new HttpError(429, 'Too many attempts. Wait a few minutes and try again.')),
});

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'coach';
}
export async function uniqueSlug(base) {
  let slug = slugify(base), n = 1;
  while (await businesses.slugTaken(slug)) slug = `${slugify(base)}-${++n}`;
  return slug;
}

function regenerate(req) {
  return new Promise((resolve, reject) => req.session.regenerate(e => (e ? reject(e) : resolve())));
}
/** Starts a fresh session (prevents session fixation) for a user in one workspace. */
export async function establish(req, user, membership, extra = {}) {
  await regenerate(req);
  req.session.userId = user.id;
  req.session.isPlatformAdmin = !!user.isPlatformAdmin;
  if (membership) {
    req.session.businessId = membership.businessId;
    req.session.role = membership.role;
    req.session.clientId = extra.clientId || null;
  }
  csrfToken(req);
  await users.touchLogin(user.id);
}

const coachMembership = list => list.find(m => m.role === 'OWNER') || list.find(m => m.role === 'COACH');

router.get('/csrf', (req, res) => res.json({ csrfToken: csrfToken(req) }));

router.get('/me', async (req, res) => {
  const token = csrfToken(req);
  if (!req.auth) return res.json({ user: null, csrfToken: token });
  const user = await users.publicById(req.auth.userId);
  if (!user) { req.session.destroy(() => {}); return res.json({ user: null, csrfToken: token }); }
  let business = null, client = null;
  if (req.db) {
    const b = await req.db.business.findFirst();
    const plan = effectivePlan(b);
    business = {
      id: b.id, name: b.name, slug: b.slug, plan: b.plan, effectivePlan: plan, planStatus: b.planStatus,
      trialDaysLeft: b.plan === 'TRIAL' && b.trialEndsAt ? Math.max(0, Math.ceil((new Date(b.trialEndsAt) - Date.now()) / 864e5)) : null,
      brandColor: b.brandColor, logoUrl: b.logoUrl, timezone: b.timezone, writingStyle: b.writingStyle, onboarded: !!b.onboardedAt,
      coachingType: b.coachingType, stripeAccountStatus: b.stripeAccountStatus,
    };
    if (req.auth.role === 'CLIENT') client = await req.db.client.findFirst({ select: { id: true, name: true, email: true, status: true } });
  }
  res.json({ user, role: req.auth.role, isPlatformAdmin: req.auth.isPlatformAdmin, business, client, csrfToken: token });
});

const signupSchema = z.object({ name, email, password, businessName: z.string().trim().max(80).optional() });
router.post('/signup', limiter(10, 60), body(signupSchema), async (req, res) => {
  const { name: fullName, email: em, password: pw, businessName } = req.body;
  if (await users.byEmail(em)) throw conflict('An account with that email already exists. Log in instead.');
  const user = await users.create({ email: em, name: fullName, passwordHash: await hashPassword(pw) });
  const bizName = businessName || `${fullName.split(' ')[0]}’s Coaching`;
  const business = await businesses.createWithOwner({ userId: user.id, name: bizName, slug: await uniqueSlug(businessName || fullName) });
  await ensureAutomations(dbForBusiness(business.id));
  await establish(req, user, { businessId: business.id, role: 'OWNER' });
  audit({ businessId: business.id, actorUserId: user.id, action: 'signup', target: em, ip: req.ip });
  res.status(201).json({ ok: true, redirect: '/onboarding', csrfToken: csrfToken(req) });
});

router.post('/login', limiter(20), body(z.object({ email, password: z.string().min(1).max(200) })), async (req, res) => {
  const { email: em, password: pw } = req.body;
  const user = await users.byEmail(em);
  if (!user || !user.passwordHash) {
    await burnTime(pw);
    audit({ action: 'login_failed', target: em, ip: req.ip });
    throw unauthorized('That email and password don’t match.');
  }
  if (!(await verifyPassword(user.passwordHash, pw))) {
    audit({ actorUserId: user.id, action: 'login_failed', target: em, ip: req.ip });
    throw unauthorized('That email and password don’t match.');
  }
  const list = await memberships.forUser(user.id);
  const m = coachMembership(list);
  if (!m && !user.isPlatformAdmin) throw badRequest('Clients log in with an email link. Use “Email me a login link” instead.', { code: 'use_magic_link' });
  if (user.totpEnabled) {
    await regenerate(req);
    req.session.pending2fa = { userId: user.id, at: Date.now() };
    return res.json({ twoFactor: true, csrfToken: csrfToken(req) });
  }
  await establish(req, user, m);
  audit({ businessId: m?.businessId, actorUserId: user.id, action: 'login', target: em, ip: req.ip });
  res.json({ ok: true, redirect: m ? (m.business.onboardedAt ? '/app' : '/onboarding') : '/admin', csrfToken: csrfToken(req) });
});

router.post('/login/2fa', limiter(20), body(z.object({ code: z.string().trim().min(6).max(10) })), async (req, res) => {
  const p = req.session.pending2fa;
  if (!p || Date.now() - p.at > 10 * 60e3) throw unauthorized('Start again: enter your email and password.');
  const user = await users.byId(p.userId);
  if (!user?.totpSecret || !verifyCode(decrypt(user.totpSecret), req.body.code)) {
    audit({ actorUserId: p.userId, action: '2fa_failed', target: user?.email || '', ip: req.ip });
    throw unauthorized('That code didn’t work. Codes change every 30 seconds.');
  }
  const m = coachMembership(await memberships.forUser(user.id));
  await establish(req, user, m);
  audit({ businessId: m?.businessId, actorUserId: user.id, action: 'login', target: user.email, ip: req.ip, meta: { twoFactor: true } });
  res.json({ ok: true, redirect: m ? (m.business.onboardedAt ? '/app' : '/onboarding') : '/admin', csrfToken: csrfToken(req) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true, redirect: '/login' }));
});

// ---------------------------------------------------------------- email login links (clients)
router.post('/magic-link', limiter(8), body(z.object({ email, slug: z.string().max(60).optional() })), async (req, res) => {
  const user = await users.byEmail(req.body.email);
  if (user) {
    const list = (await memberships.forUser(user.id)).filter(m => m.role === 'CLIENT' && (!req.body.slug || m.business.slug === req.body.slug));
    const m = list[0];
    if (m) {
      const token = randomToken();
      await magicLinks.create({ userId: user.id, businessId: m.businessId, tokenHash: sha256(token) });
      await EmailService.sendMagicLink({ to: user.email, name: user.name, businessName: m.business.name, link: `${config.appUrl}/login/magic?token=${token}` });
    }
  }
  // Same answer whether or not the email exists.
  res.json({ ok: true, message: 'If that email belongs to a client account, a login link is on its way.' });
});

router.post('/magic', limiter(20), body(z.object({ token: z.string().min(20).max(200) })), async (req, res) => {
  const link = await magicLinks.consume(sha256(req.body.token));
  if (!link || !link.businessId) throw unauthorized('That link has expired or was already used. Ask for a new one.');
  const user = await users.byId(link.userId);
  const m = await memberships.find(link.userId, link.businessId);
  if (!user || !m) throw unauthorized('That account no longer has access.');
  const client = await dbForBusiness(link.businessId).client.findFirst({ where: { userId: user.id }, select: { id: true, status: true } });
  if (!client) throw unauthorized('That account no longer has access.');
  await establish(req, user, m, { clientId: client.id });
  if (!user.emailVerifiedAt) await users.update(user.id, { emailVerifiedAt: new Date() });
  audit({ businessId: link.businessId, actorUserId: user.id, action: 'login_magic_link', target: user.email, ip: req.ip });
  res.json({ ok: true, redirect: '/client', csrfToken: csrfToken(req) });
});

// ---------------------------------------------------------------- two-step login setup (coaches)
router.post('/2fa/setup', requireUser, async (req, res) => {
  const user = await users.byId(req.auth.userId);
  const secret = newSecret();
  req.session.pendingTotp = encrypt(secret);
  res.json(await setupPayload(secret, user.email));
});
router.post('/2fa/enable', requireUser, body(z.object({ code: z.string().trim().min(6).max(10) })), async (req, res) => {
  if (!req.session.pendingTotp) throw badRequest('Start the setup again.');
  const secret = decrypt(req.session.pendingTotp);
  if (!verifyCode(secret, req.body.code)) throw badRequest('That code didn’t match. Check your phone’s time is set automatically.', { fields: { code: 'Wrong code' } });
  await users.setTotp(req.auth.userId, encrypt(secret), true);
  delete req.session.pendingTotp;
  audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: '2fa_enabled', target: req.auth.userId, ip: req.ip });
  res.json({ ok: true });
});
router.post('/2fa/disable', requireUser, body(z.object({ password: z.string().min(1).max(200), code: z.string().trim().min(6).max(10) })), async (req, res) => {
  const user = await users.byId(req.auth.userId);
  if (!(await verifyPassword(user.passwordHash, req.body.password))) throw unauthorized('Wrong password.');
  if (!user.totpSecret || !verifyCode(decrypt(user.totpSecret), req.body.code)) throw unauthorized('That code didn’t work.');
  await users.setTotp(user.id, null, false);
  audit({ businessId: req.auth.businessId, actorUserId: user.id, action: '2fa_disabled', target: user.id, ip: req.ip });
  res.json({ ok: true });
});
