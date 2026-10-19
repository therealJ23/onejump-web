// OneJump internal admin (platform staff only): business-level numbers, never client details.
import { api, setCsrf } from '../shared/api.js';
import { esc, money, plural, rel, planName } from '../shared/format.js';
import { icon, arc, wordmark } from '../shared/icons.js';
import { errorState } from '../shared/components.js';
import { hqInsights } from './insights.js';

const app = document.getElementById('app');
const HEALTH = { Healthy: 'good', 'Payment failed': 'crit', 'Trial ends soon': 'warn', 'Low usage': 'warn', 'Not onboarded': 'info' };
const FEATURE = { checkin: 'Check-in summaries', message: 'Message drafts', risk: 'Risk explanations', workout: 'Workout generation', adjust: 'Program adjustments', progress: 'Progress notes', lead: 'Lead replies' };

async function boot() {
  const me = await api.get('/api/auth/me').catch(() => null);
  if (!me?.user) { location.replace('/login'); return; }
  setCsrf(me.csrfToken);
  if (!me.isPlatformAdmin) { location.replace(me.role === 'CLIENT' ? '/client' : '/app'); return; }
  app.innerHTML = `<div class="pub"><header class="pub-nav"><span style="display:flex;align-items:center;gap:12px">${wordmark()}<span class="tiny" style="opacity:.7;letter-spacing:.08em;text-transform:uppercase">HQ</span></span><span style="display:flex;gap:6px">${me.business ? `<a class="btn ghost sm" style="color:var(--bone)" href="/app">Coach app</a>` : ''}<button class="btn ghost sm" style="color:var(--bone)" id="logout">${icon('logout')} Log out</button></span></header><main class="section"><div class="section-in" id="view" style="gap:20px"><div class="skel" style="height:120px"></div></div></main></div>`;
  document.getElementById('logout').addEventListener('click', async () => { await api.post('/api/auth/logout').catch(() => {}); location.href = '/login'; });
  try {
    const [d, ins] = await Promise.all([api.get('/api/admin/overview'), api.get('/api/admin/insights').catch(() => null)]);
    render(d, ins);
  } catch (e) { document.getElementById('view').innerHTML = errorState(e.message); }
}

function render(d, ins) {
  const k = d.kpis, paying = Math.max(1, k.payingCoaches);
  document.getElementById('view').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">OneJump HQ</div><h1 class="h1" style="margin-top:6px">Platform overview</h1><p class="sub">Month to date · live data · forecast for the rest of the month</p></div></div>
    <section class="kpis">
      <div class="kpi"><span class="eyebrow">MRR</span><span class="big-num">${money(k.mrrCents)}</span><span class="tiny muted">${plural(k.payingCoaches, 'paying coach', 'paying coaches')}</span></div>
      <div class="kpi"><span class="eyebrow">Coaches</span><span class="big-num">${k.coaches}</span><span class="tiny muted">${k.trials} in trial · ${k.newThisMonth} new this month</span></div>
      <div class="kpi"><span class="eyebrow">Clients on platform</span><span class="big-num">${k.clients.toLocaleString()}</span><span class="tiny muted">${k.coaches ? Math.round(k.clients / k.coaches) : 0} per coach</span></div>
      <div class="kpi"><span class="eyebrow">Failed payments</span><span class="big-num" style="color:${k.failedPayments ? 'var(--crit)' : 'inherit'}">${k.failedPayments}</span><span class="tiny muted">${k.canceled} canceled</span></div>
    </section>
    ${hqInsights(ins)}
    <section class="kpis">
      <div class="kpi"><span class="eyebrow">Assist calls</span><span class="big-num">${k.aiCalls.toLocaleString()}</span><span class="tiny muted">this month</span></div>
      <div class="kpi"><span class="eyebrow">AI cost</span><span class="big-num">$${k.aiCostUsd.toFixed(2)}</span><span class="tiny muted">${k.aiPctOfMrr}% of MRR</span></div>
      <div class="kpi"><span class="eyebrow">Drafts approved as-is</span><span class="big-num">${k.approvedAsIs == null ? '—' : k.approvedAsIs + '%'}</span><span class="tiny muted">of decided drafts</span></div>
      <div class="kpi"><span class="eyebrow">Open support</span><span class="big-num">${k.openSupport}</span><span class="tiny muted">requests</span></div>
    </section>
    <div class="grid g2">
      <section class="card pad stack s16"><div class="h3">Plan mix</div>${['STARTER', 'PRO', 'STUDIO'].map(p => `<div class="stack s4"><div class="row between small"><span>${planName(p)}</span><span class="strong">${plural(d.mix[p], 'coach', 'coaches')}</span></div><div class="bar"><i style="width:${(d.mix[p] / paying) * 100}%"></i></div></div>`).join('')}</section>
      <section class="card pad stack s8"><div class="row between"><div class="h3">${arc()} AI usage by feature</div><span class="pill ${k.aiPctOfMrr < 5 ? 'good' : 'warn'}">${k.aiPctOfMrr < 5 ? 'Under 5% of MRR' : 'Over 5% of MRR'}</span></div>${d.aiByFeature.length ? d.aiByFeature.map(f => `<div class="row between small"><span>${esc(FEATURE[f.kind] || f.kind)}</span><span class="num">${f.calls} · $${f.costUsd.toFixed(3)}</span></div>`).join('') : '<p class="small muted">No AI calls yet this month.</p>'}</section>
    </div>
    <section class="card"><div class="card-head"><div class="h3">Coaches</div><span class="pill info">${icon('eyeOff')} Client names and details hidden</span></div><div class="table-wrap"><table class="t"><thead><tr><th>Business</th><th>Owner</th><th>Plan</th><th class="r">Clients</th><th class="r">MRR</th><th>Stripe</th><th>Health</th><th>Last active</th></tr></thead><tbody>
      ${d.coaches.map(c => `<tr><td class="strong small nowrap">${esc(c.business)}</td><td class="small nowrap">${esc(c.owner || '—')}</td><td><span class="pill">${planName(c.plan)}</span></td><td class="r num small">${c.clients}</td><td class="r num small">${money(c.mrrCents)}</td><td class="small">${esc(c.stripe || '—')}</td><td><span class="pill ${HEALTH[c.health] || ''}">${esc(c.health)}</span></td><td class="small muted nowrap">${c.lastActiveAt ? rel(c.lastActiveAt) : '—'}</td></tr>`).join('')}</tbody></table></div></section>
    <div class="grid g2">
      <section class="card"><div class="card-head"><div class="h3">Recent sensitive actions</div></div><div class="list">${d.audit.map(a => `<div class="li"><div class="grow small"><span class="strong">${esc(a.action)}</span>${a.business ? ` · ${esc(a.business)}` : ''}</div><span class="tiny faint nowrap">${rel(a.at)}</span></div>`).join('') || '<div class="pad-sm small muted">Nothing yet.</div>'}</div></section>
      <section class="card pad stack s8"><div class="row">${icon('shield')}<div class="h3">Privacy by default</div></div><p class="small muted">Staff see totals and business-level health, not client names, check-ins or messages. Every query in the coach and client apps is scoped to one business by the data layer, and tests prove it.</p></section>
    </div>`;
}
boot();
