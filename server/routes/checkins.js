// Coach: weekly check-in review with Assist's summary, suggested actions and drafted reply.
import { Router } from 'express';
import { body, z } from '../lib/validate.js';
import { must } from '../lib/errors.js';
import { checkinSummary } from '../ai/drafts.js';
import { decideInsight, applyInsightAction, skipInsightAction } from '../core/actions.js';
import { sendMessage } from '../core/messaging.js';
import { fillTemplate } from '../core/automationTemplates.js';
import { programWeek } from '../core/training.js';
import { DAY } from '../lib/time.js';
import { missingCheckinClients } from '../core/checkinStatus.js';
import { checkinNutrition } from '../nutrition/insights.js';

export const router = Router();
const tzOf = async db => (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';

router.get('/', async (req, res) => {
  const now = new Date();
  const [checkins, clients, programs] = await Promise.all([
    req.db.checkIn.findMany({ where: { OR: [{ status: 'submitted' }, { submittedAt: { gte: new Date(now - 8 * DAY) } }] }, orderBy: { submittedAt: 'desc' } }),
    req.db.client.findMany({ where: { status: { in: ['NEW', 'ACTIVE'] } }, select: { id: true, name: true, startedAt: true, lastCheckinAt: true, programId: true, programStartedAt: true } }),
    req.db.program.findMany({ select: { id: true, name: true } }),
  ]);
  const byId = new Map(clients.map(c => [c.id, c]));
  const allClients = new Map((await req.db.client.findMany({ select: { id: true, name: true } })).map(c => [c.id, c]));
  const remindedToday = new Set((await req.db.message.findMany({ where: { senderRole: 'COACH', createdAt: { gte: new Date(now - 20 * 3600e3) }, body: { contains: 'check-in' } }, select: { clientId: true } })).map(m => m.clientId));
  const P = new Map(programs.map(p => [p.id, p.name]));
  const row = k => ({ id: k.id, clientId: k.clientId, name: allClients.get(k.clientId)?.name || 'Client', submittedAt: k.submittedAt, status: k.status, flagged: k.flagged });
  res.json({
    toReview: checkins.filter(k => k.status === 'submitted').sort((a, b) => b.flagged - a.flagged || a.submittedAt - b.submittedAt).map(row),
    reviewed: checkins.filter(k => k.status === 'reviewed' && k.submittedAt >= new Date(now - 7 * DAY)).map(row),
    missing: (await missingCheckinClients(req.db, now)).map(c => ({ clientId: c.id, name: c.name, lastCheckinAt: c.lastCheckinAt, reminded: remindedToday.has(c.id), program: P.get(c.programId) || null })),
    active: byId.size,
  });
});

router.get('/:id', async (req, res) => {
  const k = must(await req.db.checkIn.findFirst({ where: { id: req.params.id } }), 'That check-in');
  const client = await req.db.client.findFirst({ where: { id: k.clientId } });
  const prev = await req.db.checkIn.findFirst({ where: { clientId: k.clientId, submittedAt: { lt: k.submittedAt } }, orderBy: { submittedAt: 'desc' } });
  const prevWeight = await req.db.measurement.findFirst({ where: { clientId: k.clientId, weight: { not: null }, takenAt: { lt: new Date(k.submittedAt.getTime() - 3600e3) } }, orderBy: { takenAt: 'desc' } });
  const program = client.programId ? await req.db.program.findFirst({ where: { id: client.programId }, select: { name: true, weeks: true } }) : null;
  res.json({
    checkin: k,
    previous: prev ? { weight: prevWeight?.weight ?? prev.weight, sleepHours: prev.sleepHours, energy: prev.energy, soreness: prev.soreness, stress: prev.stress, nutrition: prev.nutrition, mood: prev.mood } : null,
    client: { id: client.id, name: client.name, goalType: client.goalType, week: programWeek(client), program: program?.name || null, risk: client.riskLevel },
    nutrition: await checkinNutrition(req.db, client, k, await tzOf(req.db)),
  });
});

/** Assist summary for one check-in (generated on first view, then cached). */
router.get('/:id/assist', async (req, res) => {
  const k = must(await req.db.checkIn.findFirst({ where: { id: req.params.id } }), 'That check-in');
  const i = await checkinSummary(req.db, k, { force: req.query.refresh === '1' });
  res.json({ insight: { id: i.id, status: i.status, summary: i.summary, ...i.draft, finalText: i.finalText, model: i.model, promptVersion: i.promptVersion } });
});

router.post('/:id/reply', body(z.object({ insightId: z.string().max(64), text: z.string().trim().min(1).max(3000) })), async (req, res) => {
  const k = must(await req.db.checkIn.findFirst({ where: { id: req.params.id } }), 'That check-in');
  const ins = must(await req.db.aIInsight.findFirst({ where: { id: req.body.insightId, sourceId: k.id, kind: 'checkin_summary' } }), 'That draft');
  const r = await decideInsight(req.db, req.auth, ins.id, 'approve', { text: req.body.text });
  await req.db.checkIn.update({ where: { id: k.id }, data: { status: 'reviewed', reviewedAt: new Date() } });
  const next = await req.db.checkIn.findFirst({ where: { status: 'submitted' }, orderBy: [{ flagged: 'desc' }, { submittedAt: 'asc' }], select: { id: true } });
  res.json({ ok: true, edited: r.insight.status === 'edited', nextId: next?.id || null });
});

router.post('/:id/review', async (req, res) => {
  const k = must(await req.db.checkIn.findFirst({ where: { id: req.params.id } }), 'That check-in');
  await req.db.checkIn.update({ where: { id: k.id }, data: { status: 'reviewed', reviewedAt: new Date() } });
  const ins = await req.db.aIInsight.findFirst({ where: { sourceId: k.id, kind: 'checkin_summary', status: 'pending' } });
  if (ins) await req.db.aIInsight.update({ where: { id: ins.id }, data: { status: 'dismissed', decidedAt: new Date(), decidedBy: req.auth.userId } });
  const next = await req.db.checkIn.findFirst({ where: { status: 'submitted' }, orderBy: [{ flagged: 'desc' }, { submittedAt: 'asc' }], select: { id: true } });
  res.json({ ok: true, nextId: next?.id || null });
});

router.post('/:id/actions/:index/:op', async (req, res) => {
  const k = must(await req.db.checkIn.findFirst({ where: { id: req.params.id } }), 'That check-in');
  const ins = must(await req.db.aIInsight.findFirst({ where: { sourceId: k.id, kind: 'checkin_summary' }, orderBy: { createdAt: 'desc' } }), 'That summary');
  const idx = Number(req.params.index);
  if (req.params.op === 'skip') return res.json(await skipInsightAction(req.db, ins.id, idx));
  res.json(await applyInsightAction(req.db, req.auth, ins.id, idx, { tz: await tzOf(req.db) }));
});

/** Fixed check-in reminder (the coach's own words from the automation template). */
router.post('/remind', body(z.object({ clientIds: z.array(z.string().max(64)).min(1).max(200), text: z.string().trim().max(1000).optional() })), async (req, res) => {
  const auto = await req.db.automation.findFirst({ where: { key: 'missing_checkin' } });
  const template = req.body.text || auto?.template || 'Hey {first}! Quick reminder to send your weekly check-in. Takes 2 minutes and it’s how I adjust next week.';
  const clients = await req.db.client.findMany({ where: { id: { in: req.body.clientIds } } });
  for (const c of clients) await sendMessage(req.db, { clientId: c.id, body: fillTemplate(template, c), senderUserId: req.auth.userId, senderRole: 'COACH' });
  if (auto) {
    const day = new Date().toISOString().slice(0, 10);
    for (const c of clients) await req.db.automationRun.create({ data: { automationId: auto.id, clientId: c.id, dedupeKey: `${req.auth.businessId}:checkin:${c.id}:${day}:manual:${Date.now()}`, outcome: 'sent', summary: `Check-in reminder sent to ${c.name.split(' ')[0]}` } });
  }
  res.json({ ok: true, sent: clients.length });
});
