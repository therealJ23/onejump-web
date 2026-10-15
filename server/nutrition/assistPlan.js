// Assist builds a starting nutrition plan for one client (typed or spoken request), from that
// client's own details: age, sex, height, latest weight, goal, activity, notes and recent check-ins.
// The draft is only shown to the coach. Nothing reaches the client until the coach taps
// "Use this plan" (or says yes to it), which saves it like the Nutrition tab's own Save.
//
// Code, not the model, has the last word on the numbers:
//  - targets come from the calculator (Mifflin-St Jeor) and are never below resting needs;
//  - no targets at all when sex, height, weight or birth year is missing;
//  - protein stays within 0.7–1 g per lb, fat within 20–40% of calories, carbs fill the rest;
//  - medical words or worrying food language → no numbers, no meal plan, refer to a dietitian.
import { AI } from '../ai/AIService.js';
import { coachContext } from '../ai/context.js';
import { audit } from '../db/system.js';
import { badRequest, HttpError } from '../lib/errors.js';
import { estimateTargets, restingNeeds, isLowTarget } from './calc.js';
import { planFor, calcInputs, SCOPE_REMINDER } from './plans.js';
import { checkNutritionLanguage } from './language.js';

const round = (n, to = 5) => Math.round(n / to) * to;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const firstOf = n => String(n || '').split(' ')[0];

/** Medical topics (English and Spanish) that a dietitian or doctor should guide. */
export const MEDICAL_NUTRITION = /\b(diabet\w*|insulin\w*|insulina|blood sugar|az[uú]car en (la )?sangre|kidney\w*|ri[ñn][oó]n\w*|renal|heart (disease|condition)|card[ií]ac\w*|coraz[oó]n|blood pressure|hypertension|presi[oó]n (alta|arterial)|hipertensi[oó]n|pregnan\w*|embaraz\w*|breastfeed\w*|lactan\w*|medication\w*|medicamento\w*|medicina\w*|celiac|cel[ií]ac\w*|crohn\w*|ibs|colitis|cholesterol|colesterol|thyroid|tiroides|gout|gota|pcos|ovario poliqu[ií]stico|eating disorder|trastorno alimen\w*|anorexi\w*|bulimi\w*|ozempic|semaglutide|wegovy|mounjaro|anaphyla\w*|anafila\w*|severe allerg\w*|alergia severa)\b/i;
const NO_ITEMS = /\b(supplements?|suplementos?|fat[- ]?burners?|quemadores?|diet pills?|pastillas?|detox|cleanse|creatin[ae]|pre-?workouts?|appetite suppress\w*)\b/i;

/** Everything the model sees about the client. No email, phone or payment details. */
async function contextFor(db, client, plan, { request, lang }) {
  const inputs = await calcInputs(db, client, plan);
  const est = estimateTargets(inputs);
  const [notes, checkins] = await Promise.all([
    db.note.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'desc' }, take: 5, select: { body: true, createdAt: true } }),
    db.checkIn.findMany({ where: { clientId: client.id }, orderBy: { submittedAt: 'desc' }, take: 3, select: { text: true, nutrition: true, energy: true, weight: true, submittedAt: true } }),
  ]);
  const coach = await coachContext(db);
  return {
    ctx: {
      coach: { name: coach.name, business: coach.business }, lang,
      request: String(request || '').slice(0, 1500) || 'Build a simple starting plan.',
      client: { first: firstOf(client.name), goal: client.goal, goalType: client.goalType, why: client.why, targetWeightLb: client.targetWeight, mode: client.mode, age: inputs.age, sex: inputs.sex, heightIn: inputs.heightIn, weightLb: inputs.weightLb, activity: inputs.activity, calcGoal: inputs.goal },
      estimate: est.ok ? { ok: true, rmr: est.rmr, maintenance: est.maintenance, calories: est.calories, proteinG: est.proteinG, proteinRange: est.proteinRange, carbsG: est.carbsG, fatG: est.fatG } : { ok: false, missing: est.missing },
      currentPlan: plan.id ? { approach: plan.approach, calories: plan.calories, proteinG: plan.proteinG, carbsG: plan.carbsG, fatG: plan.fatG, coachNote: plan.coachNote } : null,
      coachNotes: notes.map(n => String(n.body).slice(0, 400)),
      recentCheckins: checkins.map(k => ({ text: String(k.text || '').slice(0, 500), nutrition: k.nutrition, energy: k.energy, weight: k.weight })),
    },
    inputs, est,
  };
}

/** Applies the code-side rules to whatever the model wrote. */
export function enforcePlan(raw, { est, inputs, texts, credentialed }) {
  const d = { ...raw, habits: [...(raw.habits || [])], mealPlan: raw.mealPlan ? { ...raw.mealPlan, days: raw.mealPlan.days.map(x => ({ ...x, meals: x.meals.map(m => ({ ...m, items: m.items.filter(i => !NO_ITEMS.test(i)) })).filter(m => m.items.length) })).filter(x => x.meals.length) } : null };
  const notes = [];
  const flag = texts.map(checkNutritionLanguage).find(r => r.flagged);
  const medical = texts.find(t => MEDICAL_NUTRITION.test(t || ''));
  if (flag || medical) {
    d.needsProfessional = true;
    d.professionalReason = d.professionalReason || (flag ? 'Something in this client’s check-ins or notes suggests their relationship with food may need extra care.' : 'This client’s notes mention a medical topic that affects what they should eat.');
    Object.assign(d, { approach: 'habits', calories: null, proteinG: null, carbsG: null, fatG: null, mealPlan: null });
    notes.push('No numbers or meal plan: a registered dietitian or doctor should guide this one. The habits are general and safe to start with.');
  } else if (!est.ok) {
    Object.assign(d, { calories: null, proteinG: null, carbsG: null, fatG: null });
    if (d.approach === 'targets') d.approach = d.mealPlan ? 'meal_plan' : 'habits';
    notes.push(`No calorie targets yet: add ${est.missing.join(', ')} on the Nutrition tab and Assist can include them.`);
  } else if (d.approach !== 'habits' || d.calories != null) {
    // Numbers: start from the model's, fall back to the calculator, then hold the lines.
    let cal = d.calories ?? est.calories;
    const hi = Math.round(est.maintenance * 1.25);
    const floor = Math.ceil(est.rmr / 10) * 10;
    if (cal < est.rmr) notes.push(`Raised calories to ${floor.toLocaleString('en-US')}: never below resting needs.`);
    cal = Math.max(floor, round(clamp(cal, est.rmr, hi), 10));
    const w = inputs.weightLb;
    const protein = round(clamp(d.proteinG ?? est.proteinG, w * 0.7, w * 1.0));
    const fat = round(clamp(d.fatG ?? est.fatG, cal * 0.2 / 9, cal * 0.4 / 9));
    const carbs = Math.max(0, round((cal - protein * 4 - fat * 9) / 4));
    Object.assign(d, { calories: cal, proteinG: protein, fatG: fat, carbsG: carbs });
    if (d.approach === 'habits') d.approach = 'targets';
  }
  d.habits = [...new Set(d.habits.map(h => h.trim()).filter(h => h.length >= 2 && !NO_ITEMS.test(h)))].slice(0, 4);
  return { draft: d, notes, scopeReminder: d.mealPlan && !credentialed ? SCOPE_REMINDER : null };
}

const credentialedOf = settings => /\b(rd|rdn|dietitian|nutritionist)\b/i.test(String(settings?.nutritionCredential || ''));

/**
 * Drafts a plan. Saves nothing (except AI usage).
 * @returns {{ draft, notes, scopeReminder, estimate, model }}
 */
export async function draftNutritionPlan(db, client, { request = '', lang = 'en' } = {}) {
  const plan = await planFor(db, client.id);
  const { ctx, inputs, est } = await contextFor(db, client, plan, { request, lang: lang === 'es' ? 'es' : 'en' });
  const b = await db.business.findFirst({ select: { settings: true } });
  const r = await AI.draftNutritionPlan(ctx, { db });
  const texts = [request, client.why, client.goal, ...ctx.coachNotes, ...ctx.recentCheckins.map(k => k.text)];
  const out = enforcePlan(r.data, { est, inputs, texts, credentialed: credentialedOf(b?.settings) });
  return { ...out, estimate: est.ok ? { rmr: est.rmr, maintenance: est.maintenance, calories: est.calories, proteinG: est.proteinG } : { missing: est.missing }, model: r.model };
}

/**
 * Saves an approved draft (as the coach edited it): targets and note on the plan, new habits,
 * and the meal plan as a template assigned to this client (Pro). Same low-target rule as the tab.
 */
export async function applyNutritionPlan(db, auth, client, d, { pro = false, confirmLowTarget = false } = {}) {
  const current = await planFor(db, client.id);
  if (d.mealPlan && !pro) throw new HttpError(403, 'Saving meal plans is part of OneJump Pro. Upgrade in Plan & billing, or remove the meal plan and save the rest.', { upgrade: 'PRO', code: 'upgrade' });
  const next = { ...current, approach: d.approach, calories: d.calories ?? null, proteinG: d.proteinG ?? null, carbsG: d.carbsG ?? null, fatG: d.fatG ?? null, coachNote: d.coachNote ?? current.coachNote ?? null };
  const rmr = restingNeeds(await calcInputs(db, client, next));
  let lowTargetConfirmedAt = null;
  if (isLowTarget(next.calories, rmr)) {
    if (!confirmLowTarget) throw badRequest(rmr ? `${next.calories} kcal is below ${firstOf(client.name)}’s estimated resting needs (about ${rmr} kcal). Tick “I’ve reviewed this target” to save it.` : `${next.calories} kcal is very low. Tick “I’ve reviewed this target” to save it.`, { code: 'low_target', rmr });
    lowTargetConfirmedAt = new Date();
    audit({ businessId: auth.businessId, actorUserId: auth.userId, action: 'nutrition_low_target_confirmed', target: client.id, meta: { calories: next.calories, rmr } });
  }
  let mealPlanId = current.mealPlanId || null;
  if (d.mealPlan) {
    const t = await db.mealPlanTemplate.create({ data: { name: String(d.mealPlan.name || `${firstOf(client.name)}’s plan`).slice(0, 80), calories: next.calories, notes: `Drafted with Assist for ${client.name}.`, days: d.mealPlan.days } });
    mealPlanId = t.id;
  }
  const data = { approach: next.approach, calories: next.calories, proteinG: next.proteinG, carbsG: next.carbsG, fatG: next.fatG, coachNote: next.coachNote ? String(next.coachNote).slice(0, 2000) : null, mealPlanId, lowTargetConfirmedAt };
  const saved = current.id ? await db.nutritionPlan.update({ where: { id: current.id }, data }) : await db.nutritionPlan.create({ data: { ...data, hideNumbers: false, clientId: client.id } });
  // Habits: add the new ones (case-insensitive), up to 8 active.
  const have = await db.habit.findMany({ where: { clientId: client.id, active: true }, select: { title: true } });
  const seen = new Set(have.map(h => h.title.toLowerCase()));
  let order = have.length, added = 0;
  for (const title of (d.habits || []).map(h => String(h).trim().slice(0, 80)).filter(h => h.length >= 2)) {
    if (order >= 8 || seen.has(title.toLowerCase())) continue;
    await db.habit.create({ data: { clientId: client.id, title, sortOrder: order++ } });
    seen.add(title.toLowerCase()); added++;
  }
  audit({ businessId: auth.businessId, actorUserId: auth.userId, action: 'nutrition_plan_from_assist', target: client.id, meta: { approach: saved.approach, calories: saved.calories, proteinG: saved.proteinG, habits: added, mealPlan: !!d.mealPlan } });
  return { plan: saved, habitsAdded: added, mealPlanId, message: `${firstOf(client.name)}’s nutrition plan is saved.` };
}

/** One short sentence about a draft, for the confirmation card and for reading aloud. */
export function describeDraft(d, first, lang = 'en') {
  const es = lang === 'es';
  const parts = [];
  if (d.calories != null) parts.push(es ? `unas ${d.calories.toLocaleString('es')} calorías y ${d.proteinG} gramos de proteína al día` : `about ${d.calories.toLocaleString('en-US')} calories and ${d.proteinG} grams of protein a day`);
  if (d.habits?.length) parts.push(es ? `${d.habits.length} hábitos` : `${d.habits.length} daily habit${d.habits.length === 1 ? '' : 's'}`);
  if (d.mealPlan) parts.push(es ? `un plan de comidas de ${d.mealPlan.days.length} días` : `a ${d.mealPlan.days.length}-day meal plan`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ${es ? 'y' : 'and'} ${parts.at(-1)}` : parts[0] || (es ? 'algunos hábitos' : 'a few habits');
  return es ? `Para ${first}: ${list}.` : `For ${first}: ${list}.`;
}
