// Calendar (Nov 15): coach events, open slots, moving workouts, the client's month, and Assist
// booking (client sessions wait for the coach; blocked time is done right away).
import { describe, it, expect, beforeAll } from 'vitest';
import { fixtures, loginCoach, loginClient } from './helpers.js';
import { zonedToUtc, localYMD, addDays, ymdToDate, dateToYmd } from '../server/lib/time.js';
import { openSlots } from '../server/core/calendar.js';
import { PROPOSE, confirmProposal, isAutoApprovable } from '../server/assist/proposals.js';

let f, dani, mike, tz, auth;
const tomorrow = () => dateToYmd(addDays(ymdToDate(localYMD(tz)), 1));
beforeAll(async () => {
  f = await fixtures(); dani = await loginCoach(); mike = await loginClient(); auth = { userId: f.dani.id, businessId: f.A.id, role: 'OWNER' };
  tz = (await f.dbA.business.findFirst({ select: { timezone: true } })).timezone;
});

describe('time zones', () => {
  it('turns local wall-clock times into the right instant, across daylight saving', () => {
    expect(zonedToUtc('2026-11-17', 8, 30, 'America/New_York').toISOString()).toBe('2026-11-17T13:30:00.000Z');
    expect(zonedToUtc('2026-07-01', 8, 0, 'America/New_York').toISOString()).toBe('2026-07-01T12:00:00.000Z');
    expect(zonedToUtc('2026-11-17', 9, 0, 'America/Santo_Domingo').toISOString()).toBe('2026-11-17T13:00:00.000Z');
  });
  it('finds open slots inside working hours around events', () => {
    const from = ymdToDate('2026-11-17'); // a Tuesday
    const ev = [{ start: zonedToUtc('2026-11-17', 10, 0, 'UTC'), end: zonedToUtc('2026-11-17', 11, 0, 'UTC'), status: 'scheduled' }];
    const slots = openSlots(ev, { days: [2], from: 9, to: 13 }, { from, days: 1, tz: 'UTC', now: new Date('2026-11-01T00:00:00Z') });
    expect(slots.map(s => [s.start.toISOString().slice(11, 16), s.end.toISOString().slice(11, 16)])).toEqual([['09:00', '10:00'], ['11:00', '13:00']]);
  });
});

describe('coach calendar', () => {
  let eventId;
  it('adds a session with a client and shows it with the client’s name and photo field', async () => {
    const day = tomorrow();
    const r = await dani.post('/api/calendar', { type: 'session', start: zonedToUtc(day, 9, 0, tz).toISOString(), end: zonedToUtc(day, 10, 0, tz).toISOString(), clientId: f.mike.id, location: 'Gym' });
    expect(r.status).toBe(201);
    expect(r.body.event).toMatchObject({ type: 'session', title: 'Session', client: { id: f.mike.id, name: f.mike.name } });
    expect(r.body.event.client).toHaveProperty('photoUrl');
    eventId = r.body.event.id;
    const cal = await dani.get(`/api/calendar?from=${localYMD(tz)}&to=${dateToYmd(addDays(ymdToDate(localYMD(tz)), 6))}`);
    expect(cal.body.events.some(e => e.id === eventId)).toBe(true);
    expect(cal.body).toHaveProperty('workoutsDue');
    expect(Array.isArray(cal.body.openSlots)).toBe(true);
  });

  it('moves and cancels an event; bad times are refused', async () => {
    const day = tomorrow();
    const m = await dani.patch(`/api/calendar/${eventId}`, { start: zonedToUtc(day, 14, 0, tz).toISOString() });
    expect(new Date(m.body.event.end) - new Date(m.body.event.start)).toBe(3600e3); // keeps its length
    expect((await dani.post('/api/calendar', { type: 'call', start: zonedToUtc(day, 9, 0, tz).toISOString(), end: zonedToUtc(day, 8, 0, tz).toISOString() })).status).toBe(400);
    expect((await dani.post('/api/calendar', { type: 'party', start: zonedToUtc(day, 9, 0, tz).toISOString(), end: zonedToUtc(day, 10, 0, tz).toISOString() })).status).toBe(400);
  });

  it('the client sees their sessions and workouts in their month, and can move a planned workout', async () => {
    const month = localYMD(tz).slice(0, 7);
    const r = await mike.get(`/api/me/calendar?month=${month}`);
    expect(r.status).toBe(200);
    expect(r.body.canReschedule).toBe(true);
    const all = Object.values(r.body.days);
    expect(all.some(d => d.sessions.length)).toBe(true);
    const states = all.flatMap(d => d.workouts.map(w => w.state));
    expect(states.every(s => ['done', 'planned', 'missed'].includes(s))).toBe(true);
    const planned = all.flatMap(d => d.workouts).find(w => w.state === 'planned');
    if (planned) {
      const to = dateToYmd(addDays(ymdToDate(localYMD(tz)), 2));
      expect((await mike.patch(`/api/me/assignments/${planned.assignmentId}`, { date: to })).body.assignment.date).toBe(to);
      expect((await mike.patch(`/api/me/assignments/${planned.assignmentId}`, { date: '2020-01-01' })).status).toBe(400);
    }
    // Blocked time (no client) never reaches the client.
    const day = tomorrow();
    await dani.post('/api/calendar', { type: 'block', title: 'Dentist', start: zonedToUtc(day, 12, 0, tz).toISOString(), end: zonedToUtc(day, 13, 0, tz).toISOString() });
    const again = await mike.get(`/api/me/calendar?month=${month}`);
    expect(JSON.stringify(again.body)).not.toMatch(/Dentist/);
  });

  it('the coach can turn client rescheduling off', async () => {
    const b = await f.dbA.business.findFirst({ select: { id: true, settings: true } });
    await f.dbA.business.update({ where: { id: b.id }, data: { settings: { ...(b.settings || {}), clientCanReschedule: false } } });
    try {
      const a = await f.dbA.workoutAssignment.findFirst({ where: { clientId: f.mike.id, status: 'scheduled' } });
      if (a) expect((await mike.patch(`/api/me/assignments/${a.id}`, { date: tomorrow() })).status).toBe(403);
    } finally { await f.dbA.business.update({ where: { id: b.id }, data: { settings: b.settings } }); }
  });
});

describe('Assist and the calendar', () => {
  it('books a session with a client (waits for the coach) and blocks time (done right away)', async () => {
    const day = tomorrow();
    const s = await PROPOSE.create_event(f.dbA, auth, { type: 'session', client_name: f.mike.name.split(' ')[0], date: day, start_time: '07:30', minutes: 45 }, { source: 'typed', lang: 'en' });
    expect(s.error).toBeUndefined();
    expect(isAutoApprovable(s.proposal)).toBe(false);
    const done = await confirmProposal(f.dbA, auth, s.proposal.id);
    expect(done.message).toMatch(/on your calendar/);
    const e = await f.dbA.calendarEvent.findFirst({ where: { id: done.eventId } });
    expect(e.start.toISOString()).toBe(zonedToUtc(day, 7, 30, tz).toISOString());
    expect(e.end - e.start).toBe(45 * 6e4);
    const b = await PROPOSE.create_event(f.dbA, auth, { type: 'block', date: day, start_time: '18:00', title: 'Gym floor' }, { source: 'typed', lang: 'en' });
    expect(isAutoApprovable(b.proposal)).toBe(true);
    const mv = await PROPOSE.move_event(f.dbA, auth, { event_id: e.id, date: day, start_time: '08:00' }, { source: 'typed', lang: 'en' });
    await confirmProposal(f.dbA, auth, mv.proposal.id);
    expect((await f.dbA.calendarEvent.findFirst({ where: { id: e.id } })).start.toISOString()).toBe(zonedToUtc(day, 8, 0, tz).toISOString());
    expect((await PROPOSE.create_event(f.dbA, auth, { date: 'tomorrow', start_time: '8am' }, { source: 'typed', lang: 'en' })).error).toMatch(/day and time/);
  });
});
