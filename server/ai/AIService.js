// AIService: the only way features talk to a model. One method per job, versioned prompt +
// JSON schema, provider chosen by AI_PROVIDER (mock | anthropic | openai). Every output is
// validated, passed through the safety guard and returned as a draft for the coach.
import { config } from '../config.js';
import { SCHEMAS, jsonSchemaFor } from './schemas.js';
import { PROMPTS, PROMPT_VERSION } from './prompts.js';
import { MockProvider } from './providers/mock.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { guardDraft, checkText } from './safety.js';
import { startOfMonthUtc } from '../lib/time.js';

const MAX_TOKENS = { checkin: 1400, message: 500, risk: 700, workout: 1800, adjust: 900, progress: 700, lead: 500 };

export function makeProvider(name = config.ai.provider) {
  if (name === 'anthropic') return new AnthropicProvider({ apiKey: config.ai.anthropicKey, model: config.ai.anthropicModel });
  if (name === 'openai') return new OpenAIProvider({ apiKey: config.ai.openaiKey, model: config.ai.openaiModel });
  return new MockProvider();
}

export class AIService {
  constructor(provider = null) {
    this.provider = provider;
    this.mock = new MockProvider();
    this.promptVersion = PROMPT_VERSION;
  }
  get active() {
    if (!this.provider) {
      try { this.provider = makeProvider(); } catch (e) { console.error('[ai] provider setup failed, using mock:', e.message); this.provider = this.mock; }
    }
    return this.provider;
  }

  async overBudget(db) {
    if (!db || this.active.name === 'mock') return false;
    const r = await db.aIUsage.aggregate({ where: { createdAt: { gte: startOfMonthUtc() } }, _sum: { costMicros: true } });
    return (r._sum.costMicros || 0) >= config.ai.monthlyBudgetUsd * 1e6;
  }

  /** Runs one job. Falls back to the mock drafts if the provider fails or the workspace is over its AI budget. */
  async run(task, ctx, { db } = {}) {
    const { system, prompt } = PROMPTS[task](ctx);
    let provider = this.active, out, fallback = null;
    if (await this.overBudget(db)) { provider = this.mock; fallback = 'budget'; }
    try {
      out = await provider.complete({ task, system, prompt, schema: jsonSchemaFor(task), description: SCHEMAS[task].description, maxTokens: MAX_TOKENS[task], input: ctx });
      out.data = SCHEMAS[task].zod.parse(out.data);
    } catch (e) {
      if (provider === this.mock) throw e;
      console.error(`[ai] ${provider.name} failed on ${task}: ${e.message}. Using mock draft.`);
      provider = this.mock; fallback = 'error';
      out = await this.mock.complete({ task, input: ctx });
      out.data = SCHEMAS[task].zod.parse(out.data);
    }
    if (db) {
      await db.aIUsage.create({ data: { kind: task, provider: fallback ? `mock-${fallback}` : provider.name, model: out.model || provider.model, inputTokens: out.usage?.inputTokens || 0, outputTokens: out.usage?.outputTokens || 0, costMicros: out.usage?.costMicros || 0 } }).catch(() => null);
    }
    return { data: out.data, model: fallback ? `${out.model} (${fallback} fallback)` : (out.model || provider.model), promptVersion: this.promptVersion, provider: provider.name };
  }

  // -------------------------------------------------------------- jobs
  async analyzeCheckIn(ctx, opts) {
    const r = await this.run('checkin', ctx, opts);
    const s = checkText(ctx.checkin.text);
    const g = guardDraft(r.data.reply, { contextTexts: [ctx.checkin.text], firstName: ctx.client.first });
    r.data.reply = g.text;
    if (s.flagged && !r.data.flags.some(f => f.level === 'crit')) r.data.flags.unshift({ level: 'crit', text: `Mentions ${s.term}` });
    r.data.safety = { flagged: s.flagged, term: s.term, rewritten: g.safety.rewritten };
    return r;
  }
  async draftMessage(ctx, opts) {
    const r = await this.run('message', ctx, opts);
    const replying = ['reply-last', 'checkin-reply'].includes(ctx.intent);
    const lastClient = (ctx.lastMessages || []).filter(m => m.from === 'client').slice(-2).map(m => m.text);
    const g = guardDraft(r.data.text, { contextTexts: replying ? lastClient : [], firstName: ctx.client?.first });
    r.data = { text: g.text, safety: g.safety };
    return r;
  }
  async analyzeClientRisk(ctx, opts) {
    const r = await this.run('risk', ctx, opts);
    const g = guardDraft(r.data.draft, { contextTexts: ctx.lastClientMessage ? [ctx.lastClientMessage] : [], firstName: ctx.client.first });
    r.data.draft = g.text;
    return r;
  }
  async generateWorkout(ctx, opts) {
    const r = await this.run('workout', ctx, opts);
    const lib = new Map(ctx.library.map(e => [e.id, e]));
    const knee = /knee/i.test(ctx.brief.injuries || ''), shoulder = /shoulder/i.test(ctx.brief.injuries || '');
    // Enforce the brief no matter what the model returned: known exercises only, limitations respected.
    r.data.blocks = r.data.blocks
      .map(b => ({ ...b, items: b.items.filter(it => { const e = lib.get(it.exerciseId); return e && !(knee && e.kneeLoad) && !(shoulder && e.overhead); }) }))
      .filter(b => b.items.length)
      .map(b => ({ ...b, kind: b.items.length === 1 ? 'single' : b.kind }));
    if ((knee || shoulder || /back|hip|wrist|elbow|ankle/i.test(ctx.brief.injuries || '')) && !r.data.notes.some(n => /rehab|qualified professional/i.test(n))) {
      r.data.notes.push('Limitation noted. If the client has pain, they should see a qualified professional; this isn’t a rehab plan.');
    }
    return r;
  }
  suggestAdjustments(ctx, opts) { return this.run('adjust', ctx, opts); }
  analyzeProgress(ctx, opts) { return this.run('progress', ctx, opts); }
  async parseLead(ctx, opts) {
    const r = await this.run('lead', ctx, opts);
    r.data.reply = guardDraft(r.data.reply, { contextTexts: [ctx.dm] }).text;
    return r;
  }
}

export const AI = new AIService();
