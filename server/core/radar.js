// Nightly retention radar: refresh stats, score every client, and draft outreach for
// clients whose risk is new or rising (Pro and trial workspaces).
import { refreshClientStats } from './stats.js';
import { computeSignals, scoreRisk, scorable } from './risk.js';
import { riskInsight } from '../ai/drafts.js';
import { notify, clientEvent } from './messaging.js';
import { effectivePlan } from '../auth/middleware.js';

const RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export async function scoreClient(db, client, { tz = 'UTC', now = new Date(), drafts = true } = {}) {
  const c = await refreshClientStats(db, client.id, { tz, now });
  if (!scorable(c, now)) {
    if (c.riskScore != null) await db.client.update({ where: { id: c.id }, data: { riskScore: null, riskLevel: null, riskReasons: null, riskUpdatedAt: now } });
    return null;
  }
  const signals = await computeSignals(db, c, { tz, now });
  const risk = scoreRisk(signals);
  const prev = c.riskLevel;
  await db.client.update({ where: { id: c.id }, data: { riskScore: risk.score, riskLevel: risk.level, riskReasons: risk.reasons, riskUpdatedAt: now } });
  const rising = risk.level !== 'LOW' && (prev == null || RANK[risk.level] > RANK[prev]);
  if (rising) await clientEvent(db, c.id, 'risk_change', { from: prev, to: risk.level, score: risk.score });

  const pending = await db.aIInsight.findFirst({ where: { clientId: c.id, kind: 'risk', status: 'pending' } });
  if (risk.level === 'LOW') {
    if (pending) await db.aIInsight.update({ where: { id: pending.id }, data: { status: 'expired' } });
    return { risk, signals, created: false };
  }
  if (!drafts) return { risk, signals, created: false };
  const recentlyHandled = await db.aIInsight.findFirst({ where: { clientId: c.id, kind: 'risk', status: { in: ['approved', 'edited', 'dismissed'] }, decidedAt: { gte: new Date(now.getTime() - 7 * 864e5) } } });
  let created = false;
  if (pending && rising) {
    await db.aIInsight.update({ where: { id: pending.id }, data: { status: 'expired' } });
    await riskInsight(db, c, risk, signals); created = true;
  } else if (!pending && (rising || !recentlyHandled)) {
    await riskInsight(db, c, risk, signals); created = true;
  }
  if (risk.level === 'HIGH' && rising) {
    await notify(db, { kind: 'risk', title: `${c.name} moved to High risk`, body: risk.reasons.slice(0, 2).join(' · '), link: `/app/clients/${c.id}`, dedupeHours: 24 });
  }
  return { risk, signals, created };
}

export async function runRadar(db, { tz = 'UTC', now = new Date() } = {}) {
  const b = await db.business.findFirst({ select: { plan: true, trialEndsAt: true } });
  const drafts = ['TRIAL', 'PRO', 'STUDIO'].includes(effectivePlan(b));
  const clients = await db.client.findMany({ select: { id: true } });
  let scored = 0, created = 0;
  for (const { id } of clients) {
    const r = await scoreClient(db, { id }, { tz, now, drafts });
    if (r) { scored++; if (r.created) created++; }
  }
  return { scored, created };
}
