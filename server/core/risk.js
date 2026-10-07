// Retention radar v1. Scores are calculated in code from logged data (deterministic and
// explainable); Assist only explains them and drafts the outreach.
// Weights from the build plan: missed workouts 7 each (max 35), missed check-ins 12 each
// (max 24), messaging drop ≥40% = 12, negative sentiment 15, plateau ≥3 weeks 10,
// failed payment 15, adherence <60% = 10; high ≥65, medium ≥40.
import { todayKey, addDays, DAY } from '../lib/time.js';
import { weightSeries } from './stats.js';

const plural = (n, w) => `${n} ${n === 1 ? w : w + 's'}`;

/** Pure scoring function. @returns {{score:number, level:'LOW'|'MEDIUM'|'HIGH', reasons:string[]}} */
export function scoreRisk(s) {
  const parts = [];
  if (s.missed14) parts.push([Math.min(35, s.missed14 * 7), `Missed ${plural(s.missed14, 'workout')} in the last 14 days`]);
  if (s.checkinMiss) parts.push([Math.min(24, s.checkinMiss * 12), s.checkinMiss > 1 ? `No check-in for ${s.checkinMiss} weeks` : 'Didn’t send last week’s check-in']);
  if (s.msgDrop != null && s.msgDrop >= 0.4) parts.push([12, `Messaging ${Math.round(s.msgDrop * 100)}% less than usual`]);
  else if (s.msgDrop != null && s.msgDrop >= 0.25) parts.push([6, `Messaging ${Math.round(s.msgDrop * 100)}% less than usual`]);
  if (s.sentiment === 'negative') parts.push([15, s.quote ? `Said “${s.quote}”` : 'Frustrated tone in recent messages']);
  if (s.plateau >= 3) parts.push([10, `Weight flat for ${s.plateau} weeks`]);
  else if (s.plateau === 2) parts.push([5, 'Progress slowing for 2 weeks']);
  if (s.payFailed) parts.push([15, 'Latest payment failed']);
  if (s.adherence != null && s.adherence < 60) parts.push([10, `Adherence ${s.adherence}% over 4 weeks`]);
  else if (s.adherence != null && s.adherence < 75) parts.push([5, `Adherence ${s.adherence}% over 4 weeks`]);
  const score = Math.min(96, parts.reduce((a, p) => a + p[0], 0));
  const level = score >= 65 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
  return { score, level, reasons: parts.sort((a, b) => b[0] - a[0]).map(p => p[1]) };
}

const NEGATIVE = [
  /not sure (this|it)('?s| is) working/i, /(isn'?t|is not|not) working for me/i, /frustrat\w*/i, /annoy\w*/i, /give up/i, /giving up/i, /\bquit(ting)?\b/i,
  /pointless/i, /waste of (time|money)/i, /disappoint\w*/i, /\bhate\b/i, /fed up/i, /what'?s the point/i, /can'?t keep up/i, /too expensive/i, /thinking (about|of) (stopping|cancel\w*|pausing)/i, /\bstuck\b/i,
];
/** Deterministic tone check on the client's recent words. */
export function sentimentOf(texts) {
  for (const t of texts) {
    for (const re of NEGATIVE) {
      const m = String(t).match(re);
      if (m) {
        const sentence = (String(t).match(/[^.!?]+[.!?]*/g) || [t]).find(x => re.test(x)) || t;
        const q = sentence.trim().replace(/[.!?]+$/, '');
        return { sentiment: 'negative', quote: q.length > 70 ? q.slice(0, 67) + '…' : q };
      }
    }
  }
  return { sentiment: 'neutral', quote: null };
}

/** Consecutive recent weeks within ±0.5 lb of the latest weight (minus one). */
export function plateauWeeks(weights) {
  if (weights.length < 3) return 0;
  const last = weights[weights.length - 1];
  let n = 0;
  for (let i = weights.length - 1; i >= 0 && Math.abs(weights[i] - last) <= 0.5; i--) n++;
  return Math.max(0, n - 1);
}

/** Gathers every risk signal for one client from logged data. */
export async function computeSignals(db, client, { tz = 'UTC', now = new Date() } = {}) {
  const today = todayKey(tz, now);
  const [assign14, checkins, msgs, payFailed, weights] = await Promise.all([
    db.workoutAssignment.findMany({ where: { clientId: client.id, scheduledFor: { gte: addDays(today, -14), lt: today } }, select: { status: true } }),
    db.checkIn.findMany({ where: { clientId: client.id, submittedAt: { gte: new Date(now.getTime() - 14 * DAY) } }, select: { submittedAt: true, text: true }, orderBy: { submittedAt: 'desc' } }),
    db.message.findMany({ where: { clientId: client.id, senderRole: 'CLIENT', createdAt: { gte: new Date(now.getTime() - 56 * DAY) } }, select: { createdAt: true, body: true }, orderBy: { createdAt: 'desc' } }),
    db.payment.count({ where: { clientId: client.id, status: 'failed', createdAt: { gte: new Date(now.getTime() - 35 * DAY) } } }),
    weightSeries(db, client.id, 10),
  ]);
  const missed14 = assign14.filter(a => a.status !== 'completed').length;
  const inWindow = (d, from, to) => d >= new Date(now.getTime() - to * DAY) && d < new Date(now.getTime() - from * DAY);
  let checkinMiss = 0;
  const tenure = (now - new Date(client.startedAt)) / DAY;
  if (tenure >= 7 && !checkins.some(k => inWindow(k.submittedAt, 0, 7))) checkinMiss++;
  if (tenure >= 14 && !checkins.some(k => inWindow(k.submittedAt, 7, 14))) checkinMiss++;
  const recent = msgs.filter(m => m.createdAt >= new Date(now.getTime() - 14 * DAY)).length;
  const baseline = msgs.filter(m => m.createdAt < new Date(now.getTime() - 14 * DAY)).length / 3;
  const msgDrop = baseline >= 1.5 ? Math.max(0, Math.round((1 - recent / baseline) * 100) / 100) : null;
  const words = [...msgs.slice(0, 4).map(m => m.body), ...checkins.slice(0, 1).map(k => k.text || '')];
  const { sentiment, quote } = sentimentOf(words);
  const losing = /\b(fat|lose|losing|loss)\b/i.test(`${client.goalType || ''} ${client.goal || ''}`);
  return {
    missed14, checkinMiss, msgDrop, sentiment, quote,
    plateau: losing ? plateauWeeks(weights.map(w => w.value)) : 0,
    payFailed: payFailed > 0,
    adherence: client.adherence,
    lastClientMessage: msgs[0]?.body || null,
  };
}

/** Clients the radar scores: active (or new for 10+ days). Paused/inactive clients aren't scored. */
export const scorable = (c, now = new Date()) => (c.status === 'ACTIVE' || c.status === 'NEW') && (now - new Date(c.startedAt)) / DAY >= 10;
