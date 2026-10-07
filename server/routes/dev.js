// Development-only helpers (never mounted in production): the email outbox, running the
// nightly jobs on demand, and simulating a failed client payment without Stripe.
import { Router } from 'express';
import { EmailService } from '../email/EmailService.js';
import { hourly, processJobs } from '../jobs/nightly.js';
import { requireCoach } from '../auth/middleware.js';
import { body, z } from '../lib/validate.js';
import { must } from '../lib/errors.js';
import { runAutomations } from '../core/automations.js';
import { clientEvent } from '../core/messaging.js';

export const router = Router();

router.get('/outbox', (_req, res) => res.json({ provider: EmailService.provider(), emails: EmailService.outbox().map(e => ({ to: e.to, subject: e.subject, text: e.text, link: e.link, at: e.at })) }));

router.post('/run-nightly', requireCoach, async (_req, res) => res.json({ ...(await hourly(new Date(), { forceRadar: true })), jobs: await processJobs() }));

router.post('/simulate-failed-payment', requireCoach, body(z.object({ clientId: z.string().max(64), reason: z.string().max(120).optional() })), async (req, res) => {
  const c = must(await req.db.client.findFirst({ where: { id: req.body.clientId } }), 'That client');
  const plan = c.clientPlanId ? await req.db.clientPlan.findFirst({ where: { id: c.clientPlanId } }) : null;
  const p = await req.db.payment.create({ data: { clientId: c.id, clientPlanId: plan?.id || null, amountCents: plan?.priceCents || 15000, status: 'failed', failureReason: req.body.reason || 'Card declined: insufficient funds' } });
  await req.db.client.update({ where: { id: c.id }, data: { payStatus: 'failed' } });
  await clientEvent(req.db, c.id, 'payment_failed', { simulated: true });
  const tz = (await req.db.business.findFirst({ select: { timezone: true } })).timezone;
  await runAutomations(req.db, { tz, only: ['failed_payment'], clientId: c.id });
  res.json({ ok: true, paymentId: p.id });
});
