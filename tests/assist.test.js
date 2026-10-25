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
    // Leave the seeded queue as it was for the other test files (they may run after this one).
    await f.dbA.checkIn.update({ where: { id: k.id }, data: { status: 'reviewed', reviewedAt: new Date() } });
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

describe('hands-free approvals: Assist reads it back, a spoken yes or no decides', () => {
  it('understands a short yes or no (English and Spanish), and nothing else', async () => {
    const { yesNo } = await import('../server/assist/approvals.js');
    for (const t of ['Yes.', 'yeah send it', 'um, yes please', 'Go ahead', 'Sí, envíalo', 'Dale', 'claro que sí']) expect(yesNo(t), t).toBe('yes');
    for (const t of ['No.', 'no, don’t send it', 'Cancel that', 'no lo envíes']) expect(yesNo(t), t).toBe('no');
    for (const t of ['yes but change the last line', 'okay what about Sarah?', 'Yesterday was a good day', 'hold on', 'I’m not sure', 'Send Mike a message saying the gym is closed tomorrow because of the storm']) expect(yesNo(t), t).toBe(null);
  });

  it('reads the message back and asks; “yes” sends exactly that message', async () => {
    const before = await countMsgs();
    const r = await dani.post('/api/assist/ask', { question: 'Message Mike: see you Monday at 6!', voice: true });
    expect(r.status).toBe(200);
    expect(r.body.proposals[0].type).toBe('send_message');
    expect(r.body.spokenText).toMatch(/Here’s what I’d send Mike: see you Monday at 6! Should I send it\?/);
    expect(r.body.awaiting).toBe(r.body.proposals[0].id);
    expect(await countMsgs()).toBe(before); // nothing yet
    const yes = await dani.post('/api/assist/ask', { question: 'Yes, send it.', voice: true, pendingProposalId: r.body.awaiting });
    expect(yes.body.decided).toMatchObject({ id: r.body.awaiting, confirmed: true });
    expect(yes.body.spokenText).toMatch(/^Done\. Sent to Mike/);
    expect(await countMsgs()).toBe(before + 1);
    const again = await dani.post('/api/assist/ask', { question: 'yes', voice: true, pendingProposalId: r.body.awaiting });
    expect(again.body.decided.confirmed).toBe(false); // can't run twice
    expect(await countMsgs()).toBe(before + 1);
  });

  it('“no” cancels; anything that isn’t a clear answer goes to Assist and the proposal stays', async () => {
    const r = await dani.post('/api/assist/ask', { question: 'Message Mike: quick test', voice: true });
    const other = await dani.post('/api/assist/ask', { question: 'yes but change it to say hello', voice: true, pendingProposalId: r.body.awaiting });
    expect(other.body.decided).toBeUndefined();
    expect((await f.dbA.assistProposal.findFirst({ where: { id: r.body.awaiting } })).status).toBe('pending');
    const no = await dani.post('/api/assist/ask', { question: 'No.', voice: true, pendingProposalId: r.body.awaiting, lang: 'es' });
    expect(no.body.decided).toMatchObject({ confirmed: false });
    expect(no.body.spokenText).toBe('Está bien, no lo haré.');
    expect((await f.dbA.assistProposal.findFirst({ where: { id: r.body.awaiting } })).status).toBe('cancelled');
  });

  it('health details are never read aloud and can’t be approved by voice', async () => {
    const before = await countMsgs();
    const r = await dani.post('/api/assist/ask', { question: 'Message Mike: hope the knee pain is better', voice: true });
    expect(r.body.spokenText).toMatch(/on screen/);
    expect(r.body.spokenText).not.toMatch(/knee/);
    expect(r.body.awaiting).toBeNull();
    const yes = await dani.post('/api/assist/ask', { question: 'yes', voice: true, pendingProposalId: r.body.proposals[0].id });
    expect(yes.body.decided.confirmed).toBe(false);
    expect(await countMsgs()).toBe(before);
  });

  it('another coach’s proposal id is ignored', async () => {
    const r = await dani.post('/api/assist/ask', { question: 'Message Mike: test two', voice: true });
    const alex = await loginCoach('alex@northsidebarbell.com');
    const x = await alex.post('/api/assist/ask', { question: 'yes', voice: true, pendingProposalId: r.body.awaiting });
    expect(x.body.decided).toBeUndefined();
    expect((await f.dbA.assistProposal.findFirst({ where: { id: r.body.awaiting } })).status).toBe('pending');
  });

  it('builds a nutrition plan by voice; saying yes saves it', async () => {
    const c = await f.dbA.client.create({ data: { name: 'Voicey Planner', goalType: 'Muscle', birthYear: new Date().getFullYear() - 28, status: 'ACTIVE' } });
    await f.dbA.measurement.create({ data: { clientId: c.id, weight: 180, takenAt: new Date() } });
    await f.dbA.nutritionPlan.create({ data: { clientId: c.id, approach: 'habits', sex: 'male', heightIn: 70 } });
    try {
      const r = await dani.post('/api/assist/ask', { question: 'Build a nutrition plan for Voicey Planner with a meal plan', voice: true });
      const p = r.body.proposals[0];
      expect(p.type).toBe('nutrition_plan');
      expect(r.body.spokenText).toMatch(/For Voicey: about [\d,]+ calories and \d+ grams of protein a day.*Should I save it to Voicey’s plan\?/);
      expect((await f.dbA.nutritionPlan.findFirst({ where: { clientId: c.id } })).calories).toBeNull();
      const yes = await dani.post('/api/assist/ask', { question: 'yes', voice: true, pendingProposalId: r.body.awaiting });
      expect(yes.body.decided.confirmed).toBe(true);
      const plan = await f.dbA.nutritionPlan.findFirst({ where: { clientId: c.id } });
      expect(plan.calories).toBe(p.payload.draft.calories);
      expect(plan.mealPlanId).toBeTruthy();
      await f.dbA.mealPlanTemplate.deleteMany({ where: { id: plan.mealPlanId } });
    } finally {
      await f.dbA.habit.deleteMany({ where: { clientId: c.id } });
      await f.dbA.nutritionPlan.deleteMany({ where: { clientId: c.id } });
      await f.dbA.measurement.deleteMany({ where: { clientId: c.id } });
      await f.dbA.client.deleteMany({ where: { id: c.id } });
    }
  });

  it('off-topic questions get a friendly, human decline that steers back to the business', async () => {
    const r = await dani.post('/api/assist/ask', { question: 'Who won the World Series last year?' });
    expect(r.body.answerText).toMatch(/business|clients/);
    expect(r.body.answerText).not.toMatch(/AI|language model/);
  });

  it('caches the system prompt and tools when talking to Claude', async () => {
    const { AnthropicProvider } = await import('../server/ai/providers/anthropic.js');
    let sent;
    const p = new AnthropicProvider({ apiKey: 'x', model: 'claude-haiku-4-5', fetchImpl: async (_u, o) => { sent = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ content: [], usage: { input_tokens: 10, cache_read_input_tokens: 1000, output_tokens: 5 } }) }; } });
    const msgs = [{ role: 'user', content: 'hi' }];
    const r = await p.chat({ system: 'sys', messages: msgs, tools: [{ name: 'a', input_schema: {} }, { name: 'b', input_schema: {} }], cache: true });
    expect(sent.system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(sent.tools[1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(sent.tools[0].cache_control).toBeUndefined();
    expect(sent.messages[0].content[0]).toMatchObject({ text: 'hi', cache_control: { type: 'ephemeral' } });
    expect(msgs[0].content).toBe('hi'); // caller's array untouched
    expect(r.usage.costMicros).toBe(Math.round(10 * 1 + 1000 * 0.1 + 5 * 5));
  });
});
