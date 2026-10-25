// Ask Assist (typed) and the confirmation step for anything Assist proposes.
import { Router } from 'express';
import { body, z } from '../lib/validate.js';
import { requireFeature } from '../auth/middleware.js';
import { ask, warmAssist, speechRemainder } from '../assist/AssistService.js';
import { confirmProposal, cancelProposal } from '../assist/proposals.js';
import { startOfMonthUtc } from '../lib/time.js';

export const router = Router();
const tzOf = async db => (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';

const turn = z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(1500) });
router.post('/ask', requireFeature('PRO', 'Ask Assist'), body(z.object({ question: z.string().trim().min(1, 'Ask a question.').max(600), voice: z.boolean().default(false), history: z.array(turn).max(12).default([]), lang: z.enum(['en', 'es']).default('en'), pendingProposalId: z.string().max(64).nullable().optional() })), async (req, res) => {
  res.json(await ask(req.db, req.auth, req.body.question, { voice: req.body.voice, tz: await tzOf(req.db), history: req.body.history, lang: req.body.lang, pendingProposalId: req.body.pendingProposalId || null }));
});

/**
 * The same answer, streamed as server-sent events so the phone can show it while it's written and
 * start speaking the first sentence right away:
 *   {type:'delta', text}  more of the answer's text
 *   {type:'reset'}        what was shown so far was a lead-in; clear it (Assist is looking things up)
 *   {type:'say', text}    voice mode: the next sentence to say, in order (everything to say comes this way)
 *   {type:'done', answer} the full answer, the same shape as POST /ask (plus speechStreamed)
 *   {type:'error', message, status}
 */
const askBody = z.object({ question: z.string().trim().min(1, 'Ask a question.').max(600), voice: z.boolean().default(false), history: z.array(turn).max(12).default([]), lang: z.enum(['en', 'es']).default('en'), pendingProposalId: z.string().max(64).nullable().optional() });
router.post('/ask/stream', requireFeature('PRO', 'Ask Assist'), body(askBody), async (req, res) => {
  res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  res.flushHeaders?.();
  let open = true;
  res.on('close', () => { open = false; });
  const send = ev => { if (open) res.write(`data: ${JSON.stringify(ev)}\n\n`); };
  // Keeps proxies from closing a quiet connection while tools run.
  const ping = setInterval(() => { if (open) res.write(': ping\n\n'); }, 10000);
  try {
    const voice = req.body.voice;
    const r = await ask(req.db, req.auth, req.body.question, { voice, tz: await tzOf(req.db), history: req.body.history, lang: req.body.lang, pendingProposalId: req.body.pendingProposalId || null, emit: send, fast: true });
    if (voice) {
      const rest = speechRemainder(r.spokenText, r.streamedSay);
      if (rest) send({ type: 'say', text: rest });
    }
    send({ type: 'done', answer: { ...r, speechStreamed: !!voice } });
  } catch (e) {
    console.error('[assist] stream failed:', e.message);
    send({ type: 'error', status: e.status || 500, message: e.expose === false || !e.status ? 'Something went wrong. Try again.' : e.message });
  } finally {
    clearInterval(ping);
    if (open) res.end();
  }
});

/** Gets Assist ready when the app opens (primes the AI's cache so the first question is quick). */
router.post('/warm', requireFeature('PRO', 'Ask Assist'), body(z.object({ lang: z.enum(['en', 'es']).default('en') })), async (req, res) => {
  res.json(await warmAssist(req.db, req.auth, { lang: req.body.lang }));
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
