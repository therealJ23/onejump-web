// Real Stripe: Connect accounts where Stripe handles pricing and payouts (the coach is the
// merchant of record, OneJump pays nothing for Connect), Checkout for client payments,
// and Billing for OneJump's own plans. Turned on with PAYMENTS_PROVIDER=stripe.
import Stripe from 'stripe';
import { config } from '../config.js';
import { users } from '../db/system.js';

export class StripePayments {
  constructor(secretKey) {
    this.name = 'stripe';
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20000, appInfo: { name: 'OneJump', url: 'https://onejumpfit.com' } });
  }
  live() { return config.payments.stripeSecretKey.startsWith('sk_live_'); }

  // -------------------------------------------------- Connect (client pays coach)
  async connectStatus(db) {
    const b = await db.business.findFirst({ select: { id: true, stripeAccountId: true, stripeAccountStatus: true } });
    if (!b.stripeAccountId) return { status: 'none', accountId: null, provider: 'stripe', live: this.live() };
    const acct = await this.stripe.accounts.retrieve(b.stripeAccountId);
    const status = acct.charges_enabled && acct.payouts_enabled ? 'active' : 'pending';
    if (status !== b.stripeAccountStatus) await db.business.update({ where: { id: b.id }, data: { stripeAccountStatus: status } });
    return { status, accountId: b.stripeAccountId, provider: 'stripe', live: this.live(), requirements: acct.requirements?.currently_due || [] };
  }
  async startConnect(db, { userId }) {
    const b = await db.business.findFirst({ select: { id: true, name: true, stripeAccountId: true } });
    let accountId = b.stripeAccountId;
    if (!accountId) {
      const owner = userId ? await users.publicById(userId) : null;
      const acct = await this.stripe.accounts.create({
        email: owner?.email,
        business_profile: { name: b.name, product_description: 'Personal training and online coaching' },
        controller: { fees: { payer: 'account' }, losses: { payments: 'stripe' }, stripe_dashboard: { type: 'full' } },
        metadata: { businessId: b.id },
      });
      accountId = acct.id;
      await db.business.update({ where: { id: b.id }, data: { stripeAccountId: accountId, stripeAccountStatus: 'pending' } });
    }
    const link = await this.stripe.accountLinks.create({ account: accountId, type: 'account_onboarding', refresh_url: `${config.appUrl}/app/payments?connect=refresh`, return_url: `${config.appUrl}/app/payments?connect=done` });
    return { url: link.url };
  }
  async account(db) {
    const b = await db.business.findFirst({ select: { stripeAccountId: true, stripeAccountStatus: true } });
    if (!b.stripeAccountId) throw Object.assign(new Error('Connect Stripe in Payments before charging clients.'), { status: 409 });
    return b.stripeAccountId;
  }
  async syncPlan(db, plan) {
    if (!plan.priceCents) return plan;
    const b = await db.business.findFirst({ select: { stripeAccountId: true } });
    if (!b.stripeAccountId || plan.stripePriceId) return plan;
    const opts = { stripeAccount: b.stripeAccountId };
    const product = await this.stripe.products.create({ name: plan.name, description: plan.description || undefined, metadata: { clientPlanId: plan.id } }, opts);
    const price = await this.stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: plan.priceCents, ...(plan.interval === 'once' ? {} : { recurring: { interval: plan.interval } }), metadata: { clientPlanId: plan.id } }, opts);
    return db.clientPlan.update({ where: { id: plan.id }, data: { stripeProductId: product.id, stripePriceId: price.id } });
  }
  async clientCheckout(db, { client, plan, email }) {
    const accountId = await this.account(db);
    const p = await this.syncPlan(db, plan);
    const meta = { businessId: client.businessId, clientId: client.id, clientPlanId: plan.id };
    const session = await this.stripe.checkout.sessions.create({
      mode: plan.interval === 'once' ? 'payment' : 'subscription',
      line_items: [{ price: p.stripePriceId, quantity: 1 }],
      customer_email: email || client.email || undefined,
      client_reference_id: client.id,
      metadata: meta,
      ...(plan.interval === 'once' ? { payment_intent_data: { metadata: meta } } : { subscription_data: { metadata: meta } }),
      success_url: `${config.appUrl}/client/me?paid=1`,
      cancel_url: `${config.appUrl}/client/me?paid=0`,
    }, { stripeAccount: accountId });
    return { url: session.url };
  }
  async clientPortal(db, { client }) {
    const accountId = await this.account(db);
    const sub = await db.subscription.findFirst({ where: { clientId: client.id, stripeSubscriptionId: { not: null } }, orderBy: { createdAt: 'desc' } });
    if (!sub) throw Object.assign(new Error('No card on file yet. Choose a plan first.'), { status: 409 });
    const s = await this.stripe.subscriptions.retrieve(sub.stripeSubscriptionId, { stripeAccount: accountId });
    const portal = await this.stripe.billingPortal.sessions.create({ customer: s.customer, return_url: `${config.appUrl}/client/me` }, { stripeAccount: accountId });
    return { url: portal.url };
  }
  async retryPayment(db, payment) {
    if (!payment.stripeInvoiceId) return { ok: false, error: 'This payment can’t be retried from OneJump. Ask the client to update their card.' };
    const accountId = await this.account(db);
    try {
      const inv = await this.stripe.invoices.pay(payment.stripeInvoiceId, {}, { stripeAccount: accountId });
      if (inv.status === 'paid') return { ok: true, payment: await db.payment.update({ where: { id: payment.id }, data: { status: 'paid', paidAt: new Date(), attempts: { increment: 1 }, failureReason: null } }) };
      return { ok: false, error: 'The payment didn’t go through yet.' };
    } catch (e) {
      await db.payment.update({ where: { id: payment.id }, data: { attempts: { increment: 1 }, failureReason: e.message?.slice(0, 180) } });
      return { ok: false, error: e.code === 'card_declined' ? 'Card declined again. A reminder is the next step.' : (e.message || 'Retry failed.') };
    }
  }

  // -------------------------------------------------- OneJump plans (coach pays OneJump)
  async platformCheckout(db, { plan, userId }) {
    const price = config.payments.prices[plan];
    if (!price) throw Object.assign(new Error(`Set STRIPE_PRICE_${plan} first.`), { status: 500 });
    const b = await db.business.findFirst({ select: { id: true, stripeCustomerId: true } });
    const owner = await users.publicById(userId);
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      ...(b.stripeCustomerId ? { customer: b.stripeCustomerId } : { customer_email: owner?.email }),
      client_reference_id: b.id,
      metadata: { businessId: b.id, plan, kind: 'onejump_plan' },
      subscription_data: { metadata: { businessId: b.id, plan, kind: 'onejump_plan' } },
      allow_promotion_codes: true,
      success_url: `${config.appUrl}/app/billing?upgraded=${plan}`,
      cancel_url: `${config.appUrl}/app/billing`,
    });
    return { url: session.url };
  }
  async platformPortal(db) {
    const b = await db.business.findFirst({ select: { stripeCustomerId: true } });
    if (!b.stripeCustomerId) throw Object.assign(new Error('Choose a plan first.'), { status: 409 });
    const s = await this.stripe.billingPortal.sessions.create({ customer: b.stripeCustomerId, return_url: `${config.appUrl}/app/billing` });
    return { url: s.url };
  }
  async cancelPlatform(db) {
    const b = await db.business.findFirst({ select: { id: true, stripeSubscriptionId: true } });
    if (b.stripeSubscriptionId) await this.stripe.subscriptions.update(b.stripeSubscriptionId, { cancel_at_period_end: true });
    await db.business.update({ where: { id: b.id }, data: { cancelAtPeriodEnd: true } });
    return { ok: true };
  }
  async resumePlatform(db) {
    const b = await db.business.findFirst({ select: { id: true, stripeSubscriptionId: true } });
    if (b.stripeSubscriptionId) await this.stripe.subscriptions.update(b.stripeSubscriptionId, { cancel_at_period_end: false });
    await db.business.update({ where: { id: b.id }, data: { cancelAtPeriodEnd: false } });
    return { ok: true };
  }
  async platformInvoices(db) {
    const b = await db.business.findFirst({ select: { stripeCustomerId: true } });
    if (!b.stripeCustomerId) return [];
    const list = await this.stripe.invoices.list({ customer: b.stripeCustomerId, limit: 12 });
    return list.data.map(i => ({ id: i.id, date: new Date(i.created * 1000), amountCents: i.amount_paid || i.amount_due, status: i.status, url: i.hosted_invoice_url }));
  }

  // -------------------------------------------------- webhooks
  constructEvent(raw, signature, secret) {
    return this.stripe.webhooks.constructEvent(raw, signature, secret);
  }
}
