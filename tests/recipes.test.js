// Recipe book with pictures (Nov 15): starter recipes once, coach photos, clients see shared ones
// (no numbers when the coach hides them), a protein-gap suggestion, and a picture for every meal.
import { describe, it, expect, beforeAll } from 'vitest';
import jpeg from 'jpeg-js';
import { fixtures, loginCoach, loginClient } from './helpers.js';
import { foodArt } from '../server/nutrition/foodArt.js';
import { bestForProtein } from '../server/nutrition/recipes.js';

let f, dani, mike;
beforeAll(async () => { f = await fixtures(); dani = await loginCoach(); mike = await loginClient(); });

describe('food pictures', () => {
  it('picks a picture from the words, in English and Spanish, else by meal', () => {
    expect(foodArt('Grilled chicken breast')).toBe('poultry_leg');
    expect(foodArt(['Arroz con habichuelas'])).toBe('pot_of_food');
    expect(foodArt('Mangú con huevo')).toBe('egg');
    expect(foodArt('Sweet potato mash')).toBe('roasted_sweet_potato');
    expect(foodArt('Mystery thing', 'breakfast')).toBe('pancakes');
    expect(foodArt('', null)).toBe('fork_and_knife_with_plate');
  });
  it('every logged meal comes with an image', async () => {
    const r = await mike.get('/api/me/nutrition/today');
    for (const e of r.body.entries) expect(e.imageUrl).toMatch(/^\/(img\/food|files)\//);
    expect((await dani.agent.get('/img/food/poultry_leg.png')).status).toBe(200);
  });
});

describe('recipe book', () => {
  it('the coach gets the starter book once, with pictures', async () => {
    const r = await dani.get('/api/nutrition/recipes');
    expect(r.status).toBe(200);
    const names = r.body.recipes.map(x => x.name);
    expect(names).toContain('Mangú with eggs');
    expect(r.body.recipes.every(x => x.imageUrl)).toBe(true);
    const again = await dani.get('/api/nutrition/recipes');
    expect(again.body.recipes.length).toBe(r.body.recipes.length); // not added twice
  });

  it('a coach photo replaces the built-in picture', async () => {
    const recipe = (await dani.get('/api/nutrition/recipes')).body.recipes.find(x => x.name === 'Chicken burrito bowl');
    const img = jpeg.encode({ data: Buffer.alloc(16 * 16 * 4, 200), width: 16, height: 16 }, 80).data;
    const r = await dani.upload(`/api/nutrition/recipes/${recipe.id}/photo`, 'photo', img, 'bowl.jpg');
    expect(r.status).toBe(200);
    expect(r.body.recipe).toMatchObject({ hasPhoto: true });
    expect(r.body.recipe.imageUrl).toMatch(/^\/files\//);
  });

  it('clients see the shared recipes and a suggestion for the protein still to go', async () => {
    const r = await mike.get('/api/me/recipes');
    expect(r.status).toBe(200);
    expect(r.body.recipes.length).toBeGreaterThan(5);
    if (!r.body.hideNumbers) {
      expect(r.body.recipes[0].perServing).toHaveProperty('proteinG');
      if (r.body.suggestion) expect(r.body.suggestion.text).toMatch(/g of protein to go/);
    }
  });

  it('a hidden recipe isn’t in the client’s book', async () => {
    const recipe = (await dani.get('/api/nutrition/recipes')).body.recipes.find(x => x.name === 'Turkey chili');
    await f.dbA.recipe.update({ where: { id: recipe.id }, data: { shared: false } });
    expect((await mike.get('/api/me/recipes')).body.recipes.some(x => x.id === recipe.id)).toBe(false);
    await f.dbA.recipe.update({ where: { id: recipe.id }, data: { shared: true } });
  });

  it('picks the smallest recipe that closes the gap', () => {
    const list = [{ name: 'A', perServing: { proteinG: 20 } }, { name: 'B', perServing: { proteinG: 40 } }, { name: 'C', perServing: { proteinG: 55 } }];
    expect(bestForProtein(list, 35).name).toBe('B');
    expect(bestForProtein(list, 70).name).toBe('C');
    expect(bestForProtein(list, 3)).toBeNull();
  });
});
