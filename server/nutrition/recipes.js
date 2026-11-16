// The coach's recipe book with pictures, for coaches and (shared ones) clients.
import { StorageService } from '../storage/StorageService.js';
import { STARTER_RECIPES } from '../seed/starterRecipes.js';
import { foodArt } from './foodArt.js';

/** Gives a workspace the starter recipe book once (skipping names it already has). */
export async function ensureStarterRecipes(db) {
  const b = await db.business.findFirst({ select: { id: true, settings: true } });
  if (!b || b.settings?.starterRecipes) return false;
  const have = new Set((await db.recipe.findMany({ select: { name: true } })).map(r => r.name.toLowerCase()));
  const fresh = STARTER_RECIPES.filter(r => !have.has(r.name.toLowerCase()));
  if (fresh.length) await db.recipe.createMany({ data: fresh.map(r => ({ ...r, shared: true })) });
  await db.business.update({ where: { id: b.id }, data: { settings: { ...(b.settings || {}), starterRecipes: true } } });
  return true;
}

export async function shapeRecipe(r, { hideNumbers = false } = {}) {
  const art = r.art || foodArt([r.name, ...(r.ingredients || []).map(i => i.name)]);
  return {
    id: r.id, name: r.name, servings: r.servings, minutes: r.minutes || null, tags: Array.isArray(r.tags) ? r.tags : [], shared: r.shared !== false,
    imageUrl: r.photoKey ? await StorageService.signedUrl(r.photoKey) : `/img/food/${art}.png`, hasPhoto: !!r.photoKey,
    ingredients: (r.ingredients || []).map(i => ({ name: i.name, grams: hideNumbers ? null : i.grams })),
    steps: r.steps || [],
    perServing: hideNumbers ? null : r.perServing,
  };
}

/** The recipe that best closes today's protein gap (the smallest one that covers it, else the biggest). */
export function bestForProtein(recipes, remaining) {
  if (!(remaining > 5)) return null;
  const withP = recipes.filter(r => r.perServing?.proteinG);
  const covers = withP.filter(r => r.perServing.proteinG >= remaining).sort((a, b) => a.perServing.proteinG - b.perServing.proteinG);
  return covers[0] || withP.sort((a, b) => b.perServing.proteinG - a.perServing.proteinG)[0] || null;
}
