// HQ: OneJump's own business (coaches and their plans): a realistic forecast of this month's plan
// revenue, MRR over time, coaches gained and lost, the sign-up funnel and AI cost. Totals and
// workspace names only. Charts come from the coach Business page (../coach/insightCharts.js).
import { esc, money, plural } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { forecastChart, revenueColumns, flowChart, legend, moneyShort } from '../coach/insightCharts.js';
import { pointLine } from '../shared/charts.js';

const narrow = () => window.innerWidth < 760;
const wide = () => (narrow() ? { W: 400, H: 250 } : { W: 920, H: 300 });
const half = (h = 220) => (narrow() ? { W: 400, H: h } : { W: 480, H: h });
const signed = n => (n > 0 ? `+${n}` : String(n));
const card = (title, sub, body, note = '', extra = '') => `<section class="card pad stack s8 ins-card" ${extra}><div class="row between" style="align-items:baseline;gap:8px;flex-wrap:wrap"><h2 class="h3">${title}</h2>${sub ? `<span class="tiny muted">${sub}</span>` : ''}</div>${body}${note ? `<p class="tiny faint">${note}</p>` : ''}</section>`;
const kpi = (label, value, sub, tone = '') => `<div class="kpi"><span class="eyebrow">${label}</span><span class="big-num ${tone}">${value}</span><span class="tiny muted">${sub}</span></div>`;
const cents2 = c => `$${(c / 100).toFixed(2)}`;

function takeaways(d) {
  const items = d.takeaways.map(x => {
    switch (x.kind) {
      case 'pace': return ['chart', `On pace for about ${money(x.cents)} in plan revenue this month, ${signed(x.changePct)}% vs last month.`, x.changePct >= 0 ? 'good' : 'warn'];
      case 'trialsSoon': return ['clock', `${plural(x.count, 'trial ends', 'trials end')} in the next 7 days (${x.names.map(esc).join(', ')}). A quick personal note before the trial ends helps them pick a plan.`, 'warn'];
      case 'pastDue': return ['card', `${plural(x.count, 'coach is', 'coaches are')} past due (${money(x.cents)} a month). Stripe is retrying the card.`, 'crit'];
      case 'cancelling': return ['alert', `${plural(x.count, 'coach cancels', 'coaches cancel')} at the end of the period (${money(x.cents)} a month). Worth asking why.`, 'crit'];
      case 'idlePaying': return ['users', `${plural(x.count, 'paying coach hasn’t', 'paying coaches haven’t')} logged in for a week (${x.names.map(esc).join(', ')}). Idle coaches are the likeliest to cancel.`, 'warn'];
      case 'aiHigh': return ['zap', `AI cost is on track for ${x.pct}% of this month’s revenue (target: under 5%).`, 'warn'];
      default: return null;
    }
  }).filter(Boolean);
  if (!items.length) return '';
  return `<section class="card pad stack s12"><h2 class="h3">${icon('target')} What stands out</h2><ul class="stack s8 ul-plain">${items.map(([ic, text, tone]) => `<li class="row" style="align-items:flex-start;gap:10px"><span class="ti ${tone}">${icon(ic)}</span><span class="small grow">${text}</span></li>`).join('')}</ul></section>`;
}

function forecastCard(d) {
  const f = d.forecast, m = d.month;
  const vs = f.lastMonth.sameDay ? Math.round((f.collected - f.lastMonth.sameDay) / f.lastMonth.sameDay * 100) : null;
  return card(`${icon('chart')} Plan revenue: ${esc(m.label)} forecast`, m.daysLeft ? `${m.daysLeft} days left` : 'Last day of the month',
    `${legend([{ label: d.live ? 'Billed' : 'Billed (estimated)', kind: 'line' }, ...(m.daysLeft ? [{ label: 'Expected', kind: 'dash' }, { label: 'Likely range', kind: 'band' }] : []), ...(f.lastMonth.total ? [{ label: 'Last month', kind: 'ref', tone: 'ref' }] : [])])}
    ${forecastChart({ month: m, curve: f.curve, lastMonth: f.lastMonth.curve, ...wide() })}
    <p class="small"><b>${money(f.collected)}</b> billed by today${vs != null ? ` · ${signed(vs)}% vs the same day last month` : ''}</p>`,
    d.live ? 'From Stripe’s paid plan invoices. Hover a day for details.' : 'Stripe isn’t live yet, so “billed” is estimated from each paying coach’s renewal day. Once Stripe sends paid invoices, this uses the real payments.', 'id="hq-forecast"');
}

function breakdownCard(d) {
  const f = d.forecast;
  const row = (label, sub, k, show = true) => (show ? `<tr><td><div class="small strong">${label}</div>${sub ? `<div class="tiny muted">${sub}</div>` : ''}</td><td class="r num">${money(f.low[k])}</td><td class="r num strong">${money(f.base[k])}</td><td class="r num">${money(f.high[k])}</td></tr>` : '');
  return card(`${icon('list')} How the forecast is built`, '', `<div class="table-wrap"><table class="t breakdown"><thead><tr><th>Piece</th><th class="r">Low</th><th class="r">Expected</th><th class="r">High</th></tr></thead><tbody>
    <tr><td><div class="small strong">Billed so far</div><div class="tiny muted">${d.live ? 'Paid plan invoices' : 'Estimated'}</div></td><td class="r num">${money(f.collected)}</td><td class="r num strong">${money(f.collected)}</td><td class="r num">${money(f.collected)}</td></tr>
    ${row('Renewals before month end', plural(f.renewals.count, 'coach', 'coaches'), 'renewals', f.renewals.count > 0)}
    ${row('Past-due coaches recovered', `${money(f.failed.cents)} outstanding`, 'recovered', f.failed.count > 0)}
    ${row('Trials ending this month', `${plural(f.trials.count, 'trial')} × ${f.trialRate}% become paying`, 'trials', f.trials.count > 0)}
    ${row('New sign-ups that finish a trial this month', `About ${f.signupsPerMonth} sign-ups a month lately`, 'newClients', f.base.newClients > 0)}
    </tbody><tfoot><tr><td>Month total</td><td class="r num">${money(f.low.total)}</td><td class="r num strong">${money(f.base.total)}</td><td class="r num">${money(f.high.total)}</td></tr></tfoot></table></div>
    <ul class="tiny muted ul-plain stack s4">
      <li>${f.rateFromHistory ? `${f.chargeRate}% of plan charges went through in the last 90 days.` : `Not enough plan payments yet, so we assume ${f.chargeRate}% go through.`}</li>
      <li>${f.trialFromHistory ? `${f.trialRate}% of the ${f.trialsEnded} trials that ended in the last 90 days became paying.` : `Fewer than 5 trials have ended, so we assume ${f.trialRate}% become paying (1 in 4).`}</li>
      ${f.cancelling.count ? `<li>${plural(f.cancelling.count, 'coach is', 'coaches are')} cancelling at period end and won’t renew (${money(f.cancelling.cents)}).</li>` : ''}
      <li>Low: fewer charges go through, no past-due card recovers, half as many trials convert. High: everything goes through and 50% more trials convert.</li>
    </ul>`, '', 'id="hq-breakdown"');
}

function mrrCard(d) {
  const firstPaid = d.mrr.trend.findIndex(r => r.cents > 0);
  const from = Math.max(0, Math.min(firstPaid < 0 ? 6 : firstPaid, d.mrr.trend.length - 6));
  const months = d.mrr.trend.slice(from);
  months[months.length - 1] = { ...months.at(-1), cents: d.mrr.now };
  return card(`${icon('card')} MRR by month`, `${money(d.mrr.now)} now · about ${money(d.mrr.projected)} by month end`,
    `${legend([{ label: 'MRR at month end', kind: 'box' }, ...(d.mrr.projected > d.mrr.now ? [{ label: 'Expected growth this month', kind: 'hatch' }] : [])])}${revenueColumns({ months, expected: Math.max(d.mrr.now, d.mrr.projected), ...half() })}`,
    'Monthly recurring revenue from paying coaches (Starter $29, Pro $59, Studio $99). Past months are rebuilt from plan starts and cancellations.');
}

function coachesCard(d) {
  const c = d.coaches, cur = c.flow.at(-1);
  return card(`${icon('users')} Paying coaches gained and lost`, `${d.mrr.paying} paying · ${c.inTrial} in trial`,
    `${legend([{ label: 'Started paying', kind: 'box' }, { label: 'Cancelled', kind: 'box', tone: 'neg' }, { label: 'Expected by month end', kind: 'outline' }])}${flowChart({ flow: c.flow, projGained: c.projGained, projLost: c.projLost, ...half() })}
    <div class="row wrap small" style="gap:6px 16px">${c.flow.map(f => `<span class="muted">${esc(f.label)}: <b class="num" style="color:var(--ink)">${f.signups}</b> sign-ups</span>`).join('')}</div>`,
    cur ? `Monthly coach churn ${d.mrr.churnPct}% (last 90 days). Numbers in brackets are what to expect by month end.` : '');
}

function funnelCard(d) {
  const fn = d.coaches.funnel, top = Math.max(1, fn[0].count);
  return card(`${icon('funnel')} Sign-up funnel, last 90 days`, `Average ${money(d.mrr.arpa)} per paying coach`,
    fn[0].count ? `<div class="stack s8">${fn.map(s => `<div class="stack s4"><div class="row between small"><span class="strong">${s.stage}</span><span class="num">${s.count} <span class="tiny muted">(${Math.round(s.count / top * 100)}%)</span></span></div><div class="bar" role="img" aria-label="${esc(`${s.stage}: ${s.count}`)}"><i style="width:${Math.max(s.count ? 2 : 0, Math.round(s.count / top * 100))}%"></i></div></div>`).join('')}</div>`
      : '<div class="empty small" style="padding:24px">New coach sign-ups show up here.</div>',
    '“Active this week” means the owner logged in during the last 7 days.');
}

function aiCard(d) {
  const a = d.ai;
  return card(`${icon('zap')} AI cost by month`, a.pctOfRevenue == null ? '' : `${a.pctOfRevenue}% of expected revenue this month`,
    `${legend([{ label: 'AI cost', kind: 'box' }, { label: 'Expected rest of month', kind: 'hatch' }])}${revenueColumns({ months: a.months, expected: a.projected, fmt: cents2, full: cents2, ...half(200) })}`,
    'Claude and Deepgram usage across all coaches. This month is projected from its pace so far. Target: under 5% of revenue.');
}

function clientsCard(d) {
  const vals = d.clients.map(c => c.added);
  return card(`${icon('users')} Clients added across all coaches`, `${vals.at(-1)} this month so far`,
    vals.some(v => v > 0) ? pointLine({ labels: d.clients.map(c => c.label), values: vals, fmt: v => String(v), min: 0, height: 170 }) : '<div class="empty small" style="padding:24px">Clients coaches add show up here.</div>',
    'A sign that coaches are really using OneJump. Counts only, no client details.');
}

/** The HQ insights section, placed under the KPI tiles. */
export function hqInsights(d) {
  if (!d) return '';
  const f = d.forecast;
  const vsLast = f.lastMonth.total ? Math.round((f.base.total - f.lastMonth.total) / f.lastMonth.total * 100) : null;
  return `
    <section class="kpis" aria-label="This month’s forecast">
      ${kpi('Plan revenue this month', money(f.base.total), `Likely ${money(f.low.total)} to ${money(f.high.total)}`)}
      ${kpi('Billed so far', money(f.collected), `${f.base.total ? Math.round(f.collected / f.base.total * 100) : 0}% of expected${d.live ? '' : ' (estimated)'}`)}
      ${kpi('MRR by month end', money(d.mrr.projected), `${d.mrr.projected >= d.mrr.now ? '+' : '−'}${money(Math.abs(d.mrr.projected - d.mrr.now))} vs now`, d.mrr.projected >= d.mrr.now ? 'up' : 'down')}
      ${kpi('Trial → paid', `${f.trialRate}%`, f.trialFromHistory ? `of ${f.trialsEnded} recent trials` : 'assumed until 5 trials end')}
    </section>
    ${takeaways(d)}
    <div class="ins-grid">
      <div class="span2">${forecastCard(d)}</div>
      ${breakdownCard(d)}
      ${mrrCard(d)}
      ${coachesCard(d)}
      ${funnelCard(d)}
      ${aiCard(d)}
      ${clientsCard(d)}
    </div>
    <p class="tiny faint" style="text-align:center">Forecasts are estimates from OneJump’s own recent history, not a promise. Days and months follow ${esc(d.timezone)}.${vsLast != null ? ` Last month’s plan revenue: ${money(f.lastMonth.total)}.` : ''}</p>`;
}
