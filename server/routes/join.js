// Public: accepting an invite, and the coach's open join link (onejumpfit.com/join/[slug]).
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { invites, businesses, users, memberships, magicLinks, audit } from '../db/system.js';
import { dbForBusiness } from '../db/tenant.js';
import { body, z, email, name } from '../lib/validate.js';
import { notFound, conflict, HttpError } from '../lib/errors.js';
import { sha256, randomToken } from '../lib/crypto.js';
import { establish } from './auth.js';
import { csrfToken } from '../auth/middleware.js';
import { ensureThread, notify } from '../core/messaging.js';
import { EmailService } from '../email/EmailService.js';
import { StorageService } from '../storage/StorageService.js';

export const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60e3, limit: 30, skip: () => config.isTest, handler: (_q, _r, next) => next(new HttpError(429, 'Too many attempts. Try again in a few minutes.')) });

async function brand(b) {
  const coach = await memberships.coachNameFor(b.id);
  return { name: b.name, slug: b.slug, brandColor: b.brandColor, logoUrl: b.logoUrl ? await StorageService.signedUrl(b.logoUrl) : null, coach: coach ? { name: coach.name, title: coach.title } : null };
}
async function resolveInvite(token) {
  const inv = await invites.resolve(sha256(token));
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw notFound('This invite has expired or was already used. Ask your coach for a new one.');
  return inv;
}

router.get('/invite/:token', limiter, async (req, res) => {
  const inv = await resolveInvite(req.params.token);
  const db = dbForBusiness(inv.businessId);
  const client = await db.client.findFirst({ where: { id: inv.clientId }, select: { name: true, email: true } });
  if (!client) throw notFound('This invite is no longer valid.');
  res.json({ business: await brand(await businesses.publicById(inv.businessId)), client });
});

router.post('/invite/:token/accept', limiter, body(z.object({ name, email })), async (req, res) => {
  const inv = await resolveInvite(req.params.token);
  const db = dbForBusiness(inv.businessId);
  const client = await db.client.findFirst({ where: { id: inv.clientId } });
  if (!client) throw notFound('This invite is no longer valid.');
  let user = await users.byEmail(req.body.email);
  if (client.userId && (!user || client.userId !== user.id)) throw conflict('This invite was already accepted with a different email.');
  if (!user) user = await users.create({ email: req.body.email, name: req.body.name });
  const other = await db.client.findFirst({ where: { userId: user.id, NOT: { id: client.id } }, select: { id: true } });
  if (other) throw conflict('That email already has an account with this coach. Use “Email me a login link” instead.');
  const m = await memberships.addClient(user.id, inv.businessId);
  await db.client.update({ where: { id: client.id }, data: { userId: user.id, email: client.email || req.body.email, name: client.name || req.body.name, lastActiveAt: new Date() } });
  await db.invite.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
  await ensureThread(db, client.id);
  await notify(db, { kind: 'client', title: `${client.name} joined your app`, body: 'Invite accepted', link: `/app/clients/${client.id}` });
  await establish(req, user, m, { clientId: client.id });
  await users.update(user.id, { emailVerifiedAt: user.emailVerifiedAt || new Date() });
  audit({ businessId: inv.businessId, actorUserId: user.id, action: 'invite_accepted', target: client.id, ip: req.ip });
  res.json({ ok: true, redirect: '/client', csrfToken: csrfToken(req) });
});

router.get('/link/:slug', limiter, async (req, res) => {
  const b = await businesses.publicBySlug(req.params.slug);
  if (!b) throw notFound('We couldn’t find that coach.');
  res.json({ business: await brand(b) });
});

router.post('/link/:slug', limiter, body(z.object({ name, email, goal: z.string().trim().max(160).optional() })), async (req, res) => {
  const b = await businesses.publicBySlug(req.params.slug);
  if (!b) throw notFound('We couldn’t find that coach.');
  const db = dbForBusiness(b.id);
  let user = await users.byEmail(req.body.email);
  let client = await db.client.findFirst({ where: { email: req.body.email } });
  if (!client && user) client = await db.client.findFirst({ where: { userId: user.id } });
  if (!client) {
    client = await db.client.create({ data: { name: req.body.name, email: req.body.email, goal: req.body.goal || null, status: 'NEW', payStatus: 'none' } });
    await ensureThread(db, client.id);
    await notify(db, { kind: 'client', title: `${client.name} joined through your link`, body: req.body.goal || 'New client', link: `/app/clients/${client.id}` });
  }
  if (!user) user = await users.create({ email: req.body.email, name: req.body.name });
  if (!client.userId) await db.client.update({ where: { id: client.id }, data: { userId: user.id } });
  else if (client.userId !== user.id) return res.json({ ok: true, message: 'Check your email for a login link.' });
  await memberships.addClient(user.id, b.id);
  // Always verify the email by link: typing someone's email must never log you in as them.
  const token = randomToken();
  await magicLinks.create({ userId: user.id, businessId: b.id, tokenHash: sha256(token), ttlMinutes: 60 });
  await EmailService.sendMagicLink({ to: user.email, name: user.name, businessName: b.name, link: `${config.appUrl}/login/magic?token=${token}` });
  res.json({ ok: true, message: 'Check your email for a link to open your app.' });
});
