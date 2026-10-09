// One definition of "hasn't checked in this week", shared by Today, Check-ins, group messages,
// reminders and Ask Assist (typed or by voice), so every screen lists the same clients.
import { DAY } from '../lib/time.js';

/** Active or new clients, 7+ days in, with no check-in in the last 7 days. Sorted by name. */
export async function missingCheckinClients(db, now = new Date()) {
  const [clients, recent] = await Promise.all([
    db.client.findMany({ where: { status: { in: ['NEW', 'ACTIVE'] } }, orderBy: { name: 'asc' } }),
    db.checkIn.findMany({ where: { submittedAt: { gte: new Date(now.getTime() - 7 * DAY) } }, select: { clientId: true } }),
  ]);
  const done = new Set(recent.map(k => k.clientId));
  return clients.filter(c => (now - new Date(c.startedAt)) / DAY >= 7 && !done.has(c.id));
}
