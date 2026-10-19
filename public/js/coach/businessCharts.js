// "Your business" charts (the same four the iPhone app shows): revenue by month, workout
// adherence by week, monthly revenue by package and active clients. Hover or tab onto a column
// or point to see its value.
import { api } from '../shared/api.js';
import { esc, money, plural } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { columnChart, pointLine } from '../shared/charts.js';
import { t } from '../shared/i18n.js';

// Chart labels are drawn inside SVG, which the page translator skips, so they go through t() here.

export const loadBusiness = () => api.get('/api/today/business').catch(() => null);

const card = (title, sub, body, note = '') => `<section class="card pad stack s8"><div class="row between" style="align-items:baseline"><div class="h3">${title}</div>${sub ? `<span class="tiny muted">${sub}</span>` : ''}</div>${body}${note ? `<p class="tiny faint">${note}</p>` : ''}</section>`;

export function revenueCard(b) {
  const total = b.revenue.reduce((n, r) => n + r.cents, 0);
  return card(`${icon('card')} Revenue by month`, `${money(total)} in 6 months`,
    total ? columnChart({ labels: b.revenue.map(r => t(r.label)), values: b.revenue.map(r => r.cents), fmt: v => money(v), height: 190 }) : '<div class="empty small" style="padding:24px">Payments you collect show up here.</div>',
    'Collected payments. This month so far is highlighted; hover a month to see it.');
}
export function adherenceCard(b) {
  const vals = b.adherence.map(w => w.pct);
  const latest = [...vals].reverse().find(v => v != null);
  return card(`${icon('dumbbell')} Workout adherence`, latest == null ? '' : `${latest}% this week`,
    pointLine({ labels: b.adherence.map((_, i) => (i === b.adherence.length - 1 ? t('This week') : t('{n}w ago', { n: b.adherence.length - 1 - i }))), values: vals, fmt: v => `${v}%`, min: 0, max: 100, height: 170 }),
    'Scheduled workouts that clients logged, across all clients, each week.');
}
export function packagesCard(b) {
  const max = Math.max(1, ...b.packages.map(p => p.cents));
  return card(`${icon('layers')} Revenue by package`, 'per month',
    b.packages.length ? `<div class="stack s16">${b.packages.map(p => `<div class="stack s4 pkg-row"><div class="row between"><span class="small strong">${esc(p.name)}</span><span class="small strong num">${money(p.cents)}</span></div><div class="bar" role="img" aria-label="${esc(`${p.name}: ${money(p.cents)} a month`)}"><i style="width:${Math.round(p.cents / max * 100)}%"></i></div><span class="tiny muted">${plural(p.clients, 'client')}</span></div>`).join('')}</div>` : '<div class="empty small" style="padding:24px">Active memberships show up here by package.</div>');
}
export function clientsCard(b) {
  const now = b.activeClients.at(-1)?.count ?? 0, before = b.activeClients[0]?.count ?? 0;
  return card(`${icon('users')} Active clients`, now - before ? `${now - before > 0 ? '+' : ''}${now - before} in 6 months` : '',
    pointLine({ labels: b.activeClients.map(m => t(m.label)), values: b.activeClients.map(m => m.count), fmt: v => String(v), min: 0, height: 170 }));
}

/** The whole section (Today). */
export function businessSection(b) {
  if (!b) return '';
  return `<section class="stack s12" aria-labelledby="biz-h"><div class="row between"><h2 class="h2" id="biz-h">Your business</h2><a class="btn ghost sm" href="/app/business">Insights & forecast ${icon('chevR')}</a></div>
    <div class="biz-grid">${revenueCard(b)}${adherenceCard(b)}${packagesCard(b)}${clientsCard(b)}</div></section>`;
}
