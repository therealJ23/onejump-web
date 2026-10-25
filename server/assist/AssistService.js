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
import { ACTION_READ_TOOLS, actionReadToolDefinitions, uiToolDefinitions, runUiTool } from './actions.js';
import { daySnapshot } from './snapshot.js';
import { sensitive } from './render.js';

const ALL_TOOLS = { ...TOOLS, ...MORE_TOOLS, ...ACTION_READ_TOOLS };
const UI_TOOLS = new Set(uiToolDefinitions().map(t => t.name));

/** OneJump's founder is named by first name only: never his full name. */
export const FOUNDER = 'Jansell';
const scrubFounder = s => (typeof s === 'string' ? s.replace(/\bJansell(?:\s+Hiraldo)?(?:\s+Zapata)\b|\bJansell\s+Hiraldo\b/g, FOUNDER) : s);

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
  if (intent.kind === 'mode') {
    const line = intent.mode === 'voice' ? (c.lang === 'es' ? 'Listo, te escucho.' : 'Sure, I’m listening.') : (c.lang === 'es' ? 'Listo, escríbeme cuando quieras.' : 'Got it, type away.');
    return { answerHtml: `<p>${esc(line)}</p>`, answerText: line, spokenText: line, mode: intent.mode, proposals: [], trace: [], followups: [] };
  }
  if (intent.kind === 'open') {
    const r = await runUiTool(db, 'open_screen', { screen: intent.screen, name: intent.name }, c);
    const line = r.out.error || (c.lang === 'es' ? 'Listo, ya está abierto.' : 'Done, it’s open.');
    return { answerHtml: `<p>${esc(line)}</p>`, answerText: line, spokenText: line, ...(r.ui?.navigate ? { navigate: r.ui.navigate } : {}), proposals: [], trace: [], followups: [] };
  }
  if (intent.kind === 'founder') {
    const line = c.lang === 'es' ? `OneJump lo fundó ${FOUNDER}.` : `OneJump was founded by ${FOUNDER}.`;
    return { answerHtml: `<p>${esc(line)}</p>`, answerText: line, spokenText: line, proposals: [], trace: [], followups: [] };
  }
  if (intent.kind === 'medical') {
    const k = intent.clients.length === 1 ? await TOOLS.client_checkin.run(db, { name: intent.clients[0].name }, c) : null;
    return { answerHtml: `<p>${esc(MEDICAL)}</p>${k?.checkin ? `<div><a class="btn sm" href="/app/checkins/${esc(k.checkin.id)}">Open ${esc(firstOf(k.name))}’s check-in</a></div>` : ''}`, spokenText: 'I can’t assess pain or injuries. I’ve put what you need on screen.', proposals: [], trace: [], followups: [] };
  }
  const es = c.lang === 'es';
  const line = es ? 'Uy, con eso no te puedo ayudar; lo mío es tu negocio y tus clientes. ¿Quieres que vea quién no ha hecho su check-in esta semana?' : 'Ha, I wish I could help with that one, but I stick to your business and your clients. Want me to check who hasn’t checked in this week?';
  return { answerHtml: `<p>${esc(line)}</p>`, answerText: line, spokenText: line, proposals: [], trace: [], followups: HELP_SUGGESTIONS.slice(0, 4) };
}

const SCREENS = 'Today (what needs the coach, Assist drafts to approve, the morning briefing, business charts), Clients (each client’s profile: Overview, Program, Food, Progress, Notes, Messages), Assist, Inbox (Messages and Check-ins), and More: Programs (and each program’s workouts), Exercise library, Nutrition, Payments, Leads, Automations, Settings (profile, language, voice, reminders) and Plan & billing.';

/**
 * The fixed part of Assist's instructions (cached by Claude for an hour): the same for every
 * question from this coach in this language. What changes per question is in extraPrompt().
 */
function systemPrompt(coach, { lang }) {
  const first = String(coach.name || '').split(' ')[0];
  return [
    `You are Assist, the copilot inside OneJump, coaching software for personal trainers and online coaches. You work alongside ${first || 'the coach'}, who runs ${coach.business}.`,
    lang === 'es' ? 'Always reply in Spanish (neutral Latin American Spanish, using "tú"), even if the data is in English. Client names stay as they are.' : 'Reply in English.',
    // Personality: a person, not a bot.
    `Talk like a real person on ${first}’s team: warm, relaxed, quick, a little playful when it fits. Use contractions and everyday words. Vary how you start and phrase things; never open two answers the same way. Use ${first}’s name once in a while, not every time. React like a human would ("Oh nice, Sarah crushed it this week."). Never say you are an AI or a language model, never say "Certainly!", "Great question!" or "As an assistant", and don’t over-apologize.`,
    'Be a sharp business partner: answer first, with the specific names and numbers, then say what you’d do next. Keep the conversation going naturally; use earlier messages for follow-ups like "what about her?" or "send that to him".',
    // Understanding people: speech recognition mishears, people mispronounce.
    'The coach often talks instead of typing, so their words come from speech recognition and can be misheard, mispronounced, cut off, or mix English and Spanish. Work out what they most likely meant from how it sounds and from their business: match names to the client list by sound ("Mia" or "Maya" → Maya, "Marco" → Marcus, "Jesica" → Jessica), exercises to the exercise library ("goblin squat" → Goblet Squat, "Romanian dead lift" → Romanian Deadlift), and odd words to coaching words ("check in" → check-in, "macros", "reps", "sets"). Don’t make the coach repeat themselves when one meaning is clearly most likely: go with it, and say the right name naturally in your answer so they hear what you understood. Only when two clients or things are about equally likely, ask which one in a few words. Ignore filler like "um", "uh", "like", "so", "este", "o sea".',
    // Scope: everything inside OneJump and the coach's business. Nothing outside it.
    'You can do anything the coach asks inside OneJump and their business: answer questions about their clients, training, programs, check-ins, nutrition coaching, messages, payments, leads, marketing, pricing and growing the business; explain how to use OneJump (app_guide); open screens (open_screen); and make changes with the propose_* tools: programs and workouts, the exercise library, clients, messages to one client or a group, check-ins, payment reminders, leads, automations, nutrition plans and settings. Screens in OneJump: ' + SCREENS,
    'Small talk is fine: a greeting, thanks or "how are you" gets a short, friendly human reply, then offer something useful. Anything outside OneJump and the coach’s business (trivia, news, sports, weather, homework, coding, general recipes, travel, personal or relationship advice, politics, other companies, other apps, or doing things outside OneJump like emailing someone else, booking flights or browsing the web) you don’t do: say so kindly in your own words, one short line, a little light-hearted, different every time, then steer back with one concrete offer about their business. Don’t explain rules or policies. Example of the tone only, never copy it: "Ha, you’d need a different kind of assistant for that one. Want me to see who still owes you this month?"',
    `About OneJump itself: it was founded by ${FOUNDER}. If anyone asks who founded, created, made, built or owns OneJump, say it was founded by ${FOUNDER}. Never give his last name or full name, even if asked; just say ${FOUNDER}.`,
    'Facts about the coach’s business (clients, workouts, check-ins, nutrition, messages, payments, leads, programs, exercises) must come from the snapshot below or from the tools. Speed matters: when the snapshot already answers the question, answer right away without calling tools. Otherwise call the tools you need straight away, all at once in parallel when you can, without writing anything before the tool calls. For anything detailed about one client, use client_details; before building or changing workouts, check exact exercise names with exercise_library (and program_details for an existing program). Never invent clients, numbers, dates or events. If the data doesn’t say, say so.',
    'Some tools also show the coach a card with the data, so don’t repeat long lists the card already shows; add the insight.',
    'Changes: use the propose_* tools. A proposal does nothing until the coach approves it: the app shows a card and, when the coach is talking, reads it back and asks for a yes or no. So after creating one, say just one short, natural line (like "Okay, here’s what I’ve got."), not instructions. Do what was asked in as few proposals as possible (one program with its workouts, not one proposal per workout). When asked to write a message or reply for a client, look at client_details or client_messages first so it sounds personal and like the coach, then propose it. If the coach says yes/send/go ahead to something you proposed earlier and it is still waiting, tell them it’s on screen to confirm.',
    'Moving around: when the coach asks to see, open, show or go to something in the app, call open_screen (they can keep talking to you while it’s open). When they ask to talk, use voice or switch to voice mode, call set_assist_mode with voice; when they ask to type or stop talking, call it with text. To play the morning briefing, call start_briefing.',
    'Nutrition plans: use propose_nutrition_plan with what the coach asked for. Assist drafts it from the client’s details with the calculator (never below resting needs) and the coach approves it. Never invent calorie numbers yourself.',
    'Money stays on its screen: you don’t charge clients, refund, or change packages and prices. For those, open the Payments screen for them (open_screen) and say they can do it there. Deleting a client’s whole account is also done on their profile by the owner.',
    'Never diagnose or assess pain, injuries or medical conditions; suggest a physical therapist, sports-medicine doctor or another qualified professional. No supplement advice or medical nutrition advice. Use neutral words about food (no "good" or "bad" foods).',
    'No markdown symbols (no **, #, or tables) and no emojis. Use short lines starting with "- " for lists.',
  ].filter(Boolean).join('\n');
}

/** The part that changes per question: today's date, voice or typing, and the day's snapshot. */
function extraPrompt({ voice, now, tz }, snapshot = '') {
  const today = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(now);
  return [
    `Today is ${today} (${tz}).`,
    voice ? 'The coach is talking with you out loud and everything you write is spoken, so answer in plain, natural speech, two or three short sentences at most, no lists. Start with the answer itself in a short first sentence. Never say health details (pain, injuries, conditions, medications) aloud; say they’re on screen instead.' : 'The coach is typing and reads your answer (it isn’t spoken). Keep answers tight: a few short sentences or a short list. Plain text only.',
    snapshot ? `Snapshot of the coach’s business right now (from OneJump, up to a minute old):\n${snapshot}` : '',
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

/**
 * Voice mode, streamed: turns the answer as it's written into sentences the phone can start
 * saying right away. It follows the same rules as speakable() (at most 3 sentences and about 330
 * characters, never a health detail), so what's said early always matches the final spokenText.
 */
class SpeechStream {
  constructor(emit) { this.emit = emit; this.on = true; this.newStep(); }
  newStep() { this.text = ''; this.done = 0; this.said = ''; }
  stop() { this.on = false; }
  push(piece, final = false) {
    if (!this.on) return;
    this.text += piece;
    const t = this.text.replace(/\s+/g, ' ').trimStart().replace(/(\d)\.(\d)/g, '$1․$2');
    // A sentence is complete once a space follows its full stop (or the answer has ended).
    const sentences = [];
    const re = final ? /[^.!?]+[.!?]+(?=\s|$)/g : /[^.!?]+[.!?]+(?=\s)/g;
    let m, end = 0;
    while ((m = re.exec(t))) { sentences.push(m[0]); end = re.lastIndex; }
    if (final && t.slice(end).trim()) sentences.push(t.slice(end));
    for (let i = this.done; i < sentences.length; i++) {
      const sentence = sentences[i].replace(/․/g, '.');
      if (!sentence.trim()) { this.done = i + 1; continue; }
      if (i >= 3 || (this.said && (this.said + sentence).length > 330) || sensitive(sentence)) { this.on = false; return; }
      this.said += sentence;
      this.done = i + 1;
      this.emit({ type: 'say', text: scrubFounder(sentence.trim()) });
    }
  }
}

/** What's left to say after the sentences already streamed (all of it if they don't match). */
export function speechRemainder(spokenText, streamedSay = '') {
  const n = x => String(x || '').replace(/\s+/g, ' ').trim();
  const full = n(spokenText), said = n(streamedSay);
  if (!said) return full;
  return full.startsWith(said) ? full.slice(said.length).trim() : full;
}

/** Claude path: tool use, at most MAX_STEPS rounds. emit(event) streams the answer when given. */
async function askClaude(db, auth, question, c, source, provider, history, { emit = null, snapshot = '' } = {}) {
  const coach = await coachContext(db);
  const tools = [...toolDefinitions(), ...moreToolDefinitions(), ...actionReadToolDefinitions(), ...proposalToolDefinitions(), ...uiToolDefinitions()];
  const messages = [...historyMessages(history), { role: 'user', content: question }];
  const assistModel = config.ai.assistModel || provider.model;
  const systemText = systemPrompt(coach, c);
  const systemExtra = extraPrompt(c, snapshot);
  const cards = [], trace = new Set(), proposals = [], used = [], followups = [];
  let text = '', usage = { inputTokens: 0, outputTokens: 0, costMicros: 0 }, model = provider.model, briefing = false;
  const ui = {};
  // Speech starts while the answer is still being written (voice mode, nothing health-related asked).
  const speech = emit && c.voice && !checkText(question).flagged ? new SpeechStream(emit) : null;
  for (let step = 0; step < MAX_STEPS; step++) {
    let streamedText = false;
    speech?.newStep();
    if (proposals.length) speech?.stop(); // the proposal is read back instead
    const onText = emit ? piece => { streamedText = true; emit({ type: 'delta', text: piece }); speech?.push(piece); } : null;
    const r = await provider.chat({ system: systemText, systemExtra, messages, tools, maxTokens: c.voice ? 700 : 1200, model: assistModel, cache: true, effort: c.voice ? 'low' : null, onText });
    model = r.model; for (const k of Object.keys(usage)) usage[k] += r.usage[k] || 0;
    const content = r.json.content || [];
    text = content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim() || text;
    const calls = content.filter(b => b.type === 'tool_use');
    if (!calls.length || r.json.stop_reason !== 'tool_use') { speech?.push('', true); break; }
    // This step was a lead-in to tool calls: the screen clears it and waits for the real answer.
    if (streamedText) emit({ type: 'reset' });
    messages.push({ role: 'assistant', content });
    // Every tool asked for in this step runs at the same time.
    const outs = await Promise.all(calls.map(async call => {
      try {
        if (UI_TOOLS.has(call.name)) {
          const r = await runUiTool(db, call.name, call.input || {}, c);
          return { out: r.out, ui: r.ui };
        }
        if (call.name.startsWith('propose_')) {
          const type = call.name.slice(8);
          const p = PROPOSE[type] ? await PROPOSE[type](db, auth, call.input || {}, { source, lang: c.lang }) : { error: 'Unknown action.' };
          if (p.proposal) return { proposal: p.proposal, out: { proposal_created: true, summary: p.proposal.summary, note: 'The coach will see it and approve it (tap or a spoken yes). Nothing has been done yet.' } };
          return { out: { error: p.error } };
        }
        if (ALL_TOOLS[call.name]) {
          const data = await ALL_TOOLS[call.name].run(db, call.input || {}, c);
          return { data, out: data };
        }
        return { out: { error: 'Unknown tool.' } };
      } catch (e) { return { out: { error: e.message } }; }
    }));
    const results = [];
    calls.forEach((call, i) => {
      const o = outs[i];
      used.push(call.name);
      if (o.ui?.navigate) ui.navigate = o.ui.navigate;
      if (o.ui?.mode) ui.mode = o.ui.mode;
      if (o.ui?.action === 'briefing') briefing = true;
      if (o.proposal) proposals.push(shapeProposal(o.proposal));
      if (o.data !== undefined && ALL_TOOLS[call.name]) {
        const card = RENDER[call.name]?.(o.data, call.input || {});
        if (card) { cards.push(card.html); (card.followups || []).forEach(f => followups.push(f)); }
        ALL_TOOLS[call.name].trace.forEach(t => trace.add(t));
      }
      results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(o.out).slice(0, 12000) });
    });
    messages.push({ role: 'user', content: results });
  }
  if (/briefing/i.test(question) && /\b(start|play|read)\b/i.test(question)) briefing = true;
  return {
    answerHtml: `${text ? textToHtml(text) : ''}${cards.join('')}`,
    answerText: text,
    spokenText: proposals.length ? readBack(proposals.at(-1), c.lang) : speakable(text || (c.lang === 'es' ? 'Esto es lo que encontré.' : 'Here’s what I found.'), c.voice ? 330 : 220, c.voice ? 3 : 2),
    streamedSay: speech && !proposals.length ? scrubFounder(speech.said.trim()) : '',
    trace: [...trace], followups: [...new Set(followups)].slice(0, 3), proposals, tools: used, usage, model, ...(briefing ? { action: 'briefing' } : {}),
    ...(ui.navigate ? { navigate: ui.navigate } : {}), ...(ui.mode ? { mode: ui.mode } : {}),
  };
}

/**
 * @param {*} db tenant-scoped client for the coach's business
 * @param {{userId:string, businessId:string}} auth
 * @param {string} question
 * @param {{ voice?: boolean, tz?: string, now?: Date }} opts
 */
export async function ask(db, auth, question, { voice = false, tz = 'UTC', now = new Date(), history = [], lang = 'en', pendingProposalId = null, emit = null, fast = false } = {}) {
  const q = String(question || '').trim().slice(0, 600);
  const c = { tz, now, voice, lang: lang === 'es' ? 'es' : 'en' };
  const provider = AI.active;
  const useClaude = provider.name === 'anthropic' && typeof provider.chat === 'function';
  // Everything the answer needs is looked up at the same time.
  const [decided, over, snapshot] = await Promise.all([
    // A short "yes" / "no" right after Assist read a proposal back approves or cancels it.
    decidePending(db, auth, pendingProposalId, q, { lang: c.lang, via: voice ? 'voice' : 'typed' }),
    useClaude ? AI.overBudget(db) : false,
    useClaude && (fast || voice) ? daySnapshot(db, auth.businessId, c).catch(() => '') : '',
  ]);
  if (decided) return { question: q, ...decided, ...(decided.decided?.navigate ? { navigate: decided.decided.navigate } : {}), safety: { flagged: false } };
  const source = voice ? 'voice' : 'typed';
  let out, providerName = 'mock', fallback = null;
  if (useClaude && !over) {
    try { out = await askClaude(db, auth, q, c, source, provider, history, { emit, snapshot }); providerName = 'anthropic'; }
    catch (e) { console.error('[assist] Claude failed, using offline answers:', e.message); fallback = 'error'; emit?.({ type: 'reset' }); }
  }
  if (!out) out = await askMock(db, auth, q, c, source);
  const safety = checkText(q);
  if (safety.flagged && !out.proposals?.length) out.spokenText = speakable(out.spokenText);
  db.aIUsage.create({ data: { kind: voice ? 'ask_voice' : 'ask', provider: fallback ? `mock-${fallback}` : providerName, model: out.model || (providerName === 'mock' ? 'mock-assist-1' : config.ai.assistModel || provider.model), inputTokens: out.usage?.inputTokens || 0, outputTokens: out.usage?.outputTokens || 0, costMicros: out.usage?.costMicros || 0 } }).catch(() => null);
  const { usage, model, ...rest } = out;
  void usage; void model;
  for (const k of ['answerHtml', 'answerText', 'spokenText']) rest[k] = scrubFounder(rest[k]);
  out.spokenText = scrubFounder(out.spokenText);
  // The proposal the next yes/no answers: the last one, if it can be approved out loud.
  const last = (out.proposals || []).at(-1);
  if (last && !out.spokenText) out.spokenText = readBack(last, c.lang);
  return { question: q, ...rest, spokenText: out.spokenText, streamedSay: rest.streamedSay || '', awaiting: last && voiceApprovable(last) ? last.id : null, safety: { flagged: safety.flagged } };
}

/**
 * Primes Claude's prompt cache for this coach (the tools and fixed instructions), so their next
 * question doesn't pay to read them. Called when the app opens or Assist is opened; at most once
 * every 50 minutes per workspace and language (the cache lasts an hour).
 */
const warmed = new Map();
export async function warmAssist(db, auth, { lang = 'en' } = {}) {
  const provider = AI.active;
  if (provider.name !== 'anthropic' || typeof provider.chat !== 'function') return { warmed: false };
  const key = `${auth.businessId}:${lang === 'es' ? 'es' : 'en'}`;
  if (Date.now() - (warmed.get(key) || 0) < 50 * 60e3) return { warmed: false, fresh: true };
  warmed.set(key, Date.now());
  if (warmed.size > 2000) warmed.delete(warmed.keys().next().value);
  try {
    if (await AI.overBudget(db)) return { warmed: false };
    const coach = await coachContext(db);
    const tools = [...toolDefinitions(), ...moreToolDefinitions(), ...actionReadToolDefinitions(), ...proposalToolDefinitions(), ...uiToolDefinitions()];
    const r = await provider.chat({ system: systemPrompt(coach, { lang }), systemExtra: 'Warming up: reply with one word.', messages: [{ role: 'user', content: 'Hi' }], tools, maxTokens: 1, model: config.ai.assistModel || provider.model, cache: true });
    db.aIUsage.create({ data: { kind: 'ask_warm', provider: 'anthropic', model: r.model, inputTokens: r.usage.inputTokens || 0, outputTokens: r.usage.outputTokens || 0, costMicros: r.usage.costMicros || 0 } }).catch(() => null);
    return { warmed: true };
  } catch (e) {
    warmed.delete(key);
    console.error('[assist] warm-up failed:', e.message);
    return { warmed: false };
  }
}

export { clientLink };
