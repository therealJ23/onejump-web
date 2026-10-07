// Background work inside the server process (node-cron), plus a small jobs table for retries.
//  - every 5 minutes: queued jobs (e.g. Assist summaries for new check-ins)
//  - every hour: automations for every workspace; the radar at 2 AM in each coach's time zone
import cron from 'node-cron';
import { businesses, jobs } from '../db/system.js';
import { dbForBusiness } from '../db/tenant.js';
import { runRadar } from '../core/radar.js';
import { runAutomations } from '../core/automations.js';
import { checkinSummary } from '../ai/drafts.js';
import { localParts } from '../lib/time.js';
import { config } from '../config.js';

const HANDLERS = {
  async checkin_summary({ businessId, checkInId }) {
    const db = dbForBusiness(businessId);
    const k = await db.checkIn.findFirst({ where: { id: checkInId } });
    if (k) await checkinSummary(db, k);
  },
  async automations({ businessId, only, clientId }) {
    const b = await businesses.publicById(businessId);
    await runAutomations(dbForBusiness(businessId), { tz: b?.timezone || 'UTC', only, clientId });
  },
};

export async function processJobs() {
  const due = await jobs.claimDue();
  for (const j of due) {
    try { await HANDLERS[j.name]?.(j.payload || {}); await jobs.finish(j.id); }
    catch (e) { console.error(`[jobs] ${j.name} failed:`, e.message); await jobs.finish(j.id, e.stack || e.message); }
  }
  return due.length;
}

/** Queue work and start it right away (retried by the 5-minute tick if it fails). */
export async function enqueue(name, payload) {
  const job = await jobs.enqueue(name, payload);
  if (!config.isTest) setImmediate(() => processJobs().catch(e => console.error('[jobs]', e.message)));
  return job;
}

export async function hourly(now = new Date(), { forceRadar = false } = {}) {
  const list = await businesses.allIds();
  const summary = { businesses: list.length, radar: 0, automationRuns: 0 };
  for (const b of list) {
    const db = dbForBusiness(b.id);
    try {
      if (forceRadar || localParts(b.timezone, now).hour === 2) { await runRadar(db, { tz: b.timezone, now }); summary.radar++; }
      summary.automationRuns += (await runAutomations(db, { tz: b.timezone, now })).runs;
    } catch (e) { console.error(`[jobs] business ${b.id}:`, e.message); }
  }
  return summary;
}

export function startJobs() {
  const tasks = [
    cron.schedule('*/5 * * * *', () => processJobs().catch(e => console.error('[jobs]', e.message))),
    cron.schedule('7 * * * *', () => hourly().catch(e => console.error('[jobs] hourly', e.message))),
  ];
  console.log('[jobs] scheduled: queued jobs every 5 min, automations hourly, radar nightly at 2 AM local');
  return { stop: () => tasks.forEach(t => t.stop()) };
}
