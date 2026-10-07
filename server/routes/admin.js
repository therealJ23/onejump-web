// OneJump internal admin: business-level numbers only. No client names, check-ins or messages.
import { Router } from 'express';
import { admin } from '../db/system.js';
import { PLAN_PRICES } from '../payments/PaymentService.js';
import { startOfMonthUtc } from '../lib/time.js';

export const router = Router();

router.get('/overview', async (_req, res) => {
  const since = startOfMonthUtc();
  const [list, usage, decisions, clients, support, auditRows] = await Promise.all([admin.businesses(), admin.aiUsageSince(since), admin.aiDecisionsSince(since), admin.totalClients(), admin.openSupport(), admin.recentAudit()]);
  const now = Date.now();
  const paying = list.filter(b => ['STARTER', 'PRO', 'STUDIO'].includes(b.plan) && ['active', 'past_due'].includes(b.planStatus));
  const trials = list.filter(b => b.plan === 'TRIAL' && b.trialEndsAt && new Date(b.trialEndsAt) > now);
  const mrr = paying.reduce((n, b) => n + (PLAN_PRICES[b.plan] || 0), 0);
  const aiCost = usage.reduce((n, u) => n + (u._sum.costMicros || 0), 0) / 1e6;
  const aiCalls = usage.reduce((n, u) => n + u._count._all, 0);
  const d = Object.fromEntries(decisions.map(x => [x.status, x._count._all]));
  const decided = (d.approved || 0) + (d.edited || 0) + (d.dismissed || 0);
  const health = b => b.planStatus === 'past_due' ? 'Payment failed' : b.plan === 'TRIAL' && b.trialEndsAt && new Date(b.trialEndsAt) - now < 4 * 864e5 && new Date(b.trialEndsAt) > now ? 'Trial ends soon' : b.lastActiveAt && now - new Date(b.lastActiveAt) > 7 * 864e5 ? 'Low usage' : !b.onboardedAt ? 'Not onboarded' : 'Healthy';
  res.json({
    kpis: {
      mrrCents: mrr, payingCoaches: paying.length, trials: trials.length, coaches: list.length, clients,
      newThisMonth: list.filter(b => new Date(b.createdAt) >= since).length,
      failedPayments: list.filter(b => b.planStatus === 'past_due').length,
      canceled: list.filter(b => b.planStatus === 'canceled').length,
      aiCalls, aiCostUsd: Math.round(aiCost * 100) / 100, aiPctOfMrr: mrr ? Math.round(aiCost / (mrr / 100) * 1000) / 10 : 0,
      approvedAsIs: decided ? Math.round((d.approved || 0) / decided * 100) : null, openSupport: support.length,
    },
    mix: { STARTER: paying.filter(b => b.plan === 'STARTER').length, PRO: paying.filter(b => b.plan === 'PRO').length, STUDIO: paying.filter(b => b.plan === 'STUDIO').length },
    aiByFeature: usage.map(u => ({ kind: u.kind, calls: u._count._all, costUsd: (u._sum.costMicros || 0) / 1e6 })).sort((a, b) => b.calls - a.calls),
    coaches: list.map(b => ({ id: b.id, business: b.name, owner: b.owner, plan: b.plan, planStatus: b.planStatus, clients: b.activeClients, mrrCents: ['active', 'past_due'].includes(b.planStatus) ? PLAN_PRICES[b.plan] || 0 : 0, health: health(b), lastActiveAt: b.lastActiveAt, stripe: b.stripeAccountStatus, createdAt: b.createdAt })),
    support: support.map(s => ({ kind: s.kind, createdAt: s.createdAt })),
    audit: auditRows,
  });
});
