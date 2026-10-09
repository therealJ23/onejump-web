// Nutrition math the coach can check: resting needs (Mifflin-St Jeor), maintenance, and a
// suggested starting point. Everything here is an ESTIMATE that the coach confirms; Assist
// never sets targets on its own.
export const ACTIVITY = [
  { value: 1.2, label: 'Mostly sitting (desk job, little exercise)' },
  { value: 1.375, label: 'Lightly active (training 1–3 days a week)' },
  { value: 1.55, label: 'Moderately active (training 3–5 days a week)' },
  { value: 1.725, label: 'Very active (hard training 6–7 days a week)' },
  { value: 1.9, label: 'Extra active (physical job plus training)' },
];
export const GOALS = { lose: -0.15, maintain: 0, gain: 0.1 };
export const FLOOR_WITHOUT_RMR = 1200; // used only when resting needs can't be estimated
const LB = 0.45359237, IN = 2.54;
const round = (n, to = 1) => Math.round(n / to) * to;

/** Mifflin-St Jeor resting energy, kcal/day. Returns null if anything is missing. */
export function restingNeeds({ sex, weightLb, heightIn, age }) {
  if (!sex || !weightLb || !heightIn || !age) return null;
  const kg = weightLb * LB, cm = heightIn * IN;
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

export function goalFor(goalType) {
  if (/fat|lose|loss/i.test(goalType || '')) return 'lose';
  if (/muscle|gain|build/i.test(goalType || '')) return 'gain';
  return 'maintain';
}

/**
 * The calculator: resting needs × activity ± goal, protein 0.7–1 g per lb, fat ~30% of calories,
 * carbs the rest. Shown as an estimate for the coach to confirm or change.
 */
export function estimateTargets({ sex, weightLb, heightIn, age, activity = 1.55, goal = 'maintain' }) {
  const rmr = restingNeeds({ sex, weightLb, heightIn, age });
  if (rmr == null) return { ok: false, missing: [!sex && 'sex', !weightLb && 'weight', !heightIn && 'height', !age && 'birth year'].filter(Boolean) };
  const maintenance = Math.round(rmr * activity);
  const calories = round(Math.max(rmr, maintenance * (1 + (GOALS[goal] ?? 0))), 10);
  const proteinRange = [round(weightLb * 0.7, 5), round(weightLb * 1.0, 5)];
  const proteinG = round(weightLb * 0.8, 5);
  const fatG = round(calories * 0.3 / 9, 5);
  const carbsG = Math.max(0, round((calories - proteinG * 4 - fatG * 9) / 4, 5));
  return {
    ok: true, label: 'Estimate', rmr, maintenance, calories, proteinG, proteinRange, carbsG, fatG, activity, goal,
    notes: [
      `Resting needs about ${rmr.toLocaleString('en-US')} kcal (Mifflin-St Jeor), about ${maintenance.toLocaleString('en-US')} kcal to maintain at this activity level.`,
      goal === 'lose' ? 'Goal: fat loss, about 15% under maintenance, never below resting needs.' : goal === 'gain' ? 'Goal: muscle gain, about 10% over maintenance.' : 'Goal: maintain.',
      `Protein ${proteinRange[0]}–${proteinRange[1]} g a day (0.7–1 g per lb of body weight).`,
      'This is a starting estimate. You set the final numbers.',
    ],
  };
}

/** Safety checks on a calorie target. */
export function targetWarnings({ calories, rmr }) {
  const out = [];
  if (calories == null) return out;
  if (rmr != null && calories < rmr) out.push({ code: 'below_rmr', level: 'warn', text: `${calories.toLocaleString('en-US')} kcal is below this client’s estimated resting needs (about ${rmr.toLocaleString('en-US')} kcal). Targets this low can be unsafe without medical supervision.` });
  else if (rmr == null && calories < FLOOR_WITHOUT_RMR) out.push({ code: 'below_floor', level: 'warn', text: `${calories.toLocaleString('en-US')} kcal is very low. Add sex, height and birth year so OneJump can check it against resting needs.` });
  return out;
}
export const isLowTarget = (calories, rmr) => calories != null && (rmr != null ? calories < rmr : calories < FLOOR_WITHOUT_RMR);

/** Average weekly weight change as a share of body weight, from a dated weight series (oldest first). */
export function weeklyLossPct(series) {
  if (series.length < 2) return null;
  const a = series[0], b = series.at(-1);
  const weeks = (new Date(b.date) - new Date(a.date)) / (7 * 864e5);
  if (weeks < 2) return null;
  return ((a.value - b.value) / a.value) / weeks * 100;
}
