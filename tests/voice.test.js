// Voice acceptance criteria (03-voice-and-nutrition-spec.md, Part 1) with VOICE_PROVIDER=mock.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fixtures, loginCoach, loginClient } from './helpers.js';
import { config } from '../server/config.js';
import { parseSet } from '../public/js/shared/parse.js';

const AUDIO = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('fake webm opus audio for the tests')]);
let f, dani, alex, mike;
beforeAll(async () => { f = await fixtures(); dani = await loginCoach(); alex = await loginCoach('alex@northsidebarbell.com'); mike = await loginClient(); });
const talk = (who, hint, durationMs = 2500) => who.upload('/api/voice/ask', 'audio', AUDIO, 'talk.webm', { hint, durationMs: String(durationMs) });

describe('Talk to Assist', () => {
  it('“Who hasn’t checked in this week?” returns the same clients as the typed question', async () => {
    const typed = await dani.post('/api/assist/ask', { question: 'Who hasn’t checked in this week?' });
    const spoken = await talk(dani, 'Who hasn’t checked in this week?');
    expect(spoken.status).toBe(200);
    expect(spoken.body.transcript).toBe('Who hasn’t checked in this week?');
    const names = html => [...html.matchAll(/class="client-link" href="\/app\/clients\/([^"]+)"/g)].map(m => m[1]);
    expect(names(spoken.body.answerHtml)).toEqual(names(typed.body.answerHtml));
    expect(names(spoken.body.answerHtml).length).toBeGreaterThan(0);
    expect(spoken.body.spokenText.split(/[.!?](\s|$)/).filter(s => s && s.trim()).length).toBeLessThanOrEqual(2);
  });

  it('logs the transcript and the audio seconds, and keeps no audio', async () => {
    const before = await f.dbA.voiceInteraction.count();
    await talk(dani, 'Which clients haven’t paid?', 4200);
    const v = await f.dbA.voiceInteraction.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(await f.dbA.voiceInteraction.count()).toBe(before + 1);
    expect(v).toMatchObject({ transcript: 'Which clients haven’t paid?', durationMs: 4200, provider: 'mock', kind: 'ask' });
    const u = await f.dbA.aIUsage.findFirst({ where: { kind: 'voice_ask' }, orderBy: { createdAt: 'desc' } });
    expect(u.seconds).toBe(4);
  });

  it('never reads health details aloud', async () => {
    const r = await talk(dani, 'Read me Chris’s check-in');
    expect(r.body.answerHtml).toMatch(/Health flag/);
    expect(r.body.spokenText).not.toMatch(/knee|pain|hurt/i);
  });

  it('refuses money, deleting and target changes by voice', async () => {
    for (const q of ['Refund Marcus for last month', 'Delete Kevin', 'Set Mike’s protein target to 120', 'Change Tom’s plan to Pro']) {
      const r = await talk(dani, q);
      expect(r.body.spokenText, q).toMatch(/^I can’t do that by voice\. Open .+ to do it\.$/);
      expect(r.body.proposals).toEqual([]);
    }
  });

  it('rejects files that aren’t audio', async () => {
    expect((await dani.upload('/api/voice/ask', 'audio', Buffer.from('not audio at all, honest'), 'x.txt')).status).toBe(400);
  });
});

describe('proposals: nothing happens until Confirm', () => {
  it('“Send Marcus the drafted message” creates one pending proposal and sends nothing; Confirm sends exactly once', async () => {
    const marcus = await f.dbA.client.findFirst({ where: { name: 'Marcus Johnson' } });
    const msgs = () => f.dbA.message.count({ where: { clientId: marcus.id } });
    const before = await msgs(), pBefore = await f.dbA.assistProposal.count();
    const r = await talk(dani, 'Send Marcus the drafted message');
    expect(r.body.proposals.length).toBe(1);
    expect(r.body.proposals[0]).toMatchObject({ type: 'send_message', status: 'pending', payload: { clientId: marcus.id } });
    expect(await f.dbA.assistProposal.count()).toBe(pBefore + 1);
    expect(await msgs()).toBe(before);
    const id = r.body.proposals[0].id;
    expect((await alex.post(`/api/assist/proposals/${id}/confirm`)).status).toBe(404); // another business can't confirm it
    const [a, b] = await Promise.all([dani.post(`/api/assist/proposals/${id}/confirm`), dani.post(`/api/assist/proposals/${id}/confirm`)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await msgs()).toBe(before + 1);
    expect((await dani.post(`/api/assist/proposals/${id}/confirm`)).status).toBe(409);
    expect(await msgs()).toBe(before + 1);
    const p = await f.dbA.assistProposal.findFirst({ where: { id } });
    expect(p.status).toBe('confirmed');
    expect(await f.dbA.auditLog.count({ where: { action: 'assist_send_message_confirmed', target: id } })).toBe(1);
  });

  it('an expired proposal can’t be confirmed', async () => {
    const r = await talk(dani, 'Add a note to Chris: knee pain reported');
    const id = r.body.proposals[0].id;
    await f.dbA.assistProposal.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const notes = await f.dbA.note.count();
    const c = await dani.post(`/api/assist/proposals/${id}/confirm`);
    expect(c.status).toBe(409);
    expect(c.body.error).toMatch(/expired/);
    expect(await f.dbA.note.count()).toBe(notes);
    expect((await f.dbA.assistProposal.findFirst({ where: { id } })).status).toBe('expired');
  });

  it('a lead, a reply with the coach’s own words, reminders and cancel', async () => {
    const lead = await talk(dani, 'Add a lead: Jake, wants to get stronger for climbing, found me on Instagram');
    expect(lead.body.proposals[0].payload).toMatchObject({ name: 'Jake', goal: 'Get stronger for climbing', source: 'instagram_dm' });
    const leads = await f.dbA.lead.count();
    await dani.post(`/api/assist/proposals/${lead.body.proposals[0].id}/confirm`);
    expect(await f.dbA.lead.count()).toBe(leads + 1);

    const priya = await f.dbA.client.findFirst({ where: { name: 'Priya Patel' } });
    const reply = await talk(dani, 'Reply to Priya: great job, same weights on Day 3');
    expect(reply.body.proposals[0].payload.text).toBe('great job, same weights on Day 3');
    const edited = await dani.post(`/api/assist/proposals/${reply.body.proposals[0].id}/confirm`, { text: 'Great job, Priya! Same weights on Day 3.' });
    expect(edited.status).toBe(200);
    expect((await f.dbA.message.findFirst({ where: { clientId: priya.id }, orderBy: { createdAt: 'desc' } })).body).toBe('Great job, Priya! Same weights on Day 3.');

    const rem = await talk(dani, 'Remind everyone who hasn’t checked in');
    expect(rem.body.proposals[0].type).toBe('send_reminders');
    expect(rem.body.proposals[0].payload.recipients.length).toBeGreaterThan(0);
    const before = await f.dbA.message.count();
    expect((await dani.post(`/api/assist/proposals/${rem.body.proposals[0].id}/cancel`)).body.status).toBe('cancelled');
    expect(await f.dbA.message.count()).toBe(before);
    expect((await dani.post(`/api/assist/proposals/${rem.body.proposals[0].id}/confirm`)).status).toBe(409);
  });
});

describe('limits and plans', () => {
  let original;
  afterAll(async () => { config.voice.monthlyMinutes = original; });
  it('requests over the monthly voice limit are refused with a clear message', async () => {
    original = config.voice.monthlyMinutes;
    config.voice.monthlyMinutes = 0.01;
    const r = await talk(dani, 'Who hasn’t checked in this week?');
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('voice_limit');
    expect(r.body.error).toMatch(/monthly voice limit is reached/);
    // typing still works
    expect((await dani.post('/api/assist/ask', { question: 'Who hasn’t checked in this week?' })).status).toBe(200);
    config.voice.monthlyMinutes = original;
  });

  it('Talk to Assist is Pro: Starter gets 403 with an upgrade message', async () => {
    const orig = await f.dbA.business.findFirst({ select: { plan: true, planStatus: true } });
    await f.dbA.business.update({ where: { id: f.A.id }, data: { plan: 'STARTER', planStatus: 'active' } });
    try {
      const r = await talk(dani, 'Who hasn’t checked in this week?');
      expect(r.status).toBe(403);
      expect(r.body.upgrade).toBe('PRO');
    } finally { await f.dbA.business.update({ where: { id: f.A.id }, data: orig }); }
  });

  it('clients can’t use Talk to Assist', async () => {
    expect((await talk(mike, 'Who hasn’t checked in this week?')).status).toBe(403);
  });
});

describe('client set logging parser', () => {
  it('reads reps and weight', () => {
    expect(parseSet('10 reps at 55')).toEqual({ reps: 10, weight: 55, bodyweight: false, unit: 'lb' });
    expect(parseSet('8 at 135 pounds')).toMatchObject({ reps: 8, weight: 135 });
    expect(parseSet('12 bodyweight')).toMatchObject({ reps: 12, weight: null, bodyweight: true });
    expect(parseSet('twelve at forty five')).toMatchObject({ reps: 12, weight: 45 });
    expect(parseSet('nothing here')).toBeNull();
  });
});
