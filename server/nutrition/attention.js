// Assist on nutrition (Pro): "needs your attention" items, personal protein nudges (drafts the
// coach approves), weekly summaries, and photo analysis. Assist never sets targets or sends
// anything on its own.
import { AI } from '../ai/AIService.js';
import { coachContext, clientContext } from '../ai/context.js';
import { saveInsight } from '../ai/drafts.js';
import { foods, nutrientsFor } from './foods.js';
import { planFor, weekStats, habitsWithStatus } from './plans.js';
import { missedProteinMostDays, stoppedLogging, clientRows } from './insights.js';
import { CATEGORY_LABEL } from './flags.js';
import { effectivePlan, isPro } from '../auth/middleware.js';
import { weekStart, todayKey, dateToYmd } from '../lib/time.js';

const firstOf = n => String(n || '').split(' ')[0];
export const NUDGE_MINUTES = 4;
const startOfToday = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

async function proPlan(db) { return isPro(effectivePlan(await db.business.findFirst({ select: { plan: true, trialEndsAt: true } }))); }

// Two page loads at once must not draft the same nudge twice (then "Send all" would send both):
// concurrent callers share one in-flight draft, and it checks again before saving.
const inflight = new Map();
const findNudge = (db, sourceId) => db.aIInsight.findFirst({ where: { kind: 'nutrition_nudge', sourceId }, orderBy: { createdAt: 'desc' } });
async function nudgeFor(db, r, sourceId) {
  const existing = await findNudge(db, sourceId);
  if (existing) return existing;
  if (inflight.has(sourceId)) return inflight.get(sourceId);
  const p = (async () => {
    const ctx = { coach: await coachContext(db), client: await clientContext(db, r.client), week: { daysLogged: r.week.daysLogged, proteinHitDays: r.week.proteinHitDays }, hideNumbers: r.plan.hideNumbers };
    const d = await AI.draftNutritionNudge(ctx, { db });
    const again = await findNudge(db, sourceId);
    if (again) return again;
    return saveInsight(db, { clientId: r.client.id, kind: 'nutrition_nudge', source: 'nutrition', sourceId, summary: `${firstOf(r.client.name)} reached the protein target on ${r.week.proteinHitDays} of ${r.week.daysLogged} logged days.`, draft: { text: d.data.text, hitDays: r.week.proteinHitDays, loggedDays: r.week.daysLogged }, minutesSaved: NUDGE_MINUTES, model: d.model, promptVersion: d.promptVersion });
  })().finally(() => inflight.delete(sourceId));
  inflight.set(sourceId, p);
  return p;
}

/** One pending personal draft per client per week for clients missing protein most days. */
export async function ensureNudges(db, rows, { tz = 'UTC', now = new Date() } = {}) {
  const week = dateToYmd(weekStart(todayKey(tz, now)));
  const out = [];
  for (const r of rows.filter(r => missedProteinMostDays(r.plan, r.week))) {
    out.push({ insight: await nudgeFor(db, r, `${r.client.id}:${week}`), client: r.client, week: r.week });
  }
  return out;
}

/** "Needs your attention" on the Nutrition page. */
export async function attentionItems(db, data, { tz = 'UTC', now = new Date() } = {}) {
  const pro = await proPlan(db);
  const rows = await clientRows(db, { tz, now });
  const items = [];
  const urgent = data.flags.filter(f => f.severity === 'urgent');
  for (const f of urgent) items.push({ kind: 'flag', sev: 'crit', clientId: f.clientId, name: f.name, title: `Please check on ${firstOf(f.name)} today`, text: 'Something they wrote suggests they may be at risk. Only you can see this.', flagId: f.id });
  if (pro) {
    const nudges = await ensureNudges(db, rows, { tz, now });
    const pending = nudges.filter(n => n.insight.status === 'pending');
    if (nudges.length) items.push({ kind: 'protein', sev: 'assist', title: `${nudges.length} client${nudges.length === 1 ? '' : 's'} missed their protein target most days`, text: 'A personal reminder is drafted for each. Nothing is sent until you approve it.', drafts: pending.map(n => ({ insightId: n.insight.id, clientId: n.client.id, name: n.client.name, text: n.insight.draft.text, detail: `hit ${n.week.proteinHitDays} of ${n.week.daysLogged} logged days` })), done: nudges.length - pending.length });
  } else {
    const misses = rows.filter(r => missedProteinMostDays(r.plan, r.week));
    if (misses.length) items.push({ kind: 'protein', sev: 'warn', title: `${misses.length} client${misses.length === 1 ? '' : 's'} missed their protein target most days`, text: misses.map(r => firstOf(r.client.name)).join(', '), drafts: [], upgrade: true });
  }
  for (const r of rows.filter(r => r.lowTarget.low && !r.lowTarget.confirmed)) items.push({ kind: 'low_target', sev: 'warn', clientId: r.client.id, name: r.client.name, title: `${firstOf(r.client.name)}’s calorie target is below resting needs`, text: `${r.plan.calories.toLocaleString('en-US')} kcal vs about ${(r.lowTarget.rmr ?? 1200).toLocaleString('en-US')} kcal estimated resting needs. Review it on their Nutrition tab.` });
  for (const f of data.flags.filter(f => f.severity !== 'urgent')) items.push({ kind: 'flag', sev: 'warn', clientId: f.clientId, name: f.name, title: `Private flag: ${firstOf(f.name)}`, text: `${CATEGORY_LABEL[f.category] || 'Language'} in a ${f.sourceType.replace('_', ' ')}. Only you can see this.`, flagId: f.id, quote: f.text.slice(0, 180) });
  for (const r of rows) if (r.plan.id && await stoppedLogging(db, r.client.id, tz, now)) items.push({ kind: 'stopped', sev: 'info', clientId: r.client.id, name: r.client.name, title: `${firstOf(r.client.name)} stopped logging`, text: 'Logged regularly, then nothing for 5+ days. Worth a friendly check-in.' });
  return items;
}

/** Assist's weekly nutrition summary for one client (cached for the day). */
export async function weeklySummary(db, client, { tz = 'UTC', force = false } = {}) {
  if (!force) {
    const existing = await db.aIInsight.findFirst({ where: { clientId: client.id, kind: 'nutrition_summary', createdAt: { gte: startOfToday() } }, orderBy: { createdAt: 'desc' } });
    if (existing) return existing;
  }
  const plan = await planFor(db, client.id);
  const [week, habits] = await Promise.all([weekStats(db, client.id, plan, tz), habitsWithStatus(db, client.id, tz)]);
  const ctx = { coach: await coachContext(db), client: await clientContext(db, client), approach: plan.approach, targets: { calories: plan.calories, proteinG: plan.proteinG }, week: { daysLogged: week.daysLogged, proteinHitDays: week.proteinHitDays, avgCalories: week.avgCalories, avgProteinG: week.avgProteinG, photos: week.photos }, habits: habits.map(h => ({ title: h.title, daysThisWeek: h.daysThisWeek })) };
  const r = await AI.summarizeNutrition(ctx, { db });
  return saveInsight(db, { clientId: client.id, kind: 'nutrition_summary', source: 'nutrition', summary: r.data.summary, draft: r.data, minutesSaved: 0, model: r.model, promptVersion: r.promptVersion, status: 'info' });
}

/**
 * Photo logging: Assist identifies foods and grams; the server matches each to the food database
 * and does the math. Saved as a pending analysis (not a food entry) until the client taps Add.
 */
/** Matches what Assist saw in a meal photo to the food database (or keeps Assist's estimate). */
export async function matchPhotoItems(a) {
  const items = [];
  for (const [i, it] of a.items.entries()) {
    const match = (await foods().search(it.name)).results[0] || null;
    const est = it.estimate ? { calories: it.estimate.calories, proteinG: it.estimate.protein_g, carbsG: it.estimate.carbs_g, fatG: it.estimate.fat_g } : null;
    if (match) items.push({ index: i, name: it.name, matched: match.name, foodRef: match.ref, grams: it.grams, portionText: it.portion_text, confidence: it.confidence, per100g: match.per100g, ...nutrientsFor(match, it.grams), source: match.source });
    else items.push({ index: i, name: it.name, matched: null, foodRef: null, grams: it.grams, portionText: it.portion_text, confidence: 'estimate', per100g: est && it.grams ? Object.fromEntries(Object.entries(est).map(([k, v]) => [k, Math.round(v / it.grams * 1000) / 10])) : null, ...(est || { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }), source: 'estimate' });
  }
  return items;
}

export async function analyzeMealPhoto(coachDb, { clientId, buffer, photoKey }) {
  const r = await AI.analyzeMealPhoto(buffer, { db: coachDb });
  const a = r.data;
  if (!a.is_food || !a.items.length) {
    await saveInsight(coachDb, { clientId, kind: 'meal_photo', source: 'photo', summary: 'Not food', draft: { isFood: false, photoKey }, model: r.model, promptVersion: r.promptVersion, status: 'dismissed' });
    return { isFood: false };
  }
  const items = await matchPhotoItems(a);
  const ins = await saveInsight(coachDb, { clientId, kind: 'meal_photo', source: 'photo', summary: a.title, draft: { isFood: true, title: a.title, note: a.note, photoKey, items: items.map(x => ({ name: x.name, grams: x.grams, portionText: x.portionText, calories: x.calories, proteinG: x.proteinG, carbsG: x.carbsG, fatG: x.fatG, foodRef: x.foodRef })) }, model: r.model, promptVersion: r.promptVersion });
  return { isFood: true, photoToken: ins.id, title: a.title, note: a.note, items: items.map(x => ({ ...x, foodRef: x.foodRef || `est:${ins.id}:${x.index}`, check: x.confidence !== 'high' })) };
}
