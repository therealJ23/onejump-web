// The Business page: how the coaching business is doing, and a realistic forecast for the month.
//
// Everything comes from the coach's own tenant-scoped data. Amounts in cents. Months and days are
// the coach's local calendar (business time zone), so "this month" matches what they see.
//
// The month forecast is built bottom-up from things that are actually expected to happen, each
// discounted by how this business has really behaved lately:
//   collected so far
//   + memberships that renew before the month ends × the share of charges that usually go through
//   + payments already scheduled (upcoming) × that same share
//   + failed payments still being retried × a recovery share (Stripe retries + card-update reminders)
//   + new clients' first payments at the pace of the last 90 days
//   + trials that convert before the month ends (half, in the base case)
// A low and a high case use the same pieces with less and more favourable assumptions, so the
// coach sees a range rather than one over-precise number.
import { monthlyCents } from './money.js';
import { localYMD, DAY } from '../lib/time.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ACTIVE = ['NEW', 'ACTIVE'];
const STAGES = ['new', 'contacted', 'consult', 'trial', 'active', 'retained'];
const WON = new Set(['active', 'retained']);
const SOURCE_NAMES = { instagram_dm: 'Instagram', booking_page: 'Booking page', referral: 'Referral', walk_in: 'Walk-in', google: 'Google', other: 'Other' };

/** Assumptions, in one place so they're easy to read and test. */
export const ASSUME = {
  defaultCollectionRate: 0.95, // when there isn't enough payment history yet
  minHistoryForRate: 5, // charges needed before the business's own rate is trusted
  failedRecovery: { low: 0, base: 0.5, high: 1 },
  trialConversion: { low: 0, base: 0.5, high: 1 },
  newClientPace: { low: 0.5, base: 1, high: 1.5 },
  collectionDrop: 0.1, // the low case: this much below the usual collection rate
};

// ---------------------------------------------------------------- local calendar helpers

export const ymdParts = ymd => ymd.split('-').map(Number);
export const ymKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
export const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** [year, month] shifted by n months. Month is 1–12. */
export const shiftMonth = (y, m, n) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); return [d.getUTCFullYear(), d.getUTCMonth() + 1]; };
/** Adds calendar months to a local date string, clamping the day (Jan 31 + 1 month = Feb 28). */
function addMonthsYmd(ymd, n) {
  const [y, m, d] = ymdParts(ymd);
  const [ny, nm] = shiftMonth(y, m, n);
  return `${ymKey(ny, nm)}-${String(Math.min(d, daysIn(ny, nm))).padStart(2, '0')}`;
}
export const addDaysYmd = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const round = n => Math.round(n);
const pct = (a, b) => (b ? Math.round(a / b * 100) : null);

// ---------------------------------------------------------------- the forecast (pure, testable)

/**
 * Next charges for one membership between `from` and `to` (local dates, inclusive).
 * Uses the subscription's own renewal date when it has one, otherwise the last payment + 1 period.
 */
export function chargeDates({ interval, periodEnd, lastPaid, started }, from, to) {
  if (interval !== 'month' && interval !== 'week') return [];
  const step = d => (interval === 'week' ? addDaysYmd(d, 7) : addMonthsYmd(d, 1));
  let next = periodEnd || (lastPaid ? step(lastPaid) : started ? step(started) : null);
  if (!next) return [];
  for (let guard = 0; next < from && guard < 60; guard++) next = step(next);
  const out = [];
  for (let guard = 0; next <= to && guard < 6; guard++) { out.push(next); next = step(next); }
  return out;
}

/**
 * Builds the month forecast from expected events. Pure: all inputs are plain numbers and dates.
 * @param {object} p
 * @param {string} p.today local YYYY-MM-DD
 * @param {number[]} p.dailyCollected cents collected on each day of this month so far (index 0 = day 1)
 * @param {{date:string,cents:number}[]} p.renewals memberships renewing later this month
 * @param {{date:string,cents:number}[]} p.scheduled upcoming payments due later this month
 * @param {number} p.failedCents failed payments still being retried
 * @param {{date:string,cents:number}[]} p.trials trials converting later this month
 * @param {number} p.newPerDayCents new clients' first payments per day, recent pace
 * @param {number} p.collectionRate share of charges that go through (0–1)
 * @param {{low:number,base:number,high:number}} [p.trialRate] share of trials that become paying
 */
export function forecastMonth({ today, dailyCollected, renewals, scheduled, failedCents, trials, newPerDayCents, collectionRate, trialRate = ASSUME.trialConversion }) {
  const [y, m, d] = ymdParts(today);
  const n = daysIn(y, m);
  const collected = dailyCollected.reduce((a, b) => a + b, 0);
  const rate = Math.max(0, Math.min(1, collectionRate));
  const lowRate = Math.max(0, rate - ASSUME.collectionDrop);
  const cases = { low: {}, base: {}, high: {} };
  const want = { low: lowRate, base: rate, high: 1 };
  const renewCents = renewals.reduce((a, r) => a + r.cents, 0);
  const schedCents = scheduled.reduce((a, r) => a + r.cents, 0);
  const trialCents = trials.reduce((a, r) => a + r.cents, 0);
  const daysLeft = n - d;
  // Stripe retries a failed charge on days 3, 5 and 7; only retries before the month ends count.
  const retryDays = [3, 5, 7].map(x => d - 1 + x).filter(i => i <= n - 1);
  const retryShare = retryDays.length / 3;
  for (const k of ['low', 'base', 'high']) {
    cases[k] = {
      renewals: round(renewCents * want[k]),
      scheduled: round(schedCents * want[k]),
      recovered: round(failedCents * ASSUME.failedRecovery[k] * retryShare),
      trials: round(trialCents * trialRate[k] * want[k]),
      newClients: round(newPerDayCents * daysLeft * ASSUME.newClientPace[k]),
    };
    cases[k].total = collected + Object.values(cases[k]).reduce((a, b) => a + b, 0);
  }

  // Day-by-day curve for the chart: actual up to today, then each case adds its pieces on the day
  // they're expected (renewals and scheduled payments on their dates, failed-payment retries over
  // the next week, new clients evenly across the remaining days).
  const actual = []; let run = 0;
  for (let i = 0; i < d; i++) { run += dailyCollected[i] || 0; actual.push(run); }
  const curve = k => {
    const add = new Array(n).fill(0);
    const dayIdx = date => Math.min(n - 1, Math.max(d - 1, Number(date.slice(8, 10)) - 1));
    for (const r of renewals) add[dayIdx(r.date)] += r.cents * want[k];
    for (const r of scheduled) add[dayIdx(r.date)] += r.cents * want[k];
    for (const r of trials) add[dayIdx(r.date)] += r.cents * trialRate[k] * want[k];
    for (const i of retryDays) add[i] += failedCents * ASSUME.failedRecovery[k] / 3;
    for (let i = d; i < n; i++) add[i] += newPerDayCents * ASSUME.newClientPace[k];
    const out = []; let r = collected;
    for (let i = d - 1; i < n; i++) { r += add[i]; out.push(round(r)); }
    return out; // starts at today (index d-1); its last point equals the case total
  };
  return {
    daysInMonth: n, day: d, daysLeft, collected,
    low: cases.low, base: cases.base, high: cases.high,
    curve: { actual, startDay: d, low: curve('low'), base: curve('base'), high: curve('high') },
    collectionRate: rate,
  };
}

// ---------------------------------------------------------------- everything the page shows

export async function businessInsights(db, now = new Date()) {
  const biz = await db.business.findFirst({ select: { timezone: true, createdAt: true } });
  const tz = biz?.timezone || 'UTC';
  const L = d => localYMD(tz, new Date(d));
  const today = L(now);
  const [Y, M, D] = ymdParts(today);
  const thisMonth = ymKey(Y, M);
  const monthEnd = `${thisMonth}-${String(daysIn(Y, M)).padStart(2, '0')}`;
  const since = new Date(now.getTime() - 400 * DAY); // ~13 months, plus slack for time zones
  const d90 = new Date(now.getTime() - 90 * DAY);
  const w8 = new Date(now.getTime() - 63 * DAY);

  const [payments, subs, plans, clients, leads, checkins, assignments] = await Promise.all([
    db.payment.findMany({ where: { OR: [{ paidAt: { gte: since } }, { createdAt: { gte: since } }, { status: 'upcoming' }] }, select: { clientId: true, amountCents: true, status: true, paidAt: true, dueAt: true, createdAt: true } }),
    db.subscription.findMany({ select: { clientId: true, clientPlanId: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, createdAt: true, updatedAt: true } }),
    db.clientPlan.findMany({ select: { id: true, name: true, priceCents: true, interval: true } }),
    db.client.findMany({ select: { id: true, name: true, status: true, startedAt: true, updatedAt: true, riskLevel: true } }),
    db.lead.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 200 * DAY) } }, select: { stage: true, source: true, createdAt: true, valueCents: true } }),
    db.checkIn.findMany({ where: { submittedAt: { gte: w8 } }, select: { clientId: true, submittedAt: true } }),
    db.workoutAssignment.findMany({ where: { scheduledFor: { gte: w8, lt: now } }, select: { scheduledFor: true, status: true } }),
  ]);
  const planById = new Map(plans.map(p => [p.id, p]));
  const clientById = new Map(clients.map(c => [c.id, c]));
  const paid = payments.filter(p => p.status === 'paid' && p.paidAt);

  // ---- revenue by month, last 12 (this month last)
  const months = Array.from({ length: 12 }, (_, i) => { const [y, m] = shiftMonth(Y, M, i - 11); return { key: ymKey(y, m), label: MONTHS[m - 1], year: y, cents: 0 }; });
  const monthIdx = new Map(months.map((x, i) => [x.key, i]));
  const dailyCollected = new Array(D).fill(0);
  const lastMonthKey = months[10].key;
  const [lmY, lmM] = shiftMonth(Y, M, -1);
  const lastMonthDaily = new Array(daysIn(lmY, lmM)).fill(0);
  const lastPaidBy = new Map();
  const firstPaidBy = new Map(); // client → their first payment in this window
  for (const p of paid) {
    const day = L(p.paidAt);
    const i = monthIdx.get(day.slice(0, 7));
    if (i != null) months[i].cents += p.amountCents;
    if (day.slice(0, 7) === thisMonth) dailyCollected[Number(day.slice(8)) - 1] += p.amountCents;
    if (day.slice(0, 7) === lastMonthKey) lastMonthDaily[Number(day.slice(8)) - 1] += p.amountCents;
    if (!lastPaidBy.has(p.clientId) || lastPaidBy.get(p.clientId) < day) lastPaidBy.set(p.clientId, day);
    const f = firstPaidBy.get(p.clientId);
    if (!f || f.day > day) firstPaidBy.set(p.clientId, { day, cents: p.amountCents });
  }

  // ---- how reliably charges go through (last 90 days)
  const recentPaid = paid.filter(p => p.paidAt >= d90).length;
  const recentFailed = payments.filter(p => p.status === 'failed' && p.createdAt >= d90).length;
  const enoughHistory = recentPaid + recentFailed >= ASSUME.minHistoryForRate;
  const collectionRate = enoughHistory ? recentPaid / (recentPaid + recentFailed) : ASSUME.defaultCollectionRate;

  // ---- what's still expected this month
  const tomorrow = addDaysYmd(today, 1);
  const paidThisMonth = new Set(paid.filter(p => L(p.paidAt).slice(0, 7) === thisMonth).map(p => p.clientId));
  const scheduled = [];
  const scheduledFor = new Set();
  for (const p of payments) {
    if (p.status !== 'upcoming' || !p.dueAt) continue;
    const due = L(p.dueAt);
    if (due < today || due > monthEnd) continue;
    scheduled.push({ date: due, cents: p.amountCents });
    scheduledFor.add(p.clientId);
  }
  const renewals = [];
  const trials = [];
  const scheduledCancels = [];
  let mrr = 0;
  const mrrByRisk = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const atRiskPayers = [];
  for (const s of subs) {
    const plan = planById.get(s.clientPlanId);
    const c = clientById.get(s.clientId);
    if (!plan || !c || c.status === 'INACTIVE') continue;
    const monthly = monthlyCents(plan);
    if (['active', 'past_due'].includes(s.status)) {
      mrr += monthly;
      const risk = c.riskLevel || 'LOW';
      mrrByRisk[risk] = (mrrByRisk[risk] || 0) + monthly;
      if (risk === 'HIGH' && monthly) atRiskPayers.push({ id: c.id, name: c.name, cents: monthly });
    }
    const periodEnd = s.currentPeriodEnd ? L(s.currentPeriodEnd) : null;
    if (s.cancelAtPeriodEnd && periodEnd && periodEnd <= monthEnd) { scheduledCancels.push(s.clientId); continue; }
    if (!plan.priceCents || scheduledFor.has(s.clientId)) continue;
    if (s.status === 'trialing') {
      if (periodEnd && periodEnd >= tomorrow && periodEnd <= monthEnd) trials.push({ date: periodEnd, cents: plan.priceCents });
      continue;
    }
    if (!['active', 'past_due'].includes(s.status)) continue;
    let dates = chargeDates({ interval: plan.interval, periodEnd: periodEnd && periodEnd >= tomorrow ? periodEnd : null, lastPaid: lastPaidBy.get(s.clientId), started: L(s.createdAt) }, tomorrow, monthEnd);
    if (plan.interval === 'month' && paidThisMonth.has(s.clientId)) dates = []; // already paid this month
    for (const date of dates) renewals.push({ date, cents: plan.priceCents });
  }
  const failedOpen = payments.filter(p => p.status === 'failed' && p.createdAt >= new Date(now.getTime() - 30 * DAY) && clientById.get(p.clientId)?.status !== 'INACTIVE');
  const failedCents = failedOpen.reduce((a, p) => a + p.amountCents, 0);

  // New clients' first payments, at the pace of the last 90 days (clients who started in that
  // window and have paid). A young business uses the days it has had clients, at least 30.
  const firstStart = clients.reduce((m, c) => Math.min(m, new Date(c.startedAt).getTime()), now.getTime());
  const historyDays = Math.max(30, Math.min(90, Math.round((now.getTime() - firstStart) / DAY)));
  const fromNew = addDaysYmd(today, -historyDays);
  const firstPayments = clients.filter(c => L(c.startedAt) > fromNew && firstPaidBy.has(c.id)).map(c => firstPaidBy.get(c.id));
  const newPerDayCents = firstPayments.reduce((a, f) => a + f.cents, 0) / historyDays;

  const forecast = forecastMonth({ today, dailyCollected, renewals, scheduled, failedCents, trials, newPerDayCents, collectionRate });
  const lastMonthTotal = months[10].cents;
  const lastMonthSameDay = lastMonthDaily.slice(0, Math.min(D, lastMonthDaily.length)).reduce((a, b) => a + b, 0);
  let lmRun = 0;
  const lastMonthCurve = lastMonthDaily.map(v => (lmRun += v));

  // ---- clients gained and lost, by month (last 6 + this month)
  const lostDate = new Map();
  for (const c of clients) if (c.status === 'INACTIVE') lostDate.set(c.id, L(c.updatedAt));
  for (const s of subs) if (s.status === 'canceled' && !lostDate.has(s.clientId)) lostDate.set(s.clientId, L(s.updatedAt));
  const flow = months.slice(6).map(x => ({ key: x.key, label: x.label, gained: 0, lost: 0, active: 0 }));
  const flowIdx = new Map(flow.map((x, i) => [x.key, i]));
  for (const c of clients) { const i = flowIdx.get(L(c.startedAt).slice(0, 7)); if (i != null) flow[i].gained++; }
  for (const [, day] of lostDate) { const i = flowIdx.get(day.slice(0, 7)); if (i != null) flow[i].lost++; }
  for (const f of flow) {
    const [fy, fm] = ymdParts(`${f.key}-01`);
    const end = f.key === thisMonth ? today : `${f.key}-${String(daysIn(fy, fm)).padStart(2, '0')}`;
    f.active = clients.filter(c => L(c.startedAt) <= end && !(lostDate.get(c.id) && lostDate.get(c.id) <= end) && c.status !== 'PAUSED').length;
  }
  const activeNow = clients.filter(c => ACTIVE.includes(c.status)).length;
  const from90 = addDaysYmd(today, -90);
  const gained90 = clients.filter(c => L(c.startedAt) > from90).length;
  const lost90 = [...lostDate.values()].filter(day => day > from90).length;
  const cur = flow.at(-1);
  const daysLeft = forecast.daysLeft;
  const projGained = cur.gained + Math.round(gained90 / 90 * daysLeft);
  const extraCancels = scheduledCancels.filter(id => !(lostDate.get(id) && lostDate.get(id).slice(0, 7) === thisMonth)).length;
  const projLost = cur.lost + extraCancels + Math.round(lost90 / 90 * daysLeft);
  const projActive = Math.max(0, activeNow + (projGained - cur.gained) - (projLost - cur.lost));
  const avgActive = flow.slice(-4).reduce((a, f) => a + f.active, 0) / 4 || activeNow || 1;
  const churnPct = Math.round(lost90 / 3 / avgActive * 1000) / 10; // monthly, one decimal
  const payers = new Set(subs.filter(s => ['active', 'past_due'].includes(s.status) && clientById.get(s.clientId)?.status !== 'INACTIVE').map(s => s.clientId)).size;
  const arpc = payers ? Math.round(mrr / payers) : 0;
  const lifetimeMonths = churnPct > 0 ? Math.round(100 / churnPct * 10) / 10 : null;

  // ---- leads: funnel and where clients come from (last 90 days)
  const recentLeads = leads.filter(l => l.createdAt >= d90);
  const reached = s => recentLeads.filter(l => l.stage !== 'lost' && STAGES.indexOf(l.stage) >= STAGES.indexOf(s)).length;
  const funnel = [
    { stage: 'Leads', count: recentLeads.length },
    { stage: 'Contacted', count: reached('contacted') },
    { stage: 'Consult', count: reached('consult') },
    { stage: 'Trial', count: reached('trial') },
    { stage: 'Became clients', count: recentLeads.filter(l => WON.has(l.stage)).length },
  ];
  const bySource = new Map();
  for (const l of recentLeads) {
    const k = SOURCE_NAMES[l.source] || 'Other';
    const b = bySource.get(k) || { source: k, leads: 0, won: 0 };
    b.leads++; if (WON.has(l.stage)) b.won++;
    bySource.set(k, b);
  }
  const openLeads = leads.filter(l => ['consult', 'trial'].includes(l.stage));
  const pipelineCents = openLeads.reduce((a, l) => a + (l.valueCents || 0), 0);

  // ---- engagement by week (last 8): check-ins sent and workouts done, as a share
  const wk0 = addDaysYmd(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) - 49); // Monday, 7 weeks ago
  const weeks = Array.from({ length: 8 }, (_, i) => ({ start: addDaysYmd(wk0, i * 7), checkins: new Set(), done: 0, scheduled: 0, eligible: 0 }));
  const weekOf = day => { const i = Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${wk0}T00:00:00Z`)) / (7 * DAY)); return i >= 0 && i < 8 ? i : null; };
  for (const ci of checkins) { const i = weekOf(L(ci.submittedAt)); if (i != null) weeks[i].checkins.add(ci.clientId); }
  for (const a of assignments) { const i = weekOf(new Date(a.scheduledFor).toISOString().slice(0, 10)); if (i == null) continue; weeks[i].scheduled++; if (a.status === 'completed') weeks[i].done++; }
  for (const w of weeks) {
    const end = addDaysYmd(w.start, 6);
    // Clients expected to check in that week: started at least a week before, not paused or gone.
    w.eligible = clients.filter(c => L(c.startedAt) <= addDaysYmd(w.start, -1) && c.status !== 'PAUSED' && !(lostDate.get(c.id) && lostDate.get(c.id) <= end)).length;
  }
  const engagement = weeks.map(w => ({ weekOf: w.start, checkinPct: w.eligible ? Math.min(100, pct(w.checkins.size, w.eligible)) : null, adherencePct: w.scheduled ? pct(w.done, w.scheduled) : null }));

  // ---- plain-words takeaways (structured; the page words them in the coach's language)
  const takeaways = [];
  const base = forecast.base.total;
  if (lastMonthTotal > 0) takeaways.push({ kind: 'pace', cents: base, changePct: Math.round((base - lastMonthTotal) / lastMonthTotal * 100) });
  if (mrrByRisk.HIGH > 0) takeaways.push({ kind: 'risk', cents: mrrByRisk.HIGH, clients: atRiskPayers.length, names: atRiskPayers.sort((a, b) => b.cents - a.cents).slice(0, 3).map(x => x.name.split(' ')[0]) });
  if (failedCents > 0) takeaways.push({ kind: 'failed', cents: failedCents, count: failedOpen.length });
  const bestSource = [...bySource.values()].filter(s => s.leads >= 2).sort((a, b) => b.won / b.leads - a.won / a.leads || b.leads - a.leads)[0];
  if (bestSource && bestSource.won > 0) takeaways.push({ kind: 'source', source: bestSource.source, won: bestSource.won, leads: bestSource.leads });
  // Full weeks only: the current week is still filling up.
  const ck = engagement.slice(0, -1).map(e => e.checkinPct).filter(v => v != null);
  if (ck.length >= 4) {
    const recent = (ck.at(-1) + ck.at(-2)) / 2, before = (ck.at(-3) + ck.at(-4)) / 2;
    if (recent - before <= -10) takeaways.push({ kind: 'checkinsDown', from: Math.round(before), to: Math.round(recent) });
  }
  if (pipelineCents > 0) takeaways.push({ kind: 'pipeline', leads: openLeads.length, cents: pipelineCents });

  return {
    today, timezone: tz, month: { label: MONTHS[M - 1], year: Y, day: D, daysInMonth: forecast.daysInMonth, daysLeft },
    forecast: {
      collected: forecast.collected, low: forecast.low, base: forecast.base, high: forecast.high, curve: forecast.curve,
      collectionRate: Math.round(collectionRate * 1000) / 10, rateFromHistory: enoughHistory,
      renewals: { count: renewals.length, cents: renewals.reduce((a, r) => a + r.cents, 0) },
      scheduled: { count: scheduled.length, cents: scheduled.reduce((a, r) => a + r.cents, 0) },
      failed: { count: failedOpen.length, cents: failedCents },
      trials: { count: trials.length, cents: trials.reduce((a, r) => a + r.cents, 0) },
      newPerMonthCents: Math.round(newPerDayCents * 30), newClientsLast90: firstPayments.length, historyDays,
      lastMonth: { total: lastMonthTotal, sameDay: lastMonthSameDay, curve: lastMonthCurve },
    },
    revenue: months.map(x => ({ label: x.label, year: x.year, cents: x.cents })),
    clients: { flow: flow.map(({ key, ...f }) => f), active: activeNow, projectedActive: projActive, projectedGained: projGained, projectedLost: projLost, churnPct, lifetimeMonths, arpc, payers, mrr, ltvCents: lifetimeMonths ? Math.round(arpc * lifetimeMonths) : null },
    risk: { mrrByRisk, atRisk: atRiskPayers.slice(0, 5) },
    leads: { funnel, sources: [...bySource.values()].sort((a, b) => b.leads - a.leads), open: openLeads.length, pipelineCents, total90: recentLeads.length },
    engagement,
    takeaways,
  };
}
