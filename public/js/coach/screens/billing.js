// Plan & billing (prototype V.billing): what the coach pays OneJump.
import { api } from '../../shared/api.js';
import { esc, money, fmtFullDate, plural, planName } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { toast, toastError, busy, confirmDialog } from '../../shared/ui.js';
import { state } from '../state.js';
import { renderShell } from '../shell.js';

const RANK = { STARTER: 1, PRO: 2, STUDIO: 3 };
const F = [
  ['Clients', '15', '50', '150'], ['Coaches', '1', '1', '2 (V2)'],
  ['Workouts, programs, library', '✓', '✓', '✓'], ['Client app, logging, progress photos', '✓', '✓', '✓'], ['Check-ins with Assist summaries', '✓', '✓', '✓'], ['Messaging with Assist drafts', '✓', '✓', '✓'], ['Payments (no OneJump fee)', '✓', '✓', '✓'], ['Automation templates', '5', '5 (custom in V2)', '5 (custom in V2)'],
  ['Retention radar', '—', '✓', '✓'], ['Assist workout builder', '✓', '✓', '✓'], ['Leads and booking page', '—', '✓', '✓'], ['Custom branding', '—', '✓', '✓'], ['Support', 'Email', 'Email + chat', 'Priority'],
];

export default {
  nav: 'billing',
  title: () => 'Plan & billing',
  load: () => api.get('/api/billing'),
  async mount(_r, _d, params, ctx) {
    const q = params.query || {};
    if (q.checkout === 'cancelled') toast('Checkout cancelled. Nothing was charged.');
    if (q.portal === 'mock') toast('Test mode: the Stripe billing portal opens here once Stripe keys are added.');
    if (q.upgraded || q.checkout === 'done') {
      toast(q.upgraded ? `You’re on ${planName(q.upgraded)}. Thanks!` : 'Thanks! Your plan is active.');
      state.me = await api.get('/api/auth/me'); renderShell();
      ctx.navigate('/app/billing', { replace: true });
    }
  },
  render(d) {
    const cur = d.plan, eff = d.effectivePlan, trial = cur === 'TRIAL';
    const owner = state.me.role === 'OWNER';
    const cap = d.clients.cap, n = d.clients.active;
    const price = trial ? 0 : d.prices[cur] || 0;
    return `<div class="page-head"><div><h1 class="h1">Plan & billing</h1><p class="sub">What you pay OneJump</p></div></div>
    ${d.provider === 'mock' ? '<div class="notice small">Test mode: plan changes are simulated until Stripe keys are added.</div>' : ''}
    ${!owner ? '<div class="notice small">Only the workspace owner can change the plan.</div>' : ''}
    <div class="split">
      <section class="card pad stack s16"><div class="row between wrap"><div><div class="eyebrow">Current plan</div><div class="h1" style="margin-top:4px">${trial ? 'Pro trial' : planName(cur)}</div></div><div style="text-align:right">${trial ? `<div class="big-num">${d.trialDaysLeft}</div><div class="tiny muted">${d.trialDaysLeft === 1 ? 'day' : 'days'} left</div>` : `<div class="big-num">${money(price)}</div><div class="tiny muted">per month</div>`}</div></div>
        <div class="small muted">${trial ? (d.trialDaysLeft ? `Your trial ends ${fmtFullDate(d.trialEndsAt)}. No card needed until you pick a plan. After that the workspace keeps working on Starter limits.` : 'Your trial has ended. You’re on Starter limits until you pick a plan.') : d.cancelAtPeriodEnd ? `<b>Cancels ${d.renewsAt ? fmtFullDate(d.renewsAt) : 'at the end of the period'}.</b> You can resume any time before then.` : d.renewsAt ? `Renews ${fmtFullDate(d.renewsAt)}` : 'Active'}${!trial && owner ? ' · <button class="link" data-act="portal">Update card or download receipts</button>' : ''}</div>
        <div class="stack s8"><div class="row between small"><span>Active clients</span><span class="strong">${n} of ${cap}</span></div><div class="bar ${n > cap ? 'crit' : n / cap > 0.8 ? 'warn' : ''}"><i style="width:${Math.min(100, (n / cap) * 100)}%"></i></div>${n > cap ? `<div class="pill crit" style="align-self:flex-start;height:auto;white-space:normal;padding:6px 10px">Over the ${planName(eff)} limit. Existing clients keep working; new invites need a bigger plan.</div>` : ''}</div>
        <div class="stack s8"><div class="row between small"><span>Assist actions this month</span><span class="strong">${d.aiActions.used} · included</span></div><div class="bar"><i style="width:${Math.min(100, (d.aiActions.used / d.aiActions.allowance) * 100)}%"></i></div><div class="tiny faint">Fair-use allowance of ${d.aiActions.allowance.toLocaleString()} per month. You’ll never be charged extra without asking.</div></div>
        ${d.cancelAtPeriodEnd && owner ? '<div><button class="btn primary sm" data-act="resume">Resume plan</button></div>' : ''}
      </section>
      <section class="card"><div class="card-head"><div class="h3">Invoices</div></div><div class="list">${d.invoices.length ? d.invoices.map(i => `<div class="li"><div class="grow small">${fmtFullDate(i.date)}</div><span class="num small">${money(i.amountCents, 2)}</span><span class="pill ${i.status === 'paid' ? 'good' : 'warn'}">${esc(i.status === 'paid' ? 'Paid' : i.status)}</span>${i.url ? `<a class="btn ghost xs" href="${esc(i.url)}" target="_blank" rel="noopener">PDF</a>` : ''}</div>`).join('') : '<div class="pad-sm small muted">No invoices yet. You haven’t been charged.</div>'}</div></section>
    </div>
    <section class="card table-wrap"><table class="t"><thead><tr><th style="min-width:220px">Compare plans</th>${['STARTER', 'PRO', 'STUDIO'].map(p => `<th style="text-align:center;min-width:140px"><div class="stack s4" style="align-items:center;text-transform:none;letter-spacing:0"><span class="h3" style="color:var(--ink)">${planName(p)}</span><span class="small muted">${money(d.prices[p])}/mo</span>${!trial && cur === p ? '<span class="pill assist">Current</span>' : owner ? `<button class="btn xs ${trial || RANK[p] > RANK[cur] ? 'primary' : ''}" data-act="choosePlan" data-plan="${p}">${trial ? 'Choose' : RANK[p] > RANK[cur] ? 'Upgrade' : 'Switch'}</button>` : ''}</div></th>`).join('')}</tr></thead>
      <tbody>${F.map(r => `<tr><td class="small strong">${r[0]}</td>${r.slice(1).map(v => `<td class="small" style="text-align:center;color:${v === '—' ? 'var(--faint)' : 'inherit'}">${v === '✓' ? `<span style="color:var(--good)" aria-label="Included">${icon('check')}</span>` : v}</td>`).join('')}</tr>`).join('')}
      <tr><td class="small strong">Free trial</td><td class="small" colspan="3" style="text-align:center">14 days of Pro for every new workspace, no card</td></tr></tbody></table></section>
    ${!trial && owner && !d.cancelAtPeriodEnd ? '<div class="row"><button class="link small" data-act="cancelPlan" style="color:var(--muted)">Cancel subscription</button></div>' : ''}`;
  },
  actions: {
    async choosePlan(el, _e, ctx) {
      const p = el.dataset.plan;
      if (ctx.data.clients.active > { STARTER: 15, PRO: 50, STUDIO: 150 }[p]) {
        if (!await confirmDialog({ title: `Switch to ${planName(p)}?`, body: `<p class="small">You have ${plural(ctx.data.clients.active, 'active client')}, more than ${planName(p)} allows. Existing clients keep working, but you can’t invite new ones until you’re under the limit.</p>`, confirm: 'Switch anyway' })) return;
      }
      busy(el, true, '…');
      try { const r = await api.post('/api/billing/checkout', { plan: p }); if (r.mock) ctx.navigate(new URL(r.url).pathname + new URL(r.url).search, { replace: true }); else location.href = r.url; }
      catch (e) { busy(el, false); toastError(e); }
    },
    async portal() { try { const r = await api.post('/api/billing/portal'); if (r.url) location.href = r.url; } catch (e) { toastError(e); } },
    async cancelPlan(_el, _e, ctx) {
      if (!await confirmDialog({ title: 'Cancel your OneJump subscription?', body: '<p class="small">Your plan stays active until the end of the billing period. After that the workspace is read-only for 30 days so you can export everything, and your clients’ app stops working.</p>', confirm: 'Cancel at period end', danger: true })) return;
      try { await api.post('/api/billing/cancel'); toast('Your plan will end at the end of the period. You can resume any time before then.'); ctx.refresh(); } catch (e) { toastError(e); }
    },
    async resume(_el, _e, ctx) { try { await api.post('/api/billing/resume'); toast('Welcome back. Your plan continues.'); ctx.refresh(); } catch (e) { toastError(e); } },
  },
};
