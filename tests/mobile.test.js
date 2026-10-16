// The coach iPhone app's data: one snapshot per screen, only this business's data, labels in
// English and Spanish, no private contact or card details.
import { describe, it, expect, beforeAll } from 'vitest';
import { fixtures, loginCoach, loginClient } from './helpers.js';

let f, dani, alex, mike, snap;
beforeAll(async () => {
  f = await fixtures();
  dani = await loginCoach();
  alex = await loginCoach('alex@northsidebarbell.com');
  mike = await loginClient();
  snap = (await dani.get('/api/mobile/coach')).body;
});
const loc = x => expect(x).toMatchObject({ en: expect.any(String), es: expect.any(String) });

describe('coach snapshot for the iPhone app', () => {
  it('has every screen, with the coach’s own name and business', async () => {
    expect(snap.version).toBe(1);
    expect(snap.me).toMatchObject({ name: f.dani.name, business: expect.any(String), pro: true });
    for (const k of ['today', 'charts', 'clients', 'threads', 'checkIns', 'leads', 'payments', 'programs', 'nutrition', 'automations', 'assist', 'library']) expect(snap[k], k).toBeTruthy();
    expect(snap.today.kpis).toHaveLength(4);
    expect(snap.charts.revenue).toHaveLength(6);
    expect(snap.charts.adherence).toHaveLength(8);
    loc(snap.charts.revenue[0].label);
  });

  it('lists only this business’s clients, with Spanish labels and no emails or phone numbers', async () => {
    const mine = await f.dbA.client.findMany({ select: { id: true } });
    expect(snap.clients.map(c => c.id).sort()).toEqual(mine.map(c => c.id).sort());
    const other = await f.dbB.client.findFirst({ select: { id: true, name: true } });
    const { me, ...rest } = snap; // the coach's own email is fine (Settings shows it)
    expect(me.email).toBe(f.dani.email);
    const json = JSON.stringify(rest);
    expect(json).not.toContain(other.id);
    expect(json).not.toContain(f.mike.email);
    expect(json).not.toMatch(/"(email|phone)":"[^"]*@/);
    const c = snap.clients.find(x => x.id === f.mike.id);
    expect(c).toMatchObject({ name: f.mike.name, initials: expect.stringMatching(/^[A-Z]{1,2}$/), kind: expect.stringMatching(/risk|checkin|overdue|ok|new|paused|invited/) });
    loc(c.programLabel); loc(c.insight);
    expect(c.programLabel.es).not.toBe(c.programLabel.en);
  });

  it('puts every pending draft in the Needs-you queue with its insight id', async () => {
    const pending = await f.dbA.aIInsight.count({ where: { status: 'pending', kind: { in: ['risk', 'automation', 'nutrition_nudge'] } } });
    expect(snap.today.queue.length).toBeGreaterThan(0);
    expect(snap.today.queue.length).toBeLessThanOrEqual(pending);
    for (const q of snap.today.queue) {
      expect(snap.clients.some(c => c.id === q.clientId)).toBe(true);
      expect(q.draft.length).toBeGreaterThan(5);
      expect(await f.dbA.aIInsight.findFirst({ where: { id: q.id } })).toBeTruthy();
    }
  });

  it('shows check-ins to review with their answers (flagged ones first)', async () => {
    const list = snap.checkIns.toReview;
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].answers.length).toBeGreaterThan(2);
    const flaggedIdx = list.findIndex(k => k.flag), plainIdx = list.findIndex(k => !k.flag);
    if (flaggedIdx >= 0 && plainIdx >= 0) expect(flaggedIdx).toBeLessThan(plainIdx);
  });

  it('opens one client, one thread and one check-in; other businesses get 404', async () => {
    const d = (await dani.get(`/api/mobile/coach/clients/${f.mike.id}`)).body;
    expect(d.stats).toHaveLength(3);
    expect(Array.isArray(d.notes)).toBe(true);
    loc(d.food.note);
    const t = (await dani.get(`/api/mobile/coach/threads/${f.mike.id}`)).body;
    expect(t.messages.length).toBeGreaterThan(0);
    expect(t.messages[0]).toMatchObject({ fromMe: expect.any(Boolean), text: expect.any(String) });
    const k = snap.checkIns.toReview[0];
    const r = (await dani.get(`/api/mobile/coach/checkins/${k.id}`)).body;
    expect(r.summary.en.length).toBeGreaterThan(10);
    expect(r.draft.length).toBeGreaterThan(10);
    expect(r.insightId).toBeTruthy();
    expect((await alex.get(`/api/mobile/coach/clients/${f.mike.id}`)).status).toBe(404);
    expect((await alex.get(`/api/mobile/coach/threads/${f.mike.id}`)).status).toBe(404);
    expect((await alex.get(`/api/mobile/coach/checkins/${k.id}`)).status).toBe(404);
  });

  it('is for coaches only', async () => {
    expect((await mike.get('/api/mobile/coach')).status).toBe(403);
    const { browser } = await import('./helpers.js');
    expect((await (await browser()).get('/api/mobile/coach')).status).toBe(401);
  });
});
