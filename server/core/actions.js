// What happens when the coach approves, edits or dismisses an Assist draft.
// Nothing Assist wrote reaches a client until one of these runs on a coach's request.
import { sendMessage, notify } from './messaging.js';
import { conflict, must, badRequest } from '../lib/errors.js';
import { todayKey, addDays } from '../lib/time.js';
import { exerciseMap, tailorWorkoutForClient } from './training.js';

const SENDABLE = new Set(['message_draft', 'risk', 'automation', 'checkin_summary']);
export const draftText = i => (i.draft && (i.draft.text ?? i.draft.draft ?? i.draft.reply)) || '';

/**
 * @param {'approve'|'dismiss'} decision
 * @param {{ text?: string }} opts  text = the coach's edited version (if any)
 */
export async function decideInsight(db, auth, id, decision, { text } = {}) {
  const insight = must(await db.aIInsight.findFirst({ where: { id } }), 'That suggestion');
  if (insight.status !== 'pending') throw conflict('That suggestion was already handled.');
  const now = new Date();
  if (decision === 'dismiss') {
    const updated = await db.aIInsight.update({ where: { id }, data: { status: 'dismissed', decidedAt: now, decidedBy: auth.userId } });
    return { insight: updated };
  }
  if (!SENDABLE.has(insight.kind)) {
    const updated = await db.aIInsight.update({ where: { id }, data: { status: 'approved', decidedAt: now, decidedBy: auth.userId } });
    return { insight: updated };
  }
  if (!insight.clientId) throw badRequest('This draft has no client.');
  const original = draftText(insight);
  const finalText = (text ?? original).trim();
  if (!finalText) throw badRequest('The message is empty.');
  const edited = text != null && text.trim() !== original.trim();
  const message = await sendMessage(db, { clientId: insight.clientId, body: finalText, senderUserId: auth.userId, senderRole: 'COACH', aiInsightId: insight.id, aiEdited: edited });
  const updated = await db.aIInsight.update({
    where: { id },
    data: { status: edited ? 'edited' : 'approved', finalText, decidedAt: now, decidedBy: auth.userId, minutesSaved: edited ? Math.round(insight.minutesSaved * 0.7) : insight.minutesSaved },
  });
  if (insight.kind === 'checkin_summary' && insight.sourceId) {
    await db.checkIn.updateMany({ where: { id: insight.sourceId }, data: { status: 'reviewed', reviewedAt: now } });
  }
  return { insight: updated, message };
}

/** Undo a send within 5 minutes: removes the message and puts the draft back. */
export async function undoInsight(db, id) {
  const insight = must(await db.aIInsight.findFirst({ where: { id } }), 'That suggestion');
  if (!['approved', 'edited', 'dismissed'].includes(insight.status)) throw conflict('Nothing to undo.');
  if (insight.decidedAt && Date.now() - new Date(insight.decidedAt).getTime() > 5 * 60e3) throw conflict('It’s been more than 5 minutes, so this can’t be undone.');
  const msg = await db.message.findFirst({ where: { aiInsightId: id } });
  if (msg) {
    await db.message.delete({ where: { id: msg.id } });
    const t = await db.thread.findFirst({ where: { id: msg.threadId } });
    if (t && t.clientUnread > 0) await db.thread.update({ where: { id: t.id }, data: { clientUnread: { decrement: 1 } } });
  }
  if (insight.kind === 'checkin_summary' && insight.sourceId && insight.status !== 'dismissed') {
    await db.checkIn.updateMany({ where: { id: insight.sourceId }, data: { status: 'submitted', reviewedAt: null } });
  }
  return db.aIInsight.update({ where: { id }, data: { status: 'pending', decidedAt: null, decidedBy: null, finalText: null } });
}

const LOWER = new Set(['squat', 'hinge', 'lunge']);
const UPPER = new Set(['push', 'pull']);

/** Applies one structured suggestion (from a check-in summary or an adjustment) to the client's upcoming week. */
export async function applyOp(db, auth, client, op, { tz = 'UTC' } = {}) {
  if (!op || op.type === 'none') return { changed: 0, message: 'Nothing to change.' };
  if (op.type === 'add_note') {
    await db.note.create({ data: { clientId: client.id, authorUserId: auth.userId, body: op.text || 'Assist suggestion applied.' } });
    return { changed: 1, message: 'Note added to the profile.' };
  }
  if (op.type === 'add_tag') {
    const tags = Array.isArray(client.tags) ? client.tags : [];
    if (op.text && !tags.includes(op.text)) await db.client.update({ where: { id: client.id }, data: { tags: [...tags, op.text] } });
    return { changed: 1, message: `Added “${op.text}” to ${client.name.split(' ')[0]}’s habits.` };
  }
  if (op.type === 'fewer_days' || op.type === 'pause_exercise') {
    await db.note.create({ data: { clientId: client.id, authorUserId: auth.userId, body: op.type === 'fewer_days' ? 'Assist suggested fewer, shorter sessions. Change the program in the builder when ready.' : 'Paused a painful movement until assessed.' } });
    return { changed: 1, message: 'Noted. Make the change in the builder when you’re ready.' };
  }
  // Volume / load changes: tailor this week's workouts for this client only.
  const today = todayKey(tz);
  const upcoming = await db.workoutAssignment.findMany({ where: { clientId: client.id, status: 'scheduled', scheduledFor: { gte: today, lt: addDays(today, 7) } } });
  if (!upcoming.length) return { changed: 0, message: 'No workouts scheduled in the next 7 days.' };
  const ex = await exerciseMap(db);
  const byWorkout = new Map();
  for (const a of upcoming) {
    if (!byWorkout.has(a.workoutId)) byWorkout.set(a.workoutId, []);
    byWorkout.get(a.workoutId).push(a);
  }
  let changed = 0;
  for (const [workoutId, assigns] of byWorkout) {
    const w = await db.workout.findFirst({ where: { id: workoutId } });
    if (!w) continue;
    const copy = await tailorWorkoutForClient(db, w, client.id, blocks => {
      for (const b of blocks) for (const it of b.items) {
        const pat = ex.get(it.exerciseId)?.pattern;
        if (op.type === 'reduce_volume') {
          const hit = op.area === 'all' || (op.area === 'upper' ? UPPER.has(pat) : LOWER.has(pat));
          if (hit && it.sets.length > 1) { it.sets.pop(); changed++; }
        } else if (op.type === 'increase_load' && it.exerciseId === op.exerciseId) {
          it.sets = it.sets.map(s => { const n = parseFloat(s.load); if (isNaN(n)) return s; changed++; return { ...s, load: String(s.load).replace(String(n), String(n + (op.amount || 5))) }; });
        }
      }
      return blocks;
    });
    await db.workoutAssignment.updateMany({ where: { id: { in: assigns.map(a => a.id) } }, data: { workoutId: copy.id } });
  }
  return { changed, message: changed ? `Updated ${byWorkout.size === 1 ? 'this week’s workout' : `${byWorkout.size} workouts this week`}. ${client.name.split(' ')[0]} will see the change.` : 'Nothing matched in the upcoming workouts.' };
}

/** Applies action #index of a check-in summary or adjustment draft and records it. */
export async function applyInsightAction(db, auth, insightId, index, opts) {
  const insight = must(await db.aIInsight.findFirst({ where: { id: insightId } }), 'That suggestion');
  const list = insight.kind === 'adjustment' ? insight.draft.items : insight.draft.actions;
  const action = list?.[index];
  if (!action) throw badRequest('That suggestion has no such action.');
  const draft = { ...insight.draft, applied: [...(insight.draft.applied || [])], skipped: [...(insight.draft.skipped || [])] };
  if (draft.applied.includes(index)) throw conflict('Already applied.');
  const client = must(await db.client.findFirst({ where: { id: insight.clientId } }), 'Client');
  const result = await applyOp(db, auth, client, action.op, opts);
  draft.applied.push(index);
  const mins = action.minutes ?? (insight.kind === 'adjustment' ? 12 : 5);
  draft.appliedMinutes = (draft.appliedMinutes || 0) + mins;
  await db.aIInsight.update({ where: { id: insightId }, data: { draft, ...(insight.kind === 'adjustment' ? { status: 'approved', decidedAt: new Date(), decidedBy: auth.userId } : {}) } });
  return { ...result, minutes: mins };
}

export async function skipInsightAction(db, insightId, index) {
  const insight = must(await db.aIInsight.findFirst({ where: { id: insightId } }), 'That suggestion');
  const draft = { ...insight.draft, skipped: [...new Set([...(insight.draft.skipped || []), index])] };
  await db.aIInsight.update({ where: { id: insightId }, data: { draft } });
  return { ok: true };
}

export { notify };
