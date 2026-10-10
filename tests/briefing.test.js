// Morning briefing (03-voice-and-nutrition-spec.md, Part 1, “How it works” 3).
import { describe, it, expect, beforeAll } from 'vitest';
import { fixtures, loginCoach, loginClient } from './helpers.js';
import { briefings } from '../server/jobs/nightly.js';
import { tidyLines, MAX_WORDS } from '../server/assist/briefing.js';
import { SAFETY_TERMS } from '../server/ai/safety.js';
import { EmailService } from '../server/email/EmailService.js';
import { localYMD, localParts } from '../server/lib/time.js';

let f, dani, alex, mike;
beforeAll(async () => { f = await fixtures(); dani = await loginCoach(); alex = await loginCoach('alex@northsidebarbell.com'); mike = await loginClient(); });
const words = lines => lines.join(' ').split(/\s+/).filter(Boolean).length;
/** The next moment (at least 30 hours away, so it's a different day from today) that is h:m local time. */
function atLocal(tz, h, m) {
  const start = Math.ceil((Date.now() + 30 * 3600e3) / 60e3) * 60e3;
  for (let t = start; t < start + 48 * 3600e3; t += 60e3) {
    const d = new Date(t), p = localParts(tz, d);
    if (p.hour === h && Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, minute: 'numeric' }).format(d)) === m) return d;
  }
  throw new Error('no time found');
}

describe('the briefing itself', () => {
  let b;
  it('is built from real data, under about 120 words, in speaking order', async () => {
    const r = await dani.get('/api/briefing/today');
    expect(r.status).toBe(200);
    b = r.body.briefing;
    expect(b.lines[0]).toMatch(/^Good morning, Dani\. It’s \w+day, \w+ \d+(st|nd|rd|th)\.$/);
    expect(b.lines[1]).toMatch(/things? needs? you today/);
    expect(words(b.lines)).toBeLessThanOrEqual(MAX_WORDS);
    expect(b.seconds).toBeGreaterThan(10);
    const text = b.lines.join(' ');
    const t = (await dani.get('/api/today')).body;
    const open = t.items.filter(i => (i.status || 'pending') === 'pending');
    const urgent = open.find(i => i.sev === 'crit' && i.client) || open.find(i => i.sev === 'warn' && i.client);
    expect(text).toContain(`Most urgent: ${urgent.title}.`);
    expect(text).toMatch(/check-ins? (is|are) ready/);
    expect(text).toMatch(/Chris’s is flagged for you, so read it first/);
    expect(text).toMatch(/payments? failed, totaling \$\d/);
    expect(b.lines.at(-1)).toMatch(/Have a great day\.$/);
  });

  it('never reads health details aloud (the check-in mentions knee pain; the briefing doesn’t)', async () => {
    const k = await f.dbA.checkIn.findFirst({ where: { flagged: true, status: 'submitted' } });
    expect(k.text).toMatch(SAFETY_TERMS);
    expect(b.lines.join(' ')).not.toMatch(SAFETY_TERMS);
    expect(b.lines.join(' ')).not.toMatch(/food|protein|calorie/i);
  });

  it('is stored once per coach per day; Refresh rebuilds the same one', async () => {
    const again = (await dani.get('/api/briefing/today')).body.briefing;
    expect(again.id).toBe(b.id);
    const fresh = (await dani.post('/api/briefing/today/refresh')).body.briefing;
    expect(fresh.id).toBe(b.id);
    expect(await f.dbA.briefing.count({ where: { userId: f.dani.id } })).toBe(1);
  });

  it('keeps each coach’s briefing to their own business', async () => {
    const a = (await alex.get('/api/briefing/today')).body.briefing;
    expect(a.lines[0]).toMatch(/^Good morning, Alex/);
    expect(a.lines.join(' ')).not.toMatch(/Marcus|Chris|Mike|Dani/);
    expect(await f.dbB.briefing.findFirst({ where: { id: b.id } })).toBeNull();
    expect((await mike.get('/api/briefing/today')).status).toBe(403);
  });

  it('Starter gets 403 with an upgrade message', async () => {
    const orig = await f.dbA.business.findFirst({ select: { plan: true, planStatus: true } });
    await f.dbA.business.update({ where: { id: f.A.id }, data: { plan: 'STARTER', planStatus: 'active' } });
    try {
      const r = await dani.get('/api/briefing/today');
      expect(r.status).toBe(403);
      expect(r.body.upgrade).toBe('PRO');
    } finally { await f.dbA.business.update({ where: { id: f.A.id }, data: orig }); }
  });

  it('tidyLines drops worded lines that mention health, and trims to about 120 words', () => {
    const facts = ['Good morning, Dani.', '3 check-ins are ready. Chris’s is flagged for you, so read it first.', 'Have a great day.'];
    expect(tidyLines(['Good morning!', 'Chris mentioned knee pain, read his first.'], facts)).toEqual(facts);
    const long = Array.from({ length: 8 }, (_, i) => `Line ${i} ${'word '.repeat(20)}`.trim());
    expect(words(tidyLines(long, facts))).toBeLessThanOrEqual(MAX_WORDS);
  });
});

describe('the schedule: 6:30 AM build, 7 AM notification', () => {
  const tz = 'America/New_York';
  it('builds at 6:30 local without notifying, then notifies once at 7:00 (and emails when turned on)', async () => {
    const at630 = atLocal(tz, 6, 35), day = localYMD(tz, at630);
    expect(await f.dbA.briefing.count({ where: { userId: f.dani.id, date: new Date(`${day}T00:00:00Z`) } })).toBe(0);
    await briefings(new Date(at630.getTime() - 60 * 60e3)); // 5:35: too early
    expect(await f.dbA.briefing.count({ where: { userId: f.dani.id, date: new Date(`${day}T00:00:00Z`) } })).toBe(0);
    await briefings(at630);
    const br = await f.dbA.briefing.findFirst({ where: { userId: f.dani.id, date: new Date(`${day}T00:00:00Z`) } });
    expect(br).toBeTruthy();
    expect(br.notifiedAt).toBeNull();

    const s = (await f.dbA.business.findFirst({ select: { settings: true } })).settings || {};
    await f.dbA.business.update({ where: { id: f.A.id }, data: { settings: { ...s, notifications: { ...(s.notifications || {}), briefingEmail: true } } } });
    const n0 = await f.dbA.notification.count({ where: { title: { startsWith: 'Your morning briefing is ready' } } });
    const at700 = new Date(at630.getTime() + 30 * 60e3);
    await briefings(at700);
    await briefings(new Date(at700.getTime() + 15 * 60e3)); // the next tick doesn't repeat it
    expect(await f.dbA.notification.count({ where: { title: { startsWith: 'Your morning briefing is ready' } } })).toBe(n0 + 1);
    expect((await f.dbA.briefing.findFirst({ where: { id: br.id } })).notifiedAt).not.toBeNull();
    const mail = EmailService.outbox().find(e => e.to === 'dani@reyesstrength.com' && /morning briefing/i.test(e.subject));
    expect(mail?.text).toContain(br.lines[0]);
    await f.dbA.business.update({ where: { id: f.A.id }, data: { settings: s } });
  });

  it('the Today banner shows until it’s played, on any device', async () => {
    // Today's own briefing: mark it notified, then played.
    const today = (await dani.get('/api/briefing/today')).body.briefing;
    await f.dbA.briefing.update({ where: { id: today.id }, data: { notifiedAt: new Date(), playedAt: null } });
    expect((await dani.get('/api/briefing/status')).body.ready).toBe(true);
    await dani.post('/api/briefing/today/played');
    expect((await dani.get('/api/briefing/status')).body.ready).toBe(false);
  });

  it('skips Starter workspaces', async () => {
    const orig = await f.dbA.business.findFirst({ select: { plan: true, planStatus: true } });
    await f.dbA.business.update({ where: { id: f.A.id }, data: { plan: 'STARTER', planStatus: 'active' } });
    try {
      const t = atLocal(tz, 6, 50), t2 = new Date(t.getTime() + 24 * 3600e3); // a day nobody built yet
      await briefings(t2);
      expect(await f.dbA.briefing.count({ where: { date: new Date(`${localYMD(tz, t2)}T00:00:00Z`) } })).toBe(0);
    } finally { await f.dbA.business.update({ where: { id: f.A.id }, data: orig }); }
  });
});
