// Stripe-shaped mock so every payments screen works before Stripe keys exist.
// Checkout and the card-update portal are simple pages in the app marked "test mode".
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { PLAN_PRICES } from './PaymentService.js';

export class MockPayments {
  constructor() { this.name = 'mock'; }

  async connectStatus(db) {
    const b = await db.business.findFirst({ select: { stripeAccountId: true, stripeAccountStatus: true } });
    return { status: b.stripeAccountStatus, accountId: b.stripeAccountId, provider: 'mock' };
  }
  async startConnect(db) {
    const b = await db.business.findFirst({ select: { id: true } });
    await db.business.update({ where: { id: b.id }, data: { stripeAccountId: `acct_mock_${b.id.slice(0, 8)}`, stripeAccountStatus: 'active' } });
    return { url: `${config.appUrl}/app/payments?connect=done` };
  }
  async syncPlan(db, plan) {
    if (!plan.priceCents || plan.stripePriceId) return plan;
    return db.clientPlan.update({ where: { id: plan.id }, data: { stripeProductId: `prod_mock_${plan.id.slice(0, 8)}`, stripePriceId: `price_mock_${plan.id.slice(0, 8)}` } });
  }
  /** Client pays the coach: returns a URL to the app's test-mode checkout page. */
  async clientCheckout(_db, { client, plan }) {
    return { url: `${config.appUrl}/client/checkout?plan=${encodeURIComponent(plan.id)}&session=mock_${randomUUID().slice(0, 12)}&client=${encodeURIComponent(client.id)}`, mock: true };
  }
  /** Completes a test-mode checkout (called by the mock checkout page). */
  async completeMockCheckout(db, { client, plan }) {
    const now = new Date();
    const existing = await db.subscription.findFirst({ where: { clientId: client.id, status: { in: ['active', 'past_due', 'trialing'] } } });
    if (plan.interval !== 'once') {
      if (existing) await db.subscription.update({ where: { id: existing.id }, data: { clientPlanId: plan.id, status: 'active', currentPeriodEnd: new Date(now.getTime() + 30 * 864e5) } });
      else await db.subscription.create({ data: { clientId: client.id, clientPlanId: plan.id, status: 'active', stripeSubscriptionId: `sub_mock_${randomUUID().slice(0, 12)}`, currentPeriodEnd: new Date(now.getTime() + 30 * 864e5) } });
    }
    await db.payment.create({ data: { clientId: client.id, clientPlanId: plan.id, amountCents: plan.priceCents, status: 'paid', paidAt: now, stripeCheckoutSessionId: `cs_mock_${randomUUID().slice(0, 12)}` } });
    return { ok: true };
  }
  async clientPortal(_db, { client }) {
    return { url: `${config.appUrl}/client/me?card=mock-updated&client=${encodeURIComponent(client.id)}`, mock: true };
  }
  /** Mock retry: an updated card succeeds; otherwise it fails like a real decline would. */
  async retryPayment(db, payment) {
    const card = await db.clientEvent.findFirst({ where: { clientId: payment.clientId, kind: 'card_updated', at: { gte: payment.createdAt } } });
    if (card) {
      return { ok: true, payment: await db.payment.update({ where: { id: payment.id }, data: { status: 'paid', paidAt: new Date(), attempts: { increment: 1 }, failureReason: null } }) };
    }
    await db.payment.update({ where: { id: payment.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: /expired/i.test(payment.failureReason || '') ? 'Card expired. The client needs to add a new card.' : 'Card declined again. A reminder is the next step.' };
  }

  // -------------------------------------------------- OneJump plans (coach pays OneJump)
  async platformCheckout(db, { plan }) {
    const b = await db.business.findFirst({ select: { id: true } });
    await db.business.update({ where: { id: b.id }, data: { plan, planStatus: 'active', planRenewsAt: new Date(Date.now() + 30 * 864e5), cancelAtPeriodEnd: false, stripeCustomerId: `cus_mock_${b.id.slice(0, 8)}`, stripeSubscriptionId: `sub_mock_${b.id.slice(0, 8)}` } });
    return { url: `${config.appUrl}/app/billing?upgraded=${plan}`, mock: true };
  }
  async platformPortal() { return { url: `${config.appUrl}/app/billing?portal=mock`, mock: true }; }
  async cancelPlatform(db) {
    const b = await db.business.findFirst({ select: { id: true } });
    await db.business.update({ where: { id: b.id }, data: { cancelAtPeriodEnd: true } });
    return { ok: true };
  }
  async resumePlatform(db) {
    const b = await db.business.findFirst({ select: { id: true } });
    await db.business.update({ where: { id: b.id }, data: { cancelAtPeriodEnd: false } });
    return { ok: true };
  }
  async platformInvoices(db) {
    const b = await db.business.findFirst({ select: { plan: true, createdAt: true, planStatus: true } });
    if (b.plan === 'TRIAL' || b.planStatus !== 'active') return [];
    return [{ id: 'in_mock_1', date: new Date(), amountCents: PLAN_PRICES[b.plan] || 0, status: 'paid', url: null }];
  }
}
