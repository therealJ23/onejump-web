// Turns AIService output into saved drafts (AIInsight rows, status "pending") that the
// coach approves, edits or dismisses. Approval is handled in server/core/actions.js.
import { AI } from './AIService.js';
import { checkinContext, messageContext, riskContext, workoutContext, adjustContext, progressContext, coachContext } from './context.js';

export const MINUTES = { checkin_summary: 8, message_draft: 4, risk: 10, workout: 20, adjustment: 12, automation: 3, lead_reply: 5 };
const startOfToday = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

export function saveInsight(db, { clientId = null, kind, source = null, sourceId = null, summary = null, draft = null, minutesSaved = 0, model, promptVersion, status = 'pending' }) {
  return db.aIInsight.create({ data: { clientId, kind, source, sourceId, summary, draft, minutesSaved, model, promptVersion, status } });
}

/** Weekly check-in summary + suggested actions + drafted reply. One per check-in (cached). */
export async function checkinSummary(db, checkIn, { force = false } = {}) {
  if (!force) {
    const existing = await db.aIInsight.findFirst({ where: { kind: 'checkin_summary', source: 'checkin', sourceId: checkIn.id }, orderBy: { createdAt: 'desc' } });
    if (existing) return existing;
  }
  const client = await db.client.findFirst({ where: { id: checkIn.clientId } });
  if (!client) return null;
  const r = await AI.analyzeCheckIn(await checkinContext(db, client, checkIn), { db });
  return saveInsight(db, { clientId: client.id, kind: 'checkin_summary', source: 'checkin', sourceId: checkIn.id, summary: r.data.summary, draft: r.data, minutesSaved: MINUTES.checkin_summary, model: r.model, promptVersion: r.promptVersion });
}

/** A message draft for the inbox, Today queue or an automation. */
export async function messageDraft(db, client, intent, { current = '', kind = 'message_draft', source = 'inbox', sourceId = null, extra = {}, minutes } = {}) {
  const r = await AI.draftMessage(await messageContext(db, client, intent, current, extra), { db });
  return saveInsight(db, { clientId: client.id, kind, source, sourceId, summary: null, draft: { text: r.data.text, intent, safety: r.data.safety, ...extra }, minutesSaved: minutes ?? MINUTES[kind] ?? 4, model: r.model, promptVersion: r.promptVersion });
}

/** Retention radar: plain-words explanation + suggested action + outreach draft. */
export async function riskInsight(db, client, risk, signals) {
  const r = await AI.analyzeClientRisk(await riskContext(db, client, risk, signals), { db });
  return saveInsight(db, { clientId: client.id, kind: 'risk', source: 'risk', sourceId: `${client.id}:${new Date().toISOString().slice(0, 10)}`, summary: r.data.explanation, draft: { ...r.data, reasons: risk.reasons, score: risk.score, level: risk.level }, minutesSaved: MINUTES.risk, model: r.model, promptVersion: r.promptVersion });
}

export async function workoutDraft(db, brief, client = null) {
  const r = await AI.generateWorkout(await workoutContext(db, brief, client), { db });
  return saveInsight(db, { clientId: client?.id || null, kind: 'workout', source: 'builder', summary: r.data.rationale, draft: { ...r.data, brief }, minutesSaved: MINUTES.workout, model: r.model, promptVersion: r.promptVersion });
}

/** Suggested program adjustments; cached for the day unless forced. */
export async function adjustmentsFor(db, client, { force = false } = {}) {
  if (!force) {
    const existing = await db.aIInsight.findFirst({ where: { clientId: client.id, kind: 'adjustment', createdAt: { gte: startOfToday() } }, orderBy: { createdAt: 'desc' } });
    if (existing) return existing;
  }
  const r = await AI.suggestAdjustments(await adjustContext(db, client), { db });
  return saveInsight(db, { clientId: client.id, kind: 'adjustment', source: 'program', summary: r.data.items[0]?.text, draft: r.data, minutesSaved: MINUTES.adjustment, model: r.model, promptVersion: r.promptVersion });
}

/** Progress trends (informational, not an action); cached for the day. */
export async function progressNote(db, client, { force = false } = {}) {
  if (!force) {
    const existing = await db.aIInsight.findFirst({ where: { clientId: client.id, kind: 'progress', createdAt: { gte: startOfToday() } }, orderBy: { createdAt: 'desc' } });
    if (existing) return existing;
  }
  const r = await AI.analyzeProgress(await progressContext(db, client), { db });
  return saveInsight(db, { clientId: client.id, kind: 'progress', source: 'profile', summary: r.data.items[0]?.title, draft: r.data, minutesSaved: 0, model: r.model, promptVersion: r.promptVersion, status: 'info' });
}

export async function leadReply(db, dm, { price = null, bookingLink = null } = {}) {
  const coach = await coachContext(db);
  const r = await AI.parseLead({ coach: { ...coach, price, bookingLink }, dm }, { db });
  return saveInsight(db, { kind: 'lead_reply', source: 'lead', summary: r.data.goal, draft: r.data, minutesSaved: MINUTES.lead_reply, model: r.model, promptVersion: r.promptVersion });
}
