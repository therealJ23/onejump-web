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
import { MORE_TOOLS, moreToolDefinitions } from './moreTools.js';
import { config } from '../config.js';

const ALL_TOOLS = { ...TOOLS, ...MORE_TOOLS };

const MAX_STEPS = 6;
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

const SCREENS = 'Today (what needs the coach, Assist drafts to approve), Clients (each client’s profile: Overview, Program, Nutrition, Check-ins, Progress, Messages, Notes, Payments), Check-ins, Messages, Programs, Workout builder, Exercise library, Nutrition, Payments, Leads, Automations, Settings (profile, language, reminders) and Plan & billing.';

function systemPrompt(coach, { voice, lang, now, tz }) {
  const today = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(now);
  return [
    `You are Assist, the AI copilot inside OneJump, coaching software for personal trainers and online coaches. You are working with ${coach.name}, who runs ${coach.business}. Today is ${today} (${tz}).`,
    lang === 'es' ? 'Always reply in Spanish (neutral Latin American Spanish, using "tú"), even if the data is in English. Client names stay as they are.' : 'Reply in English.',
    'You are a sharp, warm business partner for a busy coach: answer directly, give the specific names and numbers, and say what you would do next. Have a real conversation: use earlier messages for follow-ups like "what about her?" or "send that to him".',
    'Facts about the coach’s business (clients, workouts, check-ins, nutrition, messages, payments, leads, programs) must come from the tools. Call as many tools as you need, in parallel when you can; for anything about one client, start with client_details. Never invent clients, numbers, dates or events. If the data doesn’t say, say so.',
    'You may also answer general coaching and business questions from your own expertise: program design, progressions, exercise technique and cues, client communication, retention, pricing strategy, marketing, and how to use OneJump. Screens in OneJump: ' + SCREENS,
    'Some tools also show the coach a card with the data, so don’t repeat long lists the card already shows; add the insight.',
    voice ? 'The coach is talking to you and your first two sentences are read aloud, so lead with the answer in plain speech. Never say health details (pain, injuries, conditions, medications) aloud; say they are on screen instead.' : 'Keep answers tight: a few short sentences or a short list. Plain text only.',
    'Actions: use a propose_* tool. It only creates a proposal the coach must confirm on screen; say so ("Tap confirm to send it"). When asked to write a message for a client, look at client_details or client_messages first so it sounds personal, then propose it.',
    'Never do by voice or chat: charges, refunds, plan or price changes, deleting anything, changing nutrition targets, or messaging all clients without review. For those reply exactly: "I can’t do that by voice. Open [screen] to do it." naming the right screen (Payments, the client’s profile, the client’s Nutrition tab, or Messages).',
    'Never diagnose or assess pain, injuries or medical conditions; recommend a physical therapist, sports-medicine doctor or qualified professional. Never give diet prescriptions, supplement advice or medical nutrition advice; the coach sets targets. Use neutral words about food (no "good" or "bad" foods).',
    'No markdown symbols (no **, #, or tables) and no emojis. Use short lines starting with "- " for lists.',
  ].filter(Boolean).join('\n');
}

/** Earlier turns of this conversation, as Messages API turns (user first, roles alternating). */
function historyMessages(history = []) {
  const out = [];
  for (const h of history.slice(-12)) {
    const role = h.role === 'assistant' ? 'assistant' : 'user', text = String(h.text || '').trim().slice(0, 1500);
    if (!text) continue;
    if (!out.length && role !== 'user') continue;
    if (out.length && out.at(-1).role === role) out.at(-1).content += `\n${text}`; else out.push({ role, content: text });
  }
  if (out.length && out.at(-1).role === 'user') out.pop(); // the new question is the next user turn
  return out;
}

/** Plain text (paragraphs and "- " lists) to safe HTML. */
function textToHtml(text) {
  return String(text).replace(/\*\*/g, '').split(/\n{2,}/).map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length && lines.every(l => /^[-•*]\s+/.test(l))) return `<ul class="answer-list">${lines.map(l => `<li>${esc(l.replace(/^[-•*]\s+/, ''))}</li>`).join('')}</ul>`;
    return lines.map(l => /^[-•*]\s+/.test(l) ? `<p>• ${esc(l.replace(/^[-•*]\s+/, ''))}</p>` : `<p>${esc(l)}</p>`).join('');
  }).join('');
}

/** Claude path: tool use, at most MAX_STEPS rounds. */
async function askClaude(db, auth, question, c, source, provider, history) {
  const coach = await coachContext(db);
  const tools = [...toolDefinitions(), ...moreToolDefinitions(), ...proposalToolDefinitions()];
  const messages = [...historyMessages(history), { role: 'user', content: question }];
  const assistModel = config.ai.assistModel || provider.model;
  const cards = [], trace = new Set(), proposals = [], used = [], followups = [];
  let text = '', usage = { inputTokens: 0, outputTokens: 0, costMicros: 0 }, model = provider.model, briefing = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await provider.chat({ system: systemPrompt(coach, c), messages, tools, maxTokens: 1200, model: assistModel });
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
        } else if (ALL_TOOLS[call.name]) {
          const data = await ALL_TOOLS[call.name].run(db, call.input || {}, c);
          const card = RENDER[call.name]?.(data, call.input || {});
          if (card) { cards.push(card.html); (card.followups || []).forEach(f => followups.push(f)); }
          ALL_TOOLS[call.name].trace.forEach(t => trace.add(t));
          out = data;
        } else out = { error: 'Unknown tool.' };
      } catch (e) { out = { error: e.message }; }
      results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out).slice(0, 12000) });
    }
    messages.push({ role: 'user', content: results });
  }
  if (/briefing/i.test(question) && /\b(start|play|read)\b/i.test(question)) briefing = true;
  return {
    answerHtml: `${text ? textToHtml(text) : ''}${cards.join('')}`,
    answerText: text,
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
export async function ask(db, auth, question, { voice = false, tz = 'UTC', now = new Date(), history = [], lang = 'en' } = {}) {
  const q = String(question || '').trim().slice(0, 600);
  const c = { tz, now, voice, lang: lang === 'es' ? 'es' : 'en' };
  const source = voice ? 'voice' : 'typed';
  const provider = AI.active;
  let out, providerName = 'mock', fallback = null;
  if (provider.name === 'anthropic' && typeof provider.chat === 'function' && !(await AI.overBudget(db))) {
    try { out = await askClaude(db, auth, q, c, source, provider, history); providerName = 'anthropic'; }
    catch (e) { console.error('[assist] Claude failed, using offline answers:', e.message); fallback = 'error'; }
  }
  if (!out) out = await askMock(db, auth, q, c, source);
  const safety = checkText(q);
  if (safety.flagged) out.spokenText = speakable(out.spokenText);
  await db.aIUsage.create({ data: { kind: voice ? 'ask_voice' : 'ask', provider: fallback ? `mock-${fallback}` : providerName, model: out.model || (providerName === 'mock' ? 'mock-assist-1' : config.ai.assistModel || provider.model), inputTokens: out.usage?.inputTokens || 0, outputTokens: out.usage?.outputTokens || 0, costMicros: out.usage?.costMicros || 0 } }).catch(() => null);
  const { usage, model, ...rest } = out;
  void usage; void model;
  return { question: q, ...rest, safety: { flagged: safety.flagged } };
}

export { clientLink };
