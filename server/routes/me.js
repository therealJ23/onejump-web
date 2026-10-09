// The client app API. Every query runs through a CLIENT-scoped database client, so a client
// can only ever reach their own rows. Side effects for the coach (notifications, stats, Assist
// jobs) use the workspace's coach-level client, server-side only.
import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { audit, memberships } from '../db/system.js';
import { dbForBusiness } from '../db/tenant.js';
import { body, z, score10 } from '../lib/validate.js';
import { must, badRequest, conflict } from '../lib/errors.js';
import { todayKey, addDays, weekStart, DAY } from '../lib/time.js';
import { exerciseMap, programWeek } from '../core/training.js';
import { refreshClientStats, weightSeries, keyLift, personalBests } from '../core/stats.js';
import { sendMessage, notify, clientEvent, ensureThread } from '../core/messaging.js';
import { checkText } from '../ai/safety.js';
import { enqueue } from '../jobs/nightly.js';
import { runAutomations } from '../core/automations.js';
import { StorageService, sniffImage } from '../storage/StorageService.js';
import { exportClientData } from '../core/clientData.js';
import { payments } from '../payments/PaymentService.js';
import { raiseFlag } from '../nutrition/flags.js';

export const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

async function ctx(req) {
  const coach = dbForBusiness(req.auth.businessId);
  const b = await req.db.business.findFirst({ select: { id: true, name: true, timezone: true, brandColor: true, logoUrl: true } });
  const client = must(await req.db.client.findFirst({ where: { id: req.auth.clientId } }), 'Your account');
  return { coach, b, client, tz: b.timezone };
}

async function touch(coach, client) {
  if (!client.lastActiveAt || Date.now() - new Date(client.lastActiveAt).getTime() > 30 * 60e3) {
    await coach.client.update({ where: { id: client.id }, data: { lastActiveAt: new Date() } });
    await clientEvent(coach, client.id, 'app_open');
  }
}

/** Fills in exercise names and the targets the client sees. */
function shapeWorkout(w, ex) {
  return {
    id: w.id, name: w.name, estMinutes: w.estMinutes,
    exercises: w.blocks.flatMap(b => b.items.map((it, idx) => ({
      exerciseId: it.exerciseId, name: ex.get(it.exerciseId)?.name || 'Exercise', muscle: ex.get(it.exerciseId)?.muscle, equipment: ex.get(it.exerciseId)?.equipment,
      howTo: ex.get(it.exerciseId)?.howTo || null, videoUrl: ex.get(it.exerciseId)?.videoUrl || null,
      group: b.items.length > 1 ? (b.kind === 'circuit' ? 'Circuit' : 'Superset') : '', groupIndex: idx, notes: it.notes, tempo: it.tempo,
      sets: it.sets.map(s => ({ target: `${s.reps}${s.load && !['BW', 'Band', 'Box'].includes(s.load) ? ' × ' + s.load : ''}`, reps: parseInt(s.reps) || '', weight: parseFloat(s.load) || '', rest: Number(s.rest) || 0, rpe: s.rpe })),
    }))),
  };
}

router.get('/today', async (req, res) => {
  const { coach, b, client, tz } = await ctx(req);
  await touch(coach, client);
  const today = todayKey(tz), mon = weekStart(today);
  const [todays, next, week, program, lastCheckin, weights, coachInfo, failed, lastCoachMsg] = await Promise.all([
    req.db.workoutAssignment.findFirst({ where: { scheduledFor: today }, orderBy: { status: 'asc' } }),
    req.db.workoutAssignment.findFirst({ where: { scheduledFor: { gt: today }, status: 'scheduled' }, orderBy: { scheduledFor: 'asc' } }),
    req.db.workoutAssignment.findMany({ where: { scheduledFor: { gte: mon, lt: addDays(mon, 7) } }, select: { status: true, scheduledFor: true } }),
    client.programId ? req.db.program.findFirst({ where: { id: client.programId }, select: { name: true, weeks: true } }) : null,
    req.db.checkIn.findFirst({ orderBy: { submittedAt: 'desc' } }),
    weightSeries(req.db, client.id, 40),
    memberships.coachNameFor(b.id),
    req.db.payment.findFirst({ where: { status: 'failed' } }),
    req.db.message.findFirst({ where: { senderRole: 'COACH', createdAt: { gte: new Date(Date.now() - 7 * DAY) } }, orderBy: { createdAt: 'desc' } }),
  ]);
  const ex = await exerciseMap(req.db);
  const withWorkout = async a => {
    if (!a) return null;
    const w = await req.db.workout.findFirst({ where: { id: a.workoutId } });
    if (!w) return null;
    const s = shapeWorkout(w, ex);
    return { assignmentId: a.id, date: a.scheduledFor, status: a.status, note: a.coachNote, workout: { id: w.id, name: w.name, estMinutes: w.estMinutes, count: s.exercises.length, first: s.exercises[0]?.name || null } };
  };
  // streak: consecutive days back from today with a workout done or a rest day (no missed workouts)
  const past = await req.db.workoutAssignment.findMany({ where: { scheduledFor: { gte: addDays(today, -60), lte: today } }, select: { scheduledFor: true, status: true }, orderBy: { scheduledFor: 'desc' } });
  let streak = 0;
  for (let d = 0; d < 60; d++) {
    const day = addDays(today, -d);
    const a = past.find(x => +x.scheduledFor === +day);
    if (a && a.status !== 'completed' && d > 0) break;
    if (d === 0 && a && a.status !== 'completed') continue;
    streak++;
  }
  const w = weights.map(x => x.value);
  const checkinThisWeek = lastCheckin && new Date(lastCheckin.submittedAt) >= addDays(today, -6);
  res.json({
    client: { name: client.name, first: client.name.split(' ')[0], goal: client.goal, targetWeight: client.targetWeight },
    business: { name: b.name, brandColor: b.brandColor, logoUrl: b.logoUrl ? await StorageService.signedUrl(b.logoUrl) : null },
    coach: { name: coachInfo?.name || b.name, first: (coachInfo?.name || b.name).split(' ')[0] },
    program: program ? { name: program.name, week: Math.min(program.weeks, programWeek(client) || 1), weeks: program.weeks } : null,
    streak,
    today: await withWorkout(todays),
    next: todays ? null : await withWorkout(next),
    week: { done: week.filter(a => a.status === 'completed').length, planned: week.length },
    checkin: { doneThisWeek: !!checkinThisWeek, lastAt: lastCheckin?.submittedAt || null },
    weight: w.length ? { start: w[0], current: w.at(-1), change: Math.round((w.at(-1) - w[0]) * 10) / 10, since: weights[0].date } : null,
    coachNote: todays?.coachNote ? { text: todays.coachNote } : lastCoachMsg ? { text: lastCoachMsg.body, at: lastCoachMsg.createdAt } : null,
    paymentProblem: !!failed,
    workoutsDone: client.workoutsDone,
  });
});

router.get('/workouts/:assignmentId', async (req, res) => {
  const a = must(await req.db.workoutAssignment.findFirst({ where: { id: req.params.assignmentId } }), 'That workout');
  const w = must(await req.db.workout.findFirst({ where: { id: a.workoutId } }), 'That workout');
  const session = await req.db.workoutSession.findFirst({ where: { assignmentId: a.id }, orderBy: { startedAt: 'desc' } });
  res.json({ assignment: { id: a.id, date: a.scheduledFor, status: a.status, note: a.coachNote }, workout: shapeWorkout(w, await exerciseMap(req.db)), session });
});

const loggedSet = z.object({ weight: z.union([z.coerce.number().min(0).max(2000), z.literal('')]).optional(), reps: z.union([z.coerce.number().int().min(0).max(1000), z.literal('')]).optional(), done: z.boolean().default(true) });
router.post('/workouts/:assignmentId/complete', body(z.object({
  sets: z.array(z.object({ exerciseId: z.string().max(64), sets: z.array(loggedSet).max(12) })).max(40),
  rpe: score10, soreness: score10.optional(), note: z.string().trim().max(1000).optional(),
})), async (req, res) => {
  const { coach, client, tz } = await ctx(req);
  const a = must(await req.db.workoutAssignment.findFirst({ where: { id: req.params.assignmentId } }), 'That workout');
  if (a.status === 'completed') throw conflict('This workout is already logged.');
  const w = must(await req.db.workout.findFirst({ where: { id: a.workoutId } }), 'That workout');
  const allowed = new Set(w.blocks.flatMap(b => b.items.map(i => i.exerciseId)));
  const sets = req.body.sets.filter(e => allowed.has(e.exerciseId));
  const volume = sets.reduce((n, e) => n + e.sets.filter(s => s.done).reduce((m, s) => m + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0), 0);
  const session = await req.db.workoutSession.create({ data: { workoutId: w.id, assignmentId: a.id, completedAt: new Date(), sets, volume, rpe: req.body.rpe, soreness: req.body.soreness ?? null, note: req.body.note || null } });
  await req.db.workoutAssignment.update({ where: { id: a.id }, data: { status: 'completed' } });
  const stats = await refreshClientStats(coach, client.id, { tz });
  await clientEvent(coach, client.id, 'workout_done', { workoutId: w.id, rpe: req.body.rpe });
  if (client.status === 'NEW') await coach.client.update({ where: { id: client.id }, data: { status: 'ACTIVE' } });
  const s = checkText(req.body.note);
  if (s.flagged) {
    await notify(coach, { kind: 'checkin', title: `${client.name} mentioned ${s.term} after a workout`, body: `“${req.body.note.slice(0, 120)}”`, link: `/app/clients/${client.id}` });
    await clientEvent(coach, client.id, 'safety_flag', { source: 'workout', term: s.term });
  }
  await runAutomations(coach, { tz, only: ['milestone'], clientId: client.id }).catch(() => null);
  res.json({ ok: true, sessionId: session.id, workoutNumber: stats.workoutsDone, sets: sets.reduce((n, e) => n + e.sets.filter(x => x.done).length, 0), volume: Math.round(volume) });
});

router.get('/checkin', async (req, res) => {
  const { client, tz } = await ctx(req);
  const today = todayKey(tz), mon = weekStart(today);
  const [last, week, weights] = await Promise.all([
    req.db.checkIn.findFirst({ orderBy: { submittedAt: 'desc' } }),
    req.db.workoutAssignment.findMany({ where: { scheduledFor: { gte: mon, lt: addDays(mon, 7) } }, select: { status: true } }),
    weightSeries(req.db, client.id, 1),
  ]);
  res.json({ last: last ? { submittedAt: last.submittedAt, sleepHours: last.sleepHours, energy: last.energy, stress: last.stress, soreness: last.soreness, nutrition: last.nutrition, mood: last.mood } : null, weight: weights[0]?.value ?? null, workouts: { done: week.filter(a => a.status === 'completed').length, planned: week.length }, doneThisWeek: !!(last && new Date(last.submittedAt) >= addDays(today, -6)) });
});

router.post('/checkins', body(z.object({
  weight: z.coerce.number().min(50).max(800).optional().nullable(), sleepHours: z.coerce.number().min(0).max(14), energy: score10, stress: score10, soreness: score10, nutrition: score10, mood: score10,
  text: z.string().trim().max(3000).optional().default(''),
})), async (req, res) => {
  const { coach, client, tz } = await ctx(req);
  const today = todayKey(tz), mon = weekStart(today);
  const week = await req.db.workoutAssignment.findMany({ where: { scheduledFor: { gte: mon, lt: addDays(mon, 7) } }, select: { status: true } });
  const s = checkText(req.body.text);
  const k = await req.db.checkIn.create({ data: { weekOf: mon, ...req.body, workoutsDone: week.filter(a => a.status === 'completed').length, workoutsPlanned: week.length, flagged: s.flagged, status: 'submitted' } });
  if (req.body.weight) await req.db.measurement.create({ data: { weight: req.body.weight, source: 'checkin' } });
  await refreshClientStats(coach, client.id, { tz });
  await clientEvent(coach, client.id, 'checkin', { flagged: s.flagged });
  await notify(coach, { kind: 'checkin', title: `${client.name} sent a check-in`, body: s.flagged ? `Mentions ${s.term} · review first` : `Soreness ${req.body.soreness}/10 · sleep ${req.body.sleepHours} h`, link: `/app/checkins/${k.id}` });
  await raiseFlag(coach, { clientId: client.id, clientName: client.name, businessId: req.auth.businessId, sourceType: 'checkin', sourceId: k.id, text: req.body.text });
  await enqueue('checkin_summary', { businessId: req.auth.businessId, checkInId: k.id });
  res.status(201).json({ ok: true, id: k.id });
});

router.get('/thread', async (req, res) => {
  const { client } = await ctx(req);
  const t = await ensureThread(req.db, client.id);
  const msgs = await req.db.message.findMany({ orderBy: { createdAt: 'asc' }, take: 200 });
  if (t.clientUnread) {
    await req.db.thread.update({ where: { id: t.id }, data: { clientUnread: 0 } });
    await req.db.message.updateMany({ where: { senderRole: 'COACH', readAt: null }, data: { readAt: new Date() } });
  }
  res.json({ messages: msgs.map(m => ({ id: m.id, from: m.senderRole === 'CLIENT' ? 'me' : 'coach', body: m.body, at: m.createdAt })) });
});

router.post('/messages', body(z.object({ body: z.string().trim().min(1).max(3000) })), async (req, res) => {
  const { coach, client } = await ctx(req);
  const m = await sendMessage(req.db, { clientId: client.id, body: req.body.body, senderUserId: req.auth.userId, senderRole: 'CLIENT' });
  await clientEvent(coach, client.id, 'message');
  const s = checkText(req.body.body);
  await notify(coach, { kind: 'message', title: `${client.name}: “${req.body.body.slice(0, 60)}${req.body.body.length > 60 ? '…' : ''}”`, body: s.flagged ? `Mentions ${s.term}` : 'New message', link: `/app/inbox/${client.id}` });
  await raiseFlag(coach, { clientId: client.id, clientName: client.name, businessId: req.auth.businessId, sourceType: 'message', sourceId: m.id, text: req.body.body });
  res.status(201).json({ message: { id: m.id, from: 'me', body: m.body, at: m.createdAt } });
});

router.get('/progress', async (req, res) => {
  const { client } = await ctx(req);
  const ex = await exerciseMap(req.db);
  const [weights, lift, bests, photos, measurements] = await Promise.all([
    weightSeries(req.db, client.id, 16), keyLift(req.db, client.id, ex), personalBests(req.db, client.id, ex, 4),
    req.db.progressPhoto.findMany({ orderBy: { takenAt: 'desc' }, take: 12 }),
    req.db.measurement.findMany({ where: { OR: [{ waist: { not: null } }, { hips: { not: null } }] }, orderBy: { takenAt: 'desc' }, take: 6 }),
  ]);
  const w = weights.map(x => x.value);
  res.json({
    workoutsDone: client.workoutsDone, weightChange: w.length >= 2 ? Math.round((w.at(-1) - w[0]) * 10) / 10 : null,
    weights: weights.map(x => ({ date: x.date, value: x.value })), lift, bests, measurements,
    photos: await Promise.all(photos.map(async p => ({ id: p.id, pose: p.pose, takenAt: p.takenAt, url: await StorageService.signedUrl(p.storageKey) }))),
  });
});

const meas = z.coerce.number().min(0).max(1000).optional().nullable();
router.post('/measurements', body(z.object({ weight: meas, waist: meas, hips: meas, chest: meas, arm: meas, thigh: meas })), async (req, res) => {
  if (!Object.values(req.body).some(v => v != null)) throw badRequest('Enter at least one measurement.');
  res.status(201).json({ measurement: await req.db.measurement.create({ data: { ...req.body, source: 'client' } }) });
});

router.post('/photos', upload.single('photo'), async (req, res) => {
  if (!req.file) throw badRequest('Choose a photo.');
  const type = sniffImage(req.file.buffer);
  if (!type) throw badRequest('Upload a JPG, PNG, WebP or HEIC photo.');
  const pose = ['front', 'side', 'back', 'other'].includes(req.body?.pose) ? req.body.pose : 'front';
  const key = `photos/${req.auth.businessId}/${req.auth.clientId}/${randomUUID()}`;
  await StorageService.put(key, req.file.buffer, type);
  const p = await req.db.progressPhoto.create({ data: { storageKey: key, pose, contentType: type, size: req.file.size } });
  res.status(201).json({ photo: { id: p.id, pose: p.pose, takenAt: p.takenAt, url: await StorageService.signedUrl(key) } });
});
router.delete('/photos/:id', async (req, res) => {
  const p = must(await req.db.progressPhoto.findFirst({ where: { id: req.params.id } }), 'That photo');
  await StorageService.remove(p.storageKey);
  await req.db.progressPhoto.delete({ where: { id: p.id } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- Me / billing / privacy
router.get('/account', async (req, res) => {
  const { b, client } = await ctx(req);
  const coachInfo = await memberships.coachNameFor(b.id);
  const [sub, plans, recent] = await Promise.all([
    req.db.subscription.findFirst({ orderBy: { createdAt: 'desc' } }),
    req.db.clientPlan.findMany({ where: { active: true, priceCents: { gt: 0 } }, orderBy: { priceCents: 'asc' }, select: { id: true, name: true, priceCents: true, interval: true, description: true } }),
    req.db.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, amountCents: true, status: true, paidAt: true, createdAt: true, failureReason: true } }),
  ]);
  const plan = client.clientPlanId ? plans.find(p => p.id === client.clientPlanId) || await req.db.clientPlan.findFirst({ where: { id: client.clientPlanId }, select: { id: true, name: true, priceCents: true, interval: true, description: true } }) : null;
  res.json({ client: { name: client.name, email: client.email, goal: client.goal, payStatus: client.payStatus }, coach: { name: coachInfo?.name || b.name }, business: { name: b.name }, plan, subscription: sub ? { status: sub.status, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd } : null, plans, payments: recent, provider: payments().name });
});

router.post('/billing/checkout', body(z.object({ clientPlanId: z.string().max(64).optional() })), async (req, res) => {
  const { client } = await ctx(req);
  const planId = req.body.clientPlanId || client.clientPlanId;
  const plan = must(planId ? await req.db.clientPlan.findFirst({ where: { id: planId, active: true } }) : null, 'That plan');
  if (!plan.priceCents) throw badRequest('That plan is free.');
  res.json(await payments().clientCheckout(dbForBusiness(req.auth.businessId), { client: { ...client, businessId: req.auth.businessId }, plan }));
});
/** Test-mode checkout only (PAYMENTS_PROVIDER=mock). */
router.post('/billing/mock-complete', body(z.object({ clientPlanId: z.string().max(64) })), async (req, res) => {
  const p = payments();
  if (p.name !== 'mock') throw badRequest('Not available with real payments.');
  const { coach, client } = await ctx(req);
  const plan = must(await req.db.clientPlan.findFirst({ where: { id: req.body.clientPlanId, active: true } }), 'That plan');
  await p.completeMockCheckout(coach, { client, plan });
  await coach.client.update({ where: { id: client.id }, data: { clientPlanId: plan.id, payStatus: 'paid', status: client.status === 'NEW' ? 'ACTIVE' : client.status } });
  await notify(coach, { kind: 'payment', title: `${client.name} paid for ${plan.name}`, body: 'Test-mode payment', link: `/app/clients/${client.id}` });
  res.json({ ok: true });
});
router.post('/billing/portal', async (req, res) => {
  const { coach, client } = await ctx(req);
  const p = payments();
  if (p.name === 'mock') await clientEvent(coach, client.id, 'card_updated');
  res.json(await p.clientPortal(coach, { client }));
});

router.get('/export', async (req, res) => {
  const { coach } = await ctx(req);
  const data = await exportClientData(coach, req.auth.clientId);
  delete data.aIInsight; delete data.clientEvent; delete data.note; delete data.nutritionFlag; // coach-private
  audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'client_self_export', target: req.auth.clientId });
  res.set('Content-Disposition', 'attachment; filename="my-onejump-data.json"');
  res.json(data);
});
