// OneJump HQ: how OneJump itself is doing (coaches and their plans), with a realistic forecast of
// this month's plan revenue. Totals and workspace names only; never client details.
//
// Plan revenue this month =
//   billed so far (Stripe's paid invoices once Stripe is live; until then, estimated from each
//   paying coach's renewal day)
//   + paying coaches who renew later this month (not those cancelling at period end) × the share
//     of plan charges that go through
//   + past-due coaches × a recovery share (Stripe retries)
//   + trials ending this month × the trial-to-paid rate (history once 5 trials have ended)
//   + coaches who sign up soon enough to finish a 14-day trial before the month ends
import { admin } from '../db/system.js';
import { PLAN_PRICES } from '../payments/PaymentService.js';
import { localYMD, DAY } from '../lib/time.js';
import { forecastMonth, ymdParts, ymKey, daysIn, shiftMonth, addDaysYmd } from './businessInsights.js';

export const HQ_TZ = process.env.HQ_TIMEZONE || 'America/New_York';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAID_PLANS = ['STARTER', 'PRO', 'STUDIO'];
export const HQ_ASSUME = { trialRate: 0.25, minTrialsForRate: 5, chargeRate: 0.95, minChargesForRate: 5, trialDays: 14 };

/** Local midnight of a YYYY-MM-DD in a time zone, as a Date (close enough for month bounds). */
function zonedStart(ymd, tz) {
  const guess = new Date(`${ymd}T00:00:00Z`);
  const local = localYMD(tz, guess);
  // Shift by the zone's offset at that moment (−12h…+14h), so the boundary lands on local midnight.
  const offsetH = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(guess));
  const shift = local === ymd ? -offsetH : 24 - offsetH;
  return new Date(guess.getTime() + shift * 3600e3);
}

export async function platformInsights(now = new Date(), tz = HQ_TZ) {
  const L = d => localYMD(tz, new Date(d));
  const today = L(now);
  const [Y, M, D] = ymdParts(today);
  const thisMonth = ymKey(Y, M);
  const monthEnd = `${thisMonth}-${String(daysIn(Y, M)).padStart(2, '0')}`;
  const since = new Date(now.getTime() - 400 * DAY);
  const d90 = addDaysYmd(today, -90);

  const [rows, events] = await Promise.all([admin.planRows(), admin.planEvents(since)]);
  const price = b => PLAN_PRICES[b.plan] || 0;
  const isPaying = b => PAID_PLANS.includes(b.plan) && ['active', 'past_due'].includes(b.planStatus);
  // A cancelled paid plan (not a trial that simply ran out): Stripe set a renewal date for it.
  const wasPaid = b => b.planStatus === 'canceled' && !!b.planRenewsAt;
  const paying = rows.filter(isPaying);
  const mrr = paying.reduce((n, b) => n + price(b), 0);
  const arpa = paying.length ? Math.round(mrr / paying.length) : PLAN_PRICES.PRO;

  // ---- billing events
  const byBiz = new Map();
  for (const e of events) { if (!byBiz.has(e.businessId)) byBiz.set(e.businessId, []); byBiz.get(e.businessId).push(e); }
  const startedAt = new Map(); // first plan start per workspace
  for (const e of events) if (e.action === 'plan_started' && !startedAt.has(e.businessId)) startedAt.set(e.businessId, L(e.at));
  const paidEvents = events.filter(e => e.action === 'plan_paid').map(e => ({ businessId: e.businessId, day: L(e.meta?.paidAt || e.at), cents: Number(e.meta?.amountCents) || 0 }));
  const live = paidEvents.length > 0; // Stripe has sent real plan payments

  // When a paying coach is billed each month: their renewal date, else their plan start, else trial end.
  const startOf = b => {
    const est = startedAt.get(b.id) || (b.trialEndsAt ? L(b.trialEndsAt) : addDaysYmd(L(b.createdAt), HQ_ASSUME.trialDays));
    return est > today ? L(b.createdAt) : est; // already paying, so it started by today
  };
  const billDay = b => Number((b.planRenewsAt ? L(b.planRenewsAt) : startOf(b)).slice(8, 10));
  const dayIn = (y, m, d) => `${ymKey(y, m)}-${String(Math.min(d, daysIn(y, m))).padStart(2, '0')}`;

  // ---- billed so far this month, and last month (for the comparison line)
  const [lmY, lmM] = shiftMonth(Y, M, -1);
  const lastKey = ymKey(lmY, lmM);
  const daily = new Array(D).fill(0);
  const lastDaily = new Array(daysIn(lmY, lmM)).fill(0);
  const paidThisMonth = new Set();
  if (live) {
    for (const p of paidEvents) {
      if (p.day.slice(0, 7) === thisMonth && p.day <= today) { daily[Number(p.day.slice(8)) - 1] += p.cents; paidThisMonth.add(p.businessId); }
      if (p.day.slice(0, 7) === lastKey) lastDaily[Number(p.day.slice(8)) - 1] += p.cents;
    }
  } else {
    for (const b of paying) {
      const start = startOf(b);
      const day = dayIn(Y, M, billDay(b));
      if (start <= day && day <= today) { daily[Number(day.slice(8)) - 1] += price(b); paidThisMonth.add(b.id); }
      const lday = dayIn(lmY, lmM, billDay(b));
      if (start <= lday) lastDaily[Number(lday.slice(8)) - 1] += price(b);
    }
  }

  // ---- how often plan charges go through, and how often trials become paying (last 90 days)
  const recent = e => L(e.at) > d90;
  const okCharges = live ? paidEvents.filter(p => p.day > d90).length : 0;
  const badCharges = events.filter(e => e.action === 'plan_payment_failed' && recent(e)).length;
  const rateFromHistory = okCharges + badCharges >= HQ_ASSUME.minChargesForRate;
  const chargeRate = rateFromHistory ? okCharges / (okCharges + badCharges) : HQ_ASSUME.chargeRate;
  const trialsEnded = rows.filter(b => { const end = b.trialEndsAt ? L(b.trialEndsAt) : addDaysYmd(L(b.createdAt), HQ_ASSUME.trialDays); return end > d90 && end <= today; });
  const converted = trialsEnded.filter(b => startedAt.has(b.id) || isPaying(b) || wasPaid(b)).length;
  const trialFromHistory = trialsEnded.length >= HQ_ASSUME.minTrialsForRate;
  const trialRate = trialFromHistory ? converted / trialsEnded.length : HQ_ASSUME.trialRate;

  // ---- what's still expected this month
  const tomorrow = addDaysYmd(today, 1);
  const renewals = [];
  const cancelling = [];
  for (const b of paying) {
    if (b.cancelAtPeriodEnd) { cancelling.push(b); continue; }
    if (paidThisMonth.has(b.id) || b.planStatus === 'past_due') continue;
    const day = dayIn(Y, M, billDay(b));
    if (day >= tomorrow && day <= monthEnd && startOf(b) <= day) renewals.push({ date: day, cents: price(b) });
  }
  const pastDue = paying.filter(b => b.planStatus === 'past_due');
  const failedCents = pastDue.reduce((n, b) => n + price(b), 0);
  const inTrial = rows.filter(b => b.plan === 'TRIAL' && b.planStatus === 'trialing' && b.trialEndsAt && new Date(b.trialEndsAt) >= now);
  const trials = inTrial.map(b => ({ date: L(b.trialEndsAt), cents: arpa })).filter(t => t.date >= tomorrow && t.date <= monthEnd);
  const signups90 = rows.filter(b => L(b.createdAt) > d90).length;
  const signupsPerDay = signups90 / 90;
  const daysLeft = daysIn(Y, M) - D;
  // Only sign-ups at least 14 days before month end can convert this month.
  const convertibleShare = daysLeft > HQ_ASSUME.trialDays ? (daysLeft - HQ_ASSUME.trialDays) / daysLeft : 0;
  const newPerDayCents = signupsPerDay * trialRate * arpa * convertibleShare;
  const f = forecastMonth({
    today, dailyCollected: daily, renewals, scheduled: [], failedCents, trials, newPerDayCents, collectionRate: chargeRate,
    trialRate: { low: Math.min(1, trialRate * 0.5), base: trialRate, high: Math.min(1, trialRate * 1.5) },
  });
  let run = 0;
  const lastCurve = lastDaily.map(v => (run += v));

  // ---- MRR at the end of each month (last 12), from plan starts and cancellations
  const endOf = b => (wasPaid(b) || (b.planStatus === 'canceled' && startedAt.has(b.id)) ? L(b.updatedAt) : null);
  const everPaid = rows.filter(b => startedAt.has(b.id) || isPaying(b) || wasPaid(b));
  const mrrTrend = Array.from({ length: 12 }, (_, i) => {
    const [y, m] = shiftMonth(Y, M, i - 11);
    const end = i === 11 ? today : dayIn(y, m, 31);
    const cents = everPaid.filter(b => startOf(b) <= end && !(endOf(b) && endOf(b) <= end)).reduce((n, b) => n + price(b), 0);
    return { label: MONTHS[m - 1], year: y, cents };
  });
  const projectedMrr = Math.max(0, mrr - cancelling.reduce((n, b) => n + price(b), 0) + Math.round(trials.length * trialRate * arpa + signupsPerDay * daysLeft * convertibleShare * trialRate * arpa));

  // ---- coaches gained (started paying) and lost (cancelled), by month (last 6)
  const flow = Array.from({ length: 6 }, (_, i) => { const [y, m] = shiftMonth(Y, M, i - 5); return { key: ymKey(y, m), label: MONTHS[m - 1], gained: 0, lost: 0, signups: 0 }; });
  const fIdx = new Map(flow.map((x, i) => [x.key, i]));
  for (const b of everPaid) { const i = fIdx.get(startOf(b).slice(0, 7)); if (i != null && startOf(b) <= today) flow[i].gained++; }
  for (const b of rows) { const e = endOf(b); if (e) { const i = fIdx.get(e.slice(0, 7)); if (i != null) flow[i].lost++; } const s = fIdx.get(L(b.createdAt).slice(0, 7)); if (s != null) flow[s].signups++; }
  const lost90 = rows.filter(b => endOf(b) && endOf(b) > d90).length;
  const avgPaying = Math.max(1, paying.length);
  const churnPct = Math.round(lost90 / 3 / avgPaying * 1000) / 10;
  const cur = flow.at(-1);
  const projGained = cur.gained + Math.round(trials.length * trialRate + signupsPerDay * daysLeft * convertibleShare * trialRate);
  const projLost = cur.lost + cancelling.length;

  // ---- sign-up funnel (last 90 days)
  const recentSignups = rows.filter(b => L(b.createdAt) > d90);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const funnel = [
    { stage: 'Signed up', count: recentSignups.length },
    { stage: 'Finished setup', count: recentSignups.filter(b => b.onboardedAt).length },
    { stage: 'Active this week', count: recentSignups.filter(b => b.members[0]?.user?.lastLoginAt && new Date(b.members[0].user.lastLoginAt) >= weekAgo).length },
    { stage: 'Paying', count: recentSignups.filter(b => isPaying(b)).length },
  ];

  // ---- AI cost by month (last 6), this month projected from its pace so far
  const monthStarts = Array.from({ length: 7 }, (_, i) => { const [y, m] = shiftMonth(Y, M, i - 5); return zonedStart(`${ymKey(y, m)}-01`, tz); });
  const aiMicros = await Promise.all(monthStarts.slice(0, 6).map((s, i) => admin.aiCostBetween(s, i === 5 ? now : monthStarts[i + 1])));
  const aiCost = aiMicros.map((micros, i) => { const [y, m] = shiftMonth(Y, M, i - 5); return { label: MONTHS[m - 1], year: y, cents: Math.round(micros / 1e4) }; });
  const aiNow = aiCost.at(-1).cents;
  const aiProjected = D ? Math.round(aiNow / D * daysIn(Y, M)) : aiNow;
  const clientsAdded = await Promise.all(monthStarts.slice(0, 6).map((s, i) => admin.clientsAddedBetween(s, i === 5 ? now : monthStarts[i + 1])));

  // ---- takeaways
  const takeaways = [];
  const lastTotal = lastDaily.reduce((a, b) => a + b, 0);
  if (lastTotal > 0) takeaways.push({ kind: 'pace', cents: f.base.total, changePct: Math.round((f.base.total - lastTotal) / lastTotal * 100) });
  const soon = inTrial.filter(b => { const e = L(b.trialEndsAt); return e >= today && e <= addDaysYmd(today, 7); });
  if (soon.length) takeaways.push({ kind: 'trialsSoon', count: soon.length, names: soon.slice(0, 3).map(b => b.name) });
  if (pastDue.length) takeaways.push({ kind: 'pastDue', count: pastDue.length, cents: failedCents });
  if (cancelling.length) takeaways.push({ kind: 'cancelling', count: cancelling.length, cents: cancelling.reduce((n, b) => n + price(b), 0) });
  const idle = paying.filter(b => !b.members[0]?.user?.lastLoginAt || new Date(b.members[0].user.lastLoginAt) < weekAgo);
  if (idle.length) takeaways.push({ kind: 'idlePaying', count: idle.length, names: idle.slice(0, 3).map(b => b.name) });
  if (aiProjected && f.base.total) { const p = Math.round(aiProjected / f.base.total * 1000) / 10; if (p >= 5) takeaways.push({ kind: 'aiHigh', pct: p }); }

  return {
    today, timezone: tz, live,
    month: { label: MONTHS[M - 1], year: Y, day: D, daysInMonth: f.daysInMonth, daysLeft },
    forecast: {
      collected: f.collected, low: f.low, base: f.base, high: f.high, curve: f.curve,
      chargeRate: Math.round(chargeRate * 1000) / 10, rateFromHistory,
      trialRate: Math.round(trialRate * 1000) / 10, trialFromHistory, trialsEnded: trialsEnded.length,
      renewals: { count: renewals.length, cents: renewals.reduce((a, r) => a + r.cents, 0) },
      failed: { count: pastDue.length, cents: failedCents },
      trials: { count: trials.length, cents: trials.reduce((a, r) => a + r.cents, 0) },
      cancelling: { count: cancelling.length, cents: cancelling.reduce((n, b) => n + price(b), 0) },
      signupsPerMonth: Math.round(signupsPerDay * 30 * 10) / 10,
      lastMonth: { total: lastTotal, curve: lastCurve, sameDay: lastDaily.slice(0, D).reduce((a, b) => a + b, 0) },
    },
    mrr: { now: mrr, projected: projectedMrr, trend: mrrTrend, arpa, paying: paying.length, churnPct },
    coaches: { flow: flow.map(({ key, ...x }) => x), projGained, projLost, funnel, inTrial: inTrial.length },
    ai: { months: aiCost, projected: aiProjected, pctOfRevenue: f.base.total ? Math.round(aiProjected / f.base.total * 1000) / 10 : null },
    clients: aiCost.map((m, i) => ({ label: m.label, year: m.year, added: clientsAdded[i] })),
    takeaways,
  };
}
