// The coach's calendar (sessions, check-in calls, consultations, blocked time) and the client's
// training calendar (workouts done / planned / missed, sessions with the coach, check-ins).
import { badRequest, must } from '../lib/errors.js';
import { addDays, ymdToDate, dateToYmd, wallParts, zonedToUtc, todayKey } from '../lib/time.js';
import { clientPhotoUrls } from './avatars.js';
import { audit } from '../db/system.js';

export const EVENT_TYPES = ['session', 'call', 'consult', 'block'];
const TYPE_TITLE = { session: 'Session', call: 'Check-in call', consult: 'Consultation', block: 'Busy' };

async function shapeEvents(db, rows) {
  const ids = [...new Set(rows.map(r => r.clientId).filter(Boolean))];
  const [clients, photos] = await Promise.all([
    ids.length ? db.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [],
    clientPhotoUrls(db, ids),
  ]);
  const byId = new Map(clients.map(c => [c.id, c]));
  return rows.map(e => ({
    id: e.id, type: e.type, title: e.title, start: e.start, end: e.end, location: e.location, notes: e.notes, status: e.status, source: e.source,
    client: e.clientId && byId.get(e.clientId) ? { id: e.clientId, name: byId.get(e.clientId).name, photoUrl: photos.get(e.clientId) || null } : null,
  }));
}

/** Free windows of at least `minMinutes` inside the coach's working hours, from now on. */
export function openSlots(events, availability, { from, days, tz, now = new Date(), minMinutes = 60 }) {
  const av = availability || { days: [1, 2, 3, 4, 5], from: 9, to: 17 };
  const out = [];
  for (let i = 0; i < days; i++) {
    const ymd = dateToYmd(addDays(from, i));
    const weekday = new Date(`${ymd}T12:00:00Z`).getUTCDay();
    if (!(av.days || []).includes(weekday)) continue;
    const dayStart = zonedToUtc(ymd, Number(av.from ?? 9), 0, tz), dayEnd = zonedToUtc(ymd, Number(av.to ?? 17), 0, tz);
    let cursor = new Date(Math.max(dayStart.getTime(), Math.ceil(now.getTime() / 9e5) * 9e5)); // next quarter hour
    const busy = events.filter(e => e.status !== 'cancelled' && e.end > dayStart && e.start < dayEnd).sort((a, b) => a.start - b.start);
    for (const e of [...busy, { start: dayEnd, end: dayEnd }]) {
      if (e.start - cursor >= minMinutes * 6e4) out.push({ start: new Date(cursor), end: new Date(e.start) });
      if (e.end > cursor) cursor = new Date(e.end);
    }
  }
  return out;
}

/** The coach's calendar between two local dates (inclusive), up to 62 days. */
export async function coachRange(db, { from, to, tz, now = new Date() }) {
  const start = zonedToUtc(from, 0, 0, tz), end = zonedToUtc(dateToYmd(addDays(ymdToDate(to), 1)), 0, 0, tz);
  if (end - start > 62 * 864e5 || end <= start) throw badRequest('Pick a range of up to two months.');
  const [rows, due, b] = await Promise.all([
    db.calendarEvent.findMany({ where: { start: { lt: end }, end: { gt: start }, status: { not: 'cancelled' } }, orderBy: { start: 'asc' }, take: 500 }),
    db.workoutAssignment.groupBy({ by: ['scheduledFor'], where: { scheduledFor: { gte: ymdToDate(from), lte: ymdToDate(to) } }, _count: { _all: true } }),
    db.business.findFirst({ select: { availability: true } }),
  ]);
  const days = Math.round((ymdToDate(to) - ymdToDate(from)) / 864e5) + 1;
  return {
    events: await shapeEvents(db, rows),
    workoutsDue: Object.fromEntries(due.map(d => [dateToYmd(d.scheduledFor), d._count._all])),
    openSlots: openSlots(rows, b?.availability, { from: ymdToDate(from), days: Math.min(days, 14), tz, now }),
    availability: b?.availability || { days: [1, 2, 3, 4, 5], from: 9, to: 17 },
    tz,
  };
}

export async function createEvent(db, auth, d) {
  if (!EVENT_TYPES.includes(d.type)) throw badRequest('Pick a type: session, call, consultation or busy.');
  const start = new Date(d.start), end = new Date(d.end);
  if (!(start < end)) throw badRequest('The end has to be after the start.');
  if (end - start > 12 * 3600e3) throw badRequest('Events can be up to 12 hours.');
  if (d.clientId) must(await db.client.findFirst({ where: { id: d.clientId }, select: { id: true } }), 'That client');
  const e = await db.calendarEvent.create({ data: { type: d.type, title: String(d.title || '').trim().slice(0, 120) || TYPE_TITLE[d.type], start, end, clientId: d.clientId || null, leadId: d.leadId || null, location: d.location ? String(d.location).slice(0, 190) : null, notes: d.notes ? String(d.notes).slice(0, 2000) : null, source: d.source || 'manual', createdBy: auth.userId || null } });
  audit({ businessId: auth.businessId, actorUserId: auth.userId, action: 'calendar_event_created', target: e.id, meta: { type: e.type, source: e.source } });
  return (await shapeEvents(db, [e]))[0];
}

export async function updateEvent(db, auth, id, d) {
  const e = must(await db.calendarEvent.findFirst({ where: { id } }), 'That event');
  const data = {};
  for (const k of ['title', 'location', 'notes']) if (d[k] !== undefined) data[k] = d[k] == null ? null : String(d[k]).slice(0, k === 'notes' ? 2000 : 190);
  if (d.type) { if (!EVENT_TYPES.includes(d.type)) throw badRequest('Unknown type.'); data.type = d.type; }
  if (d.status) data.status = d.status;
  if (d.clientId !== undefined) { if (d.clientId) must(await db.client.findFirst({ where: { id: d.clientId }, select: { id: true } }), 'That client'); data.clientId = d.clientId || null; }
  const start = d.start ? new Date(d.start) : e.start, end = d.end ? new Date(d.end) : (d.start ? new Date(new Date(d.start).getTime() + (e.end - e.start)) : e.end);
  if (!(start < end)) throw badRequest('The end has to be after the start.');
  Object.assign(data, { start, end });
  const u = await db.calendarEvent.update({ where: { id: e.id }, data });
  audit({ businessId: auth.businessId, actorUserId: auth.userId, action: 'calendar_event_updated', target: e.id });
  return (await shapeEvents(db, [u]))[0];
}

/** Moves a client's scheduled workout to another day (coach, or the client when allowed). */
export async function moveAssignment(db, id, ymd, { tz, client = false } = {}) {
  const a = must(await db.workoutAssignment.findFirst({ where: { id } }), 'That workout');
  if (a.status !== 'scheduled') throw badRequest('Only workouts that haven’t been done can move.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw badRequest('Pick a day.');
  const target = ymdToDate(ymd), today = todayKey(tz);
  if (client && (target < today || target - today > 21 * 864e5)) throw badRequest('Pick a day in the next three weeks.');
  return db.workoutAssignment.update({ where: { id: a.id }, data: { scheduledFor: target } });
}

/** The client's month: each day's workout (done / planned / missed), sessions and check-in. */
export async function clientMonth(db, clientId, month, tz, now = new Date()) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('Pick a month.');
  const first = ymdToDate(`${month}-01`), last = addDays(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)), -1);
  const from = addDays(first, -7), to = addDays(last, 7); // the grid shows a few days of the months around it
  const today = todayKey(tz, now);
  const [assignments, events, checkins] = await Promise.all([
    db.workoutAssignment.findMany({ where: { clientId, scheduledFor: { gte: from, lte: to } }, orderBy: { scheduledFor: 'asc' } }),
    db.calendarEvent.findMany({ where: { clientId, status: { not: 'cancelled' }, start: { gte: zonedToUtc(dateToYmd(from), 0, 0, tz), lt: zonedToUtc(dateToYmd(addDays(to, 1)), 0, 0, tz) } }, orderBy: { start: 'asc' } }),
    db.checkIn.findMany({ where: { clientId, submittedAt: { gte: from } }, select: { submittedAt: true } }),
  ]);
  const workouts = await db.workout.findMany({ where: { id: { in: [...new Set(assignments.map(a => a.workoutId))] } }, select: { id: true, name: true, estMinutes: true, blocks: true } });
  const W = new Map(workouts.map(w => [w.id, w]));
  const days = {};
  const day = ymd => (days[ymd] ||= { workouts: [], sessions: [], checkin: false });
  for (const a of assignments) {
    const w = W.get(a.workoutId);
    const state = a.status === 'completed' ? 'done' : a.status === 'skipped' || a.scheduledFor < today ? 'missed' : 'planned';
    day(dateToYmd(a.scheduledFor)).workouts.push({ assignmentId: a.id, workoutId: a.workoutId, name: w?.name || 'Workout', estMinutes: w?.estMinutes || null, exercises: (w?.blocks || []).reduce((n, b) => n + (b.items?.length || 0), 0), state });
  }
  for (const e of events) {
    const p = wallParts(tz, e.start);
    const ymd = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    day(ymd).sessions.push({ id: e.id, type: e.type, title: e.title, start: e.start, end: e.end, location: e.location });
  }
  for (const k of checkins) day(dateToYmd(k.submittedAt)).checkin = true;
  return { month, days, today: dateToYmd(today) };
}
