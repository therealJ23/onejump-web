// Coach: one client's nutrition (Client → Nutrition tab): approach, targets with the calculator
// and safety checks, habits, the food log with private photo links, and private flags.
import { Router } from 'express';
import { audit } from '../db/system.js';
import { body, z, query } from '../lib/validate.js';
import { must, badRequest, HttpError } from '../lib/errors.js';
import { estimateTargets, targetWarnings, isLowTarget, restingNeeds, ACTIVITY } from '../nutrition/calc.js';
import { planFor, calcInputs, APPROACHES, SCOPE_REMINDER, entriesBetween, shapeEntry, dayKey } from '../nutrition/plans.js';
import { clientNutrition } from '../nutrition/insights.js';
import { StorageService } from '../storage/StorageService.js';
import { addDays, ymdToDate } from '../lib/time.js';
import { effectivePlan, isPro, requireFeature } from '../auth/middleware.js';
import { weeklySummary } from '../nutrition/attention.js';
import { draftNutritionPlan, applyNutritionPlan } from '../nutrition/assistPlan.js';

export const router = Router();
const tzOf = async db => (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';
const getClient = async (db, id) => must(await db.client.findFirst({ where: { id } }), 'That client');
const credentialed = settings => /\b(rd|rdn|dietitian|nutritionist)\b/i.test(String(settings?.nutritionCredential || ''));

async function shapePlan(db, client, plan, settings) {
  const inputs = await calcInputs(db, client, plan);
  const rmr = restingNeeds(inputs);
  return {
    plan: { approach: plan.approach, calories: plan.calories, proteinG: plan.proteinG, carbsG: plan.carbsG, fatG: plan.fatG, hideNumbers: plan.hideNumbers, mealPlanId: plan.mealPlanId, coachNote: plan.coachNote, sex: plan.sex, heightIn: plan.heightIn, activity: plan.activity, goal: plan.goal, lowTargetConfirmedAt: plan.lowTargetConfirmedAt, saved: !!plan.id, updatedAt: plan.updatedAt || null },
    inputs: { ...inputs, rmr },
    warnings: targetWarnings({ calories: plan.calories, rmr }),
    lowTargetNeedsReview: isLowTarget(plan.calories, rmr) && !plan.lowTargetConfirmedAt,
    scopeReminder: plan.approach === 'meal_plan' && !credentialed(settings) ? SCOPE_REMINDER : null,
    activityOptions: ACTIVITY,
  };
}

router.get('/:id/nutrition-plan', async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const b = await req.db.business.findFirst({ select: { settings: true } });
  res.json(await shapePlan(req.db, c, await planFor(req.db, c.id), b.settings));
});

const n = (min, max) => z.coerce.number().int().min(min).max(max).nullable().optional();
const planBody = z.object({
  approach: z.enum(APPROACHES).optional(),
  calories: n(0, 10000), proteinG: n(0, 1000), carbsG: n(0, 2000), fatG: n(0, 1000),
  hideNumbers: z.boolean().optional(), mealPlanId: z.string().max(64).nullable().optional(), coachNote: z.string().trim().max(2000).nullable().optional(),
  sex: z.enum(['female', 'male']).nullable().optional(), heightIn: z.coerce.number().min(36).max(96).nullable().optional(),
  activity: z.coerce.number().min(1.1).max(2.2).nullable().optional(), goal: z.enum(['lose', 'maintain', 'gain']).nullable().optional(),
  confirmLowTarget: z.boolean().default(false),
});
router.put('/:id/nutrition-plan', body(planBody), async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const { confirmLowTarget, ...d } = req.body;
  const current = await planFor(req.db, c.id);
  const next = { ...current, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) };
  if (next.mealPlanId) {
    must(await req.db.mealPlanTemplate.findFirst({ where: { id: next.mealPlanId } }), 'That meal plan');
    const b = await req.db.business.findFirst({ select: { plan: true, trialEndsAt: true } });
    if (!isPro(effectivePlan(b)) && d.mealPlanId) throw new HttpError(403, 'Meal plan templates are part of OneJump Pro. Upgrade in Plan & billing to use them.', { upgrade: 'PRO', code: 'upgrade' });
  }
  if (next.approach === 'habits') { /* keep targets on file, the client just won't see them */ }
  // Safety rule: a target below estimated resting needs needs an explicit "I've reviewed this target".
  const rmr = restingNeeds(await calcInputs(req.db, c, next));
  const low = isLowTarget(next.calories, rmr);
  const unchangedAndReviewed = current.lowTargetConfirmedAt && current.calories === next.calories;
  let lowTargetConfirmedAt = low ? current.lowTargetConfirmedAt : null;
  if (low && !unchangedAndReviewed) {
    if (!confirmLowTarget) throw badRequest(rmr ? `${next.calories} kcal is below ${c.name.split(' ')[0]}’s estimated resting needs (about ${rmr} kcal). Tick “I’ve reviewed this target” to save it.` : `${next.calories} kcal is very low. Tick “I’ve reviewed this target” to save it.`, { code: 'low_target', rmr, fields: { confirmLowTarget: 'Review required' } });
    lowTargetConfirmedAt = new Date();
    audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'nutrition_low_target_confirmed', target: c.id, meta: { calories: next.calories, rmr } });
  }
  const data = { approach: next.approach, calories: next.calories ?? null, proteinG: next.proteinG ?? null, carbsG: next.carbsG ?? null, fatG: next.fatG ?? null, hideNumbers: !!next.hideNumbers, mealPlanId: next.mealPlanId || null, coachNote: next.coachNote || null, sex: next.sex || null, heightIn: next.heightIn ?? null, activity: next.activity ?? null, goal: next.goal || null, lowTargetConfirmedAt };
  const saved = current.id ? await req.db.nutritionPlan.update({ where: { id: current.id }, data }) : await req.db.nutritionPlan.create({ data: { ...data, clientId: c.id } });
  if (['calories', 'proteinG', 'carbsG', 'fatG', 'hideNumbers', 'approach'].some(k => current[k] !== saved[k])) {
    audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'nutrition_plan_changed', target: c.id, meta: { approach: saved.approach, calories: saved.calories, proteinG: saved.proteinG, hideNumbers: saved.hideNumbers } });
  }
  const b = await req.db.business.findFirst({ select: { settings: true } });
  res.json(await shapePlan(req.db, c, saved, b.settings));
});

/** The calculator: an estimate for the coach to confirm. Saves nothing. */
router.post('/:id/nutrition-plan/estimate', body(z.object({
  sex: z.enum(['female', 'male']), heightIn: z.coerce.number().min(36).max(96), activity: z.coerce.number().min(1.1).max(2.2).default(1.55),
  goal: z.enum(['lose', 'maintain', 'gain']).default('maintain'), weightLb: z.coerce.number().min(60).max(800).optional(), age: z.coerce.number().int().min(13).max(100).optional(),
})), async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const inputs = await calcInputs(req.db, c, {});
  const est = estimateTargets({ ...inputs, ...req.body, weightLb: req.body.weightLb || inputs.weightLb, age: req.body.age || inputs.age });
  if (!est.ok) throw badRequest(`Add ${est.missing.join(' and ')} first.`, { missing: est.missing });
  res.json({ estimate: est });
});

// ---------------------------------------------------------------- Assist builds the plan
// A draft for the coach only; "Use this plan" (apply-draft) is the coach's approval.
const assistPro = requireFeature('PRO', 'Assist nutrition plans');
router.post('/:id/nutrition-plan/assist', assistPro, body(z.object({ request: z.string().trim().max(1500).default(''), lang: z.enum(['en', 'es']).default('en') })), async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  res.json(await draftNutritionPlan(req.db, c, req.body));
});
const draftBody = z.object({
  approach: z.enum(APPROACHES),
  calories: n(0, 10000), proteinG: n(0, 1000), carbsG: n(0, 2000), fatG: n(0, 1000),
  habits: z.array(z.string().trim().min(2).max(80)).max(8).default([]),
  mealPlan: z.object({ name: z.string().trim().min(2).max(80), days: z.array(z.object({ label: z.string().trim().max(40), meals: z.array(z.object({ meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']), items: z.array(z.string().trim().min(1).max(200)).max(12) })).max(8) })).min(1).max(14) }).nullable().default(null),
  coachNote: z.string().trim().max(2000).nullable().optional(),
  confirmLowTarget: z.boolean().default(false),
});
router.post('/:id/nutrition-plan/apply-draft', assistPro, body(draftBody), async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const b = await req.db.business.findFirst({ select: { plan: true, planStatus: true, trialEndsAt: true, settings: true } });
  const { confirmLowTarget, ...d } = req.body;
  const r = await applyNutritionPlan(req.db, req.auth, c, d, { pro: isPro(effectivePlan(b)), confirmLowTarget });
  res.json({ ...(await shapePlan(req.db, c, r.plan, b.settings)), habitsAdded: r.habitsAdded, message: r.message });
});

// ---------------------------------------------------------------- tab data + food log
router.get('/:id/nutrition', async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const tz = await tzOf(req.db);
  const b = await req.db.business.findFirst({ select: { settings: true } });
  const data = await clientNutrition(req.db, c, { tz });
  const today = dayKey(tz);
  const [entries, flags, templates] = await Promise.all([
    entriesBetween(req.db, c.id, addDays(today, -1), today),
    req.db.nutritionFlag.findMany({ where: { clientId: c.id, status: 'open' }, orderBy: { createdAt: 'desc' } }),
    req.db.mealPlanTemplate.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, calories: true } }),
  ]);
  if (entries.some(e => e.photoKey)) audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'food_photos_viewed', target: c.id });
  res.json({
    ...(await shapePlan(req.db, c, data.plan, b.settings)),
    week: data.week, habits: data.habits,
    today: await Promise.all(entries.filter(e => +e.day === +today).map(async e => shapeEntry(e, { photoUrl: e.photoKey ? await StorageService.signedUrl(e.photoKey) : null }))),
    yesterday: entries.filter(e => +e.day !== +today).map(e => shapeEntry(e)),
    flags: flags.map(f => ({ id: f.id, category: f.category, severity: f.severity, sourceType: f.sourceType, text: f.text, createdAt: f.createdAt })),
    templates,
  });
});

router.get('/:id/food-entries', query(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })), async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const tz = await tzOf(req.db), today = dayKey(tz);
  const to = req.q.to ? ymdToDate(req.q.to) : today, from = req.q.from ? ymdToDate(req.q.from) : addDays(to, -6);
  if ((to - from) / 864e5 > 62) throw badRequest('Pick up to two months at a time.');
  const entries = await entriesBetween(req.db, c.id, from, to);
  if (entries.some(e => e.photoKey)) audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'food_photos_viewed', target: c.id });
  res.json({ entries: await Promise.all(entries.map(async e => shapeEntry(e, { photoUrl: e.photoKey ? await StorageService.signedUrl(e.photoKey) : null }))) });
});

router.get('/:id/nutrition-summary', requireFeature('PRO', 'Assist nutrition summaries'), async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const i = await weeklySummary(req.db, c, { tz: await tzOf(req.db), force: req.query.refresh === '1' });
  res.json({ ...i.draft, model: i.model });
});

// ---------------------------------------------------------------- habits (coach-defined)
router.post('/:id/habits', body(z.object({ title: z.string().trim().min(2).max(80) })), async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const count = await req.db.habit.count({ where: { clientId: c.id, active: true } });
  if (count >= 8) throw badRequest('Up to 8 habits at a time keeps it doable.');
  res.status(201).json({ habit: await req.db.habit.create({ data: { clientId: c.id, title: req.body.title, sortOrder: count } }) });
});
router.patch('/:id/habits/:habitId', body(z.object({ title: z.string().trim().min(2).max(80).optional(), active: z.boolean().optional() })), async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const h = must(await req.db.habit.findFirst({ where: { id: req.params.habitId, clientId: c.id } }), 'That habit');
  res.json({ habit: await req.db.habit.update({ where: { id: h.id }, data: req.body }) });
});
router.delete('/:id/habits/:habitId', async (req, res) => {
  const c = await getClient(req.db, req.params.id);
  const h = must(await req.db.habit.findFirst({ where: { id: req.params.habitId, clientId: c.id } }), 'That habit');
  await req.db.habit.update({ where: { id: h.id }, data: { active: false } });
  res.json({ ok: true });
});
