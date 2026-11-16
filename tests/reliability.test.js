// Assist reliability (Nov 15): long actions aren't cut off, no silent offline fallback, every
// question is logged, internal changes are done right away, packages and prices, the approve-all
// queue, time saved, and the live-speech token.
import { describe, it, expect, beforeAll } from 'vitest';
import { fixtures, loginCoach } from './helpers.js';
import { config } from '../server/config.js';
import { AI } from '../server/ai/AIService.js';
import { ask, isActionRequest } from '../server/assist/AssistService.js';
import { PROPOSE, confirmProposal } from '../server/assist/proposals.js';
import { modelOptions } from '../server/ai/providers/anthropic.js';

let f, dani, auth;
beforeAll(async () => { f = await fixtures(); dani = await loginCoach(); auth = { userId: f.dani.id, businessId: f.A.id, role: 'OWNER' }; });

/** A fake Claude that answers from a script: each entry is a function(req, i) → json. */
function fakeClaude(script) {
  const calls = [];
  return { calls, provider: { name: 'anthropic', model: 'fake-haiku', async chat(req) {
    calls.push(req);
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    const json = typeof step === 'function' ? step(req, calls.length - 1) : step;
    if (json instanceof Error) throw json;
    return { model: req.model || 'fake-haiku', usage: { inputTokens: 10, outputTokens: 10, costMicros: 1 }, json };
  } } };
}
async function withProvider(p, fn) {
  const before = AI.provider; AI.provider = p;
  try { return await fn(); } finally { AI.provider = before; }
}
const text = t => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const tool = (name, input, id = `t${Math.random()}`) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] });

describe('the Assist loop', () => {
  it('tells actions from questions', () => {
    for (const q of ['Create a 4-week program for Mike', 'set up a package for 199', 'Mándale un mensaje a Priya', 'move Sarah to Friday', 'add a note to Chris']) expect(isActionRequest(q)).toBe(true);
    for (const q of ['Who hasn’t checked in this week?', 'How is Mike doing?', 'what did I make last month']) expect(isActionRequest(q)).toBe(q.includes('make'));
  });

  it('actions get thinking and room to finish; questions stay fast', async () => {
    const { calls, provider } = fakeClaude([text('Okay.')]);
    await withProvider(provider, () => ask(f.dbA, auth, 'Build a 3-day program for beginners', { voice: true }));
    expect(calls[0]).toMatchObject({ think: true, effort: 'medium' });
    expect(calls[0].maxTokens).toBeGreaterThanOrEqual(6000);
    const q = fakeClaude([text('Mike is on track.')]);
    await withProvider(q.provider, () => ask(f.dbA, auth, 'How is Mike doing?', { voice: true }));
    expect(q.calls[0]).toMatchObject({ think: false, effort: 'low' });
    expect(modelOptions('claude-haiku-5-5', { think: true, effort: 'medium' })).toEqual({ output_config: { effort: 'medium' } });
    expect(modelOptions('claude-haiku-5-5', {})).toEqual({ thinking: { type: 'disabled' } });
  });

  it('a step cut off mid-action is redone once with more room on the escalation model', async () => {
    const { calls, provider } = fakeClaude([
      { stop_reason: 'max_tokens', content: [{ type: 'tool_use', id: 'cut', name: 'propose_create_program', input: {} }] },
      tool('propose_add_note', { client_name: f.mike.name, text: 'Started the new block' }, 'ok1'),
      text('Done.'),
    ]);
    const r = await withProvider(provider, () => ask(f.dbA, auth, 'Add a note to Mike: started the new block'));
    expect(calls[1].maxTokens).toBe(12000);
    expect(calls[1].model).toBe(config.ai.escalateModel);
    expect(r.done?.[0]?.type).toBe('add_note'); // internal: done right away
    const run = await f.dbA.assistRun.findFirst({ where: { question: 'Add a note to Mike: started the new block' }, orderBy: { createdAt: 'desc' } });
    expect(run.outcome).toBe('done');
  });

  it('out of steps: one last call without tools to wrap up', async () => {
    const { calls, provider } = fakeClaude([(req, i) => (req.toolChoice?.type === 'none' ? text('Here’s where things stand.') : tool('programs', {}, `p${i}`))]);
    const r = await withProvider(provider, () => ask(f.dbA, auth, 'How are my programs doing?'));
    expect(calls.at(-1).toolChoice).toEqual({ type: 'none' });
    expect(r.answerText).toMatch(/where things stand/);
    const run = await f.dbA.assistRun.findFirst({ where: { question: 'How are my programs doing?' }, orderBy: { createdAt: 'desc' } });
    expect(run.outcome).toBe('step_limit');
  });

  it('when Claude fails it retries, then says so honestly (no offline phrase matcher), and logs it', async () => {
    const { calls, provider } = fakeClaude([new Error('Anthropic 529: overloaded')]);
    const r = await withProvider(provider, () => ask(f.dbA, auth, 'Send Marcus the drafted message'));
    expect(calls.length).toBe(2);
    expect(r.answerText).toMatch(/couldn’t finish/);
    expect(r.proposals).toEqual([]);
    const run = await f.dbA.assistRun.findFirst({ where: { question: 'Send Marcus the drafted message', outcome: 'error' }, orderBy: { createdAt: 'desc' } });
    expect(run.error).toMatch(/529/);
  });

  it('over the AI budget: an honest message, unless the coach is on the OneJump team', async () => {
    const before = { budget: config.ai.monthlyBudgetUsd, hq: config.hqAdminEmails };
    config.ai.monthlyBudgetUsd = 0;
    try {
      const { calls, provider } = fakeClaude([text('All good.')]);
      const r = await withProvider(provider, () => ask(f.dbA, auth, 'Who needs me today?'));
      expect(r.answerText).toMatch(/AI budget/);
      expect(calls.length).toBe(0);
      config.hqAdminEmails = ['dani@reyesstrength.com'];
      const r2 = await withProvider(provider, () => ask(f.dbA, auth, 'Who needs me today?'));
      expect(r2.answerText).toBe('All good.');
    } finally { config.ai.monthlyBudgetUsd = before.budget; config.hqAdminEmails = before.hq; }
  });
});

describe('internal changes happen right away', () => {
  it('a lead is added at once (with auto-approve on) and counts as time saved', async () => {
    const leads = await f.dbA.lead.count();
    const saved = (await dani.get('/api/assist/time-saved')).body.monthMinutes;
    const r = await dani.post('/api/assist/ask', { question: 'Add a lead: Rosa, wants to run a 10k, found me on Instagram' });
    expect(r.status).toBe(200);
    expect(r.body.proposals).toEqual([]);
    expect(r.body.done[0]).toMatchObject({ type: 'create_lead' });
    expect(r.body.answerText).toMatch(/^Done\./);
    expect(await f.dbA.lead.count()).toBe(leads + 1);
    expect((await dani.get('/api/assist/time-saved')).body.monthMinutes).toBeGreaterThan(saved);
  });

  it('anything a client sees still waits for the coach', async () => {
    const r = await dani.post('/api/assist/ask', { question: 'Send Marcus the drafted message' });
    expect(r.body.proposals.length).toBe(1);
    expect(r.body.done).toBeUndefined();
  });

  it('the owner can turn auto-approve off', async () => {
    expect((await dani.patch('/api/assist/settings', { autoApprove: false })).body.autoApprove).toBe(false);
    const r = await dani.post('/api/assist/ask', { question: 'Add a lead: Tom, wants to lose 10 pounds' });
    expect(r.body.proposals[0].type).toBe('create_lead');
    expect((await dani.patch('/api/assist/settings', { autoApprove: true })).body.autoApprove).toBe(true);
    expect((await dani.get('/api/assist/settings')).body.autoApprove).toBe(true);
  });
});

describe('packages and prices', () => {
  it('creates a package after the coach confirms, and changing the price makes a new price for new sign-ups', async () => {
    const p = await PROPOSE.create_package(f.dbA, auth, { name: '12-Week Transformation', price: 199, interval: 'month', minimum_months: 3, includes: ['Custom program', 'Weekly check-ins'] }, { source: 'typed', lang: 'en' });
    expect(p.proposal.payload.lines[0]).toBe('Price: $199 a month');
    expect(await f.dbA.clientPlan.count({ where: { name: '12-Week Transformation' } })).toBe(0);
    const r = await confirmProposal(f.dbA, auth, p.proposal.id);
    expect(r.message).toMatch(/ready in your packages/);
    const plan = await f.dbA.clientPlan.findFirst({ where: { name: '12-Week Transformation' } });
    expect(plan.priceCents).toBe(19900);
    expect(plan.description).toMatch(/3-month minimum/);
    const dup = await PROPOSE.create_package(f.dbA, auth, { name: '12-week transformation', price: 150 }, { source: 'typed', lang: 'en' });
    expect(dup.error).toMatch(/already have/);

    const u = await PROPOSE.update_package(f.dbA, auth, { package_name: '12 week transformation', price: 179 }, { source: 'typed', lang: 'en' });
    expect(u.proposal.payload.lines[0]).toMatch(/\$199 → \$179/);
    await confirmProposal(f.dbA, auth, u.proposal.id);
    const after = await f.dbA.clientPlan.findFirst({ where: { id: plan.id } });
    expect(after.priceCents).toBe(17900);
    expect(after.stripePriceId).toBeTruthy(); // a fresh price was made
  });

  it('only the owner can', async () => {
    const r = await PROPOSE.create_package(f.dbA, { ...auth, role: 'COACH' }, { name: 'X', price: 10 }, { source: 'typed', lang: 'en' });
    expect(r.error).toMatch(/owner/);
  });
});

describe('approve-all queue', () => {
  it('lists drafts waiting on the coach and approves many at once; medical check-ins need a read first', async () => {
    const q = await dani.get('/api/assist/queue');
    expect(q.status).toBe(200);
    const drafts = q.body.items.filter(i => i.kind === 'insight');
    expect(drafts.length).toBeGreaterThan(0);
    for (const i of q.body.items) expect(i).toHaveProperty('needsReview');
    const pick = drafts.filter(i => !i.needsReview).slice(0, 2).map(i => ({ kind: 'insight', id: i.id }));
    const r = await dani.post('/api/assist/queue/approve', { items: pick });
    expect(r.body.ok).toBe(pick.length);
    const flagged = drafts.find(i => i.needsReview);
    if (flagged) {
      const bad = await dani.post('/api/assist/queue/approve', { items: [{ kind: 'insight', id: flagged.id }] });
      expect(bad.body.results[0].error).toMatch(/read it first/);
    }
    const again = await dani.post('/api/assist/queue/approve', { items: pick.slice(0, 1) });
    expect(again.body.failed).toBe(1); // already handled
  });
});

describe('live speech and HQ', () => {
  it('no Deepgram: the app is told to use the iPhone’s own speech recognition', async () => {
    const r = await dani.post('/api/voice/stt-token', { lang: 'en' });
    expect(r.status).toBe(200);
    expect(r.body.available).toBe(false);
  });

  it('HQ sees outcomes and errors, never the questions', async () => {
    const before = config.hqAdminEmails;
    config.hqAdminEmails = ['dani@reyesstrength.com'];
    try {
      const hq = await loginCoach();
      const r = await hq.get('/api/admin/assist-runs');
      expect(r.status).toBe(200);
      expect(r.body.total).toBeGreaterThan(0);
      expect(JSON.stringify(r.body)).not.toMatch(/question/);
      expect(r.body.byOutcome.some(o => o.outcome === 'error')).toBe(true);
    } finally { config.hqAdminEmails = before; }
    expect((await dani.get('/api/admin/assist-runs')).status).toBe(403);
  });
});
