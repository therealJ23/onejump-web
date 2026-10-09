// Actions Assist proposes (from Talk to Assist or Ask Assist). A proposal tool only writes an
// AssistProposal row; nothing happens until the coach taps Confirm on screen. Confirming runs the
// action through the normal service functions with the coach's own tenant-scoped access.
// Proposals expire after 10 minutes and can be confirmed once.
import { must, conflict, badRequest } from '../lib/errors.js';
import { audit } from '../db/system.js';
import { sendMessage } from '../core/messaging.js';
import { decideInsight } from '../core/actions.js';
import { missingCheckinClients } from '../core/checkinStatus.js';
import { sendCheckinReminders, checkinReminderTemplate } from '../core/reminders.js';
import { fillTemplate } from '../core/automationTemplates.js';
import { messageDraft } from '../ai/drafts.js';
import { draftText } from '../core/actions.js';
import { clientByName } from './tools.js';

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
    return { proposal: await save(db, auth, { type: 'send_message', summary: `Message to ${client.name}`, payload: { clientId: client.id, clientName: client.name, text: body, insightId, fromDraft }, source }) };
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
    return { proposal: await save(db, auth, { type: 'add_note', summary: `Note on ${client.name}’s profile`, payload: { clientId: client.id, clientName: client.name, text: text.trim().slice(0, 4000) }, source }) };
  },
  async book_appointment() {
    return { error: 'Scheduling isn’t set up in OneJump yet, so I can’t book sessions. Add it to your calendar for now.' };
  },
};

/** Proposal tool definitions for the Anthropic Messages API. */
export function proposalToolDefinitions() {
  const s = props => ({ type: 'object', properties: props, required: Object.keys(props).filter(k => ['client_name', 'name', 'text'].includes(k) && props[k].required !== false).map(k => k) });
  return [
    { name: 'propose_send_message', description: 'Propose sending one client a message. Leave text empty to use the draft Assist already wrote for them. Creates a proposal the coach must confirm; it sends nothing.', input_schema: { type: 'object', properties: { client_name: { type: 'string' }, text: { type: 'string', description: 'The coach’s exact words, if they dictated the message' } }, required: ['client_name'] } },
    { name: 'propose_create_lead', description: 'Propose adding a lead (a prospective client). Creates a proposal the coach must confirm.', input_schema: { type: 'object', properties: { name: { type: 'string' }, goal: { type: 'string' }, source: { type: 'string', enum: ['instagram_dm', 'booking_page', 'referral', 'walk_in', 'google', 'other'] }, note: { type: 'string' } }, required: ['name'] } },
    { name: 'propose_send_reminders', description: 'Propose sending the coach’s fixed check-in reminder to every client who hasn’t checked in this week. Shows the recipients; the coach must confirm.', input_schema: { type: 'object', properties: {} } },
    { name: 'propose_add_note', description: 'Propose adding a private note to a client’s profile. The coach must confirm.', input_schema: s({ client_name: { type: 'string' }, text: { type: 'string' } }) },
    { name: 'propose_book_appointment', description: 'Book a session with a client.', input_schema: { type: 'object', properties: { client_name: { type: 'string' }, when: { type: 'string' } }, required: ['client_name'] } },
  ];
}

// ---------------------------------------------------------------- confirm / cancel

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
};

export async function confirmProposal(db, auth, id, { text } = {}) {
  const p = must(await db.assistProposal.findFirst({ where: { id } }), 'That proposal');
  const now = new Date();
  if (p.status === 'pending' && p.expiresAt <= now) {
    await db.assistProposal.updateMany({ where: { id, status: 'pending' }, data: { status: 'expired' } });
    throw conflict('That expired after 10 minutes, so nothing was done. Ask again if you still want it.');
  }
  if (p.status !== 'pending') throw conflict(p.status === 'confirmed' ? 'That was already done.' : p.status === 'cancelled' ? 'That was cancelled.' : 'That expired, so nothing was done.');
  if (p.userId !== auth.userId) throw conflict('Only the coach who asked can confirm this.');
  // Claim it atomically so a double tap (or two tabs) can only run it once.
  const claimed = await db.assistProposal.updateMany({ where: { id, status: 'pending', expiresAt: { gt: now } }, data: { status: 'confirmed', decidedAt: now } });
  if (claimed.count !== 1) throw conflict('That was already done.');
  try {
    const result = await EXECUTE[p.type](db, auth, p.payload, { text: text == null ? null : String(text) });
    await db.assistProposal.update({ where: { id }, data: { result } });
    audit({ businessId: auth.businessId, actorUserId: auth.userId, action: `assist_${p.type}_confirmed`, target: p.id, meta: { source: p.source } });
    return { status: 'confirmed', ...result };
  } catch (e) {
    await db.assistProposal.update({ where: { id }, data: { status: 'pending', decidedAt: null } });
    throw e;
  }
}

export async function cancelProposal(db, auth, id) {
  const p = must(await db.assistProposal.findFirst({ where: { id } }), 'That proposal');
  if (p.status !== 'pending') throw conflict('That was already handled.');
  await db.assistProposal.update({ where: { id }, data: { status: 'cancelled', decidedAt: new Date() } });
  return { status: 'cancelled', message: 'Cancelled. Nothing was done.' };
}
