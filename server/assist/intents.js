// The offline (mock) understanding of a coach's question. It maps plain-English questions and
// commands to the same tools and proposals the Claude provider uses, so typed and spoken
// questions give the same answers with or without an API key.
import { findClientsIn } from './tools.js';
import { checkText } from '../ai/safety.js';

const LEAD_SOURCES = [[/instagram|insta|\big\b|dm/i, 'instagram_dm'], [/refer|friend|client of mine/i, 'referral'], [/google|search/i, 'google'], [/booking page|website|site/i, 'booking_page'], [/walk[- ]?in|gym floor|in person/i, 'walk_in']];

/** Things Assist never does by voice (or in chat): money, plans and prices, deleting, nutrition targets, messaging everyone without review. */
const ASK = String.raw`^(?:hey assist,?\s+)?(?:please\s+|can you\s+|could you\s+|would you\s+|go ahead and\s+|i want to\s+|i'd like to\s+)*`;
const NEVER = [
  [new RegExp(ASK + String.raw`(charge|bill|invoice|refund|reimburse)\b`, 'i'), 'Payments'],
  [new RegExp(ASK + String.raw`(change|switch|upgrade|downgrade|cancel|pause)\b.{0,40}\b(plan|package|price|pricing|subscription|membership)`, 'i'), 'Payments'],
  [new RegExp(ASK + String.raw`(raise|lower|change|set)\b.{0,20}\b(price|prices|pricing|rate|rates)\b`, 'i'), 'Payments'],
  [new RegExp(ASK + String.raw`(delete|erase|remove|archive)\b`, 'i'), 'the client’s profile'],
  [new RegExp(ASK + String.raw`(set|change|lower|raise|update|increase|decrease|adjust|bump|drop)\b.{0,40}\b(calorie|calories|protein|carb|carbs|fat|macro|macros|nutrition)\b`, 'i'), 'the client’s Nutrition tab'],
  [new RegExp(ASK + String.raw`(message|text|email|tell|send)\b.{0,25}\b(all( my)? clients|every(one|body)|all of them|the whole)\b(?!.{0,40}\bhaven.?t\b)`, 'i'), 'Messages → Message a group'],
];

function leadFrom(rest) {
  const parts = rest.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  const name = (parts[0] || '').replace(/^(named|called|name is)\s+/i, '').replace(/\b(who|wants|is|from)\b.*$/i, '').trim();
  const goalPart = rest.match(/(?:wants? to|trying to|looking to|goal is to|hoping to|wants)\s+([^,.;]+)/i)?.[1] || parts.find(p => /stronger|lose|gain|build|run|get|fit/i.test(p)) || '';
  const src = LEAD_SOURCES.find(([re]) => re.test(rest))?.[1] || 'other';
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  return { name: name.split(/\s+/).slice(0, 3).map(cap).join(' '), goal: goalPart ? cap(goalPart.trim()) : '', source: src, note: rest };
}

/**
 * @returns {Promise<{kind:'tool', name:string, args:object} | {kind:'propose', type:string, args:object} | {kind:'refuse', screen:string} | {kind:'briefing'} | {kind:'medical', clients:object[]} | {kind:'help'}>}
 */
export async function route(db, question) {
  const q = String(question || '').trim().replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const s = q.toLowerCase();

  if (/\b(start|play|read)\b.{0,20}\bbriefing\b|^(morning )?briefing\b/.test(s)) return { kind: 'briefing' };

  // ----- commands that become proposals (checked first so "remind everyone" isn't refused)
  if (/\b(remind|nudge)\b.{0,30}\b(every(one|body)|all|them|clients)\b|\bsend\b.{0,20}\b(check-?in )?reminders?\b|\b(draft|write)\b.{0,20}\bmessage\b.{0,30}\bhaven.?t\b.{0,15}\bcheck/.test(s)) return { kind: 'propose', type: 'send_reminders', args: {} };
  let n = q.match(/\b(?:build|make|create|draft|write|put together|do|set up)\b.{0,30}\b(?:nutrition|meal|diet|eating)\s*plan\b.{0,12}?\bfor\s+([a-z][a-z' -]{0,40}?)(?=[,.!?]|\s+(?:with|that|who|to|and|so|she|he|they)\b|$)/i);
  if (n) return { kind: 'propose', type: 'nutrition_plan', args: { client_name: n[1], request: q } };
  n = q.match(/^(?:please\s+)?(?:reply|respond|answer)\s+(?:to\s+)?([a-z][a-z' -]{0,40}?)['’]s\s+check-?in\b/i);
  if (n) return { kind: 'propose', type: 'reply_checkin', args: { client_name: n[1] } };
  n = q.match(/^(?:please\s+)?(?:start|put|assign|move)\s+([a-z][a-z' -]{0,40}?)\s+(?:on|onto|to|in)\s+(?:the\s+)?(.+?)(?:\s+program)?[.!]*$/i);
  if (n && !/\b(calorie|protein|nutrition|plan|package|price)\b/i.test(n[2])) return { kind: 'propose', type: 'assign_program', args: { client_name: n[1], program_name: n[2] } };
  // ----- never by voice
  for (const [re, screen] of NEVER) if (re.test(q)) return { kind: 'refuse', screen };

  let m = q.match(/^(?:please\s+)?(?:add|create|make|save)\s+(?:a\s+)?(?:new\s+)?lead[\s:,-]+(.+)$/i);
  if (m) return { kind: 'propose', type: 'create_lead', args: leadFrom(m[1]) };
  m = q.match(/^(?:please\s+)?(?:add|make|leave|write|save)\s+(?:a\s+)?(?:private\s+)?note\s+(?:to|for|on|about)\s+(.+?)(?:'s profile)?\s*[:,-]\s*(.+)$/i);
  if (m) return { kind: 'propose', type: 'add_note', args: { client_name: m[1], text: m[2] } };
  m = q.match(/^(?:please\s+)?(?:reply|respond|write back|message|text|tell)\s+(?:to\s+)?([a-z][a-z' -]{0,40}?)\s*[:,-]\s*(.+)$/i);
  if (m) return { kind: 'propose', type: 'send_message', args: { client_name: m[1], text: m[2].replace(/^"|"$/g, '') } };
  m = q.match(/^(?:please\s+)?send\s+(?:the\s+)?(?:drafted\s+|draft\s+)?(?:message|draft|reply|note)\s+to\s+([a-z][a-z' -]{0,40}?)[.!?]*$/i) || q.match(/^(?:please\s+)?send\s+([a-z][a-z' -]{0,40}?)\s+(?:the|my|that|his|her|their)\s+(?:drafted\s+|draft\s+)?(?:message|draft|reply)\b/i) || q.match(/^(?:please\s+)?(?:approve|send)\s+([a-z][a-z' -]{0,40}?)(?:'s)?\s+draft\b/i);
  if (m) return { kind: 'propose', type: 'send_message', args: { client_name: m[1] } };
  if (/^(?:please\s+)?(book|schedule)\b/.test(s)) return { kind: 'propose', type: 'book_appointment', args: {} };

  const named = await findClientsIn(db, q);

  // ----- medical questions about a client: never assess, always refer
  if (checkText(q).flagged && /\?|\b(is|does|did|should|can|what|why|how)\b/.test(s) && !/check-?in/.test(s)) return { kind: 'medical', clients: named };

  // ----- one client
  if (named.length && /check-?in/.test(s)) return { kind: 'tool', name: 'client_checkin', args: { name: named.length === 1 ? named[0].name : q } };
  if (named.length && /\b(how|what|summar|doing|going|progress|update|tell me about|status)\b/.test(s)) return { kind: 'tool', name: 'client_summary', args: { name: named.length === 1 ? named[0].name : q } };

  // ----- business questions
  if (/(haven.?t|hasn.?t|not|didn.?t|missing|no|who).{0,25}check(ed|ing)?[\s-]?in|check[\s-]?ins?.{0,20}(missing|due|outstanding)/.test(s)) return { kind: 'tool', name: 'missing_checkins', args: {} };
  if (/\b(nutrition|protein|eating|food|calorie|macro|meals?)\b/.test(s)) return { kind: 'tool', name: 'nutrition_struggles', args: {} };
  if (/missed.{0,12}most|most.{0,12}missed|missed workouts|missing workouts|skipp(ed|ing)|who.{0,10}(isn.?t|not) training/.test(s)) return { kind: 'tool', name: 'missed_workouts', args: {} };
  if (/\b(risk|leav(e|ing)|churn|cancel|quit|drifting|lose|losing)\b/.test(s) && /client|who|which|anyone/.test(s)) return { kind: 'tool', name: 'at_risk_clients', args: {} };
  if (/\b(revenue|made|make|earn(ed)?|income|collect(ed)?|sales)\b/.test(s)) return { kind: 'tool', name: 'revenue', args: { month: /this month|so far|month to date|mtd/.test(s) ? 'this' : 'last' } };
  if (/\b(paid|pay|owe|owing|unpaid|failed|declin(ed|e)|overdue)\b/.test(s)) return { kind: 'tool', name: 'unpaid', args: {} };
  if (/how many|active clients|client count|number of clients/.test(s)) return { kind: 'tool', name: 'active_clients', args: {} };
  if (/summar|overview|how.{0,12}(business|doing|going|things)|this month|recap/.test(s)) return { kind: 'tool', name: 'business_summary', args: {} };
  if (/\btoday\b|focus|first|need(s)? me|to-?do|what should i/.test(s)) return { kind: 'tool', name: 'today_queue', args: {} };
  if (named.length) return { kind: 'tool', name: 'client_summary', args: { name: named.length === 1 ? named[0].name : q } };
  return { kind: 'help' };
}
