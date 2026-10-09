// Fixed-text check-in reminders (the coach's own template, no AI). Used by Today, Check-ins,
// and confirmed "remind everyone who hasn't checked in" proposals from Assist.
import { sendMessage } from './messaging.js';
import { fillTemplate } from './automationTemplates.js';

export const DEFAULT_CHECKIN_REMINDER = 'Hey {first}! Quick reminder to send your weekly check-in. Takes 2 minutes and it’s how I adjust next week.';

export async function checkinReminderTemplate(db) {
  const auto = await db.automation.findFirst({ where: { key: 'missing_checkin' } });
  return { auto, template: auto?.template || DEFAULT_CHECKIN_REMINDER };
}

/** Sends the reminder to each client (individually, with their first name) and records the run. */
export async function sendCheckinReminders(db, auth, clients, text = null, tag = 'queue') {
  const { auto, template } = await checkinReminderTemplate(db);
  const body = text || template;
  const day = new Date().toISOString().slice(0, 10);
  for (const c of clients) {
    await sendMessage(db, { clientId: c.id, body: fillTemplate(body, c), senderUserId: auth.userId, senderRole: 'COACH' });
    if (auto) await db.automationRun.create({ data: { automationId: auto.id, clientId: c.id, dedupeKey: `${auth.businessId}:checkin:${c.id}:${day}:${tag}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`, outcome: 'sent', summary: `Check-in reminder sent to ${c.name.split(' ')[0]}` } });
  }
  return clients.length;
}
