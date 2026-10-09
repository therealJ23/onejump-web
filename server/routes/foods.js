// Food search (USDA FoodData Central) and barcodes (Open Food Facts), for coaches and clients.
// Public data through a 30-day cache. A client with "Hide numbers" gets results without numbers.
import { Router } from 'express';
import { query, z } from '../lib/validate.js';
import { badRequest } from '../lib/errors.js';
import { foods, CREDITS } from '../nutrition/foods.js';
import { planFor, stripNumbers } from '../nutrition/plans.js';

export const router = Router();

async function forViewer(req, data) {
  if (req.auth.role !== 'CLIENT') return data;
  const plan = await planFor(req.db, req.auth.clientId);
  return plan.hideNumbers ? stripNumbers(data) : data;
}

router.get('/search', query(z.object({ q: z.string().trim().min(2, 'Type at least 2 letters.').max(80) })), async (req, res) => {
  const r = await foods().search(req.q.q);
  res.json(await forViewer(req, { results: r.results, credit: r.credit, cached: r.cached }));
});

router.get('/barcode/:code', async (req, res) => {
  const r = await foods().barcode(req.params.code);
  if (r.invalid) throw badRequest('That doesn’t look like a barcode. Check the numbers and try again.');
  if (!r.food) return res.status(404).json({ error: 'We couldn’t find that product. You can add it with Quick add.', code: 'not_found', quickAdd: true, credit: CREDITS.off });
  res.json(await forViewer(req, { food: r.food, credit: r.credit, cached: r.cached }));
});
