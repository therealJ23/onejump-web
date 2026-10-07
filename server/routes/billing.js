// What the coach pays OneJump: 14-day Pro trial → Starter / Pro / Studio (Stripe Billing).
import { Router } from 'express';
import { body, z } from '../lib/validate.js';
import { effectivePlan } from '../auth/middleware.js';
import { payments, PLAN_PRICES } from '../payments/PaymentService.js';
import { CLIENT_CAPS } from '../core/invites.js';
import { startOfMonthUtc } from '../lib/time.js';
import { audit } from '../db/system.js';

export const router = Router();

router.get('/', async (req, res) => {
  const b = await req.db.business.findFirst();
  const plan = effectivePlan(b);
  const [active, aiActions, invoices] = await Promise.all([
    req.db.client.count({ where: { status: { in: ['NEW', 'ACTIVE', 'PAUSED'] } } }),
    req.db.aIInsight.count({ where: { createdAt: { gte: startOfMonthUtc() } } }),
    payments().platformInvoices(req.db).catch(() => []),
  ]);
  res.json({
    plan: b.plan, effectivePlan: plan, planStatus: b.planStatus, trialEndsAt: b.trialEndsAt, renewsAt: b.planRenewsAt, cancelAtPeriodEnd: b.cancelAtPeriodEnd,
    trialDaysLeft: b.plan === 'TRIAL' && b.trialEndsAt ? Math.max(0, Math.ceil((new Date(b.trialEndsAt) - Date.now()) / 864e5)) : null,
    clients: { active, cap: CLIENT_CAPS[plan] }, aiActions: { used: aiActions, allowance: 1000 },
    prices: PLAN_PRICES, provider: payments().name, invoices,
  });
});

router.post('/checkout', body(z.object({ plan: z.enum(['STARTER', 'PRO', 'STUDIO']) })), async (req, res) => {
  const r = await payments().platformCheckout(req.db, { plan: req.body.plan, userId: req.auth.userId });
  audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'plan_checkout', target: req.body.plan });
  res.json(r);
});
router.post('/portal', async (req, res) => res.json(await payments().platformPortal(req.db)));
router.post('/cancel', async (req, res) => {
  await payments().cancelPlatform(req.db);
  audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'plan_cancel', target: 'period_end' });
  res.json({ ok: true });
});
router.post('/resume', async (req, res) => res.json(await payments().resumePlatform(req.db)));
