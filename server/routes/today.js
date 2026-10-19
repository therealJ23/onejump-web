// Today: the queue + numbers, and the grouped actions (reminders) it offers.
import { Router } from 'express';
import { body, z } from '../lib/validate.js';
import { buildToday } from '../core/queue.js';
import { sendMessage } from '../core/messaging.js';
import { fillTemplate } from '../core/automationTemplates.js';
import { missingCheckinClients } from '../core/checkinStatus.js';
import { sendCheckinReminders } from '../core/reminders.js';
import { businessCharts } from '../core/businessCharts.js';
import { businessInsights } from '../core/businessInsights.js';

export const router = Router();
const tzOf = async db => (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';

router.get('/', async (req, res) => res.json(await buildToday(req.db, { tz: await tzOf(req.db) })));
router.get('/business', async (req, res) => res.json(await businessCharts(req.db)));
/** The Business page: trends and a realistic forecast for this month. */
router.get('/insights', async (req, res) => res.json(await businessInsights(req.db)));

router.post('/remind-missing', body(z.object({ text: z.string().trim().max(1000).optional() })), async (req, res) => {
  const clients = await missingCheckinClients(req.db);
  const sent = await sendCheckinReminders(req.db, req.auth, clients, req.body.text || null, 'queue');
  res.json({ ok: true, sent, minutes: sent * 2 });
});

router.post('/remind-payments', async (req, res) => {
  const auto = await req.db.automation.findFirst({ where: { key: 'failed_payment' } });
  const template = auto?.template || 'Hi {first}, your last payment didn’t go through. You can update your card in the app under Me → Billing. Thanks!';
  const failed = await req.db.payment.findMany({ where: { status: 'failed', remindedAt: null } });
  const now = new Date();
  for (const p of failed) {
    const c = await req.db.client.findFirst({ where: { id: p.clientId } });
    if (!c) continue;
    await sendMessage(req.db, { clientId: c.id, body: fillTemplate(template, c), senderUserId: req.auth.userId, senderRole: 'COACH' });
    await req.db.payment.update({ where: { id: p.id }, data: { remindedAt: now } });
    if (auto) await req.db.automationRun.create({ data: { automationId: auto.id, clientId: c.id, dedupeKey: `${req.auth.businessId}:payment-manual:${p.id}:${Date.now()}`, outcome: 'sent', summary: `Card-update reminder sent to ${c.name.split(' ')[0]}` } });
  }
  res.json({ ok: true, sent: failed.length, minutes: failed.length * 3 });
});
