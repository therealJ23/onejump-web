// Coach: the Nutrition page (Coaching → Nutrition), meal plan templates and recipes, private flags.
import { Router } from 'express';
import { body, z } from '../lib/validate.js';
import { must, badRequest } from '../lib/errors.js';
import { requireFeature } from '../auth/middleware.js';
import { overview } from '../nutrition/insights.js';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { attentionItems, matchPhotoItems } from '../nutrition/attention.js';
import { AI } from '../ai/AIService.js';
import { config } from '../config.js';
import { stripJpegMetadata, sniffImage } from '../storage/StorageService.js';
import { foods, nutrientsFor, CREDITS } from '../nutrition/foods.js';
import { flagReplyDraft } from '../nutrition/flags.js';
import { audit } from '../db/system.js';
import { ensureStarterRecipes, shapeRecipe } from '../nutrition/recipes.js';
import { StorageService } from '../storage/StorageService.js';
import { randomUUID } from 'node:crypto';

export const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 4, fieldSize: 1024 } });
const photoLimit = rateLimit({ windowMs: 24 * 3600e3, limit: 40, keyGenerator: req => `photo:${req.auth.businessId}`, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => config.isTest, message: { error: 'That’s 40 photos today, the daily limit for trying it out. Search still works.', code: 'photo_limit' } });
const tzOf = async db => (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';

router.get('/overview', async (req, res) => {
  const tz = await tzOf(req.db);
  const data = await overview(req.db, { tz });
  res.json({ ...data, attention: await attentionItems(req.db, data, { tz }), credits: [CREDITS.usda, CREDITS.off], provider: foods().mode });
});

// ---------------------------------------------------------------- photo logging, tried by the coach (Pro)
/** The iPhone app's client preview: Assist reads a meal photo for the coach. Nothing is saved: no photo, no food log. */
router.post('/photo-preview', requireFeature('PRO', 'Photo logging'), photoLimit, upload.single('photo'), async (req, res) => {
  if (!req.file) throw badRequest('Take or choose a photo.');
  if (sniffImage(req.file.buffer) !== 'image/jpeg') throw badRequest('Send the photo as a JPEG. The app does this for you; try again.');
  const clean = stripJpegMetadata(req.file.buffer);
  if (!clean) throw badRequest('That photo couldn’t be read. Try again.');
  const a = (await AI.analyzeMealPhoto(clean, { db: req.db })).data;
  if (!a.is_food || !a.items.length) return res.status(422).json({ error: 'I couldn’t recognize food in this photo. Try again or search instead.', code: 'not_food' });
  const items = await matchPhotoItems(a);
  res.json({ isFood: true, title: a.title, note: a.note, items: items.map(x => ({ ...x, check: x.confidence !== 'high' })) });
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
  minutes: z.coerce.number().int().min(1).max(600).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(6).optional(),
  shared: z.boolean().optional(),
  art: z.string().regex(/^[a-z_]{2,40}$/).nullable().optional(),
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
router.get('/recipes', async (req, res) => {
  await ensureStarterRecipes(req.db);
  const list = await req.db.recipe.findMany({ orderBy: { name: 'asc' } });
  res.json({ recipes: await Promise.all(list.map(r => shapeRecipe(r))) });
});
// The coach's own photo for a recipe (replaces the built-in picture).
router.post('/recipes/:id/photo', upload.single('photo'), async (req, res) => {
  const r = must(await req.db.recipe.findFirst({ where: { id: req.params.id } }), 'That recipe');
  const type = req.file?.buffer ? sniffImage(req.file.buffer) : null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw badRequest('Choose a JPEG, PNG or WebP photo.');
  const buf = type === 'image/jpeg' ? stripJpegMetadata(req.file.buffer) : req.file.buffer;
  const key = `recipes/${req.auth.businessId}/${randomUUID()}.${type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'}`;
  await StorageService.put(key, buf, type);
  if (r.photoKey) StorageService.remove(r.photoKey).catch(() => null);
  res.json({ recipe: await shapeRecipe(await req.db.recipe.update({ where: { id: r.id }, data: { photoKey: key } })) });
});
router.post('/recipes', pro, body(recipeBody), async (req, res) => {
  res.status(201).json({ recipe: await shapeRecipe(await req.db.recipe.create({ data: { ...req.body, perServing: await perServing(req.body.ingredients, req.body.servings) } })) });
});
router.put('/recipes/:id', pro, body(recipeBody), async (req, res) => {
  const r = must(await req.db.recipe.findFirst({ where: { id: req.params.id } }), 'That recipe');
  // Starter recipes have no food links, so recomputing gives zeros: keep their estimates then.
  const computed = await perServing(req.body.ingredients, req.body.servings);
  res.json({ recipe: await shapeRecipe(await req.db.recipe.update({ where: { id: r.id }, data: { ...req.body, perServing: computed.calories ? computed : r.perServing } })) });
});
router.delete('/recipes/:id', async (req, res) => {
  const r = must(await req.db.recipe.findFirst({ where: { id: req.params.id } }), 'That recipe');
  await req.db.recipe.delete({ where: { id: r.id } });
  res.json({ ok: true });
});
