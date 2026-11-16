// Ask Assist (typed) and the confirmation step for anything Assist proposes.
import { Router } from 'express';
import { body, z } from '../lib/validate.js';
import { requireFeature } from '../auth/middleware.js';
import { ask, warmAssist, speechRemainder } from '../assist/AssistService.js';
import { confirmProposal, cancelProposal } from '../assist/proposals.js';
import { decideInsight, draftText } from '../core/actions.js';
import { minutesSavedThisWeek } from '../core/queue.js';
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
const askBody = z.object({ question: z.string().trim().min(1, 'Ask a question.').max(600), voice: z.boolean().default(false), history: z.array(turn).max(12).default([]), lang: z.enum(['en', 'es']).default('en'), pendingProposalId: z.string().max(64).nullable().optional(), audioMs: z.number().int().min(0).max(120000).optional(), sttProvider: z.string().max(20).optional() });
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
    // Speech the phone streamed to Deepgram counts toward the monthly voice minutes.
    if (voice && req.body.audioMs && req.body.sttProvider === 'deepgram') req.db.voiceInteraction.create({ data: { userId: req.auth.userId, kind: 'ask', transcript: req.body.question, durationMs: req.body.audioMs, provider: 'deepgram-flux', costMicros: Math.round(req.body.audioMs / 60000 * 6500) } }).catch(() => null);
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

// ---------------------------------------------------------------- approve-all queue
// Everything Assist has drafted that's waiting on the coach, in one stack: check-in replies,
// retention and automation messages, and pending proposals. The coach approves many at once.
// Check-ins that mention pain or a medical topic are never in a batch: they need a read first.
const QUEUE_KINDS = ['risk', 'automation', 'message_draft', 'checkin_summary', 'nutrition_nudge'];
async function queueItems(db, auth) {
  const now = new Date();
  const [insights, proposals, clients] = await Promise.all([
    db.aIInsight.findMany({ where: { status: 'pending', kind: { in: QUEUE_KINDS } }, orderBy: { createdAt: 'desc' }, take: 60 }),
    db.assistProposal.findMany({ where: { status: 'pending', userId: auth.userId, expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.client.findMany({ select: { id: true, name: true, status: true } }),
  ]);
  const byId = new Map(clients.map(c => [c.id, c]));
  const flaggedCheckins = new Set((await db.checkIn.findMany({ where: { id: { in: insights.filter(i => i.kind === 'checkin_summary' && i.sourceId).map(i => i.sourceId) }, flagged: true }, select: { id: true } })).map(k => k.id));
  const items = [];
  for (const i of insights) {
    const c = i.clientId ? byId.get(i.clientId) : null;
    if (i.clientId && (!c || !['ACTIVE', 'NEW', 'PAUSED'].includes(c.status))) continue;
    const text = draftText(i);
    if (!text) continue;
    const needsReview = i.kind === 'checkin_summary' && flaggedCheckins.has(i.sourceId);
    items.push({ kind: 'insight', id: i.id, type: i.kind, client: c ? { id: c.id, name: c.name } : null, title: { risk: 'Check-in message', automation: i.summary || 'Reminder', message_draft: 'Message', checkin_summary: 'Check-in reply', nutrition_nudge: 'Food check-in' }[i.kind] || 'Draft', text, minutes: i.minutesSaved || 0, needsReview, createdAt: i.createdAt });
  }
  for (const p of proposals) items.push({ kind: 'proposal', id: p.id, type: p.type, client: p.payload?.clientId ? { id: p.payload.clientId, name: p.payload.clientName } : null, title: p.summary, text: p.payload?.text || (p.payload?.lines || []).join('\n') || '', minutes: 0, needsReview: p.payload?.voiceOk === false, createdAt: p.createdAt, payload: p.payload });
  return items;
}
router.get('/queue', async (req, res) => {
  const items = await queueItems(req.db, req.auth);
  res.json({ items, count: items.length, batchable: items.filter(i => !i.needsReview).length });
});
router.post('/queue/approve', body(z.object({ items: z.array(z.object({ kind: z.enum(['insight', 'proposal']), id: z.string().max(64), text: z.string().trim().min(1).max(5000).optional() })).min(1).max(60) })), async (req, res) => {
  const results = [];
  // One at a time: each send is its own audited action, and a failure doesn't stop the rest.
  for (const it of req.body.items) {
    try {
      if (it.kind === 'insight') {
        const ins = await req.db.aIInsight.findFirst({ where: { id: it.id } });
        if (ins?.kind === 'checkin_summary' && ins.sourceId && !it.text) {
          const k = await req.db.checkIn.findFirst({ where: { id: ins.sourceId }, select: { flagged: true } });
          if (k?.flagged) { results.push({ ...it, ok: false, error: 'This check-in mentions pain or a medical topic, so open it and read it first.' }); continue; }
        }
        const r = await decideInsight(req.db, req.auth, it.id, 'approve', { text: it.text });
        results.push({ ...it, ok: true, minutes: r.insight?.minutesSaved || 0 });
      } else {
        const r = await confirmProposal(req.db, req.auth, it.id, { text: it.text, via: 'tap' });
        results.push({ ...it, ok: true, message: r.message || '' });
      }
    } catch (e) { results.push({ ...it, ok: false, error: String(e.message || e) }); }
  }
  const ok = results.filter(r => r.ok).length;
  res.json({ results, ok, failed: results.length - ok });
});

// ---------------------------------------------------------------- time saved and settings
router.get('/time-saved', async (req, res) => {
  const tz = await tzOf(req.db);
  const since = startOfMonthUtc();
  const [week, month, byKind, insightMonth] = await Promise.all([
    minutesSavedThisWeek(req.db, tz),
    req.db.assistSaving.aggregate({ where: { createdAt: { gte: since } }, _sum: { minutes: true } }),
    req.db.assistSaving.groupBy({ by: ['kind'], where: { createdAt: { gte: since } }, _sum: { minutes: true } }),
    req.db.aIInsight.aggregate({ where: { status: { in: ['approved', 'edited'] }, decidedAt: { gte: since } }, _sum: { minutesSaved: true } }),
  ]);
  const monthMin = (month._sum.minutes || 0) + (insightMonth._sum.minutesSaved || 0);
  const label = m => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  res.json({ weekMinutes: week, weekLabel: label(week), monthMinutes: monthMin, monthLabel: label(monthMin), byKind: byKind.map(k => ({ kind: k.kind, minutes: k._sum.minutes || 0 })).sort((a, b) => b.minutes - a.minutes), estimate: true });
});
router.get('/settings', async (req, res) => {
  const b = await req.db.business.findFirst({ select: { settings: true } });
  res.json({ autoApprove: b?.settings?.assistAutoApprove !== false });
});
router.patch('/settings', body(z.object({ autoApprove: z.boolean() })), async (req, res) => {
  if (req.auth.role !== 'OWNER') return res.status(403).json({ error: 'Only the workspace owner can change this.' });
  const b = await req.db.business.findFirst({ select: { id: true, settings: true } });
  await req.db.business.update({ where: { id: b.id }, data: { settings: { ...(b.settings || {}), assistAutoApprove: req.body.autoApprove } } });
  res.json({ autoApprove: req.body.autoApprove });
});
