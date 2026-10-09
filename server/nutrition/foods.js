// FoodService: food search (USDA FoodData Central), barcodes (Open Food Facts) and the offline
// sample list, behind one cache (FoodCache, 30 days). Nutrients are always per 100 g here and
// are scaled to the logged grams by nutrientsFor(): the database calculates, never a model.
import { config } from '../config.js';
import { foodCache } from '../db/system.js';
import { MOCK_FOODS, MOCK_BARCODES } from './mockFoods.js';

export const CACHE_DAYS = 30;
export const CREDITS = {
  usda: { text: 'Food data: USDA FoodData Central', url: 'https://fdc.nal.usda.gov/' },
  off: { text: 'Contains data from Open Food Facts, available under the Open Database License', url: 'https://world.openfoodfacts.org/', license: 'https://opendatacommons.org/licenses/odbl/1-0/' },
  mock: { text: 'Offline sample food list (values from USDA FoodData Central)', url: '/data-sources' },
};
const r1 = n => Math.round((Number(n) || 0) * 10) / 10;
const fresh = row => row && Date.now() - new Date(row.fetchedAt).getTime() < CACHE_DAYS * 864e5;
const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s(/-])\S/g, c => c.toUpperCase());
const prettyName = s => (/^[^a-z]*$/.test(s || '') ? titleCase(s) : String(s || '')); // USDA branded names come in CAPS

/** Nutrients for a food at a weight, from its per-100 g values. */
export function nutrientsFor(food, grams) {
  const g = Math.max(0, Number(grams) || 0), f = g / 100, p = food.per100g || {};
  return { calories: r1(p.calories * f), proteinG: r1(p.proteinG * f), carbsG: r1(p.carbsG * f), fatG: r1(p.fatG * f) };
}

// ---------------------------------------------------------------- USDA FoodData Central
const N = { calories: [1008, '208', 2047, 2048], proteinG: [1003, '203'], carbsG: [1005, '205'], fatG: [1004, '204'] };
function usdaNutrients(list = []) {
  const get = keys => {
    for (const k of keys) {
      const n = list.find(x => x.nutrientId === k || x.nutrient?.id === k || String(x.nutrientNumber ?? x.nutrient?.number) === String(k));
      if (n) { const v = n.value ?? n.amount; const unit = String(n.unitName ?? n.nutrient?.unitName ?? '').toLowerCase(); if (v != null) return unit === 'kj' ? v / 4.184 : v; }
    }
    return null;
  };
  let calories = get(N.calories);
  if (calories == null) { const kj = list.find(x => x.nutrientId === 1062 || x.nutrient?.id === 1062); if (kj) calories = (kj.value ?? kj.amount) / 4.184; }
  return { calories: r1(calories), proteinG: r1(get(N.proteinG)), carbsG: r1(get(N.carbsG)), fatG: r1(get(N.fatG)) };
}
export function normalizeUsda(f) {
  const servings = [];
  if (f.servingSize && /^(g|grm|ml|mlt)$/i.test(f.servingSizeUnit || '')) servings.push({ label: f.householdServingFullText ? `${f.householdServingFullText} (${Math.round(f.servingSize)} g)` : `1 serving (${Math.round(f.servingSize)} g)`, grams: Number(f.servingSize) });
  for (const m of f.foodMeasures || []) if (m.gramWeight && m.disseminationText && !/quantity not specified/i.test(m.disseminationText)) servings.push({ label: m.disseminationText, grams: Number(m.gramWeight) });
  for (const p of f.foodPortions || []) if (p.gramWeight) servings.push({ label: [p.amount, p.modifier || p.measureUnit?.name || p.portionDescription].filter(x => x && x !== 'undetermined').join(' ') || 'portion', grams: Number(p.gramWeight) });
  servings.push({ label: '100 g', grams: 100 });
  const uniq = []; for (const s of servings) if (!uniq.some(u => u.label === s.label)) uniq.push(s);
  return {
    ref: `usda:${f.fdcId}`, source: 'usda', fdcId: f.fdcId, name: prettyName(f.description), brand: f.brandOwner || f.brandName ? prettyName(f.brandName || f.brandOwner) : null,
    dataType: f.dataType || null, per100g: usdaNutrients(f.foodNutrients), servings: uniq.slice(0, 6), defaultGrams: uniq[0].grams,
  };
}
const TYPE_RANK = { Foundation: 0, 'SR Legacy': 0, 'Survey (FNDDS)': 1, Branded: 2 };
/** Whole foods first (Foundation, SR Legacy) unless the search names a brand that matches. */
export function rankUsda(foods, q) {
  const words = String(q).toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const branded = f => f.brand && words.some(w => f.brand.toLowerCase().includes(w));
  return foods.map((f, i) => ({ f, i, r: branded(f) ? -1 : (TYPE_RANK[f.dataType] ?? 1) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.f);
}

export class UsdaProvider {
  constructor({ apiKey = config.nutrition.fdcKey, fetchImpl = fetch } = {}) { this.name = 'usda'; this.apiKey = apiKey; this.fetch = fetchImpl; }
  async search(q) {
    const res = await this.fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query: q, pageSize: 20, dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded'] }), signal: AbortSignal.timeout(10000),
    });
    if (res.status === 429) throw Object.assign(new Error('The food database is busy. Try again in a minute.'), { status: 503 });
    if (!res.ok) throw new Error(`USDA ${res.status}`);
    const json = await res.json();
    return rankUsda((json.foods || []).map(normalizeUsda).filter(f => f.per100g.calories || f.per100g.proteinG), q);
  }
  async food(fdcId) {
    const res = await this.fetch(`https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(fdcId)}?api_key=${encodeURIComponent(this.apiKey)}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`USDA ${res.status}`);
    return normalizeUsda(await res.json());
  }
}

// ---------------------------------------------------------------- Open Food Facts
export function normalizeOff(code, p) {
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] != null ? n['energy_100g'] / 4.184 : null);
  const servingG = Number(p.serving_quantity) || null;
  const servings = [];
  if (servingG) servings.push({ label: p.serving_size ? String(p.serving_size) : `1 serving (${Math.round(servingG)} g)`, grams: servingG });
  servings.push({ label: '100 g', grams: 100 });
  return {
    ref: `off:${code}`, source: 'off', barcode: code, name: String(p.product_name || p.generic_name || 'Product').trim(), brand: p.brands ? String(p.brands).split(',')[0].trim() : null,
    dataType: 'Open Food Facts', per100g: { calories: r1(kcal), proteinG: r1(n.proteins_100g), carbsG: r1(n.carbohydrates_100g), fatG: r1(n.fat_100g) }, servings, defaultGrams: servings[0].grams,
  };
}
export class OffProvider {
  constructor({ fetchImpl = fetch, userAgent = config.nutrition.userAgent } = {}) { this.name = 'off'; this.fetch = fetchImpl; this.ua = userAgent; }
  async barcode(code) {
    const res = await this.fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,generic_name,brands,nutriments,serving_size,serving_quantity`, { headers: { 'User-Agent': this.ua, accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    return normalizeOff(code, json.product);
  }
}

// ---------------------------------------------------------------- offline sample list
export class MockFoodProvider {
  constructor() { this.name = 'mock'; }
  async search(q) {
    const words = String(q).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean).map(w => w.replace(/(ies)$/, 'y').replace(/(?<!s)s$/, ''));
    const score = f => words.reduce((n, w) => n + (f.keywords.includes(w) ? (f.name.toLowerCase().startsWith(w) ? 3 : 2) : 0), 0);
    return MOCK_FOODS.map(f => ({ f, s: score(f) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 12).map(({ f }) => strip(f));
  }
  async food(id) { const f = MOCK_FOODS.find(x => x.ref === `mock:${id}`); return f ? strip(f) : null; }
  async barcode(code) {
    const p = MOCK_BARCODES[code];
    if (!p) return null;
    return { ref: `off:${code}`, source: 'off', barcode: code, name: p.name, brand: p.brand, dataType: 'Open Food Facts', per100g: p.per100g, servings: [p.serving, { label: '100 g', grams: 100 }], defaultGrams: p.serving.grams };
  }
}
const strip = ({ keywords, ...f }) => { void keywords; return { ...f }; };

// ---------------------------------------------------------------- the service (with cache)
export class FoodService {
  /** @param {{ mode?: 'mock'|'live', usda?: any, off?: any }} opts */
  constructor({ mode = config.nutrition.provider, usda, off } = {}) {
    this.mode = mode === 'live' ? 'live' : 'mock';
    this.mock = new MockFoodProvider();
    this.usda = usda || (this.mode === 'live' ? new UsdaProvider() : null);
    this.off = off || (this.mode === 'live' ? new OffProvider() : null);
  }
  get searchCredit() { return this.usda ? CREDITS.usda : CREDITS.mock; }

  async search(q) {
    const query = String(q || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
    if (query.length < 2) return { results: [], cached: false, credit: this.searchCredit };
    if (!this.usda) return { results: await this.mock.search(query), cached: false, credit: CREDITS.mock };
    const hit = await foodCache.get('usda-search', query);
    if (fresh(hit)) return { results: hit.data.results, cached: true, credit: CREDITS.usda };
    const results = (await this.usda.search(query)).slice(0, 12);
    await foodCache.put('usda-search', query, { results });
    for (const f of results) await foodCache.put('usda', String(f.fdcId), f);
    return { results, cached: false, credit: CREDITS.usda };
  }

  /** One real API call per scan; results are cached. Returns null when the product isn't found. */
  async barcode(code) {
    const c = String(code || '').replace(/\D/g, '');
    if (c.length < 8 || c.length > 14) return { food: null, invalid: true };
    const source = this.off ? 'off' : 'mock-off';
    const hit = await foodCache.get(source, c);
    // Found products are kept 30 days; "not found" only for a day (products get added).
    if (fresh(hit) && (hit.data.food || Date.now() - new Date(hit.fetchedAt).getTime() < 864e5)) return { food: hit.data.food, cached: true, credit: CREDITS.off };
    const food = this.off ? await this.off.barcode(c) : await this.mock.barcode(c);
    await foodCache.put(source, c, { food });
    return { food, cached: false, credit: CREDITS.off };
  }

  /** Looks up a food by reference (usda:123, off:0123456789, mock:egg) for the server-side math. */
  async get(ref) {
    const [src, id] = String(ref || '').split(':');
    if (!id) return null;
    if (src === 'mock') return this.mock.food(id);
    if (src === 'off') return (await this.barcode(id)).food;
    if (src === 'usda') {
      const hit = await foodCache.get('usda', id);
      if (hit) return hit.data;
      if (!this.usda) return null;
      const f = await this.usda.food(id);
      if (f) await foodCache.put('usda', id, f);
      return f;
    }
    return null;
  }
}

let shared = null;
export const foods = () => (shared ||= new FoodService());
export const setFoodServiceForTests = s => { shared = s; };
