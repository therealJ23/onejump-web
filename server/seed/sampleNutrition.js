// Sample nutrition data for the demo workspace: plans (habits / targets / meal plan / hidden
// numbers), a week of food logs, habits with check-ins, two meal photos, a meal plan template,
// a recipe, a below-resting-needs target to review and one private flag.
import { randomUUID } from 'node:crypto';
import jpeg from 'jpeg-js';
import { MOCK_FOODS } from '../nutrition/mockFoods.js';
import { nutrientsFor } from '../nutrition/foods.js';
import { saveEntry } from '../nutrition/plans.js';
import { raiseFlag } from '../nutrition/flags.js';
import { StorageService } from '../storage/StorageService.js';
import { todayKey, addDays } from '../lib/time.js';

const F = Object.fromEntries(MOCK_FOODS.map(f => [f.ref.slice(5), f]));
const item = (id, grams, portionText = null) => ({ name: F[id].name, grams, portionText: portionText || F[id].servings[0].label, ...nutrientsFor(F[id], grams), foodRef: F[id].ref, fdcId: null, barcode: null, confidence: null });

/** A simple illustrated "plate" JPEG (no real photo needed for the demo). */
export function platePhoto(colors, seed = 1) {
  const w = 320, h = 240, data = Buffer.alloc(w * h * 4);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const blobs = colors.map((c, i) => ({ c, x: 160 + Math.cos(i * 2.1 + seed) * 48, y: 120 + Math.sin(i * 2.1 + seed) * 38, r: 34 + rnd() * 12 }));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    let [r, g, b] = [126 + ((x >> 4) + (y >> 4)) % 2 * 10, 98, 72]; // wooden table
    const d = Math.hypot(x - 160, y - 120);
    if (d < 104) [r, g, b] = d > 96 ? [222, 226, 220] : [244, 246, 241]; // plate + rim
    for (const bl of blobs) { const dd = Math.hypot(x - bl.x, (y - bl.y) * 1.15); if (dd < bl.r) { const k = 1 - dd / bl.r * 0.35 + (rnd() - 0.5) * 0.12; [r, g, b] = bl.c.map(v => Math.max(0, Math.min(255, v * k))); } }
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ data, width: w, height: h }, 82).data);
}

// protein factor per day (oldest → today); null = nothing logged that day
const PATTERNS = {
  c1: { days: [1.02, 0.96, 0.7, 1.0, 0.98, 1.03, 0.55], target: { approach: 'targets', calories: 2200, proteinG: 180, carbsG: 220, fatG: 70, sex: 'male', heightIn: 71, activity: 1.55, goal: 'lose', coachNote: 'Protein at every meal, weekends included. Log what you can; it doesn’t need to be perfect.' } },
  c4: { days: [1.0, 1.05, null, 0.95, 1.0, 1.02, 0.4], target: { approach: 'targets', calories: 2100, proteinG: 120, carbsG: 260, fatG: 65, sex: 'female', heightIn: 66, activity: 1.725, goal: 'maintain' } },
  c6: { days: [0.6, 0.66, null, 0.95, 0.62, null, 0.3], target: { approach: 'targets', calories: 2300, proteinG: 190, carbsG: 230, fatG: 75, sex: 'male', heightIn: 70, activity: 1.375, goal: 'lose', coachNote: 'On travel days, grab a protein option at breakfast.' } },
  c15: { days: [0.55, null, 0.6, 0.93, null, 0.5, null], target: { approach: 'targets', calories: 1700, proteinG: 120, carbsG: 180, fatG: 55, sex: 'female', heightIn: 64, activity: 1.375, goal: 'lose' } },
  c18: { days: [0.5, 0.6, null, 0.55, 0.65, null, null], target: { approach: 'targets', calories: 2500, proteinG: 200, carbsG: 250, fatG: 80, sex: 'male', heightIn: 72, activity: 1.375, goal: 'lose' } },
  c11: { days: [1.0, 0.95, 1.0, null, 0.97, 1.0, 0.5], target: { approach: 'targets', calories: 1150, proteinG: 120, carbsG: 110, fatG: 40, sex: 'female', heightIn: 65, activity: 1.375, goal: 'lose' }, lowUnreviewed: true },
  c7: { days: [1.0, 0.95, 1.02, 1.0, null, 0.97, 0.45], target: { approach: 'meal_plan', calories: 2400, proteinG: 150, carbsG: 280, fatG: 75, sex: 'female', heightIn: 67, activity: 1.55, goal: 'gain' } },
  c14: { days: [0.95, 1.0, 0.9, null, 0.96, 1.0, null], target: { approach: 'targets', calories: 2800, proteinG: 180, carbsG: 330, fatG: 85, sex: 'male', heightIn: 69, activity: 1.725, goal: 'gain' } },
  c2: { days: [null, null, null, null, null, null, null], before: 6, target: { approach: 'targets', calories: 1900, proteinG: 140, carbsG: 200, fatG: 60, sex: 'female', heightIn: 64, activity: 1.55, goal: 'maintain' } },
  c5: { days: [null, 1, null, 1, 1, null, null], target: { approach: 'habits', hideNumbers: true, coachNote: 'No counting needed. Just tick your habits each day and snap a photo when you can.' } },
  c13: { days: [null, null, 1, null, null, 1, null], target: { approach: 'habits' } },
};
const HABITS = {
  c1: [['Protein at every meal', [1, 1, 0, 1, 1, 1, 1]], ['Sleep 7+ hours', [0, 1, 0, 1, 1, 0, 0]], ['8,000 steps', [1, 1, 1, 0, 1, 1, 0]]],
  c5: [['Protein at breakfast', [1, 1, 1, 0, 1, 1, 1]], ['8 glasses of water', [1, 0, 1, 1, 1, 0, 1]], ['10-minute walk after dinner', [0, 1, 1, 1, 0, 1, 0]]],
  c13: [['Vegetables with lunch and dinner', [1, 0, 1, 1, 0, 1, 0]], ['Sleep 7+ hours', [1, 1, 1, 0, 1, 1, 0]]],
  c6: [['Protein at breakfast', [0, 0, 1, 0, 0, 1, 0]]],
};
// base day: [meal, foodId, grams]; the protein anchor ('anchor') is scaled to hit the day's factor
const MENUS = [
  [['breakfast', 'greek-yogurt', 170], ['breakfast', 'blueberries', 74], ['breakfast', 'granola', 40], ['lunch', 'chicken-breast', 170, 'anchor'], ['lunch', 'white-rice', 158], ['lunch', 'broccoli', 90], ['dinner', 'salmon', 142], ['dinner', 'sweet-potato', 114], ['dinner', 'salad', 85], ['snack', 'apple', 182], ['snack', 'almonds', 28]],
  [['breakfast', 'egg', 100], ['breakfast', 'toast', 64], ['breakfast', 'avocado', 75], ['lunch', 'turkey-deli', 112, 'anchor'], ['lunch', 'tortilla', 49], ['lunch', 'salad', 85], ['dinner', 'ground-beef', 113], ['dinner', 'pasta', 200], ['snack', 'protein-bar', 60]],
  [['breakfast', 'oatmeal', 234], ['breakfast', 'banana', 118], ['breakfast', 'whey', 30], ['lunch', 'burrito-bowl', 450], ['dinner', 'chicken-thigh', 170, 'anchor'], ['dinner', 'brown-rice', 195], ['dinner', 'broccoli', 156], ['snack', 'cottage-cheese', 113]],
];
const PHOTO_COLORS = { lunch: [[236, 230, 214], [218, 174, 120], [72, 140, 72]], dinner: [[232, 128, 96], [200, 120, 60], [96, 160, 80]] };

function dayItems(menu, target, factor) {
  let rows = menu.map(([meal, id, g, tag]) => ({ meal, id, g, tag }));
  if (factor < 0.7) rows = rows.filter(r => r.meal !== 'snack'); // a light day, not just tiny portions
  const anchor = rows.find(r => r.tag === 'anchor');
  const cal = r => nutrientsFor(F[r.id], r.g).calories, pro = r => nutrientsFor(F[r.id], r.g).proteinG;
  for (let pass = 0; pass < 4; pass++) {
    if (anchor && target.proteinG) {
      const others = rows.filter(r => r !== anchor).reduce((n, r) => n + pro(r), 0);
      anchor.g = Math.max(40, Math.round((target.proteinG * factor - others) / (F[anchor.id].per100g.proteinG / 100)));
    }
    if (target.calories) {
      const want = target.calories * (factor < 0.7 ? 0.8 : 0.97), rest = rows.filter(r => r !== anchor);
      const k = Math.max(0.5, Math.min(2.2, (want - (anchor ? cal(anchor) : 0)) / rest.reduce((n, r) => n + cal(r), 0)));
      for (const r of rest) r.g = Math.round(r.g * k);
    }
  }
  return rows;
}

export async function loadSampleNutrition(db, cl, { now = new Date(), tz = 'America/New_York', businessId } = {}) {
  const today = todayKey(tz, now);
  const template = await db.mealPlanTemplate.create({ data: {
    name: 'Muscle builder · 2,400 kcal', calories: 2400, notes: 'Swap any protein for one you like. Add fruit or a glass of milk if you’re hungry.',
    days: [{ label: 'Any training day', meals: [
      { meal: 'breakfast', items: ['Overnight oats with whey and berries', 'Coffee or tea'] },
      { meal: 'lunch', items: ['Chicken burrito bowl: rice, beans, salsa, greens'] },
      { meal: 'snack', items: ['Greek yogurt with granola', 'A piece of fruit'] },
      { meal: 'dinner', items: ['Salmon, sweet potato and a big salad'] },
    ] }, { label: 'Rest day', meals: [
      { meal: 'breakfast', items: ['Eggs, whole-wheat toast and avocado'] },
      { meal: 'lunch', items: ['Turkey wrap with salad'] },
      { meal: 'dinner', items: ['Lean beef pasta with vegetables'] },
    ] }],
  } });
  await db.recipe.create({ data: {
    name: 'Overnight protein oats', servings: 2,
    ingredients: [{ name: 'Oats, rolled, dry', grams: 80, foodRef: 'mock:oats-dry' }, { name: 'Protein powder, whey', grams: 30, foodRef: 'mock:whey' }, { name: 'Milk, 2%', grams: 244, foodRef: 'mock:milk' }, { name: 'Blueberries', grams: 148, foodRef: 'mock:blueberries' }],
    steps: ['Stir everything together in a jar.', 'Refrigerate overnight.', 'Eat cold or warm it up for a minute.'],
    perServing: (() => { const t = [['oats-dry', 80], ['whey', 30], ['milk', 244], ['blueberries', 148]].map(([id, g]) => nutrientsFor(F[id], g)); return Object.fromEntries(['calories', 'proteinG', 'carbsG', 'fatG'].map(k => [k, Math.round(t.reduce((n, x) => n + x[k], 0) / 2 * 10) / 10])); })(),
  } });

  let menuIdx = 0;
  for (const [key, p] of Object.entries(PATTERNS)) {
    const c = cl[key]; if (!c) continue;
    await db.nutritionPlan.create({ data: { clientId: c.id, hideNumbers: false, ...p.target, mealPlanId: p.target.approach === 'meal_plan' ? template.id : null, lowTargetConfirmedAt: null } });
    const menu = MENUS[menuIdx++ % MENUS.length];
    const days = p.before ? Array.from({ length: p.before }, (_, i) => ({ k: 8 + i, f: 0.95 })) : p.days.map((f, i) => ({ k: 6 - i, f })).filter(d => d.f != null);
    for (const { k, f } of days) {
      const day = addDays(today, -k);
      const rows = dayItems(menu, p.target, f);
      const isToday = k === 0;
      const meals = isToday ? ['breakfast', 'lunch'] : ['breakfast', 'lunch', 'dinner', 'snack'];
      for (const meal of meals) {
        const its = rows.filter(r => r.meal === meal).map(r => item(r.id, r.g));
        if (!its.length) continue;
        const hour = { breakfast: 12, lunch: 16.5, dinner: 23, snack: 19.5 }[meal];
        const loggedAt = new Date(Math.min(now.getTime() - 60e3, day.getTime() + hour * 3600e3));
        let photoKey = null, source = 'search';
        if (key === 'c1' && ((isToday && meal === 'lunch') || (k === 1 && meal === 'dinner'))) {
          photoKey = `food/${businessId}/${c.id}/${randomUUID()}.jpg`;
          await StorageService.put(photoKey, platePhoto(PHOTO_COLORS[meal], k + 3), 'image/jpeg');
          source = 'photo';
        }
        await saveEntry(db, { clientId: c.id, meal, title: its.length === 1 ? its[0].name : `${its[0].name} + ${its.length - 1} more`, source, day, loggedAt, photoKey, items: its });
      }
    }
  }
  // habits + check-ins
  for (const [key, list] of Object.entries(HABITS)) {
    const c = cl[key]; if (!c) continue;
    let order = 0;
    for (const [title, week] of list) {
      const h = await db.habit.create({ data: { clientId: c.id, title, sortOrder: order++ } });
      const rows = week.map((v, i) => (v ? { clientId: c.id, habitId: h.id, date: addDays(today, i - 6) } : null)).filter(Boolean);
      if (rows.length) await db.habitCheck.createMany({ data: rows });
    }
  }
  // a private flag (coach-only): restriction language in a food note
  const oliviaEntry = await db.foodEntry.findFirst({ where: { clientId: cl.c13.id }, orderBy: { loggedAt: 'desc' } });
  if (oliviaEntry) {
    const note = 'Skipped lunch to make up for last night’s pizza.';
    await db.foodEntry.update({ where: { id: oliviaEntry.id }, data: { note } });
    await raiseFlag(db, { clientId: cl.c13.id, clientName: cl.c13.name, businessId, sourceType: 'food_note', sourceId: oliviaEntry.id, text: note });
  }
  return { template };
}

/** A little nutrition data for the second workspace, so isolation tests have something to protect. */
export async function loadOtherNutrition(db, clientId, { now = new Date(), tz = 'America/Chicago', businessId } = {}) {
  const today = todayKey(tz, now);
  await db.nutritionPlan.create({ data: { clientId, approach: 'targets', calories: 3000, proteinG: 200, sex: 'male', heightIn: 70 } });
  const h = await db.habit.create({ data: { clientId, title: 'Northside private habit' } });
  await db.habitCheck.create({ data: { clientId, habitId: h.id, date: today } });
  const photoKey = `food/${businessId}/${clientId}/${randomUUID()}.jpg`;
  await StorageService.put(photoKey, platePhoto(PHOTO_COLORS.dinner, 9), 'image/jpeg');
  const e = await saveEntry(db, { clientId, meal: 'dinner', title: 'Northside private dinner', source: 'photo', day: today, loggedAt: now, photoKey, note: 'Have to earn my dinner tonight.', items: [item('steak', 170), item('potato', 173)] });
  await db.foodFavorite.create({ data: { clientId, title: 'Northside favorite', items: [item('steak', 170)] } });
  await db.mealPlanTemplate.create({ data: { name: 'Northside private meal plan', days: [{ label: 'Day', meals: [{ meal: 'lunch', items: ['Secret lunch'] }] }] } });
  await db.recipe.create({ data: { name: 'Northside private recipe', servings: 1, ingredients: [{ name: 'Steak', grams: 170 }], steps: ['Grill'], perServing: { calories: 350 } } });
  await raiseFlag(db, { clientId, clientName: 'Jordan Pike', businessId, sourceType: 'food_note', sourceId: e.id, text: e.note });
}
