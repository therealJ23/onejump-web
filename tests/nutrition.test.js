// Nutrition acceptance criteria (03-voice-and-nutrition-spec.md, Part 2).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jpeg from 'jpeg-js';
import { fixtures, loginCoach, loginClient } from './helpers.js';
import { platePhoto } from '../server/seed/sampleNutrition.js';
import { FoodService, UsdaProvider, OffProvider, normalizeUsda, rankUsda, CREDITS } from '../server/nutrition/foods.js';
import { restingNeeds, estimateTargets, isLowTarget, weeklyLossPct } from '../server/nutrition/calc.js';
import { checkNutritionLanguage } from '../server/nutrition/flags.js';
import { stripNumbers } from '../server/nutrition/plans.js';
import { stripJpegMetadata } from '../server/storage/StorageService.js';
import { splitFoods, parseSet, wordsToNumbers } from '../public/js/shared/parse.js';
import { guardNutrition, DIETITIAN } from '../server/ai/safety.js';
import { TenantAccessError } from '../server/db/tenant.js';

const FOOD_PHOTO = platePhoto([[236, 230, 214], [218, 174, 120], [72, 140, 72]], 7);
const BLANK_PHOTO = Buffer.from(jpeg.encode({ data: Buffer.alloc(160 * 120 * 4, 205), width: 160, height: 120 }, 80).data);
const NUMBER_KEYS = /"(calories|proteinG|carbsG|fatG|per100g|targets|totals|kcal|perServing|rmr)":/;

let f, dani, alex, mike;
beforeAll(async () => {
  f = await fixtures();
  dani = await loginCoach();
  alex = await loginCoach('alex@northsidebarbell.com');
  mike = await loginClient();
});
const entryCount = () => f.dbA.foodEntry.count({ where: { clientId: f.mike.id } });

describe('photo logging with Assist', () => {
  it('a food photo returns items from the mock; Add saves one entry with its items', async () => {
    const before = await entryCount();
    const r = await mike.upload('/api/me/food-photo', 'photo', FOOD_PHOTO, 'meal.jpg');
    expect(r.status).toBe(200);
    expect(r.body.isFood).toBe(true);
    expect(r.body.items.length).toBeGreaterThan(1);
    expect(r.body.items[0]).toMatchObject({ name: expect.any(String), grams: expect.any(Number), confidence: expect.stringMatching(/high|medium|low|estimate/) });
    expect(r.body.items.every(i => i.foodRef)).toBe(true);
    expect(await entryCount()).toBe(before); // nothing saved yet
    const items = r.body.items.map(i => ({ name: i.name, grams: i.grams, foodRef: i.foodRef, confidence: i.confidence }));
    items[0].grams = Math.round(items[0].grams * 1.5); // the client adjusted one portion
    const saved = await mike.post('/api/me/food-entries', { meal: 'lunch', source: 'photo', photoToken: r.body.photoToken, items });
    expect(saved.status).toBe(201);
    expect(saved.body.entry.items.length).toBe(items.length);
    expect(saved.body.entry.photoUrl).toMatch(/^\/files\//);
    expect(await entryCount()).toBe(before + 1);
    const row = await f.dbA.foodEntry.findFirst({ where: { id: saved.body.entry.id }, include: { items: true } });
    expect(row.photoKey).toContain(`food/${f.A.id}/${f.mike.id}/`);
    expect(row.items.length).toBe(items.length);
    // the same analysis can't be added twice
    expect((await mike.post('/api/me/food-entries', { meal: 'lunch', source: 'photo', photoToken: r.body.photoToken, items })).status).toBe(409);
  });

  it('an analysis that is never confirmed saves nothing', async () => {
    const before = await entryCount();
    const r = await mike.upload('/api/me/food-photo', 'photo', FOOD_PHOTO, 'meal.jpg');
    expect(r.status).toBe(200);
    expect(await entryCount()).toBe(before);
    expect((await mike.del(`/api/me/food-photo/${r.body.photoToken}`)).status).toBe(200);
    expect(await entryCount()).toBe(before);
  });

  it('a photo that isn’t food gets the friendly error', async () => {
    const r = await mike.upload('/api/me/food-photo', 'photo', BLANK_PHOTO, 'wall.jpg');
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('I couldn’t recognize food in this photo. Try again or search instead.');
  });

  it('the coach can try photo logging in the iPhone preview: items come back, nothing is saved', async () => {
    const entries = await entryCount(), insights = await f.dbA.aIInsight.count({ where: { kind: 'meal_photo' } });
    const r = await dani.upload('/api/nutrition/photo-preview', 'photo', FOOD_PHOTO, 'meal.jpg');
    expect(r.status).toBe(200);
    expect(r.body.isFood).toBe(true);
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items[0]).toHaveProperty('calories');
    expect(r.body).not.toHaveProperty('photoToken');
    expect(await entryCount()).toBe(entries);
    expect(await f.dbA.aIInsight.count({ where: { kind: 'meal_photo' } })).toBe(insights);
    expect((await dani.upload('/api/nutrition/photo-preview', 'photo', BLANK_PHOTO, 'wall.jpg')).status).toBe(422);
    expect((await dani.upload('/api/nutrition/photo-preview', 'photo', Buffer.from('not a photo at all'), 'x.jpg')).status).toBe(400);
    expect([401, 403]).toContain((await mike.upload('/api/nutrition/photo-preview', 'photo', FOOD_PHOTO, 'meal.jpg')).status);
  });

  it('photos are stripped of EXIF/GPS metadata', () => {
    const exif = Buffer.from('Exif\0\0GPSDATA!!'); const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, exif.length + 2]), exif]);
    const withExif = Buffer.concat([FOOD_PHOTO.subarray(0, 2), app1, FOOD_PHOTO.subarray(2)]);
    const clean = stripJpegMetadata(withExif);
    expect(clean.includes(Buffer.from('GPSDATA'))).toBe(false);
    expect(clean.length).toBe(FOOD_PHOTO.length);
    expect(jpeg.decode(clean).width).toBe(320);
  });
});

describe('food search (USDA FoodData Central) and barcodes (Open Food Facts)', () => {
  const usdaJson = { foods: [
    { fdcId: 1, description: 'GREEK YOGURT', dataType: 'Branded', brandOwner: 'Sample Dairy', servingSize: 170, servingSizeUnit: 'g', householdServingFullText: '1 container', foodNutrients: [{ nutrientId: 1008, value: 59, unitName: 'KCAL' }, { nutrientId: 1003, value: 10.2, unitName: 'G' }, { nutrientId: 1005, value: 3.6, unitName: 'G' }, { nutrientId: 1004, value: 0.4, unitName: 'G' }] },
    { fdcId: 2, description: 'Yogurt, Greek, plain, nonfat', dataType: 'SR Legacy', foodMeasures: [{ disseminationText: '1 container', gramWeight: 170 }], foodNutrients: [{ nutrientNumber: '208', value: 59, unitName: 'KCAL' }, { nutrientNumber: '203', value: 10.2, unitName: 'G' }, { nutrientNumber: '205', value: 3.6, unitName: 'G' }, { nutrientNumber: '204', value: 0.4, unitName: 'G' }] },
  ] };

  it('returns USDA results, whole foods first; the second identical search is a cache hit', async () => {
    let calls = 0;
    const fetchImpl = async (url, opts) => { calls++; expect(url).toContain('api.nal.usda.gov/fdc/v1/foods/search'); expect(JSON.parse(opts.body).query).toBe('greek yogurt test'); return new Response(JSON.stringify(usdaJson), { status: 200 }); };
    const svc = new FoodService({ mode: 'live', usda: new UsdaProvider({ apiKey: 'test', fetchImpl }), off: new OffProvider({ fetchImpl: async () => { throw new Error('no'); } }) });
    const a = await svc.search('Greek yogurt TEST');
    expect(a.cached).toBe(false);
    expect(a.results[0]).toMatchObject({ ref: 'usda:2', dataType: 'SR Legacy', per100g: { calories: 59, proteinG: 10.2 } });
    expect(a.credit).toEqual(CREDITS.usda);
    const b = await svc.search('greek yogurt test');
    expect(b.cached).toBe(true);
    expect(b.results).toEqual(a.results);
    expect(calls).toBe(1);
    expect((await svc.get('usda:1')).name).toBe('Greek Yogurt'); // cached individually, CAPS tidied
  });

  it('prefers a branded match when the search names the brand', () => {
    const list = usdaJson.foods.map(normalizeUsda);
    expect(rankUsda(list, 'sample dairy yogurt')[0].ref).toBe('usda:1');
  });

  it('a known barcode returns the product with Open Food Facts attribution; one API call per scan', async () => {
    let calls = 0;
    const off = new OffProvider({ fetchImpl: async url => { calls++; expect(url).toContain('world.openfoodfacts.org/api/v2/product/3017620422003'); return new Response(JSON.stringify({ status: 1, product: { product_name: 'Hazelnut spread', brands: 'Sample', serving_quantity: 15, serving_size: '15 g', nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 } } }), { status: 200 }); } });
    const svc = new FoodService({ mode: 'live', usda: new UsdaProvider({ fetchImpl: async () => { throw new Error('no'); } }), off });
    const r = await svc.barcode('3017620422003');
    expect(r.food).toMatchObject({ ref: 'off:3017620422003', name: 'Hazelnut spread', per100g: { calories: 539 } });
    expect(r.credit.text).toBe('Contains data from Open Food Facts, available under the Open Database License');
    await svc.barcode('3017620422003');
    expect(calls).toBe(1);
  });

  it('over HTTP: search works, a known code returns the product, an unknown code offers Quick add', async () => {
    const s = await mike.get('/api/foods/search?q=chicken breast');
    expect(s.status).toBe(200);
    expect(s.body.results[0].name).toMatch(/chicken/i);
    const ok = await mike.get('/api/foods/barcode/0000000000017');
    expect(ok.status).toBe(200);
    expect(ok.body.credit.text).toMatch(/Open Food Facts/);
    const missing = await mike.get('/api/foods/barcode/99999999');
    expect(missing.status).toBe(404);
    expect(missing.body.quickAdd).toBe(true);
    expect((await mike.get('/api/foods/barcode/12ab')).status).toBe(400);
  });
});

describe('client logging', () => {
  it('quick add, search add, favorites, repeat and delete', async () => {
    const q = await mike.post('/api/me/food-entries', { meal: 'snack', source: 'quick', items: [{ name: 'Office birthday cake', calories: 350, proteinG: 4 }] });
    expect(q.status).toBe(201);
    expect(q.body.entry.totals.calories).toBe(350);
    expect((await mike.post('/api/me/food-entries', { meal: 'snack', source: 'quick', items: [{ name: 'No numbers' }] })).status).toBe(400);
    const s = await mike.post('/api/me/food-entries', { meal: 'breakfast', source: 'search', items: [{ name: 'Egg', grams: 100, foodRef: 'mock:egg', calories: 1 }] });
    expect(s.body.entry.items[0].calories).toBe(155); // the server does the math, not the browser
    const fav = await mike.post('/api/me/food-favorites', { entryId: s.body.entry.id });
    expect(fav.status).toBe(201);
    const used = await mike.post('/api/me/food-entries', { meal: 'breakfast', source: 'favorite', favoriteId: fav.body.favorite.id });
    expect(used.body.entry.items[0].calories).toBe(155);
    for (const id of [q.body.entry.id, s.body.entry.id, used.body.entry.id]) expect((await mike.del(`/api/me/food-entries/${id}`)).status).toBe(200);
    expect(await f.dbA.foodEntryItem.count({ where: { entryId: q.body.entry.id } })).toBe(0);
  });

  it('voice/text: “two eggs and toast” becomes foods to review (nothing saved)', async () => {
    const before = await entryCount();
    const r = await mike.post('/api/me/food-text', { text: 'two eggs and toast', source: 'voice' });
    expect(r.status).toBe(200);
    expect(r.body.items.map(i => i.name)).toEqual(['Egg, whole, cooked', 'Toast, whole-wheat bread']);
    expect(r.body.items[0].grams).toBe(100);
    expect(await entryCount()).toBe(before);
  });

  it('habits toggle once a day', async () => {
    const h = await f.dbA.habit.findFirst({ where: { clientId: f.mike.id } });
    const a = await mike.post(`/api/me/habits/${h.id}/check`, {});
    const b = await mike.post(`/api/me/habits/${h.id}/check`, {});
    expect(a.body.done).toBe(!b.body.done);
    const other = await f.dbA.habit.findFirst({ where: { NOT: { clientId: f.mike.id } } });
    expect((await mike.post(`/api/me/habits/${other.id}/check`, {})).status).toBe(404);
  });
});

describe('hide numbers', () => {
  afterAll(async () => { await dani.put(`/api/clients/${f.mike.id}/nutrition-plan`, { hideNumbers: false }); });
  it('client API responses contain no calories or macros', async () => {
    expect((await dani.put(`/api/clients/${f.mike.id}/nutrition-plan`, { hideNumbers: true })).status).toBe(200);
    const responses = [
      await mike.get('/api/me/nutrition/today'),
      await mike.get('/api/foods/search?q=rice'),
      await mike.get('/api/foods/barcode/0000000000024'),
      await mike.post('/api/me/food-text', { text: 'a cup of rice', source: 'text' }),
      await mike.post('/api/me/food-entries', { meal: 'snack', source: 'search', items: [{ name: 'Rice', grams: 158, foodRef: 'mock:white-rice' }] }),
    ];
    for (const r of responses) {
      expect(r.status).toBeLessThan(300);
      expect(JSON.stringify(r.body), r.req?.path).not.toMatch(NUMBER_KEYS);
      expect(JSON.stringify(r.body)).not.toMatch(/\bkcal\b/i);
    }
    expect(responses[0].body.hideNumbers).toBe(true);
    // the coach still sees the numbers
    const coach = await dani.get(`/api/clients/${f.mike.id}/food-entries`);
    expect(JSON.stringify(coach.body)).toMatch(/"calories"/);
    await mike.del(`/api/me/food-entries/${responses[4].body.entry.id}`);
  });
  it('stripNumbers removes values at any depth', () => {
    expect(stripNumbers({ a: [{ calories: 1, name: 'x', per100g: { proteinG: 2 } }], totals: {} })).toEqual({ a: [{ name: 'x' }] });
  });
});

describe('targets and the calculator', () => {
  afterAll(async () => { await dani.put(`/api/clients/${f.mike.id}/nutrition-plan`, { calories: 2200 }); });

  it('Mifflin-St Jeor and the estimate (never below resting needs)', () => {
    expect(restingNeeds({ sex: 'male', weightLb: 205, heightIn: 71, age: 38 })).toBe(1872);
    expect(restingNeeds({ sex: 'female', weightLb: 154.4, heightIn: 65, age: 32 })).toBe(1411);
    expect(restingNeeds({ sex: 'female', weightLb: 150 })).toBeNull();
    const e = estimateTargets({ sex: 'female', weightLb: 154.4, heightIn: 65, age: 32, activity: 1.2, goal: 'lose' });
    expect(e.label).toBe('Estimate');
    expect(e.calories).toBeGreaterThanOrEqual(e.rmr);
    expect(e.proteinRange).toEqual([110, 155]);
    expect(isLowTarget(1150, 1411)).toBe(true);
    expect(isLowTarget(1100, null)).toBe(true);
  });

  it('a target below resting needs can’t be saved without confirmation, and the confirmation is audited', async () => {
    const no = await dani.put(`/api/clients/${f.mike.id}/nutrition-plan`, { calories: 1300 });
    expect(no.status).toBe(400);
    expect(no.body.code).toBe('low_target');
    expect(no.body.rmr).toBeGreaterThan(1300);
    expect((await f.dbA.nutritionPlan.findFirst({ where: { clientId: f.mike.id } })).calories).toBe(2200);
    const yes = await dani.put(`/api/clients/${f.mike.id}/nutrition-plan`, { calories: 1300, confirmLowTarget: true });
    expect(yes.status).toBe(200);
    expect(yes.body.warnings[0].code).toBe('below_rmr');
    const log = await f.dbA.auditLog.findFirst({ where: { action: 'nutrition_low_target_confirmed', target: f.mike.id }, orderBy: { at: 'desc' } });
    expect(log.meta).toMatchObject({ calories: 1300 });
    // editing something else keeps the reviewed target without asking again
    expect((await dani.put(`/api/clients/${f.mike.id}/nutrition-plan`, { coachNote: 'Reviewed with Mike.' })).status).toBe(200);
  });

  it('the calculator returns an estimate and saves nothing', async () => {
    const before = await f.dbA.nutritionPlan.findFirst({ where: { clientId: f.mike.id } });
    const r = await dani.post(`/api/clients/${f.mike.id}/nutrition-plan/estimate`, { sex: 'male', heightIn: 71, activity: 1.55, goal: 'lose' });
    expect(r.status).toBe(200);
    expect(r.body.estimate.label).toBe('Estimate');
    const after = await f.dbA.nutritionPlan.findFirst({ where: { clientId: f.mike.id } });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('meal plan approach shows the dietitian scope reminder', async () => {
    const aisha = await f.dbA.client.findFirst({ where: { name: 'Aisha Bello' } });
    const r = await dani.get(`/api/clients/${aisha.id}/nutrition-plan`);
    expect(r.body.scopeReminder).toMatch(/dietitian license/);
  });

  it('fast loss: more than 1% of body weight a week over 2+ weeks', () => {
    const d = n => new Date(Date.now() - n * 864e5);
    expect(weeklyLossPct([{ date: d(21), value: 200 }, { date: d(0), value: 192 }])).toBeGreaterThan(1);
    expect(weeklyLossPct([{ date: d(21), value: 200 }, { date: d(0), value: 197 }])).toBeLessThan(1);
    expect(weeklyLossPct([{ date: d(7), value: 200 }, { date: d(0), value: 190 }])).toBeNull();
  });
});

describe('language flags (coach-only)', () => {
  it('recognises compensating, purging, earning, restriction and at-risk language', () => {
    expect(checkNutritionLanguage('Skipped lunch to make up for last night').category).toBe('compensating');
    expect(checkNutritionLanguage('I have to earn my dinner tonight').category).toBe('earning');
    expect(checkNutritionLanguage('gonna burn it off tomorrow').category).toBe('earning');
    expect(checkNutritionLanguage('only ate 600 today').category).toBe('restriction');
    expect(checkNutritionLanguage('made myself throw up after dinner').category).toBe('purging');
    expect(checkNutritionLanguage('honestly I don’t want to be here anymore')).toMatchObject({ category: 'at_risk', severity: 'urgent' });
    for (const t of ['Had pizza with friends, so good', 'skipped the gym today', 'great week of eating']) expect(checkNutritionLanguage(t).flagged, t).toBe(false);
  });

  it('restriction language creates a coach-only flag; the client sees nothing and gets no automatic reply', async () => {
    const coachMsgs = () => f.dbA.message.count({ where: { clientId: f.mike.id, senderRole: 'COACH' } });
    const before = await coachMsgs();
    const sent = await mike.post('/api/me/messages', { body: 'Skipped breakfast and lunch to make up for eating so much yesterday.' });
    expect(sent.status).toBe(201);
    const flag = await f.dbA.nutritionFlag.findFirst({ where: { sourceType: 'message', sourceId: sent.body.message.id } });
    expect(flag).toMatchObject({ category: 'compensating', status: 'open', clientId: f.mike.id });
    expect(await coachMsgs()).toBe(before); // Assist never replies on its own
    for (const url of ['/api/me/today', '/api/me/thread', '/api/me/nutrition/today', '/api/me/account']) expect(JSON.stringify((await mike.get(url)).body), url).not.toMatch(/flag|compensat/i);
    await expect(f.dbMike.nutritionFlag.findMany()).rejects.toThrow(TenantAccessError);
    // the coach gets a warm, number-free draft to send themselves
    const d = await dani.post(`/api/nutrition/flags/${flag.id}/draft`);
    expect(d.body.text).toMatch(/doctor or a registered dietitian/);
    expect(d.body.text).not.toMatch(/\d/);
    expect(await coachMsgs()).toBe(before);
    // and the normal Assist reply draft for that message is the same kind of reply
    const draft = await dani.post(`/api/threads/${f.mike.id}/draft`, { intent: 'reply-last' });
    expect(draft.body.text).toMatch(/registered dietitian/);
    await dani.post(`/api/nutrition/flags/${flag.id}/resolve`);
  });

  it('nutrition drafts never recommend supplements or give medical nutrition advice', () => {
    expect(guardNutrition('Try a fat burner, it helps!', { contextTexts: ['what about fat burners?'] }).text).toContain(DIETITIAN);
    expect(guardNutrition('Keto is fine for you.', { contextTexts: ['is keto ok with my diabetes?'] }).text).toContain(DIETITIAN);
    expect(guardNutrition('Nice job this week!', { contextTexts: ['had a great week'] }).text).toBe('Nice job this week!');
  });
});

describe('isolation', () => {
  it('food entries, photos, plans and flags are never visible across businesses or to other clients', async () => {
    for (const model of ['foodEntry', 'foodEntryItem', 'nutritionPlan', 'nutritionFlag', 'habit', 'habitCheck', 'foodFavorite', 'mealPlanTemplate', 'recipe']) {
      expect(await f.dbA[model].count(), `${model} in A`).toBeGreaterThan(0);
      expect(await f.dbB[model].count(), `${model} in B`).toBeGreaterThan(0);
      expect((await f.dbA[model].findMany()).every(r => r.businessId === f.A.id), model).toBe(true);
    }
    const bClient = await f.dbB.client.findFirst({ where: { name: 'Jordan Pike' } });
    for (const url of [`/api/clients/${bClient.id}/nutrition`, `/api/clients/${bClient.id}/nutrition-plan`, `/api/clients/${bClient.id}/food-entries`]) expect((await dani.get(url)).status, url).toBe(404);
    expect((await dani.put(`/api/clients/${bClient.id}/nutrition-plan`, { calories: 900, confirmLowTarget: true })).status).toBe(404);
    const bFlag = await f.dbB.nutritionFlag.findFirst();
    expect((await dani.post(`/api/nutrition/flags/${bFlag.id}/resolve`)).status).toBe(404);
    const bTemplate = await f.dbB.mealPlanTemplate.findFirst();
    expect((await dani.put(`/api/clients/${f.mike.id}/nutrition-plan`, { mealPlanId: bTemplate.id })).status).toBe(404);
    const overview = JSON.stringify((await dani.get('/api/nutrition/overview')).body);
    expect(overview).not.toMatch(/Northside|Jordan/);
    expect((await alex.get('/api/nutrition/overview')).body.rows.map(r => r.name).sort()).toEqual(['Jordan Pike', 'Morgan Ruiz', 'Riley Chen']);
    // clients only see their own log
    const other = await f.dbA.foodEntry.findFirst({ where: { NOT: { clientId: f.mike.id } } });
    expect((await mike.del(`/api/me/food-entries/${other.id}`)).status).toBe(404);
    expect((await mike.post('/api/me/food-favorites', { entryId: other.id })).status).toBe(404);
    expect((await f.dbMike.foodEntry.findMany()).every(e => e.clientId === f.mike.id)).toBe(true);
    expect((await f.dbMike.foodEntryItem.findMany()).every(e => e.clientId === f.mike.id)).toBe(true);
    await expect(f.dbMike.mealPlanTemplate.findMany()).rejects.toThrow(TenantAccessError);
    // photo links only for this client's own photos, and they expire
    const today = (await mike.get('/api/me/nutrition/today')).body;
    for (const e of today.entries.filter(x => x.photoUrl)) expect(decodeURIComponent(e.photoUrl)).toContain(`food/${f.A.id}/${f.mike.id}/`);
  });
});

describe('plans: Starter vs Pro', () => {
  let original;
  beforeAll(async () => { original = await f.dbA.business.findFirst({ select: { plan: true, planStatus: true } }); await f.dbA.business.update({ where: { id: f.A.id }, data: { plan: 'STARTER', planStatus: 'active' } }); });
  afterAll(async () => { await f.dbA.business.update({ where: { id: f.A.id }, data: original }); });

  it('photo and voice logging return 403 with an upgrade message, and the app shows them as Pro', async () => {
    const p = await mike.upload('/api/me/food-photo', 'photo', FOOD_PHOTO, 'meal.jpg');
    expect(p.status).toBe(403);
    expect(p.body.upgrade).toBe('PRO');
    expect(p.body.error).toMatch(/part of OneJump Pro/);
    const v = await mike.post('/api/me/food-text', { text: 'two eggs', source: 'voice' });
    expect(v.status).toBe(403);
    expect(v.body.upgrade).toBe('PRO');
    expect((await mike.post('/api/me/food-entries', { meal: 'lunch', source: 'voice', items: [{ name: 'Egg', foodRef: 'mock:egg', grams: 50 }] })).status).toBe(403);
    expect((await mike.get('/api/me/nutrition/today')).body.features).toEqual({ photo: false, voice: false });
    // the basics keep working on every plan
    expect((await mike.post('/api/me/food-text', { text: 'two eggs', source: 'text' })).status).toBe(200);
    expect((await mike.get('/api/foods/search?q=egg')).status).toBe(200);
    expect((await dani.get(`/api/clients/${f.mike.id}/nutrition-summary`)).status).toBe(403);
  });
});

describe('parsers', () => {
  it('number words and food lists', () => {
    expect(wordsToNumbers('one thirty five for eight')).toBe('135 for 8');
    expect(splitFoods('two eggs and toast')).toEqual([{ qty: 2, unit: null, food: 'eggs' }, { qty: 1, unit: null, food: 'toast' }]);
    expect(splitFoods('I had a cup of rice and 6 oz chicken')).toEqual([{ qty: 1, unit: 'cup', food: 'rice' }, { qty: 6, unit: 'oz', food: 'chicken' }]);
    expect(parseSet('10 reps at 55')).toMatchObject({ reps: 10, weight: 55 });
  });
});

describe('Assist on nutrition: Today queue, radar, check-ins', async () => {
  const { scoreRisk } = await import('../server/core/risk.js');

  it('the Today queue has one item for clients missing protein most days, with a personal draft each', async () => {
    const t = (await dani.get('/api/today')).body;
    const item = t.items.find(i => i.id === 'nutrition');
    expect(item.title).toBe('3 clients missed their protein target most days');
    expect(item.drafts.map(d => d.client.name).sort()).toEqual(['Grace Owens', 'Kevin Shah', 'Tom Becker']);
    for (const d of item.drafts) { expect(d.text).toContain(d.client.name.split(' ')[0]); expect(d.text).not.toMatch(/\d/); }
    // approving one sends exactly that client's draft
    const d = item.drafts[0];
    const before = await f.dbA.message.count({ where: { clientId: d.client.id } });
    expect((await dani.post(`/api/insights/${d.insightId}/approve`)).status).toBe(200);
    expect(await f.dbA.message.count({ where: { clientId: d.client.id } })).toBe(before + 1);
    await dani.post(`/api/insights/${d.insightId}/undo`);
    expect(await f.dbA.message.count({ where: { clientId: d.client.id } })).toBe(before);
  });

  it('the radar adds 6 points when logging stopped and 4 when protein is rarely hit for 2 weeks', async () => {
    expect(scoreRisk({ foodStopped: true }).score).toBe(6);
    expect(scoreRisk({ proteinLow: true }).score).toBe(4);
    expect(scoreRisk({ foodStopped: true }).reasons).toEqual(['Stopped logging food 5+ days ago']);
    const sarah = await f.dbA.client.findFirst({ where: { name: 'Sarah Kim' } });
    expect(sarah.riskReasons).toContain('Stopped logging food 5+ days ago');
  });

  it('the weekly check-in shows days logged and protein days hit, and the summary mentions food', async () => {
    const k = await f.dbA.checkIn.findFirst({ where: { clientId: f.mike.id }, orderBy: { submittedAt: 'desc' } });
    const r = await dani.get(`/api/checkins/${k.id}`);
    expect(r.body.nutrition).toMatchObject({ daysLogged: expect.any(Number), proteinHitDays: expect.any(Number), approach: 'targets' });
    const a = await dani.get(`/api/checkins/${k.id}/assist?refresh=1`);
    expect(a.body.insight.summary).toMatch(/Food log: \d of 7 days logged, protein target reached on \d/);
  });
});

describe('Assist builds a nutrition plan (draft → coach approves)', () => {
  let c;
  beforeAll(async () => {
    c = await f.dbA.client.create({ data: { name: 'Plan Tester', goalType: 'Fat loss', birthYear: new Date().getFullYear() - 30, status: 'ACTIVE', why: 'Wants more energy for her kids' } });
    await f.dbA.measurement.create({ data: { clientId: c.id, weight: 170, takenAt: new Date() } });
    await f.dbA.nutritionPlan.create({ data: { clientId: c.id, approach: 'habits', sex: 'female', heightIn: 65 } });
  });
  afterAll(async () => {
    const plan = await f.dbA.nutritionPlan.findFirst({ where: { clientId: c.id } });
    await f.dbA.habit.deleteMany({ where: { clientId: c.id } });
    await f.dbA.nutritionPlan.deleteMany({ where: { clientId: c.id } });
    if (plan?.mealPlanId) await f.dbA.mealPlanTemplate.deleteMany({ where: { id: plan.mealPlanId } });
    await f.dbA.measurement.deleteMany({ where: { clientId: c.id } });
    await f.dbA.client.deleteMany({ where: { id: c.id } });
  });

  it('drafts from the client’s details, never below resting needs, and saves nothing', async () => {
    const r = await dani.post(`/api/clients/${c.id}/nutrition-plan/assist`, { request: 'fat loss, simple meals, a meal plan please' });
    expect(r.status).toBe(200);
    const d = r.body.draft;
    expect(d.approach).toBe('meal_plan');
    expect(d.calories).toBeGreaterThanOrEqual(r.body.estimate.rmr);
    expect(d.proteinG).toBeGreaterThanOrEqual(170 * 0.7 - 5);
    expect(d.proteinG).toBeLessThanOrEqual(170 + 5);
    expect(d.mealPlan.days.length).toBeGreaterThan(0);
    expect(r.body.scopeReminder).toMatch(/dietitian/);
    const plan = await f.dbA.nutritionPlan.findFirst({ where: { clientId: c.id } });
    expect(plan.calories).toBeNull(); // still the coach's plan, untouched
    expect(await f.dbA.habit.count({ where: { clientId: c.id } })).toBe(0);
  });

  it('“Use this plan” saves targets, habits and the meal plan; the client sees the note', async () => {
    const { draft } = (await dani.post(`/api/clients/${c.id}/nutrition-plan/assist`, { request: 'meal plan' })).body;
    const r = await dani.post(`/api/clients/${c.id}/nutrition-plan/apply-draft`, draft);
    expect(r.status).toBe(200);
    expect(r.body.plan).toMatchObject({ approach: 'meal_plan', calories: draft.calories, proteinG: draft.proteinG, coachNote: draft.coachNote });
    expect(r.body.plan.mealPlanId).toBeTruthy();
    expect(await f.dbA.habit.count({ where: { clientId: c.id, active: true } })).toBe(draft.habits.length);
    const again = await dani.post(`/api/clients/${c.id}/nutrition-plan/apply-draft`, { ...draft, mealPlan: null });
    expect(again.body.habitsAdded).toBe(0); // no duplicate habits
  });

  it('an edited target below resting needs needs “I’ve reviewed this target”', async () => {
    const { draft } = (await dani.post(`/api/clients/${c.id}/nutrition-plan/assist`, { request: '' })).body;
    const low = await dani.post(`/api/clients/${c.id}/nutrition-plan/apply-draft`, { ...draft, mealPlan: null, calories: 900 });
    expect(low.status).toBe(400);
    expect(low.body.code).toBe('low_target');
  });

  it('code holds the line: below-RMR raised, medical topics or missing data → no numbers', async () => {
    const { enforcePlan } = await import('../server/nutrition/assistPlan.js');
    const est = estimateTargets({ sex: 'female', weightLb: 170, heightIn: 65, age: 30, goal: 'lose' });
    const raw = { summary: 's', approach: 'targets', calories: 800, proteinG: 400, carbsG: 10, fatG: 5, habits: ['Protein at every meal', 'Take a fat burner supplement'], mealPlan: null, coachNote: null, needsProfessional: false, professionalReason: null };
    const a = enforcePlan(raw, { est, inputs: { weightLb: 170 }, texts: ['simple'], credentialed: false });
    expect(a.draft.calories).toBeGreaterThanOrEqual(est.rmr);
    expect(a.draft.calories).toBeLessThan(est.rmr + 10);
    expect(a.draft.proteinG).toBeLessThanOrEqual(170);
    expect(a.draft.habits).toEqual(['Protein at every meal']);
    const m = enforcePlan(raw, { est, inputs: { weightLb: 170 }, texts: ['She has type 2 diabetes'], credentialed: false });
    expect(m.draft).toMatchObject({ needsProfessional: true, calories: null, approach: 'habits', mealPlan: null });
    const es = enforcePlan(raw, { est, inputs: { weightLb: 170 }, texts: ['Está embarazada'], credentialed: false });
    expect(es.draft.calories).toBeNull();
    const none = enforcePlan(raw, { est: estimateTargets({ weightLb: 170 }), inputs: { weightLb: 170 }, texts: [''], credentialed: false });
    expect(none.draft.calories).toBeNull();
    expect(none.notes[0]).toMatch(/sex/);
  });

  it('another business can’t draft or apply for this client', async () => {
    expect((await alex.post(`/api/clients/${c.id}/nutrition-plan/assist`, { request: '' })).status).toBe(404);
    expect((await alex.post(`/api/clients/${c.id}/nutrition-plan/apply-draft`, { approach: 'habits' })).status).toBe(404);
  });
});
