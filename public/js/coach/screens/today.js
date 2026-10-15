// Today: one queue instead of ten tabs (prototype V.today), backed by /api/today.
import { api } from '../../shared/api.js';
import { esc, money, plural, fmtLongDay, stamp, first } from '../../shared/format.js';
import { icon, arc } from '../../shared/icons.js';
import { avatar, assistBadge, riskPill, emptyState, lock } from '../../shared/components.js';
import { toast, toastError, busy } from '../../shared/ui.js';
import { state, ui, setUi, coachFirst } from '../state.js';
import { refreshCounts } from '../shell.js';
import { editDraft } from '../modals.js';
import { loadBusiness, businessSection } from '../businessCharts.js';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const STYLE = () => (state.me.business.writingStyle || 'Supportive').toLowerCase();

function queueItem(q) {
  const done = q.status && q.status !== 'pending';
  if (done) {
    const label = q.status === 'dismissed' ? 'Dismissed' : q.status === 'edited' ? 'Edited and sent' : q.id === 'missing' || q.id === 'payments' || q.id === 'nutrition' ? 'Reminders sent' : 'Approved and sent';
    const canUndo = q.insightId && q.decidedAt && Date.now() - new Date(q.decidedAt).getTime() < 5 * 60e3;
    return `<div class="q-item q-done"><span class="q-icon good">${icon('check')}</span><div class="stack s4"><div class="strong small">${esc(q.title)}</div><div class="tiny muted">${label}${q.mins && q.status !== 'dismissed' ? ` · saved about ${q.mins} min` : ''}</div></div>${canUndo ? `<div class="q-actions"><button class="btn ghost xs" data-act="undo" data-id="${q.insightId}">Undo</button></div>` : ''}</div>`;
  }
  return `<div class="q-item" data-qid="${esc(q.id)}">
    <span class="q-icon ${q.sev}">${q.client ? avatar(q.client, 'sm') : icon(q.icon)}</span>
    <div class="stack s4" style="min-width:0">
      <div class="row wrap" style="gap:8px"><span class="strong">${esc(q.title)}</span>${q.pill ? `<span class="pill ${q.sev}">${esc(q.pill)}</span>` : ''}</div>
      ${q.sub ? `<div class="small muted">${esc(q.sub)}</div>` : ''}
      ${q.drafts?.length ? q.drafts.map(d => `<div class="panel pad-sm stack s8" data-nudge="${esc(d.insightId)}"><div class="row">${avatar(d.client, 'xs')}<a class="client-link small" href="/app/clients/${esc(d.client.id)}/nutrition">${esc(d.client.name)}</a><span class="tiny muted grow">${esc(d.detail || '')}</span></div><div class="q-draft"><div class="row" style="margin-bottom:6px">${assistBadge('Draft')}<span class="tiny faint">number-free, in your ${STYLE()} tone</span></div><div data-text>${esc(d.text)}</div></div><div class="row wrap"><button class="btn sm" data-act="nudgeOne" data-id="${esc(d.insightId)}" data-name="${esc(d.client.name)}">${icon('send')} Approve</button><button class="btn sm" data-act="nudgeEdit" data-id="${esc(d.insightId)}" data-client="${esc(d.client.id)}" data-name="${esc(d.client.name)}">Edit</button><button class="btn ghost sm" data-act="nudgeDismiss" data-id="${esc(d.insightId)}">Not now</button></div></div>`).join('') : ''}
      ${q.draft ? `<div class="q-draft"><div class="row" style="margin-bottom:6px">${assistBadge(q.id === 'missing' || q.id === 'payments' ? 'Your reminder' : 'Draft')}<span class="tiny faint">${q.id === 'missing' ? 'your fixed check-in reminder' : `in your ${STYLE()} tone`}</span></div><div>${esc(q.draft)}</div></div>` : ''}
    </div>
    <div class="q-actions">${q.actions.map(a => a.go ? `<a class="btn sm ${a.primary ? 'primary' : ''}" href="${esc(a.go)}">${esc(a.label)}</a>` : `<button class="btn sm ${a.primary ? 'primary' : ''}" data-act="${a.act}" data-q="${esc(q.id)}">${esc(a.label)}</button>`).join('')}</div>
  </div>`;
}

export default {
  nav: 'today',
  title: () => 'Today',
  async load() {
    const [d, b, biz] = await Promise.all([api.get('/api/today'), api.get('/api/briefing/status').catch(() => ({ ready: false })), loadBusiness()]);
    return { ...d, briefingReady: d.pro && b.ready, biz };
  },
  mount() {
    // Opened from the 7 AM notification: /app?briefing=1
    if (new URLSearchParams(location.search).get('briefing') === '1') { history.replaceState(null, '', '/app'); import('../voice.js').then(m => m.openBriefing()); }
  },
  render(d) {
    const f = ui('qfilter', 'all');
    const shown = d.items.filter(x => f === 'all' || x.cat === f);
    const k = d.kpis;
    const pay = d.payments;
    return `
    <div class="page-head">
      <div><div class="eyebrow">${fmtLongDay(new Date())}</div><h1 class="h1" style="margin-top:6px">${greeting()}, ${esc(coachFirst())}.</h1>
      <p class="sub">${d.open ? `${plural(d.open, 'thing needs', 'things need')} you. Assist has drafted ${d.drafted} of them.` : 'You’re all caught up. Nice.'}</p></div>
      <div class="row wrap"><button class="btn" data-act="briefing">${icon('speaker')} Morning briefing${d.pro ? '' : ` ${lock('PRO')}`}</button><button class="btn" data-act="copilot" data-q="Give me a summary of my business this month.">${arc()} Summarize my month</button><button class="btn" data-act="invite">${icon('user')} Invite client</button><button class="btn primary" data-act="newMenu">${icon('plus')} New</button></div>
    </div>
    ${d.briefingReady ? `<div class="brief-banner" data-brief-banner role="status">${icon('speaker')}<div class="grow"><div class="strong small">Your morning briefing is ready</div><div class="tiny muted">About 40 seconds: who needs you, check-ins, payments and one piece of good news.</div></div><button class="btn assist sm" data-act="briefingPlay">${icon('play')} Play</button></div>` : ''}

    <section class="kpis" aria-label="Key numbers">
      <div class="kpi"><span class="eyebrow">Active clients</span><span class="big-num">${k.activeClients}</span><span class="delta up">${k.newThisMonth ? `+${k.newThisMonth} this month` : 'No new this month'} · ${k.newClients} new</span></div>
      <div class="kpi"><span class="eyebrow">Monthly revenue</span><span class="big-num">${money(k.mrrCents)}</span><span class="tiny muted">recurring, from active memberships</span></div>
      <div class="kpi"><span class="eyebrow">90-day retention</span><span class="big-num">${k.retention90 == null ? '—' : k.retention90 + '%'}</span><span class="tiny muted">${k.retention90 == null ? 'Shows once clients pass 90 days' : 'clients still with you after 90 days'}</span></div>
      <div class="kpi"><span class="eyebrow">Check-ins this week</span><span class="big-num">${k.checkinsThisWeek}<span class="muted" style="font-size:1rem;font-weight:600"> / ${k.activeClients}</span></span><span class="delta ${k.missingCheckins ? 'down' : 'up'}">${k.missingCheckins} missing</span></div>
    </section>

    <div class="split">
      <section class="card" aria-labelledby="needs-h">
        <div class="card-head" style="flex-wrap:wrap">
          <div class="h3" id="needs-h">${arc()} Assist needs you <span class="pill assist">${d.open} open</span></div>
          <div class="chips" role="tablist" aria-label="Filter">${[['all', 'All'], ['clients', 'Clients'], ['money', 'Money'], ['growth', 'Growth']].map(([key, l]) => `<button class="chip ${f === key ? 'on' : ''}" style="height:30px;font-size:.8rem" role="tab" aria-selected="${f === key}" data-act="qFilter" data-f="${key}">${l}</button>`).join('')}</div>
        </div>
        <div>${shown.map(queueItem).join('') || emptyState('arc', 'Nothing here right now.', 'New check-ins, drafts and at-risk clients show up here as they happen.')}</div>
      </section>

      <div class="stack s16">
        <section class="card pad stack s8">
          <div class="row between"><div class="h3">${icon('dumbbell')} Workouts today</div><a class="btn ghost sm" href="/app/clients">Clients ${icon('chevR')}</a></div>
          <div class="row between"><div><div class="big-num" style="font-size:1.5rem">${d.workoutsToday.done} <span class="muted" style="font-size:1rem">of ${d.workoutsToday.scheduled}</span></div><div class="tiny muted">scheduled workouts logged so far</div></div></div>
          <div class="bar"><i style="width:${d.workoutsToday.scheduled ? d.workoutsToday.done / d.workoutsToday.scheduled * 100 : 0}%"></i></div>
        </section>

        <section class="card">
          <div class="card-head"><div class="h3">${icon('target')} Retention radar</div>${d.radar ? `<a class="btn ghost sm" href="/app/clients?filter=risk">All ${icon('chevR')}</a>` : lock('PRO')}</div>
          ${d.radar ? (d.radar.length ? `<div class="list">${d.radar.map(c => `<a class="li click sev ${c.level === 'HIGH' ? 'crit' : 'warn'}" style="text-decoration:none" href="/app/clients/${c.id}">${avatar({ name: c.name, risk: { level: c.level } }, 'sm')}<div class="grow" style="min-width:0"><div class="strong small">${esc(c.name)}</div><div class="tiny muted clamp2">${esc(c.reason)}</div></div><div class="stack s4" style="align-items:flex-end"><span class="strong small num">${c.score}</span>${riskPill({ level: c.level }, true)}</div></a>`).join('')}</div>` : `<div class="pad small muted">No one is drifting right now.</div>`)
            + `<div class="pad-sm tiny faint" style="border-top:1px solid var(--line)">Scores update nightly from workouts, check-ins, messages and payments.</div>`
            : `<div class="pad"><div class="upsell">${arc()}<div class="grow stack s4"><div class="h3">The retention radar is part of Pro</div><div class="muted small">See who’s drifting and why, with drafted outreach. Your clients and data stay exactly as they are.</div></div><a class="btn primary" href="/app/billing">See plans</a></div></div>`}
        </section>

        <section class="card">
          <div class="card-head"><div class="h3">${icon('message')} Unread</div><a class="btn ghost sm" href="/app/inbox">Messages ${icon('chevR')}</a></div>
          <div class="list">${d.unread.map(u => `<a class="li click" style="text-decoration:none" href="/app/inbox/${u.clientId}">${avatar({ name: u.name }, 'sm')}<div class="grow" style="min-width:0"><div class="strong small">${esc(u.name)}</div><div class="tiny muted clamp2">${esc(u.preview)}</div></div><span class="tiny faint">${u.at ? stamp(u.at) : ''}</span></a>`).join('') || '<div class="pad-sm muted small">No unread messages.</div>'}</div>
        </section>

        <section class="card pad stack s8">
          <div class="row between"><div class="h3">${icon('card')} This month’s payments</div><a class="btn ghost sm" href="/app/payments">Details ${icon('chevR')}</a></div>
          <div class="row between"><div><div class="big-num" style="font-size:1.5rem">${money(pay.collectedCents)}</div><div class="tiny muted">collected of ${money(pay.expectedCents)} expected</div></div>${pay.failedCount ? `<span class="pill crit">${pay.failedCount} failed · ${money(pay.failedCents)}</span>` : '<span class="pill good">All paid</span>'}</div>
          <div class="bar"><i style="width:${pay.expectedCents ? Math.min(100, pay.collectedCents / pay.expectedCents * 100) : 0}%"></i></div>
        </section>
      </div>
    </div>
    <div style="margin-top:24px">${businessSection(d.biz)}</div>`;
  },
  actions: {
    briefingPlay() { return import('../voice.js').then(m => m.openBriefing({ autoplay: true })); },
    qFilter(el, _e, ctx) { setUi('qfilter', el.dataset.f); ctx.rerender(); },
    async approve(el, _e, ctx) {
      const q = ctx.data.items.find(x => x.id === el.dataset.q);
      busy(el, true, 'Sending…');
      try {
        const r = await api.post(`/api/insights/${q.insightId}/approve`);
        toast(`Sent to ${first(q.client?.name)}`, { assist: true, undo: async () => { await api.post(`/api/insights/${q.insightId}/undo`); ctx.refresh(); refreshCounts(); } });
        void r; await ctx.refresh(); refreshCounts();
      } catch (e) { busy(el, false); toastError(e); }
    },
    edit(el, _e, ctx) {
      const q = ctx.data.items.find(x => x.id === el.dataset.q);
      if (q.id === 'missing') {
        return editDraft({ title: 'Edit the reminder', sub: `Sent to ${plural(q.clientIds.length, 'client')}, each with their first name`, text: q.template, hint: '{first} becomes each client’s first name.', onSend: async text => { const r = await api.post('/api/today/remind-missing', { text }); toast(`${plural(r.sent, 'reminder')} sent`); await ctx.refresh(); refreshCounts(); } });
      }
      editDraft({ title: 'Edit before sending', sub: q.client ? `To ${esc(q.client.name)}` : '', text: q.draft, clientId: q.client?.id, onSend: async text => { await api.post(`/api/insights/${q.insightId}/approve`, { text }); toast('Sent', { undo: async () => { await api.post(`/api/insights/${q.insightId}/undo`); ctx.refresh(); refreshCounts(); } }); await ctx.refresh(); refreshCounts(); } });
    },
    async dismiss(el, _e, ctx) {
      const q = ctx.data.items.find(x => x.id === el.dataset.q);
      await api.post(`/api/insights/${q.insightId}/dismiss`);
      toast('Dismissed. Assist will learn from this.', { undo: async () => { await api.post(`/api/insights/${q.insightId}/undo`); ctx.refresh(); refreshCounts(); } });
      await ctx.refresh(); refreshCounts();
    },
    async undo(el, _e, ctx) { await api.post(`/api/insights/${el.dataset.id}/undo`); toast('Undone'); await ctx.refresh(); refreshCounts(); },
    async remindMissing(el, _e, ctx) { busy(el, true, 'Sending…'); try { const r = await api.post('/api/today/remind-missing', {}); toast(`${plural(r.sent, 'reminder')} sent`); await ctx.refresh(); refreshCounts(); } catch (e) { busy(el, false); toastError(e); } },
    async approveNudges(el, _e, ctx) {
      const q = ctx.data.items.find(x => x.id === el.dataset.q);
      busy(el, true, 'Sending…');
      let n = 0;
      for (const d of q.drafts) { try { await api.post(`/api/insights/${d.insightId}/approve`); n++; } catch { /* already handled */ } }
      toast(`${plural(n, 'reminder')} sent`, { assist: true }); await ctx.refresh(); refreshCounts();
    },
    async nudgeOne(el, _e, ctx) {
      busy(el, true, 'Sending…');
      try { await api.post(`/api/insights/${el.dataset.id}/approve`); toast(`Sent to ${first(el.dataset.name)}`, { assist: true, undo: async () => { await api.post(`/api/insights/${el.dataset.id}/undo`); ctx.refresh(); refreshCounts(); } }); await ctx.refresh(); refreshCounts(); }
      catch (e) { busy(el, false); toastError(e); }
    },
    nudgeEdit(el, _e, ctx) {
      const text = el.closest('[data-nudge]').querySelector('[data-text]').textContent;
      editDraft({ title: 'Edit before sending', sub: `To ${esc(el.dataset.name)}`, text, clientId: el.dataset.client, onSend: async v => { await api.post(`/api/insights/${el.dataset.id}/approve`, { text: v }); toast('Sent'); await ctx.refresh(); refreshCounts(); } });
    },
    async nudgeDismiss(el, _e, ctx) { await api.post(`/api/insights/${el.dataset.id}/dismiss`); toast('Dismissed', { undo: async () => { await api.post(`/api/insights/${el.dataset.id}/undo`); ctx.refresh(); refreshCounts(); } }); await ctx.refresh(); refreshCounts(); },
    async remindPayments(el, _e, ctx) { busy(el, true, 'Sending…'); try { const r = await api.post('/api/today/remind-payments'); toast(`${plural(r.sent, 'card-update reminder')} sent`); await ctx.refresh(); refreshCounts(); } catch (e) { busy(el, false); toastError(e); } },
  },
};
