// Revenue numbers shown to the coach. All amounts in cents.
import { startOfMonthUtc } from '../lib/time.js';

export const monthlyCents = plan => (!plan ? 0 : plan.interval === 'month' ? plan.priceCents : plan.interval === 'week' ? Math.round(plan.priceCents * 52 / 12) : 0);

export async function revenueSummary(db, now = new Date()) {
  const [subs, plans, paidThisMonth, failed, upcoming] = await Promise.all([
    db.subscription.findMany({ where: { status: { in: ['active', 'past_due', 'trialing'] } }, select: { clientPlanId: true, status: true, clientId: true } }),
    db.clientPlan.findMany(),
    db.payment.aggregate({ where: { status: 'paid', paidAt: { gte: startOfMonthUtc(now) } }, _sum: { amountCents: true }, _count: { _all: true } }),
    db.payment.findMany({ where: { status: 'failed' }, select: { amountCents: true } }),
    db.payment.aggregate({ where: { status: 'upcoming' }, _sum: { amountCents: true } }),
  ]);
  const byId = new Map(plans.map(p => [p.id, p]));
  const paying = subs.filter(s => s.status !== 'trialing');
  const mrr = paying.reduce((n, s) => n + monthlyCents(byId.get(s.clientPlanId)), 0);
  return {
    mrrCents: mrr,
    payingClients: new Set(paying.map(s => s.clientId)).size,
    collectedCents: paidThisMonth._sum.amountCents || 0,
    collectedCount: paidThisMonth._count._all || 0,
    failedCents: failed.reduce((n, p) => n + p.amountCents, 0),
    failedCount: failed.length,
    upcomingCents: upcoming._sum.amountCents || 0,
    avgPerClientCents: paying.length ? Math.round(mrr / new Set(paying.map(s => s.clientId)).size) : 0,
  };
}
