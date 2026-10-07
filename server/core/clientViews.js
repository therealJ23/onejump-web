// Shapes client data for the coach's lists and profile (no AI here; just the numbers).
import { todayKey, addDays, weekStart, DAY } from '../lib/time.js';
import { programWeek } from './training.js';
import { weightSeries } from './stats.js';

export async function clientList(db, { tz = 'UTC', now = new Date() } = {}) {
  const [clients, programs, plans, pending, recent, threads] = await Promise.all([
    db.client.findMany({ orderBy: { name: 'asc' } }),
    db.program.findMany({ select: { id: true, name: true, weeks: true, daysPerWeek: true } }),
    db.clientPlan.findMany({ select: { id: true, name: true, priceCents: true, interval: true } }),
    db.checkIn.findMany({ where: { status: 'submitted' }, select: { id: true, clientId: true, flagged: true } }),
    db.checkIn.findMany({ where: { submittedAt: { gte: new Date(now.getTime() - 7 * DAY) } }, select: { clientId: true } }),
    db.thread.findMany({ select: { clientId: true, coachUnread: true } }),
  ]);
  const P = new Map(programs.map(p => [p.id, p])), K = new Map(plans.map(p => [p.id, p]));
  const pend = new Map(pending.map(k => [k.clientId, k])), rec = new Set(recent.map(k => k.clientId)), unread = new Map(threads.map(t => [t.clientId, t.coachUnread]));
  return clients.map(c => {
    const p = P.get(c.programId);
    const tenure = (now - new Date(c.startedAt)) / DAY;
    const checkin = pend.has(c.id) ? 'review' : (c.status === 'PAUSED' ? 'paused' : c.status === 'INACTIVE' ? 'none' : rec.has(c.id) ? 'reviewed' : tenure < 7 ? 'notdue' : 'missing');
    return {
      id: c.id, name: c.name, email: c.email, goal: c.goal, goalType: c.goalType, mode: c.mode, status: c.status, tags: c.tags || [],
      program: p ? { id: p.id, name: p.name, weeks: p.weeks, week: Math.min(p.weeks, programWeek(c, now) || 1) } : null,
      plan: K.get(c.clientPlanId) || null, payStatus: c.payStatus,
      risk: c.riskLevel ? { score: c.riskScore, level: c.riskLevel, reasons: c.riskReasons || [] } : null,
      adherence: c.adherence, workoutsDone: c.workoutsDone, lastWorkoutAt: c.lastWorkoutAt, lastCheckinAt: c.lastCheckinAt, lastActiveAt: c.lastActiveAt,
      checkin, checkinId: pend.get(c.id)?.id || null, painFlag: !!pend.get(c.id)?.flagged, unread: unread.get(c.id) || 0, startedAt: c.startedAt, invited: !c.userId && !c.lastActiveAt,
    };
  });
}

/** This week Mon–Sun: done / missed / today / upcoming / rest. */
export async function weekPattern(db, clientId, tz = 'UTC', now = new Date()) {
  const today = todayKey(tz, now), mon = weekStart(today);
  const rows = await db.workoutAssignment.findMany({ where: { clientId, scheduledFor: { gte: mon, lt: addDays(mon, 7) } }, select: { scheduledFor: true, status: true } });
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(mon, i);
    const a = rows.find(r => +r.scheduledFor === +d);
    let state = 'rest';
    if (a) state = a.status === 'completed' ? 'done' : +d === +today ? 'today' : d < today ? 'missed' : 'upcoming';
    else if (+d === +today) state = 'today-rest';
    return { date: d.toISOString().slice(0, 10), state };
  });
}

export async function clientProfile(db, id, { tz = 'UTC', now = new Date() } = {}) {
  const c = await db.client.findFirst({ where: { id } });
  if (!c) return null;
  const [program, plan, sub, paidAgg, latestCheckin, lastPayment, weights, thread] = await Promise.all([
    c.programId ? db.program.findFirst({ where: { id: c.programId }, select: { id: true, name: true, weeks: true, daysPerWeek: true, level: true } }) : null,
    c.clientPlanId ? db.clientPlan.findFirst({ where: { id: c.clientPlanId } }) : null,
    db.subscription.findFirst({ where: { clientId: id }, orderBy: { createdAt: 'desc' } }),
    db.payment.aggregate({ where: { clientId: id, status: 'paid' }, _sum: { amountCents: true } }),
    db.checkIn.findFirst({ where: { clientId: id }, orderBy: { submittedAt: 'desc' } }),
    db.payment.findFirst({ where: { clientId: id, status: 'paid' }, orderBy: { paidAt: 'desc' } }),
    weightSeries(db, id, 12),
    db.thread.findFirst({ where: { clientId: id }, select: { coachUnread: true } }),
  ]);
  const pain = latestCheckin && latestCheckin.flagged && now - new Date(latestCheckin.submittedAt) < 14 * DAY ? { checkInId: latestCheckin.id, text: latestCheckin.text, reviewed: latestCheckin.status === 'reviewed' } : null;
  const w = weights.map(x => x.value);
  return {
    client: {
      id: c.id, name: c.name, email: c.email, phone: c.phone, goal: c.goal, goalType: c.goalType, why: c.why, targetWeight: c.targetWeight,
      age: c.birthYear ? new Date().getUTCFullYear() - c.birthYear : null, birthYear: c.birthYear, mode: c.mode, status: c.status, tags: c.tags || [],
      payStatus: c.payStatus, startedAt: c.startedAt, lastActiveAt: c.lastActiveAt, lastWorkoutAt: c.lastWorkoutAt, lastCheckinAt: c.lastCheckinAt,
      adherence: c.adherence, workoutsDone: c.workoutsDone, invited: !c.userId && !c.lastActiveAt, pausedUntil: c.pausedUntil, clientPlanId: c.clientPlanId, programId: c.programId,
      risk: c.riskLevel ? { score: c.riskScore, level: c.riskLevel, reasons: c.riskReasons || [], updatedAt: c.riskUpdatedAt } : null,
    },
    program: program ? { ...program, week: Math.min(program.weeks, programWeek(c, now) || 1), startedAt: c.programStartedAt } : null,
    plan, subscription: sub,
    stats: {
      weightDelta: w.length >= 2 ? Math.round((w.at(-1) - w[0]) * 10) / 10 : null,
      lifetimeCents: paidAgg._sum.amountCents || 0,
      weeks: Math.max(1, Math.round((now - new Date(c.startedAt)) / (7 * DAY))),
    },
    pain,
    unread: thread?.coachUnread || 0,
    week: await weekPattern(db, id, tz, now),
    activity: [
      latestCheckin && { kind: 'checkin', text: 'Sent weekly check-in', at: latestCheckin.submittedAt },
      c.lastWorkoutAt && { kind: 'workout', text: 'Completed a workout', at: c.lastWorkoutAt },
      c.lastActiveAt && { kind: 'open', text: 'Opened the app', at: c.lastActiveAt },
      lastPayment && { kind: 'payment', text: `Paid ${plan?.name || 'their plan'}`, at: lastPayment.paidAt },
    ].filter(Boolean).sort((a, b) => new Date(b.at) - new Date(a.at)),
  };
}
