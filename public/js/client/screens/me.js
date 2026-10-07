// Client: Me (prototype cMe) with billing through the coach's Stripe account, data export
// and log out; plus the test-mode checkout page used when PAYMENTS_PROVIDER=mock.
import { api } from '../../shared/api.js';
import { esc, money, fmtDate, interval } from '../../shared/format.js';
import { icon, wordmark } from '../../shared/icons.js';
import { avatar, payPill } from '../../shared/components.js';
import { toast, toastError } from '../../shared/ui.js';

const per = p => (p.interval === 'once' ? 'one-time' : `per ${p.interval}`);

export default {
  tab: 'me',
  title: () => 'Me',
  load: () => api.get('/api/me/account'),
  mount(_r, _d, params, ctx) { if (params.query?.card === 'mock-updated') { toast('Card updated (test mode). Your coach can retry the payment now.'); ctx.navigate('/client/me', { replace: true }); } },
  render(d) {
    const failed = d.payments.find(p => p.status === 'failed');
    const unpaid = d.plan && d.plan.priceCents && !d.subscription && d.client.payStatus !== 'paid';
    return `<div class="row between" style="padding-top:4px"><span class="h2">Me</span></div>
    <div class="row" style="gap:14px">${avatar({ name: d.client.name, tone: 1 }, 'lg')}<div><div class="h2">${esc(d.client.name)}</div><div class="small muted">Coached by ${esc(d.coach.name)}</div></div></div>
    ${d.client.goal ? `<div class="card pad stack s4"><span class="eyebrow">Goal</span><span>${esc(d.client.goal)}</span></div>` : ''}
    <section class="card pad stack s16" aria-labelledby="bill-h"><div class="row between"><div class="h3" id="bill-h">Billing</div>${payPill(d.client.payStatus)}</div>
      ${failed ? `<div class="notice small">${icon('alert')}<span><b>Your last payment didn’t go through.</b> ${esc(failed.failureReason || '')} Update your card and your coach will retry it.</span></div>` : ''}
      ${d.plan ? `<div class="stack s4"><div class="strong">${esc(d.plan.name)}</div><div class="small muted">${d.plan.priceCents ? `${money(d.plan.priceCents)} ${per(d.plan)}` : 'Free'}${d.subscription?.currentPeriodEnd ? ` · renews ${fmtDate(d.subscription.currentPeriodEnd)}` : ''}</div></div>` : '<p class="small muted">Your coach hasn’t set up a plan for you yet.</p>'}
      <div class="row wrap">${unpaid ? `<button class="btn primary" data-act="pay" data-plan="${d.plan.id}">${icon('card')} Pay ${money(d.plan.priceCents)}</button>` : ''}${d.subscription || failed ? `<button class="btn" data-act="portal">${icon('card')} ${failed ? 'Update card' : 'Manage payment'}</button>` : ''}</div>
      ${d.payments.length ? `<div class="list" style="margin:0 -20px -20px;border-top:1px solid var(--line)">${d.payments.map(p => `<div class="li"><div class="grow small">${fmtDate(p.paidAt || p.createdAt)}</div><span class="num small">${money(p.amountCents)}</span>${payPill(p.status)}</div>`).join('')}</div>` : ''}
      <div class="tiny faint">Payments go to ${esc(d.business.name)} through Stripe. Card details never touch OneJump.${d.provider === 'mock' ? ' Test mode: no real charges.' : ''}</div>
    </section>
    <section class="card list">
      <a class="li click" href="/client/progress">${icon('chart')}<div class="grow"><div class="strong small">Progress and photos</div><div class="tiny muted">Private to you and your coach</div></div>${icon('chevR')}</a>
      <a class="li click" href="/api/me/export" download>${icon('download')}<div class="grow"><div class="strong small">Download my data</div><div class="tiny muted">Workouts, check-ins, messages and measurements (JSON)</div></div>${icon('chevR')}</a>
      <a class="li click" href="mailto:hello@onejumpfit.com?subject=Delete%20my%20OneJump%20account">${icon('shield')}<div class="grow"><div class="strong small">Delete my account</div><div class="tiny muted">Ask your coach, or email us and we’ll remove everything</div></div>${icon('chevR')}</a>
      <button class="li click" style="width:100%;border:0;background:none;text-align:left" data-act="logout">${icon('logout')}<div class="grow"><div class="strong small">Log out</div></div></button>
    </section>
    <div class="row tiny faint" style="justify-content:center;gap:6px">Powered by ${wordmark('height:12px;width:auto;color:var(--faint)')}</div>
    <div class="row tiny faint" style="justify-content:center;gap:12px"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>`;
  },
  actions: {
    async pay(el) {
      el.disabled = true;
      try { const r = await api.post('/api/me/billing/checkout', { clientPlanId: el.dataset.plan }); location.href = r.url; } catch (e) { el.disabled = false; toastError(e); }
    },
    async portal(el) {
      el.disabled = true;
      try { const r = await api.post('/api/me/billing/portal'); location.href = r.url; } catch (e) { el.disabled = false; toastError(e); }
    },
  },
};

/** Test-mode stand-in for Stripe Checkout (only reachable when payments are mocked). */
export const checkout = {
  tab: 'me',
  title: () => 'Checkout',
  async load(params) {
    const acc = await api.get('/api/me/account');
    const plan = acc.plans.find(p => p.id === params.query?.plan) || acc.plan;
    return { acc, plan };
  },
  render(d) {
    if (d.acc.provider !== 'mock') return `<div class="empty">${icon('card')}<div class="h3" style="color:var(--ink)">Checkout opens on Stripe</div><a class="btn" href="/client/me">Back</a></div>`;
    if (!d.plan) return `<div class="empty">${icon('card')}<div class="h3" style="color:var(--ink)">That plan isn’t available</div><a class="btn" href="/client/me">Back</a></div>`;
    return `<div class="row between" style="padding-top:4px"><a class="btn ghost icon sm" href="/client/me" aria-label="Back">${icon('chevL')}</a><span class="strong">Checkout</span><span style="width:32px"></span></div>
    <div class="notice small">${icon('alert')}<span><b>Test mode.</b> This page stands in for Stripe Checkout until real keys are added. No card is charged.</span></div>
    <section class="card pad stack s16"><div class="eyebrow">${esc(d.acc.business.name)}</div><div class="h2">${esc(d.plan.name)}</div><div><span class="big-num">${money(d.plan.priceCents)}</span><span class="muted small"> ${esc(interval(d.plan)) || ''}</span></div>${d.plan.description ? `<p class="small muted">${esc(d.plan.description)}</p>` : ''}
      <div class="field"><label for="co-card">Card number</label><input class="input" id="co-card" value="4242 4242 4242 4242" disabled></div>
      <button class="btn primary lg" data-act="complete" data-plan="${d.plan.id}">Pay ${money(d.plan.priceCents)}</button></section>`;
  },
  actions: {
    async complete(el, _e, ctx) {
      el.disabled = true; el.textContent = 'Paying…';
      try { await api.post('/api/me/billing/mock-complete', { clientPlanId: el.dataset.plan }); toast('Paid. Thanks!'); ctx.navigate('/client/me', { replace: true }); } catch (e) { el.disabled = false; el.textContent = 'Pay'; toastError(e); }
    },
  },
};
