// Payments (prototype V.payments): Stripe Connect status, KPIs, failed payments with
// retry / card-update reminder, recent payments, packages.
import { api } from '../../shared/api.js';
import { esc, money, plural, fmtDate, interval } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { avatar, payPill, emptyState } from '../../shared/components.js';
import { toast, toastError, busy, confirmDialog } from '../../shared/ui.js';
import { state } from '../state.js';
import { newPackage } from '../modals.js';
import { refreshCounts } from '../shell.js';
import { loadBusiness, revenueCard, packagesCard } from '../businessCharts.js';

const dateOf = p => p.paidAt || p.failedAt || p.dueAt || p.createdAt;

function connectCard(d) {
  const st = d.connect?.status;
  const owner = state.me.role === 'OWNER';
  if (st === 'active') return `<section class="card pad stack s8"><div class="row between"><div class="h3">Payouts</div><span class="pill good">Stripe connected</span></div><div class="small muted">Payouts go straight to your bank on Stripe’s schedule. OneJump takes no cut of client payments; Stripe’s card fees apply.</div>${d.provider === 'mock' ? '<div class="tiny faint">Test mode: payments are simulated until Stripe keys are added.</div>' : `<div><button class="btn sm" data-act="stripeDash">${icon('external')} Open Stripe dashboard</button></div>`}<div class="tiny faint">Card data stays with Stripe. OneJump never sees card numbers.</div></section>`;
  return `<section class="card pad stack s8" style="border-color:var(--assist-ink)"><div class="row between"><div class="h3">Get paid by clients</div><span class="pill ${st === 'pending' || st === 'restricted' ? 'warn' : ''}">${st === 'pending' ? 'Finish setup' : st === 'restricted' ? 'Needs info' : 'Not connected'}</span></div><div class="small muted">Connect a Stripe account (about 5 minutes). Clients pay in the app; money goes to your bank. OneJump takes no cut.</div>${owner ? `<div><button class="btn primary sm" data-act="connect">${icon('card')} ${st ? 'Continue Stripe setup' : 'Connect Stripe'}</button></div>` : '<div class="tiny muted">Ask the workspace owner to connect Stripe.</div>'}</section>`;
}

export default {
  nav: 'payments',
  title: () => 'Payments',
  load: async () => { const [d, biz] = await Promise.all([api.get('/api/payments'), loadBusiness()]); return { ...d, biz }; },
  mount(_root, _d, params) { if (params.query?.connect === 'done') toast('Stripe connected. You can take payments now.'); },
  render(d) {
    const s = d.summary;
    const failed = d.payments.filter(p => p.status === 'failed');
    const order = { upcoming: 0, failed: 1, pending: 2, paid: 3, refunded: 4 };
    const recent = d.payments.slice().sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5) || new Date(dateOf(b)) - new Date(dateOf(a))).slice(0, 30);
    return `
    <div class="page-head"><div><h1 class="h1">Payments</h1><p class="sub">Through your Stripe account · OneJump takes no cut of client payments</p></div><div class="row wrap"><button class="btn" data-act="exportCsv">${icon('download')} Export CSV</button><button class="btn primary" data-act="newPackageHere">${icon('plus')} New package</button></div></div>
    ${d.provider === 'mock' ? '<div class="notice row small">' + icon('card') + '<span><b>Test mode.</b> No real money moves until Stripe keys are added. Everything else works the same.</span></div>' : ''}
    <section class="kpis">
      <div class="kpi"><span class="eyebrow">Monthly recurring</span><span class="big-num">${money(s.mrrCents)}</span><span class="tiny muted">${plural(s.payingClients, 'paying client')}</span></div>
      <div class="kpi"><span class="eyebrow">Collected this month</span><span class="big-num">${money(s.collectedCents)}</span><span class="tiny muted">${plural(s.collectedCount, 'payment')}</span></div>
      <div class="kpi"><span class="eyebrow">Failed</span><span class="big-num" style="color:${s.failedCount ? 'var(--crit)' : 'inherit'}">${money(s.failedCents)}</span><span class="tiny muted">${plural(s.failedCount, 'payment')}</span></div>
      <div class="kpi"><span class="eyebrow">Average per client</span><span class="big-num">${money(s.avgPerClientCents)}</span><span class="tiny muted">per month</span></div>
    </section>
    ${d.biz ? `<div class="biz-grid">${revenueCard(d.biz)}${packagesCard(d.biz)}</div>` : ''}
    ${failed.length ? `<section class="card" style="border-color:var(--crit)"><div class="card-head"><div class="h3" style="color:var(--crit)">${icon('alert')} Failed payments</div><span class="tiny muted">Stripe retries automatically on days 3, 5 and 7</span></div>
      <div class="list">${failed.map(p => `<div class="li sev crit" style="flex-wrap:wrap">${avatar(p.client || { name: '?' }, 'sm')}<div class="grow" style="min-width:180px"><div class="strong small">${esc(p.client?.name || 'Client')} · ${money(p.amountCents)}</div><div class="tiny muted">${esc(p.failureReason || 'Payment failed')} · ${fmtDate(dateOf(p))} · ${plural(p.attempts || 1, 'attempt')}${p.remindedAt ? ' · <b>reminder sent</b>' : ''}</div></div><div class="row wrap"><button class="btn sm" data-act="payRetry" data-p="${p.id}">${icon('refresh')} Retry now</button><button class="btn sm ${p.remindedAt ? '' : 'primary'}" data-act="payRemind" data-p="${p.id}" ${p.remindedAt ? 'disabled' : ''}>${p.remindedAt ? 'Reminder sent' : 'Send card-update reminder'}</button>${p.client ? `<a class="btn ghost sm" href="/app/inbox/${p.client.id}">Message</a>` : ''}</div></div>`).join('')}</div></section>` : ''}
    <div class="split">
      <section class="card"><div class="card-head"><div class="h3">Recent payments</div></div>
        ${recent.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Client</th><th>Date</th><th class="r">Amount</th><th>Status</th></tr></thead><tbody>
        ${recent.map(p => `<tr ${p.client ? `class="click" data-go="/app/clients/${p.client.id}/payments"` : ''}><td><div class="row">${avatar(p.client || { name: '?' }, 'xs')}<div style="min-width:0"><div class="small strong nowrap">${esc(p.client?.name || 'Deleted client')}</div><div class="tiny muted nowrap">${esc(p.plan || '')}</div></div></div></td><td class="small nowrap">${fmtDate(dateOf(p))}</td><td class="r num small">${money(p.amountCents)}</td><td>${p.status === 'upcoming' ? `<span class="pill warn">Due ${fmtDate(p.dueAt)}</span>` : payPill(p.status)}</td></tr>`).join('')}</tbody></table></div>`
        : emptyState('card', 'No payments yet', 'Create a package, then send it to a client from their profile. They pay in the app.')}</section>
      <div class="stack s16">
        <section class="card"><div class="card-head"><div class="h3">Packages & memberships</div><button class="btn ghost sm" data-act="newPackageHere" aria-label="New package">${icon('plus')}</button></div>
          <div class="list">${d.plans.map(k => `<div class="li" style="${k.active ? '' : 'opacity:.55'}"><div class="grow" style="min-width:0"><div class="strong small">${esc(k.name)}${k.active ? '' : ' <span class="tag">Hidden</span>'}</div><div class="tiny muted">${esc(k.description || '')}</div></div><div class="stack s4" style="align-items:flex-end"><span class="small strong num">${k.priceCents ? money(k.priceCents) + interval(k) : 'Free'}</span><span class="tiny faint">${plural(k.clients, 'client')}</span></div><button class="btn ghost icon xs" data-act="pkgToggle" data-id="${k.id}" data-on="${k.active}" aria-label="${k.active ? 'Hide' : 'Show'} ${esc(k.name)}" title="${k.active ? 'Hide from new sales' : 'Show again'}">${icon(k.active ? 'eyeOff' : 'refresh')}</button></div>`).join('') || '<div class="pad-sm small muted">No packages yet.</div>'}</div></section>
        ${connectCard(d)}
      </div>
    </div>`;
  },
  actions: {
    newPackageHere() { newPackage(); },
    async connect(el) {
      busy(el, true, 'Opening Stripe…');
      try { const r = await api.post('/api/payments/connect'); location.href = r.url; } catch (e) { busy(el, false); toastError(e); }
    },
    async stripeDash() { window.open('https://dashboard.stripe.com/', '_blank', 'noopener'); },
    async payRetry(el, _e, ctx) {
      busy(el, true, 'Retrying…');
      try { const r = await api.post(`/api/payments/${el.dataset.p}/retry`); toast(r.ok ? 'Payment succeeded' : r.error || 'Still failing. The client needs to update their card.', { error: !r.ok }); refreshCounts(); ctx.refresh(); }
      catch (e) { busy(el, false); toastError(e); }
    },
    async payRemind(el, _e, ctx) {
      busy(el, true, 'Sending…');
      try { await api.post(`/api/payments/${el.dataset.p}/remind`); toast('Card-update reminder sent'); refreshCounts(); ctx.refresh(); }
      catch (e) { busy(el, false); toastError(e); }
    },
    async pkgToggle(el, _e, ctx) {
      const on = el.dataset.on === 'true';
      if (on && !await confirmDialog({ title: 'Hide this package?', body: '<p class="small">Clients already on it keep paying. You just can’t sell it to new clients.</p>', confirm: 'Hide' })) return;
      try { await api.patch(`/api/payments/plans/${el.dataset.id}`, { active: !on }); toast(on ? 'Package hidden' : 'Package visible again'); ctx.refresh(); } catch (e) { toastError(e); }
    },
    exportCsv(_el, _e, ctx) {
      const rows = [['Client', 'Package', 'Date', 'Amount (USD)', 'Status', 'Failure reason']].concat(ctx.data.payments.map(p => [p.client?.name || '', p.plan || '', new Date(dateOf(p)).toISOString().slice(0, 10), (p.amountCents / 100).toFixed(2), p.status, p.failureReason || '']));
      const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `onejump-payments-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
  },
};
