// Client app: Nutrition. Every query runs through the CLIENT-scoped database client, so a
// client only ever reaches their own plan, log, habits and favorites. When the coach turned on
// "Hide numbers", responses contain no calories or macros at all (stripNumbers).
import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { dbForBusiness } from '../db/tenant.js';
import { body, z, query } from '../lib/validate.js';
import { must, badRequest, HttpError, conflict } from '../lib/errors.js';
import { requireFeature, effectivePlan, isPro } from '../auth/middleware.js';
import { addDays, ymdToDate, dateToYmd } from '../lib/time.js';
import { config } from '../config.js';
import { StorageService, stripJpegMetadata, sniffImage } from '../storage/StorageService.js';
import { planFor, MEALS, stripNumbers, scrubText, sumItems, resolveItems, saveEntry, shapeEntry, habitsWithStatus, entriesBetween, dayKey, mealFor, titleFor } from '../nutrition/plans.js';
import { foods, nutrientsFor, CREDITS } from '../nutrition/foods.js';
import { analyzeMealPhoto } from '../nutrition/attention.js';
import { raiseFlag } from '../nutrition/flags.js';
import { AI } from '../ai/AIService.js';
import { splitFoods } from '../../public/js/shared/parse.js';
import { startOfMonthUtc } from '../lib/time.js';

export const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } });

async function ctx(req) {
  const coach = dbForBusiness(req.auth.businessId);
  const b = await req.db.business.findFirst({ select: { id: true, name: true, timezone: true, plan: true, trialEndsAt: true } });
  const client = must(await req.db.client.findFirst({ where: { id: req.auth.clientId } }), 'Your account');
  const plan = await planFor(req.db, client.id);
  return { coach, b, client, plan, tz: b.timezone, pro: isPro(effectivePlan(b)) };
}
/** What the client may see: everything, or nothing numeric when the coach hid numbers. */
const view = (plan, data) => (plan.hideNumbers ? stripNumbers(data) : data);
const dayParam = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
function pickDay(tz, ymd) {
  const today = dayKey(tz);
  if (!ymd) return today;
  const d = ymdToDate(ymd);
  if (d > today || d < addDays(today, -30)) throw badRequest('Pick a day in the last 30 days.');
  return d;
}

// ---------------------------------------------------------------- today
router.get('/nutrition/today', query(dayParam), async (req, res) => {
  const { client, plan, tz, pro, coach } = await ctx(req);
  const day = pickDay(tz, req.q.day);
  const [entries, yesterday, habits, favorites, template] = await Promise.all([
    entriesBetween(req.db, client.id, day, day),
    entriesBetween(req.db, client.id, addDays(day, -1), addDays(day, -1)),
    habitsWithStatus(req.db, client.id, tz),
    req.db.foodFavorite.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    plan.approach === 'meal_plan' && plan.mealPlanId ? coach.mealPlanTemplate.findFirst({ where: { id: plan.mealPlanId } }) : null,
  ]);
  const items = entries.flatMap(e => e.items);
  const showTargets = plan.approach !== 'habits';
  res.json(view(plan, {
    day: dateToYmd(day), today: dateToYmd(dayKey(tz)),
    approach: plan.approach, hideNumbers: plan.hideNumbers,
    targets: showTargets ? { calories: plan.calories, proteinG: plan.proteinG, carbsG: plan.carbsG, fatG: plan.fatG } : null,
    totals: showTargets ? sumItems(items) : null,
    entries: await Promise.all(entries.map(async e => shapeEntry(e, { photoUrl: e.photoKey ? await StorageService.signedUrl(e.photoKey) : null }))),
    repeat: MEALS.filter(m => yesterday.some(e => e.meal === m)),
    habits, favorites: favorites.map(f => ({ id: f.id, title: f.title })),
    mealPlan: template ? { name: template.name, calories: template.calories, notes: plan.hideNumbers ? scrubText(template.notes) : template.notes, days: plan.hideNumbers ? template.days.map(d => ({ ...d, meals: d.meals.map(m => ({ ...m, items: m.items.map(scrubText) })) })) : template.days } : null,
    coachNote: plan.coachNote,
    suggestedMeal: mealFor(tz),
    features: { photo: pro, voice: pro },
    credits: [CREDITS.usda, CREDITS.off],
  }));
});

// ---------------------------------------------------------------- habits
router.post('/habits/:id/check', body(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })), async (req, res) => {
  const { tz } = await ctx(req);
  const h = must(await req.db.habit.findFirst({ where: { id: req.params.id, active: true } }), 'That habit');
  const date = pickDay(tz, req.body.day);
  const existing = await req.db.habitCheck.findFirst({ where: { habitId: h.id, date } });
  if (existing) await req.db.habitCheck.delete({ where: { id: existing.id } });
  else await req.db.habitCheck.create({ data: { habitId: h.id, date } }).catch(e => { if (e.code !== 'P2002') throw e; });
  const list = await habitsWithStatus(req.db, req.auth.clientId, tz);
  res.json({ habit: list.find(x => x.id === h.id), done: !existing });
});

// ---------------------------------------------------------------- photo with Assist (Pro)
router.post('/food-photo', requireFeature('PRO', 'Photo logging'), upload.single('photo'), async (req, res) => {
  const { coach, client, plan } = await ctx(req);
  if (!req.file) throw badRequest('Take or choose a photo.');
  if (sniffImage(req.file.buffer) !== 'image/jpeg') throw badRequest('Send the photo as a JPEG. The app does this for you; try again.');
  const clean = stripJpegMetadata(req.file.buffer);
  if (!clean) throw badRequest('That photo couldn’t be read. Try again.');
  const since = startOfMonthUtc(), dayAgo = new Date(Date.now() - 864e5);
  const [month, today] = await Promise.all([
    coach.aIInsight.count({ where: { kind: 'meal_photo', createdAt: { gte: since } } }),
    coach.aIInsight.count({ where: { kind: 'meal_photo', clientId: client.id, createdAt: { gte: dayAgo } } }),
  ]);
  if (month >= config.nutrition.photosMonthly) throw new HttpError(429, 'Photo logging has reached this month’s limit for your coach’s plan. Search or quick add still work.', { code: 'photo_limit' });
  if (today >= config.nutrition.photosPerClientDaily) throw new HttpError(429, 'That’s 20 photos today, the daily limit. Search or quick add still work.', { code: 'photo_limit' });
  const key = `food/${req.auth.businessId}/${client.id}/${randomUUID()}.jpg`;
  await StorageService.put(key, clean, 'image/jpeg');
  const r = await analyzeMealPhoto(coach, { clientId: client.id, buffer: clean, photoKey: key });
  if (!r.isFood) {
    await StorageService.remove(key).catch(() => null);
    return res.status(422).json({ error: 'I couldn’t recognize food in this photo. Try again or search instead.', code: 'not_food' });
  }
  res.json(view(plan, { ...r, photoUrl: await StorageService.signedUrl(key) }));
});

/** Throws away a photo analysis the client didn't add (and its photo). */
router.delete('/food-photo/:token', async (req, res) => {
  const { coach, client } = await ctx(req);
  const ins = await coach.aIInsight.findFirst({ where: { id: req.params.token, clientId: client.id, kind: 'meal_photo', status: 'pending' } });
  if (ins) {
    if (ins.draft?.photoKey) await StorageService.remove(ins.draft.photoKey).catch(() => null);
    await coach.aIInsight.update({ where: { id: ins.id }, data: { status: 'dismissed', decidedAt: new Date() } });
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------- text and voice → foods
async function matchFoods(parts) {
  const out = [];
  for (const p of parts) {
    const f = (await foods().search(p.food || p.name)).results[0];
    if (!f) { out.push({ name: p.food || p.name, matched: null, foodRef: null, grams: null, portionText: null, unmatched: true }); continue; }
    let grams = p.grams || null, portion = null;
    if (!grams && p.unit === 'g') grams = p.qty;
    if (!grams && p.unit === 'oz') grams = p.qty * 28.35;
    if (!grams && p.unit === 'lb') grams = p.qty * 453.6;
    if (!grams && p.unit) { const s = f.servings.find(x => x.label.toLowerCase().includes(p.unit)); if (s) { grams = s.grams * p.qty; portion = `${p.qty} × ${s.label}`; } }
    if (!grams) { grams = (f.defaultGrams || 100) * (p.qty || 1); portion = `${p.qty || 1} × ${f.servings[0].label}`; }
    out.push({ name: f.name, said: p.food || p.name, matched: f.name, foodRef: f.ref, grams: Math.round(grams), portionText: portion || `${Math.round(grams)} g`, servings: f.servings, per100g: f.per100g, ...nutrientsFor(f, grams), source: f.source });
  }
  return out;
}
router.post('/food-text', body(z.object({ text: z.string().trim().min(2).max(600), source: z.enum(['voice', 'text']).default('text') })), async (req, res) => {
  const { coach, plan, pro } = await ctx(req);
  if (req.body.source === 'voice' && !pro) throw new HttpError(403, 'Voice food logging is part of OneJump Pro. Ask your coach about it.', { upgrade: 'PRO', code: 'upgrade' });
  let parts = splitFoods(req.body.text), via = 'parser';
  let items = await matchFoods(parts);
  if (!items.length || items.every(i => i.unmatched)) {
    const r = await AI.parseFoodText(req.body.text, { db: coach });
    parts = r.data.items.map(i => ({ food: i.name, qty: i.qty, unit: i.unit, grams: i.grams }));
    items = await matchFoods(parts); via = 'assist';
  }
  if (!items.some(i => !i.unmatched)) return res.status(422).json({ error: 'I couldn’t match that to foods. Try searching instead.', code: 'no_match' });
  res.json(view(plan, { items: items.filter(i => !i.unmatched), unmatched: items.filter(i => i.unmatched).map(i => i.name), via, credit: foods().searchCredit }));
});

// ---------------------------------------------------------------- save / delete entries
const itemShape = z.object({
  name: z.string().trim().min(1).max(190), grams: z.coerce.number().min(0).max(3000).nullable().optional(), portionText: z.string().trim().max(190).nullable().optional(),
  foodRef: z.string().max(120).nullable().optional(), confidence: z.enum(['high', 'medium', 'low', 'estimate']).nullable().optional(),
  calories: z.coerce.number().min(0).max(10000).nullable().optional(), proteinG: z.coerce.number().min(0).max(1000).nullable().optional(), carbsG: z.coerce.number().min(0).max(2000).nullable().optional(), fatG: z.coerce.number().min(0).max(1000).nullable().optional(),
});
router.post('/food-entries', body(z.object({
  meal: z.enum(MEALS), title: z.string().trim().max(190).optional(), source: z.enum(['photo', 'search', 'barcode', 'voice', 'quick', 'favorite', 'text']),
  note: z.string().trim().max(1000).optional(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  photoToken: z.string().max(64).optional(), favoriteId: z.string().max(64).optional(), items: z.array(itemShape).max(30).default([]),
})), async (req, res) => {
  const { coach, client, plan, tz, pro } = await ctx(req);
  const d = req.body;
  if ((d.source === 'photo' || d.source === 'voice') && !pro) throw new HttpError(403, `${d.source === 'photo' ? 'Photo' : 'Voice'} logging is part of OneJump Pro. Ask your coach about it.`, { upgrade: 'PRO', code: 'upgrade' });
  let items = d.items, photoKey = null, aiInsightId = null, estimates = null, insight = null;
  if (d.favoriteId) {
    const fav = must(await req.db.foodFavorite.findFirst({ where: { id: d.favoriteId } }), 'That favorite');
    items = fav.items;
  }
  if (d.photoToken) {
    insight = await coach.aIInsight.findFirst({ where: { id: d.photoToken, clientId: client.id, kind: 'meal_photo' } });
    if (!insight || insight.status !== 'pending') throw conflict('That photo was already added or has expired. Take the photo again.');
    photoKey = insight.draft.photoKey; aiInsightId = insight.id; estimates = insight.draft.items;
  }
  if (!items.length) throw badRequest('Add at least one food.');
  if (plan.hideNumbers) items = items.map(i => (i.foodRef || d.source === 'favorite' ? i : { ...i, calories: i.calories ?? 0 }));
  const rows = await resolveItems(items, { estimates });
  const day = pickDay(tz, d.day);
  const entry = await saveEntry(req.db, { clientId: client.id, meal: d.meal, title: d.title || insight?.draft?.title || titleFor(rows), source: d.source, note: d.note || null, day, loggedAt: new Date(), photoKey, aiInsightId, items: rows });
  if (insight) {
    const edited = rows.length !== estimates.length || rows.some((r, i) => Math.abs((r.grams || 0) - (estimates[i]?.grams || 0)) > 1);
    await coach.aIInsight.update({ where: { id: insight.id }, data: { status: edited ? 'edited' : 'approved', decidedAt: new Date(), decidedBy: req.auth.userId } });
  }
  if (d.note) await raiseFlag(coach, { clientId: client.id, clientName: client.name, businessId: req.auth.businessId, sourceType: 'food_note', sourceId: entry.id, text: d.note });
  res.status(201).json(view(plan, { entry: shapeEntry(entry, { photoUrl: photoKey ? await StorageService.signedUrl(photoKey) : null }) }));
});

router.post('/food-entries/repeat', body(z.object({ meal: z.enum(MEALS), toMeal: z.enum(MEALS).optional() })), async (req, res) => {
  const { client, plan, tz } = await ctx(req);
  const today = dayKey(tz);
  const prev = await entriesBetween(req.db, client.id, addDays(today, -1), addDays(today, -1));
  const src = prev.filter(e => e.meal === req.body.meal);
  if (!src.length) throw badRequest(`Nothing was logged for ${req.body.meal} yesterday.`);
  const out = [];
  for (const e of src) {
    const items = e.items.map(({ id, businessId, clientId, entryId, ...rest }) => { void id; void businessId; void clientId; void entryId; return rest; });
    out.push(await saveEntry(req.db, { clientId: client.id, meal: req.body.toMeal || req.body.meal, title: e.title, source: 'favorite', day: today, items }));
  }
  res.status(201).json(view(plan, { entries: out.map(e => shapeEntry(e)) }));
});

router.delete('/food-entries/:id', async (req, res) => {
  const e = must(await req.db.foodEntry.findFirst({ where: { id: req.params.id } }), 'That entry');
  await req.db.foodEntryItem.deleteMany({ where: { entryId: e.id } });
  await req.db.foodEntry.delete({ where: { id: e.id } });
  if (e.photoKey) await StorageService.remove(e.photoKey).catch(() => null);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- favorites
router.post('/food-favorites', body(z.object({ entryId: z.string().max(64), title: z.string().trim().max(80).optional() })), async (req, res) => {
  const e = must(await req.db.foodEntry.findFirst({ where: { id: req.body.entryId }, include: { items: true } }), 'That entry');
  const items = e.items.map(i => ({ name: i.name, grams: i.grams, portionText: i.portionText, foodRef: i.foodRef, calories: i.calories, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG, confidence: i.confidence }));
  const fav = await req.db.foodFavorite.create({ data: { title: req.body.title || e.title, items } });
  res.status(201).json({ favorite: { id: fav.id, title: fav.title } });
});
router.delete('/food-favorites/:id', async (req, res) => {
  const f = must(await req.db.foodFavorite.findFirst({ where: { id: req.params.id } }), 'That favorite');
  await req.db.foodFavorite.delete({ where: { id: f.id } });
  res.json({ ok: true });
});
