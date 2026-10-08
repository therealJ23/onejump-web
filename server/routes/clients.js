// Coach: clients list, invites, CSV import, the client profile and everything on its tabs.
import { Router } from 'express';
import { config } from '../config.js';
import { audit } from '../db/system.js';
import { body, z, name, email, id as idRule } from '../lib/validate.js';
import { badRequest, conflict, must, paymentRequired } from '../lib/errors.js';
import { effectivePlan, requireOwner } from '../auth/middleware.js';
import { clientList, clientProfile } from '../core/clientViews.js';
import { createInvite, CLIENT_CAPS } from '../core/invites.js';
import { ensureThread, notify } from '../core/messaging.js';
import { assignProgram, exerciseMap } from '../core/training.js';
import { weightSeries, keyLift, personalBests } from '../core/stats.js';
import { scoreClient } from '../core/radar.js';
import { clientsFromCsv } from '../lib/csv.js';
import { exportClientData, deleteClientData } from '../core/clientData.js';
import { progressNote, adjustmentsFor } from '../ai/drafts.js';
import { applyInsightAction, skipInsightAction } from '../core/actions.js';
import { StorageService } from '../storage/StorageService.js';
import { todayKey, addDays, weekStart } from '../lib/time.js';

export const router = Router();
const tzOf = async db => (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';
const getClient = async (db, id) => must(await db.client.findFirst({ where: { id } }), 'That client');

async function assertCanAdd(db, n = 1) {
  const b = await db.business.findFirst({ select: { plan: true, trialEndsAt: true } });
  const plan = effectivePlan(b);
  const count = await db.client.count({ where: { status: { in: ['NEW', 'ACTIVE', 'PAUSED'] } } });
  if (count + n > CLIENT_CAPS[plan]) throw paymentRequired(`Your ${plan === 'TRIAL' ? 'trial' : plan.charAt(0) + plan.slice(1).toLowerCase()} plan covers ${CLIENT_CAPS[plan]} active clients. Existing clients keep working; upgrade to add more.`, { upgrade: plan === 'STARTER' ? 'PRO' : 'STUDIO' });
}

router.get('/', async (req, res) => res.json({ clients: await clientList(req.db, { tz: await tzOf(req.db) }) }));

router.get('/invite-link', async (req, res) => {
  const b = await req.db.business.findFirst({ select: { slug: true } });
  res.json({ link: `${config.appUrl}/join/${b.slug}` });
});

const newClient = z.object({
  name, email: email.optional().or(z.literal('').transform(() => undefined)), phone: z.string().trim().max(40).optional(),
  goal: z.string().trim().max(160).optional(), goalType: z.string().trim().max(40).optional(), mode: z.enum(['Online', 'Hybrid', 'In person']).optional(),
  programId: idRule.optional().or(z.literal('').transform(() => undefined)), clientPlanId: idRule.optional().or(z.literal('').transform(() => undefined)),
  startDate: z.string().max(30).optional(), sendInvite: z.boolean().default(true),
});
router.post('/', body(newClient), async (req, res) => {
  const d = req.body;
  await assertCanAdd(req.db);
  if (d.email && await req.db.client.findFirst({ where: { email: d.email } })) throw conflict('A client with that email is already in your workspace.');
  if (d.programId) must(await req.db.program.findFirst({ where: { id: d.programId } }), 'That program');
  if (d.clientPlanId) must(await req.db.clientPlan.findFirst({ where: { id: d.clientPlanId } }), 'That package');
  const plan = d.clientPlanId ? await req.db.clientPlan.findFirst({ where: { id: d.clientPlanId } }) : null;
  const client = await req.db.client.create({ data: {
    name: d.name, email: d.email || null, phone: d.phone || null, goal: d.goal || null, goalType: d.goalType || null, mode: d.mode || 'Online',
    status: 'NEW', clientPlanId: d.clientPlanId || null, coachUserId: req.auth.userId, payStatus: plan ? (plan.priceCents ? 'due' : 'trial') : 'none',
  } });
  await ensureThread(req.db, client.id);
  if (d.programId) await assignProgram(req.db, { clientId: client.id, programId: d.programId, start: d.startDate ? new Date(d.startDate) : null, tz: await tzOf(req.db) });
  const inv = await createInvite(req.db, client, { send: d.sendInvite });
  audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'client_invited', target: client.id });
  res.status(201).json({ client, inviteLink: inv.link, emailed: inv.emailed });
});

// ---------------------------------------------------------------- CSV import
router.post('/import/preview', body(z.object({ csv: z.string().min(1).max(2_000_000) })), async (req, res) => {
  const parsed = clientsFromCsv(req.body.csv);
  const existing = new Set((await req.db.client.findMany({ where: { email: { not: null } }, select: { email: true } })).map(c => c.email.toLowerCase()));
  const seen = new Set();
  parsed.rows.forEach(r => {
    if (r.email && existing.has(r.email)) r.issues.push('already in your workspace');
    if (r.email && seen.has(r.email)) r.issues.push('duplicate in file');
    if (r.email) seen.add(r.email);
  });
  res.json({ ...parsed, ready: parsed.rows.filter(r => !r.issues.length).length });
});
const importRow = z.object({ name, email: email.nullable().optional(), phone: z.string().max(40).nullable().optional(), goal: z.string().max(160).nullable().optional(), startDate: z.string().max(40).nullable().optional() });
router.post('/import', body(z.object({ rows: z.array(importRow).min(1).max(500), sendInvites: z.boolean().default(false), programId: idRule.optional(), clientPlanId: idRule.optional() })), async (req, res) => {
  const { rows, sendInvites, programId, clientPlanId } = req.body;
  await assertCanAdd(req.db, rows.length);
  if (programId) must(await req.db.program.findFirst({ where: { id: programId } }), 'That program');
  if (clientPlanId) must(await req.db.clientPlan.findFirst({ where: { id: clientPlanId } }), 'That package');
  const tz = await tzOf(req.db);
  let created = 0, skipped = 0, invited = 0;
  for (const r of rows) {
    if (r.email && await req.db.client.findFirst({ where: { email: r.email }, select: { id: true } })) { skipped++; continue; }
    const startedAt = r.startDate && !isNaN(new Date(r.startDate)) ? new Date(r.startDate) : new Date();
    const c = await req.db.client.create({ data: { name: r.name, email: r.email || null, phone: r.phone || null, goal: r.goal || null, startedAt, status: 'NEW', clientPlanId: clientPlanId || null, coachUserId: req.auth.userId, tags: ['Imported'] } });
    await ensureThread(req.db, c.id);
    if (programId) await assignProgram(req.db, { clientId: c.id, programId, tz });
    if (sendInvites && c.email) { await createInvite(req.db, c, { send: true }); invited++; }
    created++;
  }
  await notify(req.db, { kind: 'client', title: `Imported ${created} client${created === 1 ? '' : 's'}`, body: sendInvites ? `${invited} invites sent` : 'Invite them when you’re ready', link: '/app/clients' });
  audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'clients_imported', target: String(created) });
  res.json({ created, skipped, invited });
});

// ---------------------------------------------------------------- one client
router.get('/:id', async (req, res) => {
  const p = await clientProfile(req.db, req.params.id, { tz: await tzOf(req.db) });
  must(p, 'That client');
  res.json(p);
});

const patch = z.object({
  name: name.optional(), email: email.nullable().optional(), phone: z.string().trim().max(40).nullable().optional(), goal: z.string().trim().max(160).nullable().optional(),
  goalType: z.string().trim().max(40).nullable().optional(), why: z.string().trim().max(1000).nullable().optional(), targetWeight: z.coerce.number().min(50).max(800).nullable().optional(),
  birthYear: z.coerce.number().int().min(1900).max(2026).nullable().optional(), mode: z.enum(['Online', 'Hybrid', 'In person']).optional(),
  status: z.enum(['NEW', 'ACTIVE', 'PAUSED', 'INACTIVE']).optional(), tags: z.array(z.string().trim().max(60)).max(20).optional(),
  clientPlanId: idRule.nullable().optional(), pausedUntil: z.string().max(30).nullable().optional(),
});
router.patch('/:id', body(patch), async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const d = { ...req.body };
  if (d.clientPlanId) must(await req.db.clientPlan.findFirst({ where: { id: d.clientPlanId } }), 'That package');
  if (d.email && d.email !== c.email && await req.db.client.findFirst({ where: { email: d.email } })) throw conflict('Another client already uses that email.');
  if (d.pausedUntil !== undefined) d.pausedUntil = d.pausedUntil ? new Date(d.pausedUntil) : null;
  if (d.status === 'PAUSED' || d.status === 'INACTIVE') Object.assign(d, { riskScore: null, riskLevel: null, riskReasons: null });
  const updated = await req.db.client.update({ where: { id: c.id }, data: d });
  if (d.status && d.status !== c.status) audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'client_status', target: `${c.id}:${d.status}` });
  res.json({ client: updated });
});

router.delete('/:id', requireOwner, body(z.object({ confirmName: z.string().max(120) })), async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  if (req.body.confirmName.trim().toLowerCase() !== c.name.trim().toLowerCase()) throw badRequest('Type the client’s full name to confirm.', { fields: { confirmName: 'Doesn’t match' } });
  await deleteClientData(req.db, c.id);
  audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'client_deleted', target: c.id });
  res.json({ ok: true });
});

router.get('/:id/export', async (req, res) => {
  const data = must(await exportClientData(req.db, req.params.id), 'That client');
  audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'client_exported', target: req.params.id });
  res.set('Content-Disposition', `attachment; filename="client-${req.params.id}.json"`);
  res.json(data);
});

router.post('/:id/invite', async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  if (c.userId) throw conflict(`${c.name.split(' ')[0]} already has the app.`);
  const inv = await createInvite(req.db, c, { send: true });
  res.json({ inviteLink: inv.link, emailed: inv.emailed });
});

router.post('/:id/program', body(z.object({ programId: idRule, startDate: z.string().max(30).optional() })), async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  must(await req.db.program.findFirst({ where: { id: req.body.programId } }), 'That program');
  const r = await assignProgram(req.db, { clientId: c.id, programId: req.body.programId, start: req.body.startDate ? new Date(req.body.startDate) : null, tz: await tzOf(req.db) });
  if (c.status === 'NEW' && c.userId) await req.db.client.update({ where: { id: c.id }, data: { status: 'ACTIVE' } });
  res.json({ ok: true, scheduled: r.scheduled });
});

router.get('/:id/program', async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  if (!c.programId) return res.json({ program: null, days: [] });
  const tz = await tzOf(req.db), today = todayKey(tz), mon = weekStart(today);
  const program = await req.db.program.findFirst({ where: { id: c.programId }, include: { workouts: { orderBy: { day: 'asc' } } } });
  const ex = await exerciseMap(req.db);
  const week = await req.db.workoutAssignment.findMany({ where: { clientId: c.id, scheduledFor: { gte: mon, lt: addDays(mon, 7) } }, orderBy: { scheduledFor: 'asc' } });
  const wById = new Map((await req.db.workout.findMany({ where: { id: { in: week.map(a => a.workoutId) } } })).map(w => [w.id, w]));
  res.json({
    program: { id: program.id, name: program.name, weeks: program.weeks, daysPerWeek: program.daysPerWeek, level: program.level, startedAt: c.programStartedAt },
    days: week.map(a => {
      const w = wById.get(a.workoutId);
      return { assignmentId: a.id, date: a.scheduledFor, status: a.status, workout: w ? { id: w.id, name: w.name, tailored: !!w.clientId, estMinutes: w.estMinutes, exercises: w.blocks.flatMap(b => b.items.map(i => ex.get(i.exerciseId)?.name)).filter(Boolean) } : null };
    }),
  });
});

router.get('/:id/progress', async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const tz = await tzOf(req.db), today = todayKey(tz), ex = await exerciseMap(req.db);
  const weeks = [];
  for (let i = 5; i >= 0; i--) {
    const from = addDays(weekStart(today), -7 * i), to = addDays(from, 7);
    const rows = await req.db.workoutAssignment.findMany({ where: { clientId: c.id, scheduledFor: { gte: from, lt: to < today ? to : addDays(today, 1) } }, select: { status: true } });
    weeks.push({ label: `W${6 - i}`, pct: rows.length ? Math.round(rows.filter(r => r.status === 'completed').length / rows.length * 100) : null });
  }
  res.json({
    weights: (await weightSeries(req.db, c.id, 16)).map(w => ({ date: w.date, value: w.value })),
    lift: await keyLift(req.db, c.id, ex),
    completion: weeks,
    bests: await personalBests(req.db, c.id, ex),
    targetWeight: c.targetWeight,
  });
});

router.get('/:id/progress-ai', async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const i = await progressNote(req.db, c, { force: req.query.refresh === '1' });
  res.json({ ...i.draft, model: i.model, promptVersion: i.promptVersion });
});

router.get('/:id/measurements', async (req, res) => {
  await getClient(req.db, req.params.id);
  res.json({ measurements: await req.db.measurement.findMany({ where: { clientId: req.params.id }, orderBy: { takenAt: 'desc' }, take: 60 }) });
});
const m = z.coerce.number().min(0).max(1000).nullable().optional();
router.post('/:id/measurements', body(z.object({ takenAt: z.string().max(30).optional(), weight: m, waist: m, hips: m, chest: m, arm: m, thigh: m })), async (req, res) => {
  await getClient(req.db, req.params.id);
  const { takenAt, ...vals } = req.body;
  if (!Object.values(vals).some(v => v != null)) throw badRequest('Enter at least one measurement.');
  const row = await req.db.measurement.create({ data: { clientId: req.params.id, takenAt: takenAt ? new Date(takenAt) : new Date(), ...vals, source: 'coach' } });
  res.status(201).json({ measurement: row });
});

router.get('/:id/photos', async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const rows = await req.db.progressPhoto.findMany({ where: { clientId: c.id }, orderBy: { takenAt: 'desc' }, take: 60 });
  if (rows.length) audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'photos_viewed', target: c.id });
  res.json({ photos: await Promise.all(rows.map(async p => ({ id: p.id, pose: p.pose, takenAt: p.takenAt, url: await StorageService.signedUrl(p.storageKey) }))) });
});

router.get('/:id/checkins', async (req, res) => {
  await getClient(req.db, req.params.id);
  res.json({ checkins: await req.db.checkIn.findMany({ where: { clientId: req.params.id }, orderBy: { submittedAt: 'desc' }, take: 26 }) });
});

router.get('/:id/messages', async (req, res) => {
  await getClient(req.db, req.params.id);
  const msgs = await req.db.message.findMany({ where: { clientId: req.params.id }, orderBy: { createdAt: 'desc' }, take: Number(req.query.limit) || 4 });
  res.json({ messages: msgs.reverse() });
});

router.get('/:id/notes', async (req, res) => {
  await getClient(req.db, req.params.id);
  res.json({ notes: await req.db.note.findMany({ where: { clientId: req.params.id }, orderBy: { createdAt: 'desc' } }) });
});
router.post('/:id/notes', body(z.object({ body: z.string().trim().min(1).max(4000) })), async (req, res) => {
  await getClient(req.db, req.params.id);
  res.status(201).json({ note: await req.db.note.create({ data: { clientId: req.params.id, authorUserId: req.auth.userId, body: req.body.body } }) });
});

router.get('/:id/payments', async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  res.json({
    plan: c.clientPlanId ? await req.db.clientPlan.findFirst({ where: { id: c.clientPlanId } }) : null,
    subscription: await req.db.subscription.findFirst({ where: { clientId: c.id }, orderBy: { createdAt: 'desc' } }),
    payments: await req.db.payment.findMany({ where: { clientId: c.id }, orderBy: { createdAt: 'desc' }, take: 24 }),
    payStatus: c.payStatus,
  });
});

router.get('/:id/insights', async (req, res) => {
  await getClient(req.db, req.params.id);
  const rows = await req.db.aIInsight.findMany({ where: { clientId: req.params.id, kind: { not: 'progress' } }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, kind: true, status: true, summary: true, draft: true, finalText: true, createdAt: true, decidedAt: true, model: true, promptVersion: true } });
  res.json({ insights: rows });
});

router.get('/:id/risk', async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const insight = await req.db.aIInsight.findFirst({ where: { clientId: c.id, kind: 'risk', status: 'pending' }, orderBy: { createdAt: 'desc' } });
  res.json({ risk: c.riskLevel ? { score: c.riskScore, level: c.riskLevel, reasons: c.riskReasons || [] } : null, insight });
});
router.post('/:id/risk/refresh', async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const r = await scoreClient(req.db, c, { tz: await tzOf(req.db) });
  res.json({ risk: r?.risk || null });
});

router.get('/:id/adjustments', async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const i = await adjustmentsFor(req.db, c, { force: req.query.refresh === '1' });
  res.json({ insight: { id: i.id, status: i.status, items: i.draft.items, applied: i.draft.applied || [], skipped: i.draft.skipped || [], model: i.model } });
});
router.post('/:id/adjustments/:insightId/:action/:index', async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const ins = must(await req.db.aIInsight.findFirst({ where: { id: req.params.insightId, clientId: c.id, kind: 'adjustment' } }), 'That suggestion');
  const idx = Number(req.params.index);
  if (req.params.action === 'skip') return res.json(await skipInsightAction(req.db, ins.id, idx));
  if (req.params.action !== 'apply') throw badRequest('Unknown action.');
  res.json(await applyInsightAction(req.db, req.auth, ins.id, idx, { tz: await tzOf(req.db) }));
});
