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
import { decidePending, readBack, voiceApprovable } from './approvals.js';

const ALL_TOOLS = { ...TOOLS, ...MORE_TOOLS };

const MAX_STEPS = 6;
const firstOf = n => String(n || '').split(' ')[0];

const refusal = screen => ({ html: `<p>I can’t do that by voice. Open ${esc(screen)} to do it.</p>`, spoken: `I can’t do that by voice. Open ${screen.replace(' → ', ', then ')} to do it.` });
const MEDICAL = 'I can’t assess pain, injuries or medical conditions. Read what they said in their check-in and recommend a physical therapist, sports-medicine doctor or another qualified professional.';

async function propose(db, auth, type, args, source, lang) {
  const r = await PROPOSE[type](db, auth, args, { source, lang });
  if (r.error) return { html: `<p>${esc(r.error)}</p>`, spoken: r.error, proposals: [] };
  return { html: '', spoken: readBack(r.proposal, lang), proposals: [shapeProposal(r.proposal)] };
}

/** Offline path: same tools and proposals, chosen by intents.route(). */
async function askMock(db, auth, question, c, source) {
  const intent = await route(db, question);
  if (intent.kind === 'tool') {
    const data = await TOOLS[intent.name].run(db, intent.args, c);
    const r = RENDER[intent.name](data, intent.args);
    return { answerHtml: r.html, spokenText: r.spoken, trace: TOOLS[intent.name].trace, followups: r.followups || [], proposals: [], tools: [intent.name] };
  }
  if (intent.kind === 'propose') { const r = await propose(db, auth, intent.type, intent.args, source, c.lang); return { answerHtml: r.html, spokenText: r.spoken, proposals: r.proposals, trace: [], followups: [], tools: [`propose_${intent.type}`] }; }
  if (intent.kind === 'refuse') { const r = refusal(intent.screen); return { answerHtml: r.html, spokenText: r.spoken, proposals: [], trace: [], followups: [] }; }
  if (intent.kind === 'briefing') return { answerHtml: '<p>Starting your morning briefing.</p>', spokenText: '', action: 'briefing', proposals: [], trace: [], followups: [] };
  if (intent.kind === 'medical') {
    const k = intent.clients.length === 1 ? await TOOLS.client_checkin.run(db, { name: intent.clients[0].name }, c) : null;
    return { answerHtml: `<p>${esc(MEDICAL)}</p>${k?.checkin ? `<div><a class="btn sm" href="/app/checkins/${esc(k.checkin.id)}">Open ${esc(firstOf(k.name))}’s check-in</a></div>` : ''}`, spokenText: 'I can’t assess pain or injuries. I’ve put what you need on screen.', proposals: [], trace: [], followups: [] };
  }
  const es = c.lang === 'es';
  const line = es ? 'Uy, con eso no te puedo ayudar; lo mío es tu negocio y tus clientes. ¿Quieres que vea quién no ha hecho su check-in esta semana?' : 'Ha, I wish I could help with that one, but I stick to your business and your clients. Want me to check who hasn’t checked in this week?';
  return { answerHtml: `<p>${esc(line)}</p>`, answerText: line, spokenText: line, proposals: [], trace: [], followups: HELP_SUGGESTIONS.slice(0, 4) };
}

const SCREENS = 'Today (what needs the coach, Assist drafts to approve), Clients (each client’s profile: Overview, Program, Nutrition, Check-ins, Progress, Messages, Notes, Payments), Check-ins, Messages, Programs, Workout builder, Exercise library, Nutrition, Payments, Leads, Automations, Settings (profile, language, reminders) and Plan & billing.';

function systemPrompt(coach, { voice, lang, now, tz }) {
  const today = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(now);
  const first = String(coach.name || '').split(' ')[0];
  return [
    `You are Assist, the copilot inside OneJump, coaching software for personal trainers and online coaches. You work alongside ${coach.name}, who runs ${coach.business}. Today is ${today} (${tz}).`,
    lang === 'es' ? 'Always reply in Spanish (neutral Latin American Spanish, using "tú"), even if the data is in English. Client names stay as they are.' : 'Reply in English.',
    // Personality: a person, not a bot.
    `Talk like a real person on ${first}’s team: warm, relaxed, quick, a little playful when it fits. Use contractions and everyday words. Vary how you start and phrase things; never open two answers the same way. Use ${first}’s name once in a while, not every time. React like a human would ("Oh nice, Sarah crushed it this week."). Never say you are an AI or a language model, never say "Certainly!", "Great question!" or "As an assistant", and don’t over-apologize.`,
    'Be a sharp business partner: answer first, with the specific names and numbers, then say what you’d do next. Keep the conversation going naturally; use earlier messages for follow-ups like "what about her?" or "send that to him".',
    // Scope: the coach's business only, declined like a person would.
    'What you help with: the coach’s business and coaching. Their clients, training and programs, check-ins, nutrition coaching, messages, payments, leads, marketing, pricing, growing the business, and using OneJump. Screens in OneJump: ' + SCREENS,
    'Small talk is fine: a greeting, thanks or "how are you" gets a short, friendly human reply, then offer something useful. Anything else (trivia, news, sports, weather, homework, coding, general recipes, travel, personal or relationship advice, politics, other companies) you don’t help with: say so kindly in your own words, one short line, a little light-hearted, different every time, then steer back with one concrete offer about their business. Don’t explain rules or policies. Example of the tone only, never copy it: "Ha, you’d need a different kind of assistant for that one. Want me to see who still owes you this month?"',
    'Facts about the coach’s business (clients, workouts, check-ins, nutrition, messages, payments, leads, programs) must come from the tools. Call as many tools as you need, in parallel when you can; for anything about one client, start with client_details. Never invent clients, numbers, dates or events. If the data doesn’t say, say so.',
    'Some tools also show the coach a card with the data, so don’t repeat long lists the card already shows; add the insight.',
    voice ? 'The coach is talking with you out loud and your first few sentences are spoken, so lead with the answer in plain, natural speech, two or three short sentences at most. Never say health details (pain, injuries, conditions, medications) aloud; say they’re on screen instead.' : 'Keep answers tight: a few short sentences or a short list. Plain text only.',
    'Actions: use the propose_* tools (messages, check-in replies, notes, leads, reminders, starting a program, a nutrition plan). A proposal does nothing until the coach approves it: the app shows a card and, when the coach is talking, reads it back and asks for a yes or no. So after creating one, say just one short, natural line (like "Okay, here’s what I’ve got."), not instructions. When asked to write a message or reply for a client, look at client_details or client_messages first so it sounds personal and like the coach, then propose it. If the coach says yes/send/go ahead to something you proposed earlier and it is still waiting, tell them it’s on screen to confirm.',
    'Nutrition plans: use propose_nutrition_plan with what the coach asked for. Assist drafts it from the client’s details with the calculator (never below resting needs) and the coach approves it. Never invent calorie numbers yourself.',
    'Never do: charges, refunds, plan or price changes, deleting anything, or messaging all clients at once without review. For those, say kindly that it has to be done on the screen and name it (Payments, the client’s profile, or Messages).',
    'Never diagnose or assess pain, injuries or medical conditions; suggest a physical therapist, sports-medicine doctor or another qualified professional. No supplement advice or medical nutrition advice. Use neutral words about food (no "good" or "bad" foods).',
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
  const systemText = systemPrompt(coach, c);
  const cards = [], trace = new Set(), proposals = [], used = [], followups = [];
  let text = '', usage = { inputTokens: 0, outputTokens: 0, costMicros: 0 }, model = provider.model, briefing = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await provider.chat({ system: systemText, messages, tools, maxTokens: c.voice ? 700 : 1200, model: assistModel, cache: true });
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
          const p = PROPOSE[type] ? await PROPOSE[type](db, auth, call.input || {}, { source, lang: c.lang }) : { error: 'Unknown action.' };
          if (p.proposal) { proposals.push(shapeProposal(p.proposal)); out = { proposal_created: true, summary: p.proposal.summary, note: 'The coach will see it and approve it (tap or a spoken yes). Nothing has been done yet.' }; }
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
    spokenText: proposals.length ? readBack(proposals.at(-1), c.lang) : speakable(text || (c.lang === 'es' ? 'Esto es lo que encontré.' : 'Here’s what I found.'), c.voice ? 330 : 220, c.voice ? 3 : 2),
    trace: [...trace], followups: [...new Set(followups)].slice(0, 3), proposals, tools: used, usage, model, ...(briefing ? { action: 'briefing' } : {}),
  };
}

/**
 * @param {*} db tenant-scoped client for the coach's business
 * @param {{userId:string, businessId:string}} auth
 * @param {string} question
 * @param {{ voice?: boolean, tz?: string, now?: Date }} opts
 */
export async function ask(db, auth, question, { voice = false, tz = 'UTC', now = new Date(), history = [], lang = 'en', pendingProposalId = null } = {}) {
  const q = String(question || '').trim().slice(0, 600);
  const c = { tz, now, voice, lang: lang === 'es' ? 'es' : 'en' };
  // A short "yes" / "no" right after Assist read a proposal back approves or cancels it.
  const decided = await decidePending(db, auth, pendingProposalId, q, { lang: c.lang, via: voice ? 'voice' : 'typed' });
  if (decided) return { question: q, ...decided, safety: { flagged: false } };
  const source = voice ? 'voice' : 'typed';
  const provider = AI.active;
  let out, providerName = 'mock', fallback = null;
  if (provider.name === 'anthropic' && typeof provider.chat === 'function' && !(await AI.overBudget(db))) {
    try { out = await askClaude(db, auth, q, c, source, provider, history); providerName = 'anthropic'; }
    catch (e) { console.error('[assist] Claude failed, using offline answers:', e.message); fallback = 'error'; }
  }
  if (!out) out = await askMock(db, auth, q, c, source);
  const safety = checkText(q);
  if (safety.flagged && !out.proposals?.length) out.spokenText = speakable(out.spokenText);
  await db.aIUsage.create({ data: { kind: voice ? 'ask_voice' : 'ask', provider: fallback ? `mock-${fallback}` : providerName, model: out.model || (providerName === 'mock' ? 'mock-assist-1' : config.ai.assistModel || provider.model), inputTokens: out.usage?.inputTokens || 0, outputTokens: out.usage?.outputTokens || 0, costMicros: out.usage?.costMicros || 0 } }).catch(() => null);
  const { usage, model, ...rest } = out;
  void usage; void model;
  // The proposal the next yes/no answers: the last one, if it can be approved out loud.
  const last = (out.proposals || []).at(-1);
  if (last && !out.spokenText) out.spokenText = readBack(last, c.lang);
  return { question: q, ...rest, spokenText: out.spokenText, awaiting: last && voiceApprovable(last) ? last.id : null, safety: { flagged: safety.flagged } };
}

export { clientLink };
