// Nutrition numbers for the coach: the Nutrition page, Ask Assist ("who's struggling with
// nutrition?"), the Today queue and the risk radar all read from here.
import { planFor, weekStats, lowTarget, habitsWithStatus, dayKey } from './plans.js';
import { addDays, DAY } from '../lib/time.js';

const ACTIVE = { status: { in: ['NEW', 'ACTIVE'] } };

/** Missing protein "most days": logged 3+ days and hit the target on fewer than half of them. */
export const missedProteinMostDays = (plan, w) => plan.approach !== 'habits' && !!plan.proteinG && w.daysLogged >= 3 && w.proteinHitDays * 2 < w.daysLogged;

/** One row per active client: approach, logging and targets for the last 7 days. */
export async function clientRows(db, { tz = 'UTC', now = new Date() } = {}) {
  const [clients, plans, flags] = await Promise.all([
    db.client.findMany({ where: ACTIVE, orderBy: { name: 'asc' } }),
    db.nutritionPlan.findMany(),
    db.nutritionFlag.findMany({ where: { status: 'open' }, select: { clientId: true } }),
  ]);
  const byClient = new Map(plans.map(p => [p.clientId, p]));
  const flagCount = new Map();
  for (const f of flags) flagCount.set(f.clientId, (flagCount.get(f.clientId) || 0) + 1);
  const rows = [];
  for (const c of clients) {
    const plan = byClient.get(c.id) || (await planFor(db, c.id));
    const w = await weekStats(db, c.id, plan, tz, now);
    const lt = plan.calories ? await lowTarget(db, c, plan) : { rmr: null, low: false, confirmed: false };
    rows.push({ client: c, plan, week: w, lowTarget: lt, flags: flagCount.get(c.id) || 0 });
  }
  return rows;
}

/** Clients who logged regularly the week before but nothing for 5+ days. */
export async function stoppedLogging(db, clientId, tz, now = new Date()) {
  const today = dayKey(tz, now);
  const [recent, before] = await Promise.all([
    db.foodEntry.count({ where: { clientId, day: { gt: addDays(today, -5) } } }),
    db.foodEntry.findMany({ where: { clientId, day: { gte: addDays(today, -19), lte: addDays(today, -5) } }, select: { day: true } }),
  ]);
  return recent === 0 && new Set(before.map(e => +e.day)).size >= 4;
}

/** Ask Assist / Talk to Assist: "Who's struggling with nutrition this week?" */
export async function nutritionStruggles(db, { tz = 'UTC', now = new Date() } = {}) {
  const rows = await clientRows(db, { tz, now });
  const notLogging = [];
  for (const r of rows) if (r.plan.id && await stoppedLogging(db, r.client.id, tz, now)) notLogging.push({ id: r.client.id, name: r.client.name });
  return {
    proteinMisses: rows.filter(r => missedProteinMostDays(r.plan, r.week)).map(r => ({ id: r.client.id, name: r.client.name, hitDays: r.week.proteinHitDays, loggedDays: r.week.daysLogged })),
    lowTargets: rows.filter(r => r.lowTarget.low).map(r => ({ id: r.client.id, name: r.client.name, calories: r.plan.calories, rmr: r.lowTarget.rmr, confirmed: r.lowTarget.confirmed })),
    notLogging,
    openFlags: rows.reduce((n, r) => n + r.flags, 0),
  };
}

/** The coach Nutrition page. */
export async function overview(db, { tz = 'UTC', now = new Date() } = {}) {
  const rows = await clientRows(db, { tz, now });
  const since = new Date(now.getTime() - 7 * DAY);
  const [habitChecks, flags, templates] = await Promise.all([
    db.habitCheck.count({ where: { date: { gte: addDays(dayKey(tz, now), -6) } } }),
    db.nutritionFlag.findMany({ where: { status: 'open' }, orderBy: { createdAt: 'desc' } }),
    db.mealPlanTemplate.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, name: true, calories: true, days: true, createdAt: true } }),
  ]);
  const tracking = rows.filter(r => r.plan.id);
  const proteinRows = rows.filter(r => r.plan.proteinG && r.plan.approach !== 'habits');
  const loggedDays = proteinRows.reduce((n, r) => n + r.week.daysLogged, 0);
  const assignedTo = new Map();
  for (const r of rows) if (r.plan.mealPlanId) assignedTo.set(r.plan.mealPlanId, (assignedTo.get(r.plan.mealPlanId) || 0) + 1);
  const names = new Map(rows.map(r => [r.client.id, r.client.name]));
  return {
    kpis: {
      tracking: tracking.length, active: rows.length,
      logging5: rows.filter(r => r.week.daysLogged >= 5).length,
      proteinHitPct: loggedDays ? Math.round(proteinRows.reduce((n, r) => n + r.week.proteinHitDays, 0) / loggedDays * 100) : null,
      photos: rows.reduce((n, r) => n + r.week.photos, 0),
      habitChecks,
    },
    rows: rows.map(r => ({
      id: r.client.id, name: r.client.name, approach: r.plan.id ? r.plan.approach : null, hideNumbers: r.plan.hideNumbers,
      daysLogged: r.week.daysLogged, avgCalories: r.week.avgCalories, calories: r.plan.calories, avgProteinG: r.week.avgProteinG, proteinG: r.plan.proteinG,
      proteinHitDays: r.week.proteinHitDays, lastLoggedAt: r.week.lastLoggedAt, lowTarget: r.lowTarget.low ? { rmr: r.lowTarget.rmr, confirmed: r.lowTarget.confirmed } : null, flags: r.flags,
      missedProtein: missedProteinMostDays(r.plan, r.week),
    })),
    flags: flags.map(f => ({ id: f.id, clientId: f.clientId, name: names.get(f.clientId) || 'Client', category: f.category, severity: f.severity, sourceType: f.sourceType, text: f.text, createdAt: f.createdAt })),
    templates: templates.map(t => ({ id: t.id, name: t.name, calories: t.calories, days: Array.isArray(t.days) ? t.days.length : 0, assigned: assignedTo.get(t.id) || 0 })),
    since,
  };
}

/** Client → Nutrition tab: 7-day chart data, habits, today's log. */
export async function clientNutrition(db, client, { tz = 'UTC', now = new Date() } = {}) {
  const plan = await planFor(db, client.id);
  const [week, habits, lt] = await Promise.all([weekStats(db, client.id, plan, tz, now), habitsWithStatus(db, client.id, tz, now), lowTarget(db, client, plan)]);
  return { plan, week, habits, lowTarget: lt };
}
