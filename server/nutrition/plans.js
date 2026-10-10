// Nutrition plans, food logs and habits: the shared logic behind the coach and client routes.
import { restingNeeds, goalFor, isLowTarget } from './calc.js';
import { foods, nutrientsFor } from './foods.js';
import { todayKey, addDays, localParts, dateToYmd } from '../lib/time.js';
import { weightSeries } from '../core/stats.js';
import { badRequest } from '../lib/errors.js';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
export const APPROACHES = ['habits', 'targets', 'meal_plan'];
export const SCOPE_REMINDER = 'In some states, individualized meal plans require a dietitian license. Check your state’s rules, or refer to a registered dietitian.';
const r1 = n => Math.round((Number(n) || 0) * 10) / 10;

// ---------------------------------------------------------------- hide numbers
const NUMBER_KEYS = new Set(['calories', 'proteinG', 'carbsG', 'fatG', 'per100g', 'targets', 'totals', 'perServing', 'rmr', 'maintenance', 'proteinRange', 'kcal', 'estimate']);
/** Removes every calorie and macro value, at any depth. Used for clients with "Hide numbers" on. */
export function stripNumbers(v) {
  if (Array.isArray(v)) return v.map(stripNumbers);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!NUMBER_KEYS.has(k)) o[k] = stripNumbers(x);
    return o;
  }
  return v;
}
/** Also scrubs calorie / gram-of-macro mentions from free text (e.g. a meal plan line). */
export const scrubText = s => String(s || '').replace(/\b\d[\d,.]*\s*(k?cal(orie)?s?|kcal)\b/gi, '').replace(/\b\d[\d,.]*\s*g(rams?)?\s*(of\s+)?(protein|carbs?|fat)\b/gi, '').replace(/\s{2,}/g, ' ').trim();

// ---------------------------------------------------------------- plan
export const DEFAULT_PLAN = { approach: 'habits', calories: null, proteinG: null, carbsG: null, fatG: null, hideNumbers: false, mealPlanId: null, coachNote: null, sex: null, heightIn: null, activity: null, goal: null, lowTargetConfirmedAt: null };
export async function planFor(db, clientId) {
  const p = await db.nutritionPlan.findFirst({ where: { clientId } });
  return p || { ...DEFAULT_PLAN, clientId, id: null };
}
export const ageOf = client => (client.birthYear ? new Date().getFullYear() - client.birthYear : null);
export async function latestWeight(db, clientId) {
  const w = await weightSeries(db, clientId, 1);
  return w[0]?.value ?? null;
}
export async function calcInputs(db, client, plan) {
  return { sex: plan.sex || null, heightIn: plan.heightIn || null, weightLb: await latestWeight(db, client.id), age: ageOf(client), activity: plan.activity || 1.55, goal: plan.goal || goalFor(client.goalType) };
}
export async function rmrFor(db, client, plan) {
  return restingNeeds(await calcInputs(db, client, plan));
}
export async function lowTarget(db, client, plan) {
  const rmr = await rmrFor(db, client, plan);
  return { rmr, low: isLowTarget(plan.calories, rmr), confirmed: !!plan.lowTargetConfirmedAt };
}

// ---------------------------------------------------------------- days
/** The local training-day key for a moment (stored as UTC midnight of the local date). */
export const dayKey = (tz, d = new Date()) => todayKey(tz, d);
export function mealFor(tz, d = new Date()) {
  const { hour } = localParts(tz, d);
  return hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : hour >= 17 && hour < 22 ? 'dinner' : 'snack';
}
export function sumItems(items) {
  return items.reduce((t, i) => ({ calories: r1(t.calories + i.calories), proteinG: r1(t.proteinG + i.proteinG), carbsG: r1(t.carbsG + i.carbsG), fatG: r1(t.fatG + i.fatG) }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}
export const proteinHit = (logged, target) => target ? logged >= target * 0.9 : false;

/** Entries (with items) for a client between two day keys, inclusive. */
export async function entriesBetween(db, clientId, from, to) {
  return db.foodEntry.findMany({ where: { clientId, day: { gte: from, lte: to } }, include: { items: true }, orderBy: { loggedAt: 'asc' } });
}

/** Seven days ending today: calories and protein logged vs target. */
export async function weekStats(db, clientId, plan, tz, now = new Date()) {
  const today = dayKey(tz, now), from = addDays(today, -6);
  const entries = await entriesBetween(db, clientId, from, today);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(from, i);
    const its = entries.filter(e => +e.day === +d).flatMap(e => e.items);
    const t = sumItems(its);
    return { day: dateToYmd(d), logged: its.length > 0, entries: entries.filter(e => +e.day === +d).length, ...t, proteinHit: its.length > 0 && proteinHit(t.proteinG, plan.proteinG) };
  });
  const logged = days.filter(d => d.logged);
  return {
    days, daysLogged: logged.length, proteinHitDays: days.filter(d => d.proteinHit).length,
    avgCalories: logged.length ? Math.round(logged.reduce((n, d) => n + d.calories, 0) / logged.length) : null,
    avgProteinG: logged.length ? Math.round(logged.reduce((n, d) => n + d.proteinG, 0) / logged.length) : null,
    photos: entries.filter(e => e.source === 'photo').length,
    lastLoggedAt: entries.length ? entries.at(-1).loggedAt : null,
  };
}

/** Days logged and protein days hit between two day keys (inclusive), for check-ins and the radar. */
export async function windowStats(db, clientId, plan, from, to) {
  const entries = await entriesBetween(db, clientId, from, to);
  const byDay = new Map();
  for (const e of entries) { const k = +e.day; byDay.set(k, (byDay.get(k) || []).concat(e.items)); }
  let hit = 0;
  for (const items of byDay.values()) if (proteinHit(sumItems(items).proteinG, plan.proteinG)) hit++;
  return { daysLogged: byDay.size, proteinHitDays: plan.proteinG && plan.approach !== 'habits' ? hit : null, approach: plan.approach };
}

// ---------------------------------------------------------------- habits
export async function habitsWithStatus(db, clientId, tz, now = new Date()) {
  const today = dayKey(tz, now);
  const [habits, checks] = await Promise.all([
    db.habit.findMany({ where: { clientId, active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    db.habitCheck.findMany({ where: { clientId, date: { gte: addDays(today, -60), lte: today } }, select: { habitId: true, date: true } }),
  ]);
  return habits.map(h => {
    const days = new Set(checks.filter(c => c.habitId === h.id).map(c => dateToYmd(c.date)));
    const last7 = Array.from({ length: 7 }, (_, i) => days.has(dateToYmd(addDays(today, i - 6))));
    let streak = 0;
    for (let d = days.has(dateToYmd(today)) ? 0 : 1; d < 60 && days.has(dateToYmd(addDays(today, -d))); d++) streak++;
    return { id: h.id, title: h.title, done: days.has(dateToYmd(today)), last7, streak, daysThisWeek: last7.filter(Boolean).length };
  });
}

// ---------------------------------------------------------------- logging
const MAX_GRAMS = 3000;
/**
 * Turns what the client confirmed into rows with nutrients worked out on the server:
 *  - foodRef usda:/off:/mock: → looked up, nutrients from grams
 *  - foodRef est:<insightId>:<index> → Assist's photo estimate (labelled "estimate"), scaled to grams
 *  - no foodRef → quick add: the numbers the client typed
 */
export async function resolveItems(items, { estimates = null } = {}) {
  const out = [];
  for (const it of items) {
    const grams = it.grams != null ? Math.max(0, Math.min(MAX_GRAMS, Number(it.grams))) : null;
    const ref = it.foodRef || null;
    if (ref && /^(usda|off|mock):/.test(ref)) {
      const food = await foods().get(ref);
      if (!food) throw badRequest(`We couldn’t find “${it.name || 'that food'}” in the food database. Try searching again.`);
      const g = grams ?? food.defaultGrams ?? 100;
      out.push({ name: String(it.name || food.name).slice(0, 190), grams: r1(g), portionText: it.portionText ? String(it.portionText).slice(0, 190) : null, ...nutrientsFor(food, g), foodRef: ref, fdcId: food.fdcId || null, barcode: food.barcode || null, confidence: it.confidence || null });
    } else if (ref && ref.startsWith('est:')) {
      const idx = Number(ref.split(':')[2]);
      const est = estimates?.[idx];
      if (!est) throw badRequest('That photo analysis has expired. Take the photo again.');
      const g = grams ?? est.grams ?? 100, scale = est.grams ? g / est.grams : 1;
      out.push({ name: String(it.name || est.name).slice(0, 190), grams: r1(g), portionText: it.portionText || est.portionText || null, calories: r1(est.calories * scale), proteinG: r1(est.proteinG * scale), carbsG: r1(est.carbsG * scale), fatG: r1(est.fatG * scale), foodRef: null, fdcId: null, barcode: null, confidence: 'estimate' });
    } else {
      if (it.calories == null) throw badRequest('Enter calories for a quick add.', { fields: { calories: 'Required' } });
      out.push({ name: String(it.name || 'Quick add').slice(0, 190), grams, portionText: it.portionText || null, calories: r1(it.calories), proteinG: r1(it.proteinG), carbsG: r1(it.carbsG), fatG: r1(it.fatG), foodRef: null, fdcId: null, barcode: null, confidence: null });
    }
  }
  return out;
}

/** Saves one confirmed entry and its items (each table written separately so it's tenant-scoped). */
export async function saveEntry(db, { clientId, meal, title, source, note = null, day, loggedAt = new Date(), photoKey = null, aiInsightId = null, items }) {
  const entry = await db.foodEntry.create({ data: { clientId, meal, title: String(title).slice(0, 190), source, note, day, loggedAt, photoKey, aiInsightId } });
  try {
    await db.foodEntryItem.createMany({ data: items.map(i => ({ ...i, clientId, entryId: entry.id })) });
  } catch (e) { await db.foodEntry.delete({ where: { id: entry.id } }).catch(() => null); throw e; }
  return db.foodEntry.findFirst({ where: { id: entry.id }, include: { items: true } });
}

export function shapeEntry(e, { photoUrl = null } = {}) {
  return { id: e.id, meal: e.meal, title: e.title, source: e.source, note: e.note, day: dateToYmd(e.day), loggedAt: e.loggedAt, photoUrl, totals: sumItems(e.items || []), items: (e.items || []).map(i => ({ id: i.id, name: i.name, grams: i.grams, portionText: i.portionText, calories: i.calories, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG, confidence: i.confidence })) };
}

/** A short line for lists: "Chicken & rice bowl · 2 items". */
export const titleFor = items => (items.length === 1 ? items[0].name : `${items[0].name} + ${items.length - 1} more`);
