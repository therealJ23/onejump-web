// Payments through one interface:
//  - client → coach: Stripe Connect (direct charges on the coach's own Stripe account, where
//    Stripe handles pricing, payouts and identity checks; OneJump takes no cut at launch)
//  - coach → OneJump: Stripe Billing subscriptions (Starter / Pro / Studio)
// PAYMENTS_PROVIDER=mock (default while building) simulates both with the same shapes.
// Card data never touches OneJump: Stripe Checkout and the customer portal handle it.
import { config } from '../config.js';
import { MockPayments } from './mock.js';
import { StripePayments } from './stripe.js';

let impl = null;
export function payments() {
  if (!impl) impl = config.payments.provider === 'stripe' && config.payments.stripeSecretKey ? new StripePayments(config.payments.stripeSecretKey) : new MockPayments();
  return impl;
}
export const PLAN_PRICES = { STARTER: 2900, PRO: 5900, STUDIO: 9900 };
export const PLAN_NAMES = { TRIAL: 'Pro trial', STARTER: 'Starter', PRO: 'Pro', STUDIO: 'Studio' };
