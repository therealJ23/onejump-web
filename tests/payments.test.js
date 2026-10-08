// Payments: Stripe webhook signatures, client-payment events on connected accounts (scoped to
// the right business), test-mode checkout and the failed-payment recovery loop.
import { describe, it, expect, beforeAll } from 'vitest';
import Stripe from 'stripe';
import { fixtures, browser, loginCoach, loginClient } from './helpers.js';
import { StripePayments } from '../server/payments/stripe.js';
import { handleConnectEvent, handlePlatformEvent } from '../server/routes/webhooks.js';

let f;
beforeAll(async () => { f = await fixtures(); });
const ACCOUNT = 'acct_mock_reyes';
const invoice = (id, extra = {}) => ({ id, amount_due: 18000, amount_paid: 18000, metadata: {}, ...extra });

describe('Stripe webhook signatures', () => {
  const secret = 'whsec_test_secret';
  const sp = new StripePayments('sk_test_dummy');
  const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'invoice.paid', data: { object: {} } });
  it('accepts a correctly signed event', () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(sp.constructEvent(Buffer.from(payload), header, secret).id).toBe('evt_1');
  });
  it('rejects a tampered body or a wrong secret', () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => sp.constructEvent(Buffer.from(payload.replace('evt_1', 'evt_2')), header, secret)).toThrow();
    expect(() => sp.constructEvent(Buffer.from(payload), header, 'whsec_other')).toThrow();
  });
  it('the webhook endpoint refuses events while Stripe isn’t configured', async () => {
    const b = await browser();
    const r = await b.agent.post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('stripe-signature', 't=1,v1=x').send(payload);
    expect(r.status).toBe(400);
  });
});

describe('client payment events on a coach’s connected account', () => {
  it('records a failed invoice, flags the client and runs the failed-payment automation', async () => {
    const r = await handleConnectEvent({ type: 'invoice.payment_failed', account: ACCOUNT, data: { object: invoice('in_test_fail_1', { metadata: { clientId: f.mike.id }, last_payment_error: { message: 'Your card was declined.' } }) } });
    expect(r).toBe('invoice_failed');
    const p = await f.dbA.payment.findFirst({ where: { stripeInvoiceId: 'in_test_fail_1' } });
    expect(p.status).toBe('failed');
    expect(p.failureReason).toMatch(/declined/);
    expect((await f.dbA.client.findFirst({ where: { id: f.mike.id } })).payStatus).toBe('failed');
    expect(await f.dbA.automationRun.count({ where: { clientId: f.mike.id, summary: { startsWith: 'Payment failed' } } })).toBeGreaterThan(0);
    expect(await f.dbA.notification.count({ where: { title: { startsWith: 'Payment failed: Mike' } } })).toBeGreaterThan(0);
  });

  it('marks it paid when the retry succeeds, without duplicating the payment', async () => {
    await handleConnectEvent({ type: 'invoice.paid', account: ACCOUNT, data: { object: invoice('in_test_fail_1', { metadata: { clientId: f.mike.id }, status_transitions: { paid_at: Math.floor(Date.now() / 1000) } }) } });
    const rows = await f.dbA.payment.findMany({ where: { stripeInvoiceId: 'in_test_fail_1' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('paid');
    expect((await f.dbA.client.findFirst({ where: { id: f.mike.id } })).payStatus).toBe('paid');
  });

  it('can’t be pointed at another business’s client', async () => {
    const other = await f.dbB.client.findFirst();
    const r = await handleConnectEvent({ type: 'invoice.payment_failed', account: ACCOUNT, data: { object: invoice('in_cross_1', { metadata: { clientId: other.id } }) } });
    expect(r).toBe('unknown_client');
    expect(await f.dbB.payment.count({ where: { stripeInvoiceId: 'in_cross_1' } })).toBe(0);
    expect(await handleConnectEvent({ type: 'invoice.paid', account: 'acct_nobody', data: { object: invoice('in_x') } })).toBe('unknown_account');
  });
});

describe('OneJump plan events', () => {
  it('activates a plan from a completed checkout and marks past due on a failed invoice', async () => {
    const coach = await browser();
    const email = `plan.${Date.now()}@example.com`;
    await coach.post('/api/auth/signup', { name: 'Plan Coach', email, password: 'a-long-password-1' });
    const me = (await coach.get('/api/auth/me')).body;
    expect(await handlePlatformEvent({ type: 'checkout.session.completed', data: { object: { metadata: { kind: 'onejump_plan', plan: 'PRO', businessId: me.business.id }, customer: 'cus_test_1', subscription: 'sub_test_1' } } })).toBe('plan_started');
    expect((await coach.get('/api/auth/me')).body.business.plan).toBe('PRO');
    expect(await handlePlatformEvent({ type: 'invoice.payment_failed', data: { object: { id: 'in_plan_1', customer: 'cus_test_1' } } })).toBe('plan_past_due');
    expect((await coach.get('/api/billing')).body.planStatus).toBe('past_due');
  });
});

describe('test-mode checkout and recovery (PAYMENTS_PROVIDER=mock)', () => {
  it('lets a client pay for their package in the app', async () => {
    const mike = await loginClient();
    const acc = (await mike.get('/api/me/account')).body;
    const plan = acc.plans[0];
    const co = await mike.post('/api/me/billing/checkout', { clientPlanId: plan.id });
    expect(co.body.url).toContain('/client/checkout');
    const before = await f.dbA.payment.count({ where: { clientId: f.mike.id, status: 'paid' } });
    expect((await mike.post('/api/me/billing/mock-complete', { clientPlanId: plan.id })).status).toBe(200);
    expect(await f.dbA.payment.count({ where: { clientId: f.mike.id, status: 'paid' } })).toBe(before + 1);
  });

  it('a retry fails until the client updates their card, then succeeds', async () => {
    const dani = await loginCoach();
    const p = await f.dbA.payment.create({ data: { clientId: f.mike.id, amountCents: 18000, status: 'failed', failureReason: 'Card expired' } });
    const first = await dani.post(`/api/payments/${p.id}/retry`);
    expect(first.body.ok).toBe(false);
    const remind = await dani.post(`/api/payments/${p.id}/remind`);
    expect(remind.status).toBe(200);
    const mike = await loginClient();
    expect((await mike.post('/api/me/billing/portal')).status).toBe(200);
    const second = await dani.post(`/api/payments/${p.id}/retry`);
    expect(second.body.ok).toBe(true);
    expect((await f.dbA.payment.findFirst({ where: { id: p.id } })).status).toBe('paid');
  });
});
