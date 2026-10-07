// Today: the queue + numbers, and the grouped actions (reminders) it offers.
import { Router } from 'express';
import { body, z } from '../lib/validate.js';
import { buildToday } from '../core/queue.js';
import { sendMessage } from '../core/messaging.js';
import { fillTemplate } from '../core/automationTemplates.js';
import { DAY } from '../lib/time.js';

export const router = Router();
const tzOf = async db => (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';

router.get('/', async (req, res) => res.json(await buildToday(req.db, { tz: await tzOf(req.db) })));

router.post('/remind-missing', body(z.object({ text: z.string().trim().max(1000).optional() })), async (req, res) => {
  const auto = await req.db.automation.findFirst({ where: { key: 'missing_checkin' } });
  const template = req.body.text || auto?.template || 'Hey {first}! Quick reminder to send your weekly check-in. Takes 2 minutes and it’s how I adjust next week.';
  const recent = new Set((await req.db.checkIn.findMany({ where: { submittedAt: { gte: new Date(Date.now() - 7 * DAY) } }, select: { clientId: true } })).map(k => k.clientId));
  const clients = (await req.db.client.findMany({ where: { status: { in: ['NEW', 'ACTIVE'] } } })).filter(c => !recent.has(c.id) && (Date.now() - c.startedAt) / DAY >= 7);
  const day = new Date().toISOString().slice(0, 10);
  for (const c of clients) {
    await sendMessage(req.db, { clientId: c.id, body: fillTemplate(template, c), senderUserId: req.auth.userId, senderRole: 'COACH' });
    if (auto) await req.db.automationRun.create({ data: { automationId: auto.id, clientId: c.id, dedupeKey: `${req.auth.businessId}:checkin:${c.id}:${day}:queue:${Date.now()}`, outcome: 'sent', summary: `Check-in reminder sent to ${c.name.split(' ')[0]}` } });
  }
  res.json({ ok: true, sent: clients.length, minutes: clients.length * 2 });
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
