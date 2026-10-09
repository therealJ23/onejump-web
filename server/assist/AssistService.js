// Ask Assist: the coach asks about their business (typed, or spoken through Talk to Assist) and
// Assist answers from their own data. Data comes only from the read-only tools in ./tools.js;
// actions come only from the proposal tools in ./proposals.js, which never execute anything.
//  - AI_PROVIDER=anthropic: Claude (Haiku) with tool use picks the tools and words the answer.
//  - otherwise (mock): ./intents.js maps the question to the same tools and proposals.
// The cards on screen are always rendered here from tool results, so the numbers come from code.
import { AI } from '../ai/AIService.js';
import { checkText } from '../ai/safety.js';
import { coachContext } from '../ai/context.js';
import { TOOLS, toolDefinitions } from './tools.js';
import { RENDER, HELP_SUGGESTIONS, esc, speakable, clientLink } from './render.js';
import { PROPOSE, proposalToolDefinitions, shapeProposal } from './proposals.js';
import { route } from './intents.js';

const MAX_STEPS = 4;
const firstOf = n => String(n || '').split(' ')[0];

const SPOKEN_PROPOSAL = {
  send_message: p => `Here’s the message for ${firstOf(p.payload.clientName)}. Tap confirm to send it.`,
  create_lead: p => `I filled in a lead for ${firstOf(p.payload.name)}. Tap save to add it.`,
  send_reminders: p => `${p.payload.recipients.length} clients haven’t checked in. Tap send all to remind them.`,
  add_note: p => `I wrote the note for ${firstOf(p.payload.clientName)}. Tap save to add it.`,
};
const refusal = screen => ({ html: `<p>I can’t do that by voice. Open ${esc(screen)} to do it.</p>`, spoken: `I can’t do that by voice. Open ${screen.replace(' → ', ', then ')} to do it.` });
const MEDICAL = 'I can’t assess pain, injuries or medical conditions. Read what they said in their check-in and recommend a physical therapist, sports-medicine doctor or another qualified professional.';

async function propose(db, auth, type, args, source) {
  const r = await PROPOSE[type](db, auth, args, { source });
  if (r.error) return { html: `<p>${esc(r.error)}</p>`, spoken: r.error, proposals: [] };
  return { html: '', spoken: SPOKEN_PROPOSAL[type](r.proposal), proposals: [shapeProposal(r.proposal)] };
}

/** Offline path: same tools and proposals, chosen by intents.route(). */
async function askMock(db, auth, question, c, source) {
  const intent = await route(db, question);
  if (intent.kind === 'tool') {
    const data = await TOOLS[intent.name].run(db, intent.args, c);
    const r = RENDER[intent.name](data, intent.args);
    return { answerHtml: r.html, spokenText: r.spoken, trace: TOOLS[intent.name].trace, followups: r.followups || [], proposals: [], tools: [intent.name] };
  }
  if (intent.kind === 'propose') { const r = await propose(db, auth, intent.type, intent.args, source); return { answerHtml: r.html, spokenText: r.spoken, proposals: r.proposals, trace: [], followups: [], tools: [`propose_${intent.type}`] }; }
  if (intent.kind === 'refuse') { const r = refusal(intent.screen); return { answerHtml: r.html, spokenText: r.spoken, proposals: [], trace: [], followups: [] }; }
  if (intent.kind === 'briefing') return { answerHtml: '<p>Starting your morning briefing.</p>', spokenText: '', action: 'briefing', proposals: [], trace: [], followups: [] };
  if (intent.kind === 'medical') {
    const k = intent.clients.length === 1 ? await TOOLS.client_checkin.run(db, { name: intent.clients[0].name }, c) : null;
    return { answerHtml: `<p>${esc(MEDICAL)}</p>${k?.checkin ? `<div><a class="btn sm" href="/app/checkins/${esc(k.checkin.id)}">Open ${esc(firstOf(k.name))}’s check-in</a></div>` : ''}`, spokenText: 'I can’t assess pain or injuries. I’ve put what you need on screen.', proposals: [], trace: [], followups: [] };
  }
  return { answerHtml: '<p>I can answer questions about your clients, check-ins, workouts, nutrition, payments and leads, and prepare messages, notes, leads and reminders for you to confirm. Try one of these:</p>', spokenText: 'I can answer questions about your clients, check-ins, payments and leads. Try one of the examples on screen.', proposals: [], trace: [], followups: HELP_SUGGESTIONS.slice(0, 4) };
}

function systemPrompt(coach, voice) {
  return [
    `You are Assist, the copilot inside OneJump, coaching software. You are talking with ${coach.name}, a coach who runs ${coach.business}.`,
    'Answer questions about their business using ONLY the provided tools. Never invent clients, numbers or events. If no tool covers it, say what you can help with.',
    'The data from each tool is shown to the coach on screen as a card, so keep your own words short: 1–3 plain sentences that answer the question and point out what matters most.',
    voice ? 'The coach is talking to you; your first two sentences are read aloud. Never say health details (pain, injuries, conditions, medications) aloud; say they are on screen instead.' : '',
    'Actions: use a propose_* tool. It only creates a proposal the coach must confirm on screen; say so ("Tap confirm to send it").',
    'Never do by voice or chat: charges, refunds, plan or price changes, deleting anything, changing nutrition targets, or messaging all clients without review. For those reply exactly: "I can’t do that by voice. Open [screen] to do it." naming the right screen (Payments, the client’s profile, the client’s Nutrition tab, or Messages).',
    'Never diagnose or assess pain, injuries or medical conditions; recommend a physical therapist, sports-medicine doctor or qualified professional. Never give diet prescriptions, supplement advice or medical nutrition advice; the coach sets targets. Use neutral words about food (no "good" or "bad" foods).',
    'No markdown, no emojis.',
  ].filter(Boolean).join('\n');
}

/** Claude path: tool use, at most MAX_STEPS rounds. */
async function askClaude(db, auth, question, c, source, provider) {
  const coach = await coachContext(db);
  const tools = [...toolDefinitions(), ...proposalToolDefinitions()];
  const messages = [{ role: 'user', content: question }];
  const cards = [], trace = new Set(), proposals = [], used = [], followups = [];
  let text = '', usage = { inputTokens: 0, outputTokens: 0, costMicros: 0 }, model = provider.model, briefing = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await provider.chat({ system: systemPrompt(coach, c.voice), messages, tools, maxTokens: 700 });
    model = r.model; for (const k of Object.keys(usage)) usage[k] += r.usage[k] || 0;
    const content = r.json.content || [];
    text = content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim() || text;
    const calls = content.filter(b => b.type === 'tool_use');
    if (!calls.length || r.json.stop_reason !== 'tool_use') break;
    messages.push({ role: 'assistant', content });
    const results = [];
    for (const call of calls) {
      used.push(call.name);
      let out;
      try {
        if (call.name.startsWith('propose_')) {
          const type = call.name.slice(8);
          const p = PROPOSE[type] ? await PROPOSE[type](db, auth, call.input || {}, { source }) : { error: 'Unknown action.' };
          if (p.proposal) { proposals.push(shapeProposal(p.proposal)); out = { proposal_created: true, summary: p.proposal.summary, note: 'Waiting for the coach to confirm on screen. Nothing has been done yet.' }; }
          else out = { error: p.error };
        } else if (TOOLS[call.name]) {
          const data = await TOOLS[call.name].run(db, call.input || {}, c);
          const card = RENDER[call.name](data, call.input || {});
          cards.push(card.html); (card.followups || []).forEach(f => followups.push(f));
          TOOLS[call.name].trace.forEach(t => trace.add(t));
          out = data;
        } else out = { error: 'Unknown tool.' };
      } catch (e) { out = { error: e.message }; }
      results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out).slice(0, 12000) });
    }
    messages.push({ role: 'user', content: results });
  }
  if (/briefing/i.test(question) && /\b(start|play|read)\b/i.test(question)) briefing = true;
  return {
    answerHtml: `${text ? text.split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join('') : ''}${cards.join('')}`,
    spokenText: speakable(text || (proposals[0] ? SPOKEN_PROPOSAL[proposals[0].type](proposals[0]) : 'Here’s what I found.')),
    trace: [...trace], followups: [...new Set(followups)].slice(0, 3), proposals, tools: used, usage, model, ...(briefing ? { action: 'briefing' } : {}),
  };
}

/**
 * @param {*} db tenant-scoped client for the coach's business
 * @param {{userId:string, businessId:string}} auth
 * @param {string} question
 * @param {{ voice?: boolean, tz?: string, now?: Date }} opts
 */
export async function ask(db, auth, question, { voice = false, tz = 'UTC', now = new Date() } = {}) {
  const q = String(question || '').trim().slice(0, 600);
  const c = { tz, now, voice };
  const source = voice ? 'voice' : 'typed';
  const provider = AI.active;
  let out, providerName = 'mock', fallback = null;
  if (provider.name === 'anthropic' && typeof provider.chat === 'function' && !(await AI.overBudget(db))) {
    try { out = await askClaude(db, auth, q, c, source, provider); providerName = 'anthropic'; }
    catch (e) { console.error('[assist] Claude failed, using offline answers:', e.message); fallback = 'error'; }
  }
  if (!out) out = await askMock(db, auth, q, c, source);
  const safety = checkText(q);
  if (safety.flagged) out.spokenText = speakable(out.spokenText);
  await db.aIUsage.create({ data: { kind: voice ? 'ask_voice' : 'ask', provider: fallback ? `mock-${fallback}` : providerName, model: out.model || (providerName === 'mock' ? 'mock-assist-1' : provider.model), inputTokens: out.usage?.inputTokens || 0, outputTokens: out.usage?.outputTokens || 0, costMicros: out.usage?.costMicros || 0 } }).catch(() => null);
  const { usage, model, ...rest } = out;
  void usage; void model;
  return { question: q, ...rest, safety: { flagged: safety.flagged } };
}

export { clientLink };
