// Context builders: only this coach's data, minimum fields. No emails, phone numbers,
// payment details or anything from another client ever goes into a prompt.
import { memberships } from '../db/system.js';
import { weightSeries, keyLift } from '../core/stats.js';
import { plateauWeeks } from '../core/risk.js';
import { exerciseMap, programWeek } from '../core/training.js';
import { checkText } from './safety.js';

const first = name => String(name || '').split(' ')[0] || 'there';
const r1 = n => (n == null ? null : Math.round(n * 10) / 10);

export async function coachContext(db) {
  const b = await db.business.findFirst({ select: { id: true, name: true, writingStyle: true, slug: true } });
  const coach = await memberships.coachNameFor(b.id);
  return { name: coach?.name || b.name, business: b.name, style: b.writingStyle || 'Supportive', slug: b.slug };
}

export async function clientContext(db, client) {
  const program = client.programId ? await db.program.findFirst({ where: { id: client.programId }, select: { name: true, weeks: true, daysPerWeek: true } }) : null;
  const tags = Array.isArray(client.tags) ? client.tags.filter(t => typeof t === 'string').slice(0, 5) : [];
  return {
    first: first(client.name),
    goal: client.goal || null,
    goalType: client.goalType || null,
    mode: client.mode,
    programName: program?.name || null,
    week: programWeek(client),
    weeksInProgram: program?.weeks || null,
    daysPerWeek: program?.daysPerWeek || null,
    adherence: client.adherence,
    workoutsDone: client.workoutsDone,
    daysSinceStart: Math.floor((Date.now() - new Date(client.startedAt).getTime()) / 864e5),
    tags,
  };
}

const ciFields = k => k && ({ weight: k.weight, sleepHours: k.sleepHours, energy: k.energy, stress: k.stress, soreness: k.soreness, nutrition: k.nutrition, mood: k.mood, workoutsDone: k.workoutsDone, workoutsPlanned: k.workoutsPlanned, text: k.text || '' });

async function weights(db, clientId) {
  const series = await weightSeries(db, clientId, 10);
  const vals = series.map(s => s.value);
  return {
    weights: series.map(s => ({ date: s.date.toISOString().slice(0, 10), value: s.value })),
    weightChange: vals.length >= 2 ? { week: r1(vals.at(-1) - vals.at(-2)), total: r1(vals.at(-1) - vals[0]) } : null,
    plateauWeeks: plateauWeeks(vals),
  };
}

export async function checkinContext(db, client, checkIn) {
  const prev = await db.checkIn.findFirst({ where: { clientId: client.id, submittedAt: { lt: checkIn.submittedAt } }, orderBy: { submittedAt: 'desc' } });
  return { coach: await coachContext(db), client: await clientContext(db, client), checkin: ciFields(checkIn), previous: ciFields(prev) || null, ...(await weights(db, client.id)), safety: checkText(checkIn.text) };
}

export async function lastMessages(db, clientId, n = 6) {
  const msgs = await db.message.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' }, take: n, select: { senderRole: true, body: true } });
  return msgs.reverse().map(m => ({ from: m.senderRole === 'CLIENT' ? 'client' : 'coach', text: m.body.slice(0, 600) }));
}

export async function messageContext(db, client, intent, current = '', extra = {}) {
  const latest = await db.checkIn.findFirst({ where: { clientId: client.id }, orderBy: { submittedAt: 'desc' } });
  const w = await weights(db, client.id);
  return { coach: await coachContext(db), client: await clientContext(db, client), intent, current: current || '', lastMessages: await lastMessages(db, client.id), latestCheckin: ciFields(latest) || null, weightChange: w.weightChange, ...extra };
}

export async function riskContext(db, client, risk, signals) {
  return {
    coach: await coachContext(db), client: await clientContext(db, client),
    risk: { score: risk.score, level: risk.level, reasons: risk.reasons },
    signals: { missed14: signals.missed14, checkinMiss: signals.checkinMiss, msgDrop: signals.msgDrop, sentiment: signals.sentiment, plateau: signals.plateau, payFailed: signals.payFailed, adherence: signals.adherence },
    lastClientMessage: signals.lastClientMessage ? signals.lastClientMessage.slice(0, 400) : null,
    intent: 'risk',
  };
}

export async function workoutContext(db, brief, client = null) {
  const ex = await exerciseMap(db);
  return {
    coach: await coachContext(db),
    client: client ? await clientContext(db, client) : null,
    brief: { goal: brief.goal, level: brief.level, minutes: brief.minutes, daysPerWeek: brief.daysPerWeek, equipment: brief.equipment, injuries: brief.injuries || '', prefs: brief.prefs || '', seed: brief.seed || 1 },
    library: [...ex.values()].map(e => ({ id: e.id, name: e.name, pattern: e.pattern, equipment: e.equipment, level: e.level, kneeLoad: e.kneeLoad, overhead: e.overhead })),
  };
}

export async function adjustContext(db, client) {
  const ex = await exerciseMap(db);
  const sessions = await db.workoutSession.findMany({ where: { clientId: client.id, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, take: 8, select: { completedAt: true, rpe: true, soreness: true, note: true, sets: true } });
  const checkins = await db.checkIn.findMany({ where: { clientId: client.id }, orderBy: { submittedAt: 'desc' }, take: 3, select: { soreness: true, sleepHours: true, energy: true, text: true } });
  const lifts = new Map();
  for (const s of [...sessions].reverse()) for (const e of (Array.isArray(s.sets) ? s.sets : [])) {
    const w = Math.max(0, ...(e.sets || []).map(x => Number(x.weight) || 0));
    if (!w) continue;
    const cur = lifts.get(e.exerciseId) || { exerciseId: e.exerciseId, name: ex.get(e.exerciseId)?.name || 'Exercise', lower: ['squat', 'hinge', 'lunge'].includes(ex.get(e.exerciseId)?.pattern), lastLoad: 0, sessionsAtLoad: 0, lastRpe: null };
    cur.sessionsAtLoad = w === cur.lastLoad ? cur.sessionsAtLoad + 1 : 1;
    cur.lastLoad = w; cur.lastRpe = s.rpe;
    lifts.set(e.exerciseId, cur);
  }
  const safety = [...checkins.map(k => k.text), ...sessions.map(s => s.note)].map(checkText).find(r => r.flagged) || { flagged: false, term: null };
  return {
    coach: await coachContext(db), client: await clientContext(db, client),
    recentSessions: sessions.map(s => ({ date: s.completedAt.toISOString().slice(0, 10), rpe: s.rpe, soreness: s.soreness, note: (s.note || '').slice(0, 200) })),
    recentCheckins: checkins.map(k => ({ soreness: k.soreness, sleepHours: k.sleepHours, energy: k.energy })),
    lifts: [...lifts.values()].slice(0, 8), safety,
  };
}

export async function progressContext(db, client) {
  const ex = await exerciseMap(db);
  const w = await weights(db, client.id);
  const waistRows = await db.measurement.findMany({ where: { clientId: client.id, waist: { not: null } }, orderBy: { takenAt: 'asc' }, select: { waist: true } });
  const lift = await keyLift(db, client.id, ex);
  return {
    coach: await coachContext(db), client: await clientContext(db, client),
    weights: w.weights, plateauWeeks: w.plateauWeeks,
    keyLift: lift ? { name: lift.name, values: lift.values } : null,
    waist: waistRows.length >= 2 ? [waistRows[0].waist, waistRows.at(-1).waist] : null,
  };
}
