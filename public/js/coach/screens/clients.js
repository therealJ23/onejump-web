// Clients: cards or table, filters, search, sort (prototype V.clients).
import { api } from '../../shared/api.js';
import { esc, rel, money, interval } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { avatar, statusPill, payPill, emptyState, small } from '../../shared/components.js';
import { ui, setUi } from '../state.js';

const FILTERS = [
  ['all', 'All', () => true],
  ['active', 'Active', c => c.status === 'ACTIVE'],
  ['risk', 'At risk', c => c.risk && c.risk.level !== 'LOW' && ['ACTIVE', 'NEW'].includes(c.status)],
  ['new', 'New', c => c.status === 'NEW'],
  ['due', 'Check-in due', c => c.checkin === 'missing'],
  ['pay', 'Payment problem', c => c.payStatus === 'failed'],
  ['inactive', 'Inactive', c => c.status === 'PAUSED' || c.status === 'INACTIVE'],
];
const SORTS = { risk: (a, b) => (b.risk?.score ?? -1) - (a.risk?.score ?? -1), name: (a, b) => a.name.localeCompare(b.name), workout: (a, b) => new Date(a.lastWorkoutAt || 0) - new Date(b.lastWorkoutAt || 0), adherence: (a, b) => (a.adherence ?? 101) - (b.adherence ?? 101) };
const barCls = a => (a == null ? '' : a < 60 ? 'crit' : a < 75 ? 'warn' : '');
const checkinCell = c => c.checkin === 'review' ? `<span style="color:var(--assist-ink)">Needs review</span>` : c.checkin === 'missing' ? `<span style="color:var(--warn)">Missing</span>` : c.checkin === 'notdue' ? 'Not due yet' : rel(c.lastCheckinAt);

function filtered(d, params) {
  const f = params.query?.filter || ui('cfilter', 'all');
  const q = ui('cq', '').toLowerCase();
  const fn = (FILTERS.find(x => x[0] === f) || FILTERS[0])[2];
  return d.clients.filter(fn).filter(c => !q || `${c.name} ${c.goal || ''} ${c.email || ''}`.toLowerCase().includes(q)).sort(SORTS[ui('csort', 'risk')]);
}

function card(c) {
  const p = c.program;
  return `<a class="card cc" href="/app/clients/${c.id}">
    <div class="row">${avatar(c, 'md')}<div class="grow" style="min-width:0"><div class="h3">${esc(c.name)}</div><div class="tiny muted">${esc(c.mode)}${c.plan ? ' · ' + esc(c.plan.name) : ''}</div></div>${statusPill(c)}</div>
    <div class="small clamp2" style="min-height:2.9em">${small(icon('target'))} ${esc(c.goal || 'No goal set yet')}</div>
    ${p ? `<div class="stack s4"><div class="row between tiny"><span class="strong">${esc(p.name)}</span><span class="muted">Week ${p.week} of ${p.weeks}</span></div><div class="bar"><i style="width:${Math.min(100, p.week / p.weeks * 100)}%"></i></div></div>` : `<div class="tiny muted">${c.invited ? 'Invite sent · no program yet' : 'No program assigned'}</div>`}
    <dl class="meta" style="margin:0">
      <div><dt>Last workout</dt><dd>${rel(c.lastWorkoutAt)}</dd></div>
      <div><dt>Last check-in</dt><dd>${checkinCell(c)}</dd></div>
      <div><dt>Adherence</dt><dd class="row" style="gap:6px">${c.adherence == null ? '—' : `<span class="bar ${barCls(c.adherence)}" style="width:54px;display:inline-block"><i style="width:${c.adherence}%"></i></span>${c.adherence}%`}</dd></div>
      <div><dt>Payment</dt><dd>${payPill(c.payStatus)}</dd></div>
    </dl>
  </a>`;
}
function table(list) {
  return `<div class="card table-wrap"><table class="t"><thead><tr><th>Client</th><th>Goal</th><th>Program</th><th>Last workout</th><th>Last check-in</th><th>Adherence</th><th>Status</th><th>Payment</th></tr></thead><tbody>
    ${list.map(c => `<tr class="click" data-go="/app/clients/${c.id}"><td><a class="row" href="/app/clients/${c.id}">${avatar(c, 'sm')}<span class="strong nowrap">${esc(c.name)}</span></a></td><td class="small muted" style="max-width:220px">${esc(c.goal || '—')}</td><td class="small nowrap">${c.program ? `${esc(c.program.name)} · W${c.program.week}` : '—'}</td><td class="small nowrap">${rel(c.lastWorkoutAt)}</td><td class="small nowrap">${checkinCell(c)}</td><td>${c.adherence == null ? '—' : `<div class="row" style="gap:8px"><div class="bar ${barCls(c.adherence)}" style="width:60px"><i style="width:${c.adherence}%"></i></div><span class="small num">${c.adherence}%</span></div>`}</td><td>${statusPill(c)}</td><td>${payPill(c.payStatus)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function results(list, d) {
  if (!d.clients.length) return `<div class="card">${emptyState('users', 'No clients yet', 'Invite your first client, import a CSV from your old app, or load sample clients to try everything.', `<div class="row wrap" style="justify-content:center"><button class="btn primary" data-act="invite">${icon('plus')} Invite client</button><button class="btn" data-act="importCsv">${icon('upload')} Import CSV</button><button class="btn" data-act="loadSample">Load sample clients</button></div>`)}</div>`;
  if (!list.length) return `<div class="card">${emptyState('users', 'No clients match', 'Try another filter, or invite a client.')}</div>`;
  return ui('cview', 'grid') === 'list' ? table(list) : `<div class="client-grid">${list.map(card).join('')}</div>`;
}

export default {
  nav: 'clients',
  title: () => 'Clients',
  load: () => api.get('/api/clients'),
  render(d, params) {
    const f = params.query?.filter || ui('cfilter', 'all');
    const active = d.clients.filter(c => ['ACTIVE', 'NEW'].includes(c.status)).length;
    const sort = ui('csort', 'risk'), view = ui('cview', 'grid');
    return `
    <div class="page-head"><div><h1 class="h1">Clients</h1><p class="sub">${active} active · ${d.clients.length} total</p></div>
      <div class="row wrap"><button class="btn" data-act="importCsv">${icon('upload')} Import CSV</button><button class="btn primary" data-act="invite">${icon('plus')} Invite client</button></div></div>
    <div class="chips" role="tablist" aria-label="Filter clients">${FILTERS.map(([k, l, fn]) => `<button class="chip ${f === k ? 'on' : ''}" role="tab" aria-selected="${f === k}" data-act="cFilter" data-f="${k}">${l}<span class="count">${d.clients.filter(fn).length}</span></button>`).join('')}</div>
    <div class="row wrap">
      <div class="search grow" style="max-width:360px"><label class="sr" for="c-search">Search clients</label>${icon('search')}<input class="input" id="c-search" placeholder="Search by name or goal" value="${esc(ui('cq', ''))}" data-input="cSearch" autocomplete="off"></div>
      <div class="grow"></div>
      <label class="row small muted" for="c-sort">Sort <select class="select" id="c-sort" style="width:auto;min-height:36px" data-change="cSort">${[['risk', 'Risk'], ['name', 'Name'], ['workout', 'Last workout'], ['adherence', 'Adherence']].map(([k, l]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="seg" role="group" aria-label="View"><button class="${view === 'grid' ? 'on' : ''}" data-act="cView" data-v="grid" aria-label="Cards" aria-pressed="${view === 'grid'}">${small(icon('grid'), 16)}</button><button class="${view === 'list' ? 'on' : ''}" data-act="cView" data-v="list" aria-label="Table" aria-pressed="${view === 'list'}">${small(icon('list'), 16)}</button></div>
    </div>
    <div id="client-results">${results(filtered(d, params), d)}</div>`;
  },
  actions: {
    cFilter(el, _e, ctx) { setUi('cfilter', el.dataset.f); ctx.navigate(`/app/clients${el.dataset.f === 'all' ? '' : `?filter=${el.dataset.f}`}`, { replace: true, keepScroll: true }); },
    cView(el, _e, ctx) { setUi('cview', el.dataset.v); ctx.rerender(); },
    cSort(el, _e, ctx) { setUi('csort', el.value); ctx.rerender(); },
    async loadSample(el, _e, ctx) {
      el.disabled = true; el.textContent = 'Loading sample clients…';
      await api.post('/api/onboarding/sample-data');
      ctx.refresh();
    },
  },
  inputs: {
    cSearch(el, _e, ctx) { setUi('cq', el.value); document.getElementById('client-results').innerHTML = results(filtered(ctx.data, ctx.params), ctx.data); },
  },
  _u: [money, interval],
};
