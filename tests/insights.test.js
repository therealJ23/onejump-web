// The Business page: the month forecast's arithmetic, renewal dates, and the API (coach only,
// one business never sees another's numbers).
import { describe, it, expect, beforeAll } from 'vitest';
import { forecastMonth, chargeDates, businessInsights, ASSUME } from '../server/core/businessInsights.js';
import { fixtures, loginCoach, loginClient } from './helpers.js';

const base = {
  today: '2026-10-18',
  dailyCollected: Array.from({ length: 18 }, (_, i) => (i === 5 ? 100000 : i === 12 ? 50000 : 0)),
  renewals: [{ date: '2026-10-25', cents: 15000 }, { date: '2026-10-30', cents: 18000 }],
  scheduled: [{ date: '2026-10-20', cents: 10000 }],
  failedCents: 20000,
  trials: [{ date: '2026-10-28', cents: 15000 }],
  newPerDayCents: 1000,
  collectionRate: 0.9,
};

describe('month forecast', () => {
  it('adds up the expected pieces, with low ≤ expected ≤ high', () => {
    const f = forecastMonth(base);
    expect(f.collected).toBe(150000);
    expect(f.daysInMonth).toBe(31);
    expect(f.daysLeft).toBe(13);
    expect(f.base.renewals).toBe(Math.round(33000 * 0.9));
    expect(f.base.scheduled).toBe(9000);
    expect(f.base.recovered).toBe(20000 * ASSUME.failedRecovery.base);
    expect(f.base.trials).toBe(Math.round(15000 * ASSUME.trialConversion.base * 0.9));
    expect(f.base.newClients).toBe(13 * 1000);
    expect(f.base.total).toBe(150000 + f.base.renewals + f.base.scheduled + f.base.recovered + f.base.trials + f.base.newClients);
    expect(f.low.total).toBeLessThanOrEqual(f.base.total);
    expect(f.base.total).toBeLessThanOrEqual(f.high.total);
    expect(f.low.recovered).toBe(0);
    expect(f.high.renewals).toBe(33000);
  });

  it('draws a curve that starts at today’s total and ends at each case’s total', () => {
    const f = forecastMonth(base);
    expect(f.curve.actual).toHaveLength(18);
    expect(f.curve.actual.at(-1)).toBe(150000);
    expect(f.curve.base).toHaveLength(31 - 18 + 1);
    for (const k of ['low', 'base', 'high']) expect(Math.abs(f.curve[k].at(-1) - f[k].total)).toBeLessThanOrEqual(2);
    // never goes down
    for (let i = 1; i < f.curve.base.length; i++) expect(f.curve.base[i]).toBeGreaterThanOrEqual(f.curve.base[i - 1]);
  });

  it('near the end of the month, only retries that happen this month count', () => {
    const f = forecastMonth({ ...base, today: '2026-10-29', dailyCollected: new Array(29).fill(0), renewals: [], scheduled: [], trials: [], newPerDayCents: 0 });
    // Retries on days 3, 5, 7 after Oct 29 all fall in November.
    expect(f.base.recovered).toBe(0);
    const g = forecastMonth({ ...base, today: '2026-10-27', dailyCollected: new Array(27).fill(0), renewals: [], scheduled: [], trials: [], newPerDayCents: 0 });
    expect(g.base.recovered).toBe(Math.round(20000 * 0.5 / 3)); // only the day-3 retry (Oct 30)
  });

  it('on the last day nothing more is expected', () => {
    const f = forecastMonth({ ...base, today: '2026-10-31', dailyCollected: new Array(31).fill(1000), renewals: [], scheduled: [], trials: [] });
    expect(f.daysLeft).toBe(0);
    expect(f.base.total).toBe(31000);
    expect(f.high.total).toBe(31000);
  });
});

describe('renewal dates', () => {
  it('uses the subscription’s renewal date when it has one', () => {
    expect(chargeDates({ interval: 'month', periodEnd: '2026-10-25' }, '2026-10-19', '2026-10-31')).toEqual(['2026-10-25']);
    expect(chargeDates({ interval: 'month', periodEnd: '2026-11-03' }, '2026-10-19', '2026-10-31')).toEqual([]);
  });
  it('otherwise goes one period past the last payment, clamping short months', () => {
    expect(chargeDates({ interval: 'month', lastPaid: '2026-09-22' }, '2026-10-19', '2026-10-31')).toEqual(['2026-10-22']);
    expect(chargeDates({ interval: 'month', lastPaid: '2026-01-31' }, '2026-02-01', '2026-02-28')).toEqual(['2026-02-28']);
  });
  it('weekly plans renew every week left in the month', () => {
    expect(chargeDates({ interval: 'week', lastPaid: '2026-10-14' }, '2026-10-19', '2026-10-31')).toEqual(['2026-10-21', '2026-10-28']);
  });
  it('one-time packages never renew', () => {
    expect(chargeDates({ interval: 'once', lastPaid: '2026-10-01' }, '2026-10-19', '2026-10-31')).toEqual([]);
  });
});

describe('GET /api/today/insights', () => {
  let fx;
  beforeAll(async () => { fx = await fixtures(); });

  it('gives the coach a forecast, trends and takeaways from their own data', async () => {
    const b = await loginCoach();
    const r = await b.get('/api/today/insights');
    expect(r.status).toBe(200);
    const d = r.body;
    expect(d.forecast.base.total).toBeGreaterThanOrEqual(d.forecast.collected);
    expect(d.forecast.low.total).toBeLessThanOrEqual(d.forecast.base.total);
    expect(d.forecast.high.total).toBeGreaterThanOrEqual(d.forecast.base.total);
    expect(d.revenue).toHaveLength(12);
    expect(d.revenue.at(-1).cents).toBe(d.forecast.collected);
    expect(d.clients.flow).toHaveLength(6);
    expect(d.engagement).toHaveLength(8);
    expect(d.leads.funnel[0].stage).toBe('Leads');
    expect(d.clients.mrr).toBeGreaterThan(0);
    expect(Array.isArray(d.takeaways)).toBe(true);
    // Collected this month matches the payments table.
    const pay = await b.get('/api/payments');
    expect(d.forecast.collected).toBe(pay.body.summary.collectedCents);
  });

  it('never mixes in another business’s money or clients', async () => {
    const a = await businessInsights(fx.dbA);
    const bIns = await businessInsights(fx.dbB);
    const bPaid = await fx.dbB.payment.findMany({ where: { status: 'paid' } });
    const bClients = await fx.dbB.client.count({ where: { status: { in: ['NEW', 'ACTIVE'] } } });
    expect(bIns.clients.active).toBe(bClients);
    expect(bIns.revenue.reduce((n, m) => n + m.cents, 0)).toBeLessThanOrEqual(bPaid.reduce((n, p) => n + p.amountCents, 0));
    expect(bIns.clients.active).not.toBe(a.clients.active);
    expect(bIns.risk.atRisk.every(x => !a.risk.atRisk.some(y => y.id === x.id))).toBe(true);
  });

  it('is for coaches only', async () => {
    const client = await loginClient();
    expect((await client.get('/api/today/insights')).status).toBe(403);
  });
});

describe('HQ: OneJump’s own forecast', () => {
  it('only the platform admin gets it, with no client details', async () => {
    const coach = await loginCoach();
    expect((await coach.get('/api/admin/insights')).status).toBe(403);
    const admin = await loginCoach('ops@onejumpfit.com');
    const r = await admin.get('/api/admin/insights');
    expect(r.status).toBe(200);
    const d = r.body;
    expect(JSON.stringify(d)).not.toMatch(/Marcus|Mike Torres|mike\.t@example\.com|@example\.com/);
    expect(d.forecast.low.total).toBeLessThanOrEqual(d.forecast.base.total);
    expect(d.forecast.base.total).toBeLessThanOrEqual(d.forecast.high.total);
    expect(d.forecast.base.total).toBeGreaterThanOrEqual(d.forecast.collected);
    expect(d.mrr.trend).toHaveLength(12);
    expect(d.coaches.flow).toHaveLength(6);
    expect(d.ai.months).toHaveLength(6);
    expect(d.coaches.funnel.map(s => s.stage)).toEqual(['Signed up', 'Finished setup', 'Active this week', 'Paying']);
    // MRR matches the overview's.
    const o = await admin.get('/api/admin/overview');
    expect(d.mrr.now).toBe(o.body.kpis.mrrCents);
  });

  it('records a paid coach plan from Stripe, and a paid retry clears past-due', async () => {
    const { handlePlatformEvent } = await import('../server/routes/webhooks.js');
    const { getPrisma } = await import('../server/db/prisma.js');
    const fx = await fixtures();
    const db = getPrisma();
    await db.business.update({ where: { id: fx.B.id }, data: { stripeCustomerId: 'cus_hq_test', planStatus: 'past_due' } });
    const r = await handlePlatformEvent({ type: 'invoice.paid', data: { object: { id: 'in_hq_1', customer: 'cus_hq_test', amount_paid: 9900, status_transitions: { paid_at: Math.floor(Date.now() / 1000) } } } });
    expect(r).toBe('plan_paid');
    await new Promise(res => setTimeout(res, 50));
    const ev = await db.auditLog.findFirst({ where: { businessId: fx.B.id, action: 'plan_paid' } });
    expect(ev.meta.amountCents).toBe(9900);
    expect((await db.business.findUnique({ where: { id: fx.B.id } })).planStatus).toBe('active');
    // With a real payment on record, HQ switches from estimates to Stripe's numbers.
    const admin = await loginCoach('ops@onejumpfit.com');
    const d = (await admin.get('/api/admin/insights')).body;
    expect(d.live).toBe(true);
    expect(d.forecast.collected).toBeGreaterThanOrEqual(9900);
  });
});
