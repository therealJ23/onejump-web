// Coach: client payments through their own Stripe account (no OneJump cut), packages,
// failed-payment recovery.
import { Router } from 'express';
import { body, z, name } from '../lib/validate.js';
import { must, badRequest } from '../lib/errors.js';
import { requireOwner } from '../auth/middleware.js';
import { payments } from '../payments/PaymentService.js';
import { revenueSummary } from '../core/money.js';
import { sendMessage } from '../core/messaging.js';
import { fillTemplate } from '../core/automationTemplates.js';

export const router = Router();

router.get('/', async (req, res) => {
  const [summary, list, plans, subs, connect] = await Promise.all([
    revenueSummary(req.db),
    req.db.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
    req.db.clientPlan.findMany({ orderBy: { createdAt: 'asc' } }),
    req.db.subscription.groupBy({ by: ['clientPlanId'], where: { status: { in: ['active', 'past_due', 'trialing'] } }, _count: { _all: true } }),
    payments().connectStatus(req.db).catch(e => ({ status: 'error', error: e.message })),
  ]);
  const clients = new Map((await req.db.client.findMany({ select: { id: true, name: true, clientPlanId: true } })).map(c => [c.id, c]));
  const P = new Map(plans.map(p => [p.id, p]));
  const subCount = Object.fromEntries(subs.map(s => [s.clientPlanId, s._count._all]));
  res.json({
    summary, connect, provider: payments().name,
    payments: list.map(p => ({ ...p, client: clients.get(p.clientId) ? { id: p.clientId, name: clients.get(p.clientId).name } : null, plan: P.get(p.clientPlanId || clients.get(p.clientId)?.clientPlanId)?.name || null })),
    plans: plans.map(p => ({ ...p, clients: subCount[p.id] || 0 })),
  });
});

router.post('/connect', requireOwner, async (req, res) => res.json(await payments().startConnect(req.db, { userId: req.auth.userId })));

const planSchema = z.object({ name, price: z.coerce.number().min(0).max(100000), interval: z.enum(['month', 'week', 'once']), description: z.string().trim().max(190).optional(), sessionsIncluded: z.coerce.number().int().min(0).max(100).optional() });
router.post('/plans', body(planSchema), async (req, res) => {
  const d = req.body;
  let plan = await req.db.clientPlan.create({ data: { name: d.name, priceCents: Math.round(d.price * 100), interval: d.interval, description: d.description || null, sessionsIncluded: d.sessionsIncluded || null } });
  try { plan = await payments().syncPlan(req.db, plan); } catch (e) { console.error('[payments] syncPlan', e.message); }
  res.status(201).json({ plan });
});
router.patch('/plans/:id', body(z.object({ name: name.optional(), description: z.string().trim().max(190).optional(), active: z.boolean().optional() })), async (req, res) => {
  const p = must(await req.db.clientPlan.findFirst({ where: { id: req.params.id } }), 'That package');
  res.json({ plan: await req.db.clientPlan.update({ where: { id: p.id }, data: req.body }) });
});

router.post('/:id/retry', async (req, res) => {
  const p = must(await req.db.payment.findFirst({ where: { id: req.params.id } }), 'That payment');
  if (p.status !== 'failed') throw badRequest('Only failed payments can be retried.');
  const r = await payments().retryPayment(req.db, p);
  if (r.ok) {
    const others = await req.db.payment.count({ where: { clientId: p.clientId, status: 'failed' } });
    if (!others) await req.db.client.update({ where: { id: p.clientId }, data: { payStatus: 'paid' } });
  }
  res.json(r.ok ? { ok: true } : { ok: false, error: r.error });
});

router.post('/:id/remind', async (req, res) => {
  const p = must(await req.db.payment.findFirst({ where: { id: req.params.id } }), 'That payment');
  const c = must(await req.db.client.findFirst({ where: { id: p.clientId } }), 'That client');
  const auto = await req.db.automation.findFirst({ where: { key: 'failed_payment' } });
  await sendMessage(req.db, { clientId: c.id, body: fillTemplate(auto?.template || 'Hi {first}, your last payment didn’t go through. You can update your card in the app under Me → Billing. Thanks!', c), senderUserId: req.auth.userId, senderRole: 'COACH' });
  await req.db.payment.update({ where: { id: p.id }, data: { remindedAt: new Date() } });
  res.json({ ok: true });
});

/** A payment link the coach can send (opens the client's checkout for a package). */
router.post('/clients/:clientId/charge', body(z.object({ clientPlanId: z.string().max(64) })), async (req, res) => {
  const c = must(await req.db.client.findFirst({ where: { id: req.params.clientId } }), 'That client');
  const plan = must(await req.db.clientPlan.findFirst({ where: { id: req.body.clientPlanId } }), 'That package');
  await req.db.client.update({ where: { id: c.id }, data: { clientPlanId: plan.id, payStatus: plan.priceCents ? 'due' : c.payStatus } });
  await sendMessage(req.db, { clientId: c.id, body: `Hi ${c.name.split(' ')[0]}, your plan is ${plan.name} (${(plan.priceCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}${plan.interval === 'once' ? '' : '/' + plan.interval}). You can pay securely in the app under Me → Billing.`, senderUserId: req.auth.userId, senderRole: 'COACH' });
  res.json({ ok: true });
});
