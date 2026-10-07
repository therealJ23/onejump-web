// The 5 automation templates at work. Runs hourly (node-cron) and right after the events
// that trigger them. Every run is recorded once (AutomationRun.dedupeKey) so nothing repeats.
import { todayKey, addDays, localParts, localYMD, weekStart } from '../lib/time.js';
import { templateFor, fillTemplate } from './automationTemplates.js';
import { sendMessage, notify } from './messaging.js';
import { messageDraft } from '../ai/drafts.js';

const MILESTONES = [10, 25, 50, 100, 150, 200];

async function once(db, automation, key, clientId, fn) {
  const dedupeKey = `${automation.businessId}:${key}`.slice(0, 190);
  if (await db.automationRun.findFirst({ where: { dedupeKey }, select: { id: true } })) return null;
  const r = await fn();
  if (!r) return null;
  try {
    return await db.automationRun.create({ data: { automationId: automation.id, clientId, dedupeKey, outcome: r.outcome, summary: r.summary?.slice(0, 190), aiInsightId: r.insightId || null } });
  } catch { return null; }
}

/** Sends a template the coach switched on, or queues it for approval if they asked to approve. */
async function sendOrQueue(db, automation, client, text, title) {
  if (automation.needsApproval) {
    const ins = await db.aIInsight.create({ data: { clientId: client.id, kind: 'automation', source: 'automation', sourceId: automation.key, summary: title, draft: { text, title, rule: automation.trigger }, minutesSaved: templateFor(automation.key)?.minutes || 2, model: 'template', promptVersion: 'fixed' } });
    return { outcome: 'drafted', summary: title, insightId: ins.id };
  }
  await sendMessage(db, { clientId: client.id, body: text, senderUserId: null, senderRole: 'COACH' });
  return { outcome: 'sent', summary: title };
}

/**
 * @param {string[]} [only] limit to some template keys (e.g. ['failed_payment'] from a webhook)
 */
export async function runAutomations(db, { tz = 'UTC', now = new Date(), only = null, clientId = null } = {}) {
  const autos = await db.automation.findMany({ where: { enabled: true, ...(only ? { key: { in: only } } : {}) } });
  if (!autos.length) return { runs: 0 };
  const by = Object.fromEntries(autos.map(a => [a.key, a]));
  const clients = await db.client.findMany({ where: { status: { in: ['ACTIVE', 'NEW'] }, ...(clientId ? { id: clientId } : {}) } });
  const today = todayKey(tz, now), ymd = localYMD(tz, now), wk = weekStart(today).toISOString().slice(0, 10);
  const { hour, weekday } = localParts(tz, now);
  let runs = 0;

  for (const c of clients) {
    const first = c.name.split(' ')[0];
    const tenureDays = (now - new Date(c.startedAt)) / 864e5;

    if (by.missed_workouts) {
      const missed = await db.workoutAssignment.count({ where: { clientId: c.id, status: { not: 'completed' }, scheduledFor: { gte: addDays(today, -7), lt: today } } });
      const radarHasIt = missed >= 2 && await db.aIInsight.findFirst({ where: { clientId: c.id, kind: 'risk', status: 'pending' }, select: { id: true } });
      if (missed >= 2 && !radarHasIt) {
        const r = await once(db, by.missed_workouts, `missed:${c.id}:${wk}`, c.id, async () => {
          const ins = await messageDraft(db, c, 'missed', { kind: 'automation', source: 'automation', sourceId: 'missed_workouts', extra: { title: `${first} missed ${missed} workouts this week`, rule: by.missed_workouts.trigger }, minutes: 6 });
          await notify(db, { kind: 'missed', title: `${c.name} missed ${missed} workouts this week`, body: 'Automation drafted a check-in message', link: '/app/today' });
          return { outcome: 'drafted', summary: `Drafted a check-in message for ${first} (missed ${missed} workouts)`, insightId: ins.id };
        });
        if (r) runs++;
      }
    }

    if (by.missing_checkin && weekday === 1 && hour >= 9 && tenureDays >= 7) {
      const recent = await db.checkIn.count({ where: { clientId: c.id, submittedAt: { gte: addDays(now, -7) } } });
      if (!recent) {
        const r = await once(db, by.missing_checkin, `checkin:${c.id}:${ymd}`, c.id, () => sendOrQueue(db, by.missing_checkin, c, fillTemplate(by.missing_checkin.template, c), `Check-in reminder for ${first}`));
        if (r) runs++;
      }
    }

    if (by.inactive_7d && tenureDays >= 7) {
      const last = c.lastActiveAt ? new Date(c.lastActiveAt) : null;
      if (!last || now - last > 7 * 864e5) {
        const r = await once(db, by.inactive_7d, `inactive:${c.id}:${wk}`, c.id, async () => {
          await notify(db, { kind: 'client', title: `${c.name} hasn’t opened the app for 7 days`, body: 'From your inactivity automation', link: `/app/clients/${c.id}` });
          return { outcome: 'notified', summary: `${first} hasn’t opened the app for 7 days: notified you` };
        });
        if (r) runs++;
      }
    }

    if (by.milestone) {
      const recent = await db.workoutSession.count({ where: { clientId: c.id, completedAt: { gte: new Date(now.getTime() - 3 * 864e5) } } });
      const m = MILESTONES.filter(x => c.workoutsDone >= x && c.workoutsDone - recent < x).at(-1);
      if (m) {
        const r = await once(db, by.milestone, `milestone:${c.id}:${m}`, c.id, async () => {
          const ins = await messageDraft(db, c, 'congrats', { kind: 'automation', source: 'automation', sourceId: 'milestone', extra: { title: `${first} hit workout #${m}`, milestone: m, rule: by.milestone.trigger }, minutes: 3 });
          return { outcome: 'drafted', summary: `${first} hit ${m} workouts: congratulations drafted`, insightId: ins.id };
        });
        if (r) runs++;
      }
    }

    if (by.failed_payment) {
      const failed = await db.payment.findMany({ where: { clientId: c.id, status: 'failed', remindedAt: null, createdAt: { gte: addDays(now, -10) } } });
      for (const p of failed) {
        const r = await once(db, by.failed_payment, `payment:${p.id}`, c.id, async () => {
          if (c.riskLevel === 'HIGH') {
            // Sort the payment after the conversation, not before: hold the reminder for the coach.
            await notify(db, { kind: 'payment', title: `Payment failed: ${c.name}, $${(p.amountCents / 100).toFixed(0)}`, body: `${p.failureReason || 'Card declined'} · reminder held (high risk)`, link: '/app/payments' });
            return { outcome: 'held', summary: `Payment failed for ${first}: reminder held because they’re at high risk` };
          }
          const out = await sendOrQueue(db, by.failed_payment, c, fillTemplate(by.failed_payment.template, c), `Card-update reminder for ${first}`);
          if (out.outcome === 'sent') await db.payment.update({ where: { id: p.id }, data: { remindedAt: now } });
          await notify(db, { kind: 'payment', title: `Payment failed: ${c.name}, $${(p.amountCents / 100).toFixed(0)}`, body: out.outcome === 'sent' ? `${p.failureReason || 'Card declined'} · reminder sent` : (p.failureReason || 'Card declined'), link: '/app/payments' });
          return { ...out, summary: `Payment failed: notified you${out.outcome === 'sent' ? `, reminder sent to ${first}` : ''}` };
        });
        if (r) runs++;
      }
    }
  }
  return { runs };
}
