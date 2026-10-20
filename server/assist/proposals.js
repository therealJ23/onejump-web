// Actions Assist proposes (from Talk to Assist or Ask Assist). A proposal tool only writes an
// AssistProposal row; nothing happens until the coach approves it: a tap on Confirm, or (while
// talking to Assist) a spoken "yes" right after Assist has read the proposal back. Anything with
// health details is never read aloud, so it needs the on-screen tap. Confirming runs the action
// through the normal service functions with the coach's own tenant-scoped access.
// Proposals expire after 10 minutes and can be confirmed once. Money is never proposed; deleting
// (programs, workouts, exercises) is, because the coach confirms it. More actions: ./actions.js.
import { must, conflict, badRequest, HttpError } from '../lib/errors.js';
import { audit } from '../db/system.js';
import { sendMessage } from '../core/messaging.js';
import { decideInsight } from '../core/actions.js';
import { missingCheckinClients } from '../core/checkinStatus.js';
import { sendCheckinReminders, checkinReminderTemplate } from '../core/reminders.js';
import { fillTemplate } from '../core/automationTemplates.js';
import { messageDraft } from '../ai/drafts.js';
import { draftText } from '../core/actions.js';
import { clientByName } from './tools.js';
import { checkinSummary } from '../ai/drafts.js';
import { assignProgram } from '../core/training.js';
import { draftNutritionPlan, applyNutritionPlan, describeDraft } from '../nutrition/assistPlan.js';
import { checkText } from '../ai/safety.js';
import { checkNutritionLanguage } from '../nutrition/language.js';
import { ACTION_PROPOSE, ACTION_EXECUTE, ACTION_SCREEN, actionToolDefinitions } from './actions.js';

/** Can this text be read aloud (and so approved by voice)? Not if it touches health or worrying food talk. */
export const speakableText = t => !checkText(t).flagged && !checkNutritionLanguage(t).flagged;

export const PROPOSAL_TTL_MS = 10 * 60e3;
const firstOf = n => String(n || '').split(' ')[0];
const SENDABLE = ['risk', 'automation', 'message_draft', 'checkin_summary'];

async function save(db, auth, { type, summary, payload, source }) {
  return db.assistProposal.create({ data: { userId: auth.userId, type, summary: String(summary).slice(0, 2000), payload, source, expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS) } });
}
/** What the browser gets: enough to draw the confirmation card. */
export const shapeProposal = p => ({ id: p.id, type: p.type, summary: p.summary, payload: p.payload, status: p.status, expiresAt: p.expiresAt });

/** The "propose_*" tools. Each returns { proposal } or { error } (a sentence for the coach). */
export const PROPOSE = {
  /** A message to one client: the coach's own words, or the draft Assist already wrote. */
  async send_message(db, auth, { client_name, text = null }, { source }) {
    const { client, matches } = await clientByName(db, client_name);
    if (!client) return { error: matches.length > 1 ? `I found ${matches.length} clients called ${firstOf(client_name)}. Which one?` : `I couldn’t find ${client_name} in your clients.` };
    let insightId = null, body = text?.trim() || null, fromDraft = false;
    if (!body) {
      let ins = await db.aIInsight.findFirst({ where: { clientId: client.id, status: 'pending', kind: { in: SENDABLE } }, orderBy: { createdAt: 'desc' } });
      if (!ins) {
        const last = await db.message.findFirst({ where: { clientId: client.id }, orderBy: { createdAt: 'desc' }, select: { senderRole: true } });
        const c = await db.client.findFirst({ where: { id: client.id } });
        ins = await messageDraft(db, c, last?.senderRole === 'CLIENT' ? 'reply-last' : 'motivate', { source: 'assist' });
      }
      insightId = ins.id; body = draftText(ins); fromDraft = true;
    }
    if (!body) return { error: `There’s no draft for ${firstOf(client.name)} yet.` };
    return { proposal: await save(db, auth, { type: 'send_message', summary: `Message to ${client.name}`, payload: { clientId: client.id, clientName: client.name, text: body, insightId, fromDraft, voiceOk: speakableText(body) }, source }) };
  },
  async create_lead(db, auth, { name, goal = '', source: leadSource = 'other', note = '' }, { source }) {
    if (!name?.trim()) return { error: 'I need at least a name for the lead.' };
    return { proposal: await save(db, auth, { type: 'create_lead', summary: `New lead: ${name.trim()}`, payload: { name: name.trim().slice(0, 80), goal: String(goal || '').trim().slice(0, 160), source: leadSource, note: String(note || '').slice(0, 1000) }, source }) };
  },
  async send_reminders(db, auth, _args, { source }) {
    const clients = await missingCheckinClients(db);
    if (!clients.length) return { error: 'Everyone has already checked in this week, so there’s no one to remind.' };
    const { template } = await checkinReminderTemplate(db);
    return { proposal: await save(db, auth, { type: 'send_reminders', summary: `Check-in reminder to ${clients.length} client${clients.length === 1 ? '' : 's'}`, payload: { clientIds: clients.map(c => c.id), recipients: clients.map(c => c.name), template, example: fillTemplate(template, clients[0]) }, source }) };
  },
  async add_note(db, auth, { client_name, text }, { source }) {
    const { client, matches } = await clientByName(db, client_name);
    if (!client) return { error: matches.length > 1 ? `I found ${matches.length} clients called ${firstOf(client_name)}. Which one?` : `I couldn’t find ${client_name} in your clients.` };
    if (!text?.trim()) return { error: 'What should the note say?' };
    return { proposal: await save(db, auth, { type: 'add_note', summary: `Note on ${client.name}’s profile`, payload: { clientId: client.id, clientName: client.name, text: text.trim().slice(0, 4000), voiceOk: speakableText(text) }, source }) };
  },
  /** Send Assist's reply to a client's latest check-in (and mark it reviewed). */
  async reply_checkin(db, auth, { client_name, text = null }, { source }) {
    const { client, matches } = await clientByName(db, client_name);
    if (!client) return { error: matches.length > 1 ? `I found ${matches.length} clients called ${firstOf(client_name)}. Which one?` : `I couldn’t find ${client_name} in your clients.` };
    const k = await db.checkIn.findFirst({ where: { clientId: client.id, status: 'submitted' }, orderBy: { submittedAt: 'desc' } });
    if (!k) return { error: `${firstOf(client.name)} has no check-in waiting for a reply.` };
    const ins = await checkinSummary(db, k);
    const body = text?.trim() || ins?.draft?.reply || '';
    if (!body) return { error: `There’s no reply drafted for ${firstOf(client.name)}’s check-in yet. Open Check-ins to write one.` };
    const voiceOk = !k.flagged && speakableText(body) && speakableText(k.text || '');
    return { proposal: await save(db, auth, { type: 'reply_checkin', summary: `Reply to ${client.name}’s check-in`, payload: { clientId: client.id, clientName: client.name, checkinId: k.id, insightId: ins.id, text: body.slice(0, 3000), voiceOk }, source }) };
  },
  /** Start a client on one of the coach's programs. */
  async assign_program(db, auth, { client_name, program_name, start_date = null }, { source }) {
    const { client, matches } = await clientByName(db, client_name);
    if (!client) return { error: matches.length > 1 ? `I found ${matches.length} clients called ${firstOf(client_name)}. Which one?` : `I couldn’t find ${client_name} in your clients.` };
    const programs = await db.program.findMany({ select: { id: true, name: true, weeks: true, daysPerWeek: true } });
    const want = String(program_name || '').toLowerCase().trim();
    const hits = programs.filter(p => p.name.toLowerCase() === want).length ? programs.filter(p => p.name.toLowerCase() === want) : programs.filter(p => want && (p.name.toLowerCase().includes(want) || want.includes(p.name.toLowerCase())));
    if (hits.length !== 1) return { error: hits.length > 1 ? `More than one program matches “${program_name}”: ${hits.map(p => p.name).join(', ')}. Which one?` : `I couldn’t find a program called “${program_name}”. Your programs: ${programs.map(p => p.name).join(', ') || 'none yet'}.` };
    const prog = hits[0];
    const start = /^\d{4}-\d{2}-\d{2}$/.test(start_date || '') ? start_date : null;
    return { proposal: await save(db, auth, { type: 'assign_program', summary: `Start ${client.name} on ${prog.name}`, payload: { clientId: client.id, clientName: client.name, programId: prog.id, programName: prog.name, weeks: prog.weeks, daysPerWeek: prog.daysPerWeek, startDate: start, voiceOk: true }, source }) };
  },
  /** Assist drafts a starting nutrition plan from the client's details; saving it is the approval. */
  async nutrition_plan(db, auth, { client_name, request = '' }, { source, lang = 'en' }) {
    const { client, matches } = await clientByName(db, client_name);
    if (!client) return { error: matches.length > 1 ? `I found ${matches.length} clients called ${firstOf(client_name)}. Which one?` : `I couldn’t find ${client_name} in your clients.` };
    const full = await db.client.findFirst({ where: { id: client.id } });
    const r = await draftNutritionPlan(db, full, { request, lang });
    const voiceOk = !r.draft.needsProfessional;
    return { proposal: await save(db, auth, { type: 'nutrition_plan', summary: `Nutrition plan for ${client.name}`, payload: { clientId: client.id, clientName: client.name, draft: r.draft, notes: r.notes, scopeReminder: r.scopeReminder, estimate: r.estimate, line: describeDraft(r.draft, firstOf(client.name), lang), voiceOk }, source }) };
  },
  async book_appointment() {
    return { error: 'Scheduling isn’t set up in OneJump yet, so I can’t book sessions. Add it to your calendar for now.' };
  },
  ...ACTION_PROPOSE,
};

/** Proposal tool definitions for the Anthropic Messages API. */
export function proposalToolDefinitions() {
  const s = props => ({ type: 'object', properties: props, required: Object.keys(props).filter(k => ['client_name', 'name', 'text'].includes(k) && props[k].required !== false).map(k => k) });
  return [
    { name: 'propose_send_message', description: 'Propose sending one client a message. Leave text empty to use the draft Assist already wrote for them. Creates a proposal the coach must confirm; it sends nothing.', input_schema: { type: 'object', properties: { client_name: { type: 'string' }, text: { type: 'string', description: 'The coach’s exact words, if they dictated the message' } }, required: ['client_name'] } },
    { name: 'propose_create_lead', description: 'Propose adding a lead (a prospective client). Creates a proposal the coach must confirm.', input_schema: { type: 'object', properties: { name: { type: 'string' }, goal: { type: 'string' }, source: { type: 'string', enum: ['instagram_dm', 'booking_page', 'referral', 'walk_in', 'google', 'other'] }, note: { type: 'string' } }, required: ['name'] } },
    { name: 'propose_send_reminders', description: 'Propose sending the coach’s fixed check-in reminder to every client who hasn’t checked in this week. Shows the recipients; the coach must confirm.', input_schema: { type: 'object', properties: {} } },
    { name: 'propose_add_note', description: 'Propose adding a private note to a client’s profile. The coach must confirm.', input_schema: s({ client_name: { type: 'string' }, text: { type: 'string' } }) },
    { name: 'propose_reply_checkin', description: 'Propose sending the reply to a client’s latest check-in (Assist’s draft, or the coach’s own words) and marking it reviewed. The coach must approve.', input_schema: { type: 'object', properties: { client_name: { type: 'string' }, text: { type: 'string', description: 'The coach’s exact words, if they dictated the reply. Leave empty to use Assist’s draft.' } }, required: ['client_name'] } },
    { name: 'propose_assign_program', description: 'Propose starting a client on one of the coach’s programs (call the programs tool first if unsure of the name). The coach must approve.', input_schema: { type: 'object', properties: { client_name: { type: 'string' }, program_name: { type: 'string' }, start_date: { type: 'string', description: 'YYYY-MM-DD, optional; default is the next Monday' } }, required: ['client_name', 'program_name'] } },
    { name: 'propose_nutrition_plan', description: 'Have Assist draft a starting nutrition plan for one client (targets from the calculator, never below resting needs, daily habits, an optional meal plan) using the client’s details. Pass what the coach asked for. The coach must approve before the client sees it.', input_schema: { type: 'object', properties: { client_name: { type: 'string' }, request: { type: 'string', description: 'What the coach asked for: goal, preferences, foods, meal plan or not, number of days' } }, required: ['client_name'] } },
    { name: 'propose_book_appointment', description: 'Book a session with a client.', input_schema: { type: 'object', properties: { client_name: { type: 'string' }, when: { type: 'string' } }, required: ['client_name'] } },
    ...actionToolDefinitions(),
  ];
}

// ---------------------------------------------------------------- confirm / cancel

const SCREEN = { send_message: 'Messages', create_lead: 'Leads', send_reminders: 'Check-ins', add_note: 'the client’s profile', reply_checkin: 'Check-ins', assign_program: 'the client’s Program tab', nutrition_plan: 'the client’s Nutrition tab', ...ACTION_SCREEN };

const EXECUTE = {
  async send_message(db, auth, p, { text }) {
    const body = (text ?? p.text ?? '').trim();
    if (!body) throw badRequest('The message is empty.');
    const client = must(await db.client.findFirst({ where: { id: p.clientId } }), 'That client');
    if (p.insightId) {
      const ins = await db.aIInsight.findFirst({ where: { id: p.insightId, clientId: client.id } });
      if (ins?.status === 'pending') { const r = await decideInsight(db, auth, ins.id, 'approve', { text: body }); return { messageId: r.message?.id, message: `Sent to ${firstOf(client.name)}.` }; }
    }
    const m = await sendMessage(db, { clientId: client.id, body, senderUserId: auth.userId, senderRole: 'COACH' });
    return { messageId: m.id, message: `Sent to ${firstOf(client.name)}.` };
  },
  async create_lead(db, _auth, p, { text }) {
    const lead = await db.lead.create({ data: { name: p.name, goal: p.goal || null, source: p.source || 'other', firstMessage: text || p.note || null, stage: 'new', nextFollowUpAt: new Date(Date.now() + 3 * 864e5) } });
    return { leadId: lead.id, message: `${p.name} is in your new leads.` };
  },
  async send_reminders(db, auth, p, { text }) {
    // Only the clients the coach saw on the card, and only if they still haven't checked in.
    const still = new Set((await missingCheckinClients(db)).map(c => c.id));
    const clients = await db.client.findMany({ where: { id: { in: p.clientIds.filter(id => still.has(id)) } } });
    const sent = await sendCheckinReminders(db, auth, clients, text || p.template, 'assist');
    return { sent, message: `Sent ${sent} reminder${sent === 1 ? '' : 's'}.` };
  },
  async add_note(db, auth, p, { text }) {
    const client = must(await db.client.findFirst({ where: { id: p.clientId } }), 'That client');
    const note = await db.note.create({ data: { clientId: client.id, authorUserId: auth.userId, body: (text ?? p.text).trim().slice(0, 4000) } });
    return { noteId: note.id, message: `Note saved to ${firstOf(client.name)}’s profile.` };
  },
  async reply_checkin(db, auth, p, { text }) {
    const body = (text ?? p.text ?? '').trim();
    if (!body) throw badRequest('The reply is empty.');
    const k = must(await db.checkIn.findFirst({ where: { id: p.checkinId } }), 'That check-in');
    const ins = must(await db.aIInsight.findFirst({ where: { id: p.insightId, sourceId: k.id, kind: 'checkin_summary' } }), 'That draft');
    await decideInsight(db, auth, ins.id, 'approve', { text: body });
    await db.checkIn.update({ where: { id: k.id }, data: { status: 'reviewed', reviewedAt: new Date() } });
    return { message: `Replied to ${firstOf(p.clientName)}’s check-in.` };
  },
  async assign_program(db, _auth, p) {
    const client = must(await db.client.findFirst({ where: { id: p.clientId } }), 'That client');
    must(await db.program.findFirst({ where: { id: p.programId } }), 'That program');
    const tz = (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';
    const r = await assignProgram(db, { clientId: client.id, programId: p.programId, start: p.startDate ? new Date(p.startDate) : null, tz });
    if (client.status === 'NEW' && client.userId) await db.client.update({ where: { id: client.id }, data: { status: 'ACTIVE' } });
    return { scheduled: r?.scheduled ?? 0, message: `${firstOf(client.name)} is on ${p.programName}.` };
  },
  async nutrition_plan(db, auth, p) {
    const client = must(await db.client.findFirst({ where: { id: p.clientId } }), 'That client');
    const r = await applyNutritionPlan(db, auth, client, p.draft, { pro: true });
    return { message: r.message };
  },
  ...ACTION_EXECUTE,
};

export async function confirmProposal(db, auth, id, { text, via = 'tap' } = {}) {
  const p = must(await db.assistProposal.findFirst({ where: { id } }), 'That proposal');
  const now = new Date();
  if (p.status === 'pending' && p.expiresAt <= now) {
    await db.assistProposal.updateMany({ where: { id, status: 'pending' }, data: { status: 'expired' } });
    throw conflict('That expired after 10 minutes, so nothing was done. Ask again if you still want it.');
  }
  if (p.status !== 'pending') throw conflict(p.status === 'confirmed' ? 'That was already done.' : p.status === 'cancelled' ? 'That was cancelled.' : 'That expired, so nothing was done.');
  if (p.userId !== auth.userId) throw conflict('Only the coach who asked can confirm this.');
  if (text != null && !String(text).trim() && ['send_message', 'add_note', 'reply_checkin', 'message_clients'].includes(p.type)) throw badRequest(p.type === 'add_note' ? 'The note is empty.' : 'The message is empty.');
  if (!EXECUTE[p.type]) throw conflict('That can’t be done from here.');
  if (via === 'voice' && p.payload?.voiceOk === false) throw conflict('This one has health details, so it needs a tap on Confirm after you read it.');
  // Claim it atomically so a double tap (or two tabs) can only run it once.
  const claimed = await db.assistProposal.updateMany({ where: { id, status: 'pending', expiresAt: { gt: now } }, data: { status: 'confirmed', decidedAt: now } });
  if (claimed.count !== 1) throw conflict('That was already done.');
  try {
    const result = await EXECUTE[p.type](db, auth, p.payload, { text: text == null ? null : String(text) });
    await db.assistProposal.update({ where: { id }, data: { result } });
    audit({ businessId: auth.businessId, actorUserId: auth.userId, action: `assist_${p.type}_confirmed`, target: p.id, meta: { source: p.source, via } });
    return { status: 'confirmed', ...result };
  } catch (e) {
    // Part of it may already have happened (e.g. some reminders sent), so it is never re-armed:
    // a second Confirm can't send anything twice. The coach finishes it on the normal screen.
    await db.assistProposal.update({ where: { id }, data: { status: 'failed', result: { error: String(e.message || e).slice(0, 300) } } });
    audit({ businessId: auth.businessId, actorUserId: auth.userId, action: `assist_${p.type}_failed`, target: p.id, meta: { source: p.source } });
    throw new HttpError(e.status && e.status < 500 ? e.status : 500, `That didn’t finish: ${e.message || 'something went wrong'}. Nothing will be repeated; open ${SCREEN[p.type] || 'the screen'} to check and finish it.`, { code: 'proposal_failed' });
  }
}

export async function cancelProposal(db, auth, id) {
  const p = must(await db.assistProposal.findFirst({ where: { id } }), 'That proposal');
  if (p.userId !== auth.userId) throw conflict('Only the coach who asked can cancel this.');
  const done = await db.assistProposal.updateMany({ where: { id, status: 'pending' }, data: { status: 'cancelled', decidedAt: new Date() } });
  if (done.count !== 1) throw conflict(p.status === 'confirmed' ? 'That was already done.' : 'That was already handled.');
  return { status: 'cancelled', message: 'Cancelled. Nothing was done.' };
}
