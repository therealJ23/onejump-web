// Assist safety rules: nothing AI-written reaches a client without the coach's OK, pain and
// medical topics always get a referral (never a diagnosis), and decisions can be undone.
import { describe, it, expect, beforeAll } from 'vitest';
import { fixtures, loginCoach, loginClient } from './helpers.js';
import { guardDraft, checkText, REFERRAL } from '../server/ai/safety.js';
import { AIService } from '../server/ai/AIService.js';
import { messageContext } from '../server/ai/context.js';

let f, dani, mike;
beforeAll(async () => { f = await fixtures(); dani = await loginCoach(); mike = await loginClient(); });
const countMsgs = () => f.dbA.message.count({ where: { clientId: f.mike.id } });

describe('safety guard', () => {
  it('flags pain, injury, medication and pregnancy words', () => {
    for (const t of ['my knee hurts', 'I think I injured my back', 'started new medication', 'I’m pregnant', 'felt dizzy']) expect(checkText(t).flagged, t).toBe(true);
    for (const t of ['great week', 'legs were sore but fine', 'hit a PR']) expect(checkText(t).flagged, t).toBe(false);
  });

  it('replaces drafts that diagnose or say to push through pain', () => {
    expect(guardDraft('Sounds like you probably have a torn meniscus.', { firstName: 'Mike' }).safety.rewritten).toBe(true);
    expect(guardDraft('Just push through the pain this week!').safety.rewritten).toBe(true);
    const g = guardDraft('Keep going, you’re doing great!', { contextTexts: ['my shoulder hurts when I press'], firstName: 'Mike' });
    expect(g.safety.rewritten).toBe(true);
    expect(g.text).toContain(REFERRAL);
  });

  it('leaves a draft alone when it already refers to a professional', () => {
    const t = 'Please see a physical therapist before we load that again. We’ll train around it.';
    expect(guardDraft(t, { contextTexts: ['knee pain'] }).text).toBe(t);
  });
});

describe('AIService', () => {
  it('falls back to the mock draft when a provider returns something invalid', async () => {
    const broken = { name: 'fake', model: 'fake-1', complete: async () => ({ data: { nope: true } }) };
    const r = await new AIService(broken).draftMessage(await messageContext(f.dbA, f.mike, 'motivate'));
    expect(r.model).toMatch(/fallback/);
    expect(r.data.text.length).toBeGreaterThan(10);
  });

  it('rewrites a provider draft that diagnoses or pushes through pain', async () => {
    const bad = { name: 'fake', model: 'fake-1', complete: async () => ({ data: { text: 'You probably have a torn meniscus. Just push through the pain.' } }) };
    const r = await new AIService(bad).draftMessage(await messageContext(f.dbA, f.mike, 'motivate'));
    expect(r.data.safety.rewritten).toBe(true);
    expect(r.data.text).not.toMatch(/meniscus|push through/i);
  });

  it('sends Assist only what the task needs: no emails, phone numbers or payment details', async () => {
    const ctx = JSON.stringify(await messageContext(f.dbA, f.mike, 'reply-last'));
    expect(ctx).not.toContain(f.mike.email);
    expect(ctx).not.toMatch(/acct_|cus_|sub_|stripe|@example\.com/i);
  });
});

describe('check-ins with pain', () => {
  it('get a referral reply, a flag for the coach and no load increase', async () => {
    const sent = await mike.post('/api/me/checkins', { weight: 205, sleepHours: 7, energy: 6, stress: 5, soreness: 6, nutrition: 7, mood: 6, text: 'Good week but my left shoulder hurts when I bench.' });
    expect(sent.status).toBe(201);
    const k = await f.dbA.checkIn.findFirst({ where: { id: sent.body.id } });
    expect(k.flagged).toBe(true);
    const a = (await dani.get(`/api/checkins/${k.id}/assist`)).body.insight;
    expect(a.reply).toMatch(/physical therapist|sports-medicine doctor|qualified professional/);
    expect(a.reply).not.toMatch(/push through/i);
    expect(a.flags.some(x => x.level === 'crit')).toBe(true);
    expect((a.actions || []).some(x => x.op?.type === 'increase_load')).toBe(false);
    const notif = await f.dbA.notification.findFirst({ where: { link: `/app/checkins/${k.id}` } });
    expect(notif.body).toMatch(/hurts/);
  });
});

describe('approval before anything reaches a client', () => {
  it('a message draft sends nothing until the coach presses send', async () => {
    const before = await countMsgs();
    const d = await dani.post(`/api/threads/${f.mike.id}/draft`, { intent: 'motivate' });
    expect(d.status).toBe(200);
    expect(d.body.text.length).toBeGreaterThan(10);
    expect(await countMsgs()).toBe(before);
    const sent = await dani.post(`/api/threads/${f.mike.id}/messages`, { body: `${d.body.text} See you Thursday.`, insightId: d.body.insightId });
    expect(sent.status).toBe(201);
    expect(sent.body.message.assist).toBe(true);
    expect(sent.body.message.edited).toBe(true);
    expect(await countMsgs()).toBe(before + 1);
    expect((await f.dbA.aIInsight.findFirst({ where: { id: d.body.insightId } })).status).toBe('edited');
  });

  it('approving a risk draft sends it; undo takes it back within 5 minutes', async () => {
    const ins = await f.dbA.aIInsight.findFirst({ where: { kind: 'risk', status: 'pending' } });
    expect(ins).toBeTruthy();
    const count = () => f.dbA.message.count({ where: { clientId: ins.clientId } });
    const before = await count();
    const ok = await dani.post(`/api/insights/${ins.id}/approve`);
    expect(ok.body.status).toBe('approved');
    expect(await count()).toBe(before + 1);
    const msg = await f.dbA.message.findFirst({ where: { aiInsightId: ins.id } });
    expect(msg.body).toBe(ins.draft.draft);
    expect((await dani.post(`/api/insights/${ins.id}/undo`)).body.status).toBe('pending');
    expect(await count()).toBe(before);
    expect((await dani.post(`/api/insights/${ins.id}/dismiss`)).body.status).toBe('dismissed');
    expect(await count()).toBe(before);
  });

  it('a draft the coach edited is sent with the coach’s words', async () => {
    const ins = await f.dbA.aIInsight.findFirst({ where: { kind: 'risk', status: 'pending' } });
    if (!ins) return;
    const r = await dani.post(`/api/insights/${ins.id}/approve`, { text: 'Hey, quick call this week? — Dani' });
    expect(r.body.status).toBe('edited');
    expect((await f.dbA.message.findFirst({ where: { aiInsightId: ins.id } })).body).toBe('Hey, quick call this week? — Dani');
  });

  it('the client app never shows Assist labels, risk scores or coach notes', async () => {
    const text = JSON.stringify((await mike.get('/api/me/today')).body) + JSON.stringify((await mike.get('/api/me/thread')).body);
    expect(text).not.toMatch(/riskScore|riskLevel|aiInsightId|Assist|private note/i);
  });
});

describe('Ask Assist with Claude: memory, full data tools, language', () => {
  it('gives every extra tool only this business’s data, with no emails or phone numbers', async () => {
    const { MORE_TOOLS } = await import('../server/assist/moreTools.js');
    const c = { tz: 'UTC', now: new Date(), voice: false };
    const outs = [];
    for (const [name, tool] of Object.entries(MORE_TOOLS)) outs.push(await tool.run(f.dbA, tool.input.name ? { name: f.mike.name } : {}, c));
    const json = JSON.stringify(outs);
    expect(json).toContain(f.mike.name.split(' ')[0]);
    expect(json).not.toContain(f.mike.email);
    const other = await f.dbB.client.findFirst({ select: { name: true } });
    if (other) expect((await MORE_TOOLS.client_details.run(f.dbA, { name: other.name }, c)).notFound).toBe(true);
  });

  it('sends earlier turns and the coach’s language, runs tools, and returns the answer text', async () => {
    const { ask } = await import('../server/assist/AssistService.js');
    const { AI } = await import('../server/ai/AIService.js');
    const calls = [];
    const fake = { name: 'anthropic', model: 'fake-claude', async chat(req) {
      calls.push({ ...req, roles: req.messages.map(m => m.role), last: JSON.stringify(req.messages.at(-1)) });
      if (calls.length === 1) return { model: 'fake-claude', usage: {}, json: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'client_details', input: { name: f.mike.name } }] } };
      return { model: 'fake-claude', usage: {}, json: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Mike va bien.\n\n- Entrena 3 días\n- Sigue el plan' }] } };
    } };
    const before = AI.provider; AI.provider = fake;
    try {
      const r = await ask(f.dbA, { userId: f.dani.id, businessId: f.A.id }, '¿y él?', { history: [{ role: 'user', text: 'How is Mike doing?' }, { role: 'assistant', text: 'Mike is on track.' }], lang: 'es' });
      expect(calls[0].roles).toEqual(['user', 'assistant', 'user']);
      expect(calls[0].system).toMatch(/Spanish/);
      expect(calls[1].last).toContain(f.mike.name.split(' ')[0]);
      expect(r.answerText).toMatch(/Mike va bien/);
      expect(r.answerHtml).toContain('<ul class="answer-list">');
      expect(r.answerHtml).not.toContain('**');
    } finally { AI.provider = before; }
  });
});
