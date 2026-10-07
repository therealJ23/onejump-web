// Stripe webhooks (raw body, signature-checked). Two endpoints in the Stripe dashboard:
//   /api/webhooks/stripe          OneJump's own plans          (STRIPE_WEBHOOK_SECRET)
//   /api/webhooks/stripe-connect  coaches' client payments     (STRIPE_CONNECT_WEBHOOK_SECRET)
import { Router } from 'express';
import { config } from '../config.js';
import { businesses, audit } from '../db/system.js';
import { dbForBusiness } from '../db/tenant.js';
import { payments } from '../payments/PaymentService.js';
import { runAutomations } from '../core/automations.js';
import { notify, clientEvent } from '../core/messaging.js';

export const router = Router();
const ts = n => (n ? new Date(n * 1000) : null);

function verify(req, secret) {
  const p = payments();
  if (p.name !== 'stripe') { const e = new Error('Stripe is not configured.'); e.status = 400; throw e; }
  if (!secret) { const e = new Error('Webhook secret is not set.'); e.status = 500; throw e; }
  try { return p.constructEvent(req.body, req.get('stripe-signature'), secret); }
  catch { const e = new Error('Invalid signature.'); e.status = 400; throw e; }
}

// ---------------------------------------------------------------- OneJump plans
export async function handlePlatformEvent(event) {
  const obj = event.data.object;
  const businessId = obj.metadata?.businessId || obj.client_reference_id || null;
  const byCustomer = async () => (businessId ? { id: businessId } : obj.customer ? await businesses.byStripeCustomer(obj.customer) : null);
  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.metadata?.kind !== 'onejump_plan' || !businessId) return 'ignored';
      const db = dbForBusiness(businessId);
      await db.business.update({ where: { id: businessId }, data: { plan: obj.metadata.plan, planStatus: 'active', stripeCustomerId: obj.customer, stripeSubscriptionId: obj.subscription, cancelAtPeriodEnd: false } });
      audit({ businessId, action: 'plan_started', target: obj.metadata.plan });
      return 'plan_started';
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      if (obj.metadata?.kind && obj.metadata.kind !== 'onejump_plan') return 'ignored';
      const b = await byCustomer(); if (!b) return 'unknown_business';
      const db = dbForBusiness(b.id);
      const deleted = event.type === 'customer.subscription.deleted';
      await db.business.update({ where: { id: b.id }, data: {
        planStatus: deleted ? 'canceled' : obj.status, cancelAtPeriodEnd: !!obj.cancel_at_period_end,
        planRenewsAt: ts(obj.current_period_end || obj.items?.data?.[0]?.current_period_end),
        ...(deleted ? { plan: 'STARTER' } : obj.metadata?.plan ? { plan: obj.metadata.plan } : {}),
      } });
      return deleted ? 'plan_canceled' : 'plan_updated';
    }
    case 'invoice.payment_failed': {
      const b = await byCustomer(); if (!b) return 'unknown_business';
      await dbForBusiness(b.id).business.update({ where: { id: b.id }, data: { planStatus: 'past_due' } });
      audit({ businessId: b.id, action: 'plan_payment_failed', target: obj.id });
      return 'plan_past_due';
    }
    default: return 'ignored';
  }
}

// ---------------------------------------------------------------- client payments (connected accounts)
async function upsertPayment(db, clientId, inv, status, extra = {}) {
  const data = { clientId, amountCents: status === 'paid' ? inv.amount_paid : inv.amount_due, status, stripeInvoiceId: inv.id, ...extra };
  const existing = await db.payment.findFirst({ where: { stripeInvoiceId: inv.id } });
  return existing ? db.payment.update({ where: { id: existing.id }, data: { ...data, attempts: status === 'failed' ? { increment: 1 } : existing.attempts } }) : db.payment.create({ data });
}

export async function handleConnectEvent(event) {
  const obj = event.data.object;
  const b = event.account ? await businesses.byStripeAccount(event.account) : null;
  if (!b) return 'unknown_account';
  const db = dbForBusiness(b.id);
  const meta = obj.metadata || obj.subscription_details?.metadata || obj.parent?.subscription_details?.metadata || {};
  const clientFrom = async () => {
    if (meta.clientId) return db.client.findFirst({ where: { id: meta.clientId } });
    const subId = obj.subscription || obj.parent?.subscription_details?.subscription;
    if (subId) { const s = await db.subscription.findFirst({ where: { stripeSubscriptionId: subId } }); if (s) return db.client.findFirst({ where: { id: s.clientId } }); }
    return null;
  };
  switch (event.type) {
    case 'account.updated': {
      const status = obj.charges_enabled && obj.payouts_enabled ? 'active' : 'pending';
      await db.business.update({ where: { id: b.id }, data: { stripeAccountStatus: status } });
      return `account_${status}`;
    }
    case 'checkout.session.completed': {
      const client = await clientFrom(); if (!client) return 'unknown_client';
      const plan = meta.clientPlanId ? await db.clientPlan.findFirst({ where: { id: meta.clientPlanId } }) : null;
      if (obj.mode === 'subscription' && obj.subscription) {
        const existing = await db.subscription.findFirst({ where: { stripeSubscriptionId: obj.subscription } });
        if (!existing) await db.subscription.create({ data: { clientId: client.id, clientPlanId: plan?.id || client.clientPlanId, status: 'active', stripeSubscriptionId: obj.subscription } });
      } else if (obj.payment_status === 'paid') {
        await db.payment.create({ data: { clientId: client.id, clientPlanId: plan?.id || null, amountCents: obj.amount_total || plan?.priceCents || 0, status: 'paid', paidAt: new Date(), stripeCheckoutSessionId: obj.id } });
      }
      await db.client.update({ where: { id: client.id }, data: { clientPlanId: plan?.id || client.clientPlanId, payStatus: 'paid', status: client.status === 'NEW' ? 'ACTIVE' : client.status } });
      await notify(db, { kind: 'payment', title: `${client.name} paid for ${plan?.name || 'their plan'}`, link: `/app/clients/${client.id}` });
      return 'client_checkout';
    }
    case 'invoice.paid': {
      const client = await clientFrom(); if (!client) return 'unknown_client';
      await upsertPayment(db, client.id, obj, 'paid', { paidAt: ts(obj.status_transitions?.paid_at) || new Date(), failureReason: null });
      await db.client.update({ where: { id: client.id }, data: { payStatus: 'paid' } });
      return 'invoice_paid';
    }
    case 'invoice.payment_failed': {
      const client = await clientFrom(); if (!client) return 'unknown_client';
      const reason = obj.last_finalization_error?.message || obj.last_payment_error?.message || 'Card declined';
      await upsertPayment(db, client.id, obj, 'failed', { failureReason: reason.slice(0, 180) });
      await db.client.update({ where: { id: client.id }, data: { payStatus: 'failed' } });
      await clientEvent(db, client.id, 'payment_failed', { invoice: obj.id });
      const tz = (await db.business.findFirst({ select: { timezone: true } })).timezone;
      await runAutomations(db, { tz, only: ['failed_payment'], clientId: client.id });
      return 'invoice_failed';
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = await db.subscription.findFirst({ where: { stripeSubscriptionId: obj.id } });
      if (!sub) return 'unknown_subscription';
      const status = event.type.endsWith('deleted') ? 'canceled' : obj.status;
      await db.subscription.update({ where: { id: sub.id }, data: { status, cancelAtPeriodEnd: !!obj.cancel_at_period_end, currentPeriodEnd: ts(obj.current_period_end || obj.items?.data?.[0]?.current_period_end) } });
      if (status === 'canceled') await db.client.update({ where: { id: sub.clientId }, data: { payStatus: 'cancelled' } });
      return `subscription_${status}`;
    }
    default: return 'ignored';
  }
}

router.post('/stripe', async (req, res) => {
  const event = verify(req, config.payments.webhookSecret);
  // Connected-account events can also arrive here if one endpoint is used for both.
  const result = event.account ? await handleConnectEvent(event) : await handlePlatformEvent(event);
  res.json({ received: true, result });
});
router.post('/stripe-connect', async (req, res) => {
  const event = verify(req, config.payments.connectWebhookSecret || config.payments.webhookSecret);
  res.json({ received: true, result: await handleConnectEvent(event) });
});
