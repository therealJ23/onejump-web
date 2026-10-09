// Small text parsers shared by the browser and the server (one implementation, two places).
// - parseSet("10 reps at 55") → { reps: 10, weight: 55 }   (log a set by voice)
// - splitFoods("two eggs and toast") → [{ qty: 2, unit: null, food: 'eggs' }, { qty: 1, unit: null, food: 'toast' }]

const UNITS = { zero: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "fifty five" → "55", "one thirty five" → "135", "a hundred and ten" → "110". Leaves other words alone. */
export function wordsToNumbers(text) {
  const tokens = String(text || '').toLowerCase().replace(/[-–]/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  let i = 0;
  const isNum = t => t in UNITS || t in TENS || t === 'hundred' || /^\d+(\.\d+)?$/.test(t);
  while (i < tokens.length) {
    const t = tokens[i];
    if (!isNum(t) || ((t === 'a' || t === 'an') && !['hundred'].includes(tokens[i + 1]))) { out.push(t); i++; continue; }
    // read a run of number words
    let run = [];
    while (i < tokens.length && (isNum(tokens[i]) || (tokens[i] === 'and' && run.length && isNum(tokens[i + 1] || '') && tokens[i - 1] === 'hundred'))) { if (tokens[i] !== 'and') run.push(tokens[i]); i++; }
    if (run.length === 1 && /^\d/.test(run[0])) { out.push(run[0]); continue; }
    let total = 0, cur = 0;
    const vals = run.map(w => (/^\d/.test(w) ? Number(w) : w in UNITS ? UNITS[w] : w in TENS ? TENS[w] : w));
    // "one thirty five" (gym speak for 135): a single digit followed by a tens number
    if (vals.length >= 2 && typeof vals[0] === 'number' && vals[0] < 10 && typeof vals[1] === 'number' && vals[1] >= 20 && vals[1] % 10 === 0 && vals[0] > 0 && !run.includes('hundred')) {
      total = vals[0] * 100 + vals[1] + (typeof vals[2] === 'number' && vals[2] < 10 ? vals[2] : 0);
      out.push(String(total)); continue;
    }
    for (const v of vals) {
      if (v === 'hundred') cur = (cur || 1) * 100;
      else if (typeof v === 'number') { if (cur && v >= 20 && cur % 100 !== 0 && cur < 100) { total += cur; cur = v; } else cur += v; }
    }
    out.push(String(total + cur));
  }
  return out.join(' ');
}

const KG = 2.2046226;
/**
 * Parses a spoken set. Returns null if no rep count was heard.
 * @returns {{ reps: number, weight: number|null, bodyweight: boolean, unit: 'lb' } | null}
 */
export function parseSet(text) {
  const s = wordsToNumbers(text).replace(/,/g, ' ').replace(/(\d)\s*x\s*(\d)/g, '$1 x $2');
  const bodyweight = /\b(body ?weight|bw|no weight|no load|unweighted)\b/.test(s);
  const kg = /\b(kg|kgs|kilo|kilos|kilograms?)\b/.test(s);
  const toLb = w => (w == null ? null : kg ? Math.round(w * KG * 2) / 2 : w);
  let m;
  // "55 for 10", "135 pounds for 8 reps", "135 x 8"
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?|kg|kgs|kilos?|kilograms?)?\s*(?:for|x|times)\s*(\d+)\s*(?:reps?)?/)) && !/\breps?\b.*\b(?:for|x)\b/.test(s.slice(0, s.indexOf(m[0]) + m[1].length + 6))) {
    const a = Number(m[1]), b = Number(m[2]);
    if (/\b(lb|lbs|pounds?|kg|kilos?)\b/.test(m[0]) || a > b) return { reps: Math.round(b), weight: toLb(a), bodyweight: false, unit: 'lb' };
  }
  // "10 reps at 55", "8 at 135 pounds", "12 bodyweight", "10 reps"
  m = s.match(/(\d+)\s*(?:reps?)?\s*(?:at|@|with|of)?\s*(\d+(?:\.\d+)?)?\s*(lb|lbs|pounds?|kg|kgs|kilos?|kilograms?|bodyweight)?/i);
  if (!m) return null;
  const reps = Number(m[1]);
  if (!reps || reps > 100) return null;
  const weight = bodyweight ? null : m[2] != null ? toLb(Number(m[2])) : null;
  return { reps, weight, bodyweight, unit: 'lb' };
}

const FOOD_UNITS = 'cups?|cup|slices?|pieces?|pcs|oz|ounces?|g|grams?|tbsp|tablespoons?|tsp|teaspoons?|scoops?|bowls?|plates?|servings?|cans?|bottles?|glass(?:es)?|handfuls?|bars?|containers?|lbs?|pounds?|ml|liters?|litres?';
const FILLER = /\b(i (had|ate|drank|got)|for (breakfast|lunch|dinner|a snack|snack)|this morning|today|tonight|just|some|about|around|roughly|like|of|with a side of)\b/g;
/** Splits "two eggs and toast with a cup of coffee" into quantities and foods. */
export function splitFoods(text) {
  const s = wordsToNumbers(String(text || '').toLowerCase())
    .replace(/\bhalf (a|an)\b/g, '0.5').replace(/\b(a )?couple( of)?\b/g, '2').replace(/\ba few\b/g, '3').replace(/½/g, '0.5')
    .replace(FILLER, ' ').replace(new RegExp(`\\b(a|an)\\s+(?=(${FOOD_UNITS})\\b)`, 'g'), '1 ').replace(/\s+/g, ' ');
  return s.split(/\s*(?:,|\band\b|\bplus\b|\bwith\b|\b&\b|\+|;)\s*/).map(x => x.trim()).filter(Boolean).map(part => {
    const m = part.match(new RegExp(`^(\\d+(?:\\.\\d+)?)?\\s*(${FOOD_UNITS})?\\b\\s*(?:of\\s+)?(.*)$`));
    const qty = m?.[1] ? Number(m[1]) : 1;
    const unit = m?.[2] ? m[2].replace(/s$/, '').replace(/^ounce$/, 'oz').replace(/^gram$/, 'g').replace(/^pound$|^lb$/, 'lb').replace(/^tablespoon$/, 'tbsp').replace(/^teaspoon$/, 'tsp') : null;
    const food = (m?.[3] || part).replace(/^(a|an|the)\s+/, '').trim();
    return food ? { qty, unit, food } : null;
  }).filter(Boolean).slice(0, 12);
}
