// Coach: the Nutrition page (Coaching → Nutrition), meal plan templates and recipes, private flags.
import { Router } from 'express';
import { body, z } from '../lib/validate.js';
import { must } from '../lib/errors.js';
import { requireFeature } from '../auth/middleware.js';
import { overview } from '../nutrition/insights.js';
import { attentionItems } from '../nutrition/attention.js';
import { foods, nutrientsFor, CREDITS } from '../nutrition/foods.js';
import { flagReplyDraft } from '../nutrition/flags.js';
import { audit } from '../db/system.js';

export const router = Router();
const tzOf = async db => (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';

router.get('/overview', async (req, res) => {
  const tz = await tzOf(req.db);
  const data = await overview(req.db, { tz });
  res.json({ ...data, attention: await attentionItems(req.db, data, { tz }), credits: [CREDITS.usda, CREDITS.off], provider: foods().mode });
});

// ---------------------------------------------------------------- private flags
router.post('/flags/:id/resolve', async (req, res) => {
  const f = must(await req.db.nutritionFlag.findFirst({ where: { id: req.params.id } }), 'That flag');
  await req.db.nutritionFlag.update({ where: { id: f.id }, data: { status: 'resolved', resolvedAt: new Date() } });
  audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'nutrition_flag_resolved', target: f.id });
  res.json({ ok: true });
});
/** A warm, number-free reply for the coach to edit and send themselves (never sent automatically). */
router.post('/flags/:id/draft', async (req, res) => {
  const f = must(await req.db.nutritionFlag.findFirst({ where: { id: req.params.id } }), 'That flag');
  const c = must(await req.db.client.findFirst({ where: { id: f.clientId } }), 'That client');
  const i = await flagReplyDraft(req.db, c, f);
  res.json({ insightId: i.id, text: i.draft.text, clientId: c.id });
});

// ---------------------------------------------------------------- meal plan templates (Pro)
const dayShape = z.object({ label: z.string().trim().max(40), meals: z.array(z.object({ meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']), items: z.array(z.string().trim().min(1).max(200)).max(12), recipeId: z.string().max(64).nullable().optional() })).max(8) });
const templateBody = z.object({ name: z.string().trim().min(2).max(80), calories: z.coerce.number().int().min(0).max(10000).nullable().optional(), notes: z.string().trim().max(2000).nullable().optional(), days: z.array(dayShape).min(1).max(14) });
const pro = requireFeature('PRO', 'Meal plan templates');

router.get('/meal-plans', async (req, res) => {
  const [list, plans] = await Promise.all([req.db.mealPlanTemplate.findMany({ orderBy: { createdAt: 'desc' } }), req.db.nutritionPlan.findMany({ where: { mealPlanId: { not: null } }, select: { mealPlanId: true } })]);
  res.json({ templates: list.map(t => ({ ...t, assigned: plans.filter(p => p.mealPlanId === t.id).length })) });
});
router.post('/meal-plans', pro, body(templateBody), async (req, res) => {
  res.status(201).json({ template: await req.db.mealPlanTemplate.create({ data: req.body }) });
});
router.put('/meal-plans/:id', pro, body(templateBody), async (req, res) => {
  const t = must(await req.db.mealPlanTemplate.findFirst({ where: { id: req.params.id } }), 'That meal plan');
  res.json({ template: await req.db.mealPlanTemplate.update({ where: { id: t.id }, data: req.body }) });
});
router.delete('/meal-plans/:id', async (req, res) => {
  const t = must(await req.db.mealPlanTemplate.findFirst({ where: { id: req.params.id } }), 'That meal plan');
  await req.db.nutritionPlan.updateMany({ where: { mealPlanId: t.id }, data: { mealPlanId: null } });
  await req.db.mealPlanTemplate.delete({ where: { id: t.id } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- recipes (Pro)
const recipeBody = z.object({
  name: z.string().trim().min(2).max(80), servings: z.coerce.number().int().min(1).max(50),
  ingredients: z.array(z.object({ name: z.string().trim().min(1).max(120), grams: z.coerce.number().min(0).max(5000), foodRef: z.string().max(80).nullable().optional() })).min(1).max(40),
  steps: z.array(z.string().trim().min(1).max(600)).max(30),
});
async function perServing(ingredients, servings) {
  const t = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const i of ingredients) {
    const f = i.foodRef ? await foods().get(i.foodRef) : null;
    if (!f) continue;
    const v = nutrientsFor(f, i.grams);
    for (const k of Object.keys(t)) t[k] += v[k];
  }
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v / servings * 10) / 10]));
}
router.get('/recipes', async (req, res) => res.json({ recipes: await req.db.recipe.findMany({ orderBy: { name: 'asc' } }) }));
router.post('/recipes', pro, body(recipeBody), async (req, res) => {
  res.status(201).json({ recipe: await req.db.recipe.create({ data: { ...req.body, perServing: await perServing(req.body.ingredients, req.body.servings) } }) });
});
router.put('/recipes/:id', pro, body(recipeBody), async (req, res) => {
  const r = must(await req.db.recipe.findFirst({ where: { id: req.params.id } }), 'That recipe');
  res.json({ recipe: await req.db.recipe.update({ where: { id: r.id }, data: { ...req.body, perServing: await perServing(req.body.ingredients, req.body.servings) } }) });
});
router.delete('/recipes/:id', async (req, res) => {
  const r = must(await req.db.recipe.findFirst({ where: { id: req.params.id } }), 'That recipe');
  await req.db.recipe.delete({ where: { id: r.id } });
  res.json({ ok: true });
});
