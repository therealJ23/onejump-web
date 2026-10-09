// Nightly nutrition work for one business: personal protein nudges (drafts, Pro), the fast
// weight-loss alert, and clean-up of photo analyses nobody added.
import { clientRows } from './insights.js';
import { ensureNudges } from './attention.js';
import { weeklyLossPct } from './calc.js';
import { weightSeries } from '../core/stats.js';
import { notify, clientEvent } from '../core/messaging.js';
import { StorageService } from '../storage/StorageService.js';
import { effectivePlan, isPro } from '../auth/middleware.js';

const firstOf = n => String(n || '').split(' ')[0];

/** An average loss above 1% of body weight per week over 2+ weeks alerts the coach (once a week). */
export async function fastLossCheck(db, client, { now = new Date() } = {}) {
  const series = (await weightSeries(db, client.id, 8)).filter(w => now - new Date(w.date) <= 35 * 864e5);
  const pct = weeklyLossPct(series);
  if (pct == null || pct <= 1) return null;
  const sourceId = `${client.id}:${new Date(series.at(-1).date).toISOString().slice(0, 10)}`;
  if (await db.nutritionFlag.findFirst({ where: { sourceType: 'fast_loss', sourceId } })) return null;
  const flag = await db.nutritionFlag.create({ data: { clientId: client.id, sourceType: 'fast_loss', sourceId, text: `Average loss of ${pct.toFixed(1)}% of body weight per week over ${Math.round((new Date(series.at(-1).date) - new Date(series[0].date)) / (7 * 864e5))} weeks (${series[0].value} → ${series.at(-1).value} lb).`, category: 'fast_loss', severity: 'normal' } });
  await notify(db, { kind: 'nutrition', title: `${firstOf(client.name)} is losing weight quickly`, body: `About ${pct.toFixed(1)}% of body weight a week. Worth a check-in.`, link: `/app/clients/${client.id}/nutrition` });
  await clientEvent(db, client.id, 'nutrition_flag', { category: 'fast_loss' });
  return flag;
}

export async function runNutrition(db, { tz = 'UTC', now = new Date() } = {}) {
  const b = await db.business.findFirst({ select: { plan: true, trialEndsAt: true } });
  const pro = isPro(effectivePlan(b));
  const rows = await clientRows(db, { tz, now });
  const nudges = pro ? await ensureNudges(db, rows, { tz, now }) : [];
  let fastLoss = 0;
  for (const r of rows) if (await fastLossCheck(db, r.client, { now })) fastLoss++;
  // Photo analyses that were never added: delete the photo after a day.
  const stale = await db.aIInsight.findMany({ where: { kind: 'meal_photo', status: 'pending', createdAt: { lt: new Date(now.getTime() - 864e5) } } });
  for (const i of stale) {
    if (i.draft?.photoKey) await StorageService.remove(i.draft.photoKey).catch(() => null);
    await db.aIInsight.update({ where: { id: i.id }, data: { status: 'expired' } });
  }
  return { nudges: nudges.length, fastLoss, expiredPhotos: stale.length };
}
