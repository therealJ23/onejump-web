// Business: how the coaching business is doing, with a realistic forecast for this month.
// Data from GET /api/today/insights (server/core/businessInsights.js). Every chart has a legend
// or direct labels, values on hover, and the forecast has a table that explains each piece.
import { api } from '../../shared/api.js';
import { esc, money, plural } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { t } from '../../shared/i18n.js';
import { forecastChart, revenueColumns, flowChart, engagementChart, legend, moneyShort } from '../insightCharts.js';

const card = (title, sub, body, note = '', extra = '') => `<section class="card pad stack s8 ins-card" ${extra}><div class="row between" style="align-items:baseline;gap:8px;flex-wrap:wrap"><h2 class="h3">${title}</h2>${sub ? `<span class="tiny muted">${sub}</span>` : ''}</div>${body}${note ? `<p class="tiny faint">${note}</p>` : ''}</section>`;
const signed = n => (n > 0 ? `+${n}` : String(n));
// Chart drawing sizes close to the space they get, so their text stays readable (phone vs desktop).
const narrow = () => typeof window !== 'undefined' && window.innerWidth < 760;
const wide = () => (narrow() ? { W: 400, H: 250 } : { W: 920, H: 300 });
const half = (h = 220) => (narrow() ? { W: 400, H: h } : { W: 480, H: h });
const kpi = (label, value, sub, tone = '') => `<div class="kpi"><span class="eyebrow">${label}</span><span class="big-num ${tone}">${value}</span><span class="tiny muted">${sub}</span></div>`;

function takeaways(d) {
  const items = d.takeaways.map(x => {
    switch (x.kind) {
      case 'pace': return [x.changePct >= 0 ? 'chart' : 'alert', t('On pace for about {v} this month, {c}% vs last month.', { v: money(x.cents), c: signed(x.changePct) }), x.changePct >= 0 ? 'good' : 'warn'];
      case 'risk': return ['alert', t('{v} a month comes from {n} at high risk of leaving ({names}). A personal message this week can save it.', { v: money(x.cents), n: plural(x.clients, t('client'), t('clients')), names: x.names.join(', ') }), 'crit', '/app/clients?filter=risk'];
      case 'failed': return ['card', t('{v} in failed payments is being retried ({n}). A card-update reminder usually recovers about half.', { v: money(x.cents), n: plural(x.count, t('payment'), t('payments')) }), 'warn', '/app/payments'];
      case 'source': return ['funnel', t('{s} brings your best leads: {w} of {l} became clients.', { s: t(x.source), w: x.won, l: x.leads }), 'good', '/app/leads'];
      case 'checkinsDown': return ['clipboard', t('Check-ins dropped from {a}% to {b}% in the last two weeks.', { a: x.from, b: x.to }), 'warn', '/app/checkins'];
      case 'pipeline': return ['users', t('{n} in consult or trial, worth {v} a month if they join.', { n: plural(x.leads, t('lead'), t('leads')), v: money(x.cents) }), 'info', '/app/leads'];
      default: return null;
    }
  }).filter(Boolean);
  if (!items.length) return '';
  return `<section class="card pad stack s12 stand-out"><h2 class="h3">${icon('target')} What stands out</h2><ul class="stack s8 ul-plain">${items.map(([ic, text, tone, href]) => `<li class="row" style="align-items:flex-start;gap:10px"><span class="ti ${tone}">${icon(ic)}</span><span class="small grow">${esc(text)}</span>${href ? `<a class="btn ghost xs" href="${href}">${t('Open')} ${icon('chevR')}</a>` : ''}</li>`).join('')}</ul></section>`;
}

function forecastCard(d) {
  const f = d.forecast, m = d.month;
  const vsLast = f.lastMonth.sameDay ? Math.round((f.collected - f.lastMonth.sameDay) / f.lastMonth.sameDay * 100) : null;
  const sub = m.daysLeft ? t('{n} days left', { n: m.daysLeft }) : t('Last day of the month');
  const body = `${legend([{ label: t('Collected'), kind: 'line' }, ...(m.daysLeft ? [{ label: t('Expected'), kind: 'dash' }, { label: t('Likely range'), kind: 'band' }] : []), ...(f.lastMonth.total ? [{ label: t('Last month'), kind: 'ref', tone: 'ref' }] : [])])}
    ${forecastChart({ month: m, curve: f.curve, lastMonth: f.lastMonth.curve, ...wide() })}
    ${vsLast != null ? `<p class="small"><b>${money(f.collected)}</b> ${t('collected by today')} · ${t('{c}% vs the same day last month', { c: signed(vsLast) })}</p>` : ''}`;
  return card(`${icon('chart')} ${t('This month')}: ${t('{m} forecast', { m: t(m.label) })}`, sub, body, t('Hover a day to see what was collected or expected. The shaded area is the likely range.'), 'id="ins-forecast"');
}

function breakdownCard(d) {
  const f = d.forecast;
  const row = (label, sub, k, show = true) => (show ? `<tr><td><div class="small strong">${label}</div>${sub ? `<div class="tiny muted">${sub}</div>` : ''}</td><td class="r num">${money(f.low[k])}</td><td class="r num strong">${money(f.base[k])}</td><td class="r num">${money(f.high[k])}</td></tr>` : '');
  const rate = f.rateFromHistory ? t('{p}% of your charges went through in the last 90 days.', { p: f.collectionRate }) : t('Not enough payment history yet, so we assume {p}% of charges go through.', { p: f.collectionRate });
  const table = `<div class="table-wrap"><table class="t breakdown"><caption class="sr">${t('How the forecast is built')}</caption><thead><tr><th>${t('Piece')}</th><th class="r">${t('Low')}</th><th class="r">${t('Expected')}</th><th class="r">${t('High')}</th></tr></thead><tbody>
    <tr><td><div class="small strong">${t('Collected so far')}</div><div class="tiny muted">${t('Money already in')}</div></td><td class="r num">${money(f.collected)}</td><td class="r num strong">${money(f.collected)}</td><td class="r num">${money(f.collected)}</td></tr>
    ${row(t('Renewals before month end'), plural(f.renewals.count, t('membership'), t('memberships')), 'renewals', f.renewals.count > 0)}
    ${row(t('Scheduled payments'), plural(f.scheduled.count, t('payment'), t('payments')), 'scheduled', f.scheduled.count > 0)}
    ${row(t('Failed payments being retried'), t('{v} outstanding', { v: money(f.failed.cents) }), 'recovered', f.failed.count > 0)}
    ${row(t('Trials converting'), plural(f.trials.count, t('trial'), t('trials')), 'trials', f.trials.count > 0)}
    ${row(t('New clients at your usual pace'), t('About {v} a month in first payments lately', { v: money(f.newPerMonthCents) }), 'newClients', f.newPerMonthCents > 0)}
    </tbody><tfoot><tr><td>${t('Month total')}</td><td class="r num">${money(f.low.total)}</td><td class="r num strong">${money(f.base.total)}</td><td class="r num">${money(f.high.total)}</td></tr></tfoot></table></div>`;
  const how = `<ul class="tiny muted ul-plain stack s4"><li>${esc(rate)}</li><li>${t('Low: charges go through a bit less often, no failed payment is recovered, new clients come at half your usual pace.')}</li><li>${t('High: every charge goes through, every failed payment is recovered, new clients come 50% faster.')}</li><li>${t('Only money expected this month counts. Memberships that renew next month are not included.')}</li></ul>`;
  return card(`${icon('list')} ${t('How the forecast is built')}`, '', table + how, '', 'id="ins-breakdown"');
}

function revenueCard(d) {
  // Skip empty months at the start (a new business), but always show at least 6.
  const firstPaid = d.revenue.findIndex(r => r.cents > 0);
  const from = Math.max(0, Math.min(firstPaid < 0 ? 6 : firstPaid, d.revenue.length - 6));
  const months = d.revenue.slice(from);
  const total = months.slice(0, -1).reduce((a, r) => a + r.cents, 0);
  const avg = months.length > 1 ? Math.round(total / (months.length - 1)) : 0;
  return card(`${icon('card')} ${t('Revenue by month')}`, avg ? t('{v} a month on average', { v: money(avg) }) : '',
    `${legend([{ label: t('Collected'), kind: 'box' }, { label: t('Still expected this month'), kind: 'hatch' }])}${revenueColumns({ months, expected: d.forecast.base.total, ...half() })}`,
    t('Hover a month to see it.'));
}

function clientsCard(d) {
  const c = d.clients, cur = c.flow.at(-1);
  return card(`${icon('users')} ${t('Clients gained and lost')}`, t('{a} active now · about {p} by month end', { a: c.active, p: c.projectedActive }),
    `${legend([{ label: t('New clients'), kind: 'box' }, { label: t('Clients who left'), kind: 'box', tone: 'neg' }, { label: t('Expected by month end'), kind: 'outline' }])}${flowChart({ flow: c.flow, projGained: c.projectedGained, projLost: c.projectedLost, ...half() })}`,
    cur ? t('This month so far: {g} new, {l} left. Numbers in brackets are what to expect by the end of the month at your recent pace.', { g: cur.gained, l: cur.lost }) : '');
}

function healthCard(d) {
  const c = d.clients;
  const life = c.lifetimeMonths ? t('{n} months', { n: c.lifetimeMonths }) : t('No one left in 90 days');
  return card(`${icon('heart')} ${t('Client value')}`, '', `<div class="mini-kpis">
    <div><span class="tiny muted">${t('Average per client')}</span><b class="num">${money(c.arpc)}</b><span class="tiny faint">${t('per month')}</span></div>
    <div><span class="tiny muted">${t('Monthly churn')}</span><b class="num">${c.churnPct}%</b><span class="tiny faint">${t('of clients leave each month')}</span></div>
    <div><span class="tiny muted">${t('Average stay')}</span><b class="num">${esc(life)}</b><span class="tiny faint">${t('at this churn')}</span></div>
    <div><span class="tiny muted">${t('Lifetime value')}</span><b class="num">${c.ltvCents ? money(c.ltvCents) : '–'}</b><span class="tiny faint">${t('per client, on average')}</span></div>
  </div>`, t('Churn and stay use the last 90 days. Lifetime value = average per client × average stay.'));
}

function riskCard(d) {
  const r = d.risk.mrrByRisk, total = (r.HIGH || 0) + (r.MEDIUM || 0) + (r.LOW || 0);
  if (!total) return card(`${icon('alert')} ${t('Revenue at risk')}`, '', `<div class="empty small" style="padding:24px">${t('Paying memberships show up here by how likely the client is to stay.')}</div>`);
  const seg = (k, cls, label) => (r[k] ? `<i class="${cls}" style="width:${(r[k] / total * 100).toFixed(1)}%" title="${esc(`${label}: ${money(r[k])}`)}"></i>` : '');
  const rows = [['HIGH', 'crit', t('High risk'), 'alert'], ['MEDIUM', 'warn', t('Medium risk'), 'clock'], ['LOW', 'good', t('Low risk'), 'check']];
  return card(`${icon('alert')} ${t('Revenue at risk')}`, t('{v} a month in memberships', { v: money(total) }),
    `<div class="stack-bar" role="img" aria-label="${esc(rows.map(([k, , l]) => `${l}: ${money(r[k] || 0)}`).join(', '))}">${rows.map(([k, cls, l]) => seg(k, cls, l)).join('')}</div>
    <div class="stack s4">${rows.map(([k, cls, l, ic]) => `<div class="row between small"><span class="row" style="gap:6px"><span class="ti ${cls}">${icon(ic)}</span>${l}</span><span class="num strong">${money(r[k] || 0)} <span class="tiny muted">(${Math.round((r[k] || 0) / total * 100)}%)</span></span></div>`).join('')}</div>
    ${d.risk.atRisk.length ? `<div class="stack s4"><span class="eyebrow">${t('Reach out first')}</span>${d.risk.atRisk.map(x => `<a class="row between small link-row" href="/app/clients/${esc(x.id)}"><span>${esc(x.name)}</span><span class="num">${money(x.cents)}${t('/mo')}</span></a>`).join('')}</div>` : ''}`,
    t('Risk comes from Assist’s daily check of workouts, check-ins, messages and payments.'));
}

function leadsCard(d) {
  const l = d.leads;
  if (!l.total90) return card(`${icon('funnel')} ${t('Leads')}`, '', `<div class="empty small" style="padding:24px">${t('Add leads from Instagram, your booking page or referrals to see where your clients come from.')} <a href="/app/leads">${t('Open Leads')}</a></div>`);
  const top = Math.max(1, l.funnel[0].count);
  const funnel = l.funnel.map(s => `<div class="stack s4"><div class="row between small"><span class="strong">${t(s.stage)}</span><span class="num">${s.count} <span class="tiny muted">(${Math.round(s.count / top * 100)}%)</span></span></div><div class="bar" role="img" aria-label="${esc(`${t(s.stage)}: ${s.count}`)}"><i style="width:${Math.max(s.count ? 2 : 0, Math.round(s.count / top * 100))}%"></i></div></div>`).join('');
  const smax = Math.max(1, ...l.sources.map(s => s.leads));
  const sources = l.sources.map(s => `<div class="stack s4"><div class="row between small"><span class="strong">${t(s.source)}</span><span class="tiny muted">${plural(s.leads, t('lead'), t('leads'))} · ${t('{w} became clients', { w: s.won })}</span></div><div class="bar two" role="img" aria-label="${esc(t('{s}: {l} leads, {w} became clients', { s: t(s.source), l: s.leads, w: s.won }))}"><i style="width:${Math.round(s.leads / smax * 100)}%"></i><b style="width:${Math.round(s.won / smax * 100)}%"></b></div></div>`).join('');
  return card(`${icon('funnel')} ${t('Leads, last 90 days')}`, l.pipelineCents ? t('{v}/mo in consult or trial', { v: moneyShort(l.pipelineCents) }) : '',
    `<div class="stack s16"><div class="stack s8"><span class="eyebrow">${t('How far leads get')}</span>${funnel}</div><div class="stack s8"><span class="eyebrow">${t('Where they come from')}</span>${legend([{ label: t('Leads'), kind: 'box', tone: 'soft' }, { label: t('Became clients'), kind: 'box' }])}${sources}</div></div>`);
}

function engagementCard(d) {
  return card(`${icon('clipboard')} ${t('Client engagement')}`, t('by week'),
    `${legend([{ label: t('Sent their check-in'), kind: 'line' }, { label: t('Workouts done'), kind: 'line', tone: 'c3' }])}${engagementChart(d.engagement, half(200))}`,
    t('Share of active clients who sent a check-in, and of scheduled workouts that were logged. This week is still filling up (dashed).'));
}

export default {
  nav: 'business',
  title: () => 'Business insights',
  load: () => api.get('/api/today/insights'),
  render(d) {
    const f = d.forecast, c = d.clients;
    const pctOf = f.base.total ? Math.round(f.collected / f.base.total * 100) : 0;
    const vsLast = f.lastMonth.total ? Math.round((f.base.total - f.lastMonth.total) / f.lastMonth.total * 100) : null;
    return `
    <div class="page-head"><div><h1 class="h1">Business insights</h1><p class="sub">${t('How your coaching business is doing, and what to expect this month')}</p></div><div class="row wrap"><a class="btn" href="/app/payments">${icon('card')} ${t('Payments')}</a></div></div>
    <section class="kpis">
      ${kpi(t('Expected this month'), money(f.base.total), t('Likely {lo} to {hi}', { lo: money(f.low.total), hi: money(f.high.total) }))}
      ${kpi(t('Collected so far'), money(f.collected), t('{p}% of expected', { p: pctOf }))}
      ${kpi(t('Vs last month'), vsLast == null ? '–' : `${signed(vsLast)}%`, f.lastMonth.total ? t('Last month: {v}', { v: money(f.lastMonth.total) }) : t('No payments last month'), vsLast == null ? '' : vsLast >= 0 ? 'up' : 'down')}
      ${kpi(t('Monthly recurring'), money(c.mrr), plural(c.payers, t('paying client'), t('paying clients')))}
      ${kpi(t('Active clients'), String(c.active), t('About {n} by month end', { n: c.projectedActive }))}
      ${kpi(t('Collection rate'), `${f.collectionRate}%`, f.rateFromHistory ? t('of charges go through') : t('assumed until there’s history'))}
      ${kpi(t('Average per client'), money(c.arpc), t('per month'))}
      ${kpi(t('Monthly churn'), `${c.churnPct}%`, c.lifetimeMonths ? t('Clients stay about {n} months', { n: c.lifetimeMonths }) : t('No one left in 90 days'))}
    </section>
    ${takeaways(d)}
    <div class="ins-grid">
      <div class="span2">${forecastCard(d)}</div>
      ${breakdownCard(d)}
      ${revenueCard(d)}
      ${clientsCard(d)}
      ${riskCard(d)}
      ${engagementCard(d)}
      ${leadsCard(d)}
      <div class="span2">${healthCard(d)}</div>
    </div>
    <p class="tiny faint" style="text-align:center">${t('Forecasts are estimates from your own recent history, not a promise. Days and months follow your time zone ({tz}).', { tz: d.timezone })}</p>`;
  },
};
