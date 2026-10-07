// Coach workspace odds and ends: notifications, search, settings, team, data export, migration.
import { Router } from 'express';
import { users, memberships, sessions, audit } from '../db/system.js';
import { body, z, name } from '../lib/validate.js';
import { requireOwner } from '../auth/middleware.js';
import { EmailService } from '../email/EmailService.js';
import { config } from '../config.js';
import { AI } from '../ai/AIService.js';
import { startOfMonthUtc } from '../lib/time.js';
import { buildToday } from '../core/queue.js';
import { StorageService } from '../storage/StorageService.js';

export const router = Router();

// ---------------------------------------------------------------- badge counts for the shell
router.get('/counts', async (req, res) => {
  const tz = (await req.db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';
  const [today, checkins, unread, notifications] = await Promise.all([
    buildToday(req.db, { tz }),
    req.db.checkIn.count({ where: { status: 'submitted' } }),
    req.db.thread.count({ where: { coachUnread: { gt: 0 } } }),
    req.db.notification.count({ where: { readAt: null } }),
  ]);
  res.json({ queue: today.open, checkins, unread, notifications, minutesSaved: today.minutesSaved });
});

// ---------------------------------------------------------------- notifications
router.get('/notifications', async (req, res) => {
  const list = await req.db.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 40 });
  res.json({ notifications: list, unread: list.filter(n => !n.readAt).length });
});
router.post('/notifications/read-all', async (req, res) => {
  await req.db.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});
router.post('/notifications/:id/read', async (req, res) => {
  await req.db.notification.updateMany({ where: { id: req.params.id }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- search
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  if (!q) return res.json({ clients: [], programs: [], exercises: [] });
  const [clients, programs, exercises] = await Promise.all([
    req.db.client.findMany({ where: { OR: [{ name: { contains: q } }, { goal: { contains: q } }, { email: { contains: q } }] }, take: 5, select: { id: true, name: true, goal: true } }),
    req.db.program.findMany({ where: { name: { contains: q }, archived: false }, take: 3, select: { id: true, name: true } }),
    req.db.exercise.findMany({ where: { name: { contains: q } }, take: 3, select: { id: true, name: true } }),
  ]);
  res.json({ clients, programs, exercises });
});

// ---------------------------------------------------------------- settings
router.get('/settings', async (req, res) => {
  const [b, u, m, usage, decided] = await Promise.all([
    req.db.business.findFirst(),
    users.publicById(req.auth.userId),
    memberships.find(req.auth.userId, req.auth.businessId),
    req.db.aIUsage.aggregate({ where: { createdAt: { gte: startOfMonthUtc() } }, _count: { _all: true }, _sum: { costMicros: true } }),
    req.db.aIInsight.groupBy({ by: ['status'], where: { decidedAt: { gte: startOfMonthUtc() } }, _count: { _all: true } }),
  ]);
  const d = Object.fromEntries(decided.map(x => [x.status, x._count._all]));
  const totalDecided = (d.approved || 0) + (d.edited || 0) + (d.dismissed || 0);
  res.json({
    profile: { name: u.name, email: u.email, title: m?.title || '', bio: m?.bio || '' },
    business: { name: b.name, slug: b.slug, brandColor: b.brandColor, logo: b.logoUrl ? await StorageService.signedUrl(b.logoUrl) : null, writingStyle: b.writingStyle, timezone: b.timezone, coachingType: b.coachingType, joinLink: `${config.appUrl}/join/${b.slug}` },
    assist: { provider: AI.active.name, model: AI.active.model, promptVersion: AI.promptVersion, callsThisMonth: usage._count._all, costUsd: (usage._sum.costMicros || 0) / 1e6, budgetUsd: config.ai.monthlyBudgetUsd, approvedAsIs: totalDecided ? Math.round((d.approved || 0) / totalDecided * 100) : null, settings: b.settings?.assist || { draftCheckins: true, radar: true } },
    notifications: b.settings?.notifications || { checkins: true, messages: true, payments: true, risk: true, daily: false },
    security: { totpEnabled: u.totpEnabled },
  });
});

router.put('/settings/profile', body(z.object({ name, title: z.string().trim().max(80).optional(), bio: z.string().trim().max(1000).optional() })), async (req, res) => {
  await users.update(req.auth.userId, { name: req.body.name });
  await req.db.membership.updateMany({ where: { userId: req.auth.userId }, data: { title: req.body.title ?? null, bio: req.body.bio ?? null } });
  res.json({ ok: true });
});

const COLORS = ['#D6FF3D', '#7FD1C1', '#F4B942', '#F28C6B', '#A7B8FF'];
router.put('/settings/business', requireOwner, body(z.object({ name: name.optional(), brandColor: z.enum(COLORS).optional(), writingStyle: z.enum(['Supportive', 'Direct', 'Data-driven', 'Playful']).optional(), timezone: z.string().max(60).optional() })), async (req, res) => {
  const d = { ...req.body };
  if (d.timezone) { try { new Intl.DateTimeFormat('en-US', { timeZone: d.timezone }); } catch { delete d.timezone; } }
  await req.db.business.update({ where: { id: req.auth.businessId }, data: d });
  res.json({ ok: true });
});

router.put('/settings/preferences', requireOwner, body(z.object({ assist: z.object({ draftCheckins: z.boolean(), radar: z.boolean() }).partial().optional(), notifications: z.record(z.string(), z.boolean()).optional() })), async (req, res) => {
  const b = await req.db.business.findFirst({ select: { settings: true } });
  const s = { ...(b.settings || {}) };
  if (req.body.assist) s.assist = { ...(s.assist || { draftCheckins: true, radar: true }), ...req.body.assist };
  if (req.body.notifications) s.notifications = { ...(s.notifications || {}), ...req.body.notifications };
  await req.db.business.update({ where: { id: req.auth.businessId }, data: { settings: s } });
  res.json({ ok: true, settings: s });
});

router.post('/settings/sign-out-others', async (req, res) => {
  const n = await sessions.destroyForUser(req.auth.userId, req.sessionID);
  audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'sessions_revoked', target: String(n) });
  res.json({ ok: true, signedOut: n });
});

router.get('/settings/export', requireOwner, async (req, res) => {
  const out = { exportedAt: new Date().toISOString(), business: await req.db.business.findFirst() };
  for (const t of ['client', 'program', 'workout', 'workoutAssignment', 'workoutSession', 'checkIn', 'measurement', 'thread', 'message', 'note', 'clientPlan', 'subscription', 'payment', 'lead', 'automation']) out[t] = await req.db[t].findMany();
  delete out.business.stripeCustomerId;
  audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'workspace_exported', target: req.auth.businessId });
  res.set('Content-Disposition', 'attachment; filename="onejump-export.json"');
  res.json(out);
});

router.post('/settings/migration', body(z.object({ from: z.enum(['Trainerize', 'TrueCoach', 'Everfit', 'Spreadsheet', 'Other']), clients: z.coerce.number().int().min(0).max(5000).optional(), notes: z.string().trim().max(3000).optional() })), async (req, res) => {
  const b = await req.db.business.findFirst({ select: { name: true } });
  const u = await users.publicById(req.auth.userId);
  const text = `Moving from: ${req.body.from}\nClients: ${req.body.clients ?? 'not given'}\n\n${req.body.notes || ''}`;
  await req.db.supportRequest.create({ data: { kind: 'migration', body: text } });
  await EmailService.sendMigrationRequest({ fromName: u.name, fromEmail: u.email, businessName: b.name, body: text });
  res.json({ ok: true });
});

router.get('/team', async (req, res) => {
  const list = await req.db.membership.findMany({ where: { role: { in: ['OWNER', 'COACH'] } }, select: { role: true, title: true, userId: true } });
  const people = await Promise.all(list.map(async m => ({ ...m, ...(await users.publicById(m.userId)) })));
  res.json({ members: people.map(p => ({ name: p.name, email: p.email, role: p.role, title: p.title })) });
});
