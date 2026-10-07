// Approve / Edit / Dismiss for every Assist draft, plus undo.
import { Router } from 'express';
import { body, z } from '../lib/validate.js';
import { decideInsight, undoInsight } from '../core/actions.js';

export const router = Router();

router.get('/', async (req, res) => {
  const where = { status: req.query.status === 'all' ? undefined : (req.query.status || 'pending') };
  if (req.query.clientId) where.clientId = String(req.query.clientId);
  if (!where.status) delete where.status;
  res.json({ insights: await req.db.aIInsight.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }) });
});

router.post('/:id/approve', body(z.object({ text: z.string().trim().min(1).max(5000).optional() })), async (req, res) => {
  const r = await decideInsight(req.db, req.auth, req.params.id, 'approve', { text: req.body.text });
  res.json({ ok: true, status: r.insight.status, minutesSaved: r.insight.minutesSaved, messageId: r.message?.id || null });
});
router.post('/:id/dismiss', async (req, res) => {
  const r = await decideInsight(req.db, req.auth, req.params.id, 'dismiss');
  res.json({ ok: true, status: r.insight.status });
});
router.post('/:id/undo', async (req, res) => {
  const i = await undoInsight(req.db, req.params.id);
  res.json({ ok: true, status: i.status });
});
