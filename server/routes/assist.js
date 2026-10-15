// Ask Assist (typed) and the confirmation step for anything Assist proposes.
import { Router } from 'express';
import { body, z } from '../lib/validate.js';
import { requireFeature } from '../auth/middleware.js';
import { ask } from '../assist/AssistService.js';
import { confirmProposal, cancelProposal } from '../assist/proposals.js';
import { startOfMonthUtc } from '../lib/time.js';

export const router = Router();
const tzOf = async db => (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';

const turn = z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(1500) });
router.post('/ask', requireFeature('PRO', 'Ask Assist'), body(z.object({ question: z.string().trim().min(1, 'Ask a question.').max(600), voice: z.boolean().default(false), history: z.array(turn).max(12).default([]), lang: z.enum(['en', 'es']).default('en') })), async (req, res) => {
  res.json(await ask(req.db, req.auth, req.body.question, { voice: req.body.voice, tz: await tzOf(req.db), history: req.body.history, lang: req.body.lang }));
});

router.post('/proposals/:id/confirm', body(z.object({ text: z.string().trim().min(1).max(5000).optional() })), async (req, res) => {
  res.json(await confirmProposal(req.db, req.auth, req.params.id, { text: req.body.text }));
});
router.post('/proposals/:id/cancel', async (req, res) => {
  res.json(await cancelProposal(req.db, req.auth, req.params.id));
});

router.get('/stats', async (req, res) => {
  const since = startOfMonthUtc();
  const [asked, decided] = await Promise.all([
    req.db.aIUsage.count({ where: { kind: { in: ['ask', 'ask_voice'] }, createdAt: { gte: since } } }),
    req.db.aIInsight.groupBy({ by: ['status'], where: { decidedAt: { gte: since }, status: { in: ['approved', 'edited'] } }, _count: { _all: true } }),
  ]);
  const d = Object.fromEntries(decided.map(x => [x.status, x._count._all]));
  const total = (d.approved || 0) + (d.edited || 0);
  res.json({ asked, approved: total, asIs: total ? Math.round((d.approved || 0) / total * 100) : null });
});
