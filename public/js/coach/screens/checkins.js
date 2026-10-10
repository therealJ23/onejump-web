// Weekly check-ins: list to review / missing / reviewed, plus the review panel with
// Assist's summary, suggested actions and drafted reply (prototype V.checkins).
import { api } from '../../shared/api.js';
import { esc, rel, first, plural, fmtDate } from '../../shared/format.js';
import { icon, arc } from '../../shared/icons.js';
import { avatar, assistBadge, thinking, skeleton, emptyState, small } from '../../shared/components.js';
import { toast, toastError, busy, openModal, closeModal, modalHead } from '../../shared/ui.js';
import { editorBlock } from '../../shared/editor.js';
import { refreshCounts } from '../shell.js';

function row(k, selId) {
  return `<a class="li click sev ${k.flagged && k.status === 'submitted' ? 'crit' : k.status === 'submitted' ? 'assist' : ''}" ${selId === k.id ? 'style="background:var(--surface-2)" aria-current="true"' : ''} href="/app/checkins/${k.id}">${avatar(k, 'sm')}<div class="grow"><div class="strong small">${esc(k.name)}</div><div class="tiny muted">${k.flagged ? '<span style="color:var(--crit);font-weight:700">Pain mentioned</span> · ' : ''}${rel(k.submittedAt)}</div></div>${k.status === 'reviewed' ? `<span style="color:var(--good)">${icon('check')}</span>` : icon('chevR')}</a>`;
}

function metric(label, val, prev, unit = '', goodUp = true) {
  if (val == null) return `<div class="stat" style="padding:12px 14px"><div class="eyebrow">${label}</div><span class="muted">—</span></div>`;
  let d = '';
  if (prev != null && prev !== val) { const up = val > prev, good = up === goodUp; d = `<span class="tiny ${good ? 'delta up' : 'delta down'}">${up ? '↑' : '↓'} ${Math.abs(Math.round((val - prev) * 10) / 10)}</span>`; }
  return `<div class="stat" style="padding:12px 14px"><div class="eyebrow">${label}</div><div class="row" style="gap:6px"><span class="strong" style="font-size:1.15rem">${val}${unit}</span>${d}</div></div>`;
}

function detail(det) {
  if (!det) return `<div class="empty" style="padding:60px 20px">${arc()}<div class="h3" style="color:var(--ink)">No check-ins this week yet</div><p>Clients send them on Sundays. You’ll see each one here with an Assist summary.</p></div>`;
  const { checkin: k, previous: p = {}, client: c } = det;
  const pv = p || {};
  return `
  <div class="card-head"><a class="btn ghost icon sm show-sm" href="/app/checkins" aria-label="Back to check-ins">${icon('chevL')}</a><div class="row grow">${avatar(c, 'md')}<div><div class="h3">${esc(c.name)}</div><div class="tiny muted">${c.program ? `Week ${c.week || 1} of ${esc(c.program)} · ` : ''}sent ${rel(k.submittedAt).toLowerCase()}</div></div></div><a class="btn sm" href="/app/clients/${c.id}">Profile</a></div>
  ${k.flagged ? `<div class="pad-sm row top" style="background:var(--crit-tint);border-bottom:1px solid var(--line)"><span style="color:var(--crit)">${icon('alert')}</span><div class="small"><b>Pain reported.</b> Assist won’t suggest training through it and has drafted a reply recommending a physical therapist or sports-medicine doctor. You decide what happens next.</div></div>` : ''}
  <div class="stat-row" style="border-bottom:1px solid var(--line)">
    ${metric('Workouts', k.workoutsDone != null ? `${k.workoutsDone}/${k.workoutsPlanned ?? '?'}` : null, null)}
    ${metric('Weight', k.weight, pv.weight, ' lb', c.goalType !== 'Fat loss')}
    ${metric('Sleep', k.sleepHours, pv.sleepHours, ' h')}
    ${metric('Energy', k.energy, pv.energy, '/10')}
    ${metric('Soreness', k.soreness, pv.soreness, '/10', false)}
    ${metric('Stress', k.stress, pv.stress, '/10', false)}
    ${metric('Nutrition', k.nutrition, pv.nutrition, '/10')}
    ${det.nutrition ? `<div class="stat" style="padding:12px 14px"><div class="eyebrow">Food log</div><div class="strong" style="font-size:1.15rem">${det.nutrition.daysLogged}/7 <span class="tiny muted" style="font-weight:600">days</span></div>${det.nutrition.proteinHitDays != null ? `<div class="tiny muted">protein hit ${det.nutrition.proteinHitDays} of ${det.nutrition.daysLogged}</div>` : ''}</div>` : ''}
    ${metric('Mood', k.mood, pv.mood, '/10')}
  </div>
  <div class="pad stack s16">
    <div class="stack s8"><div class="eyebrow">In ${esc(first(c.name))}’s words</div><blockquote style="margin:0;padding:12px 16px;border-left:3px solid var(--line-strong);background:var(--surface-2);border-radius:0 10px 10px 0;white-space:pre-wrap">${k.text ? esc(k.text) : '<span class="muted">No note this week.</span>'}</blockquote></div>
    <div class="assist-card pad stack s16" id="ci-ai" aria-live="polite">${thinking('Assist is summarizing the week…')}${skeleton(3)}</div>
  </div>`;
}

function assistHtml(r, det) {
  const k = det.checkin, c = det.client, done = k.status === 'reviewed';
  const ic = n => small(icon(n), 13);
  const acts = (r.actions || []).map((a, i) => ({ ...a, i })).filter(a => a.kind !== 'reply' && !(r.skipped || []).includes(a.i));
  return `
    <div class="row between wrap"><div class="row">${assistBadge('Weekly summary')}</div><span class="tiny faint">Suggestions for you to review</span></div>
    <p style="font-size:1.02rem">${esc(r.summary)}</p>
    ${(r.flags?.length || r.wins?.length) ? `<div class="row wrap" style="gap:6px">${(r.flags || []).map(f => `<span class="pill ${f.level}">${ic('alert')}${esc(f.text)}</span>`).join('')}${(r.wins || []).map(w => `<span class="pill good">${ic('check')}${esc(w)}</span>`).join('')}</div>` : ''}
    ${acts.length ? `<div class="stack s8"><div class="strong small">Recommended actions</div>
      ${acts.map(a => `<div class="panel pad-sm row top" data-ci-act="${a.i}"><div class="grow stack s4"><div class="strong small">${esc(a.label)}</div>${a.detail ? `<div class="tiny muted">${esc(a.detail)}</div>` : ''}</div>${(r.applied || []).includes(a.i) ? `<span class="small row">${icon('check')} Done</span>` : `<button class="btn xs primary" data-act="ciAction" data-i="${a.i}">Apply</button><button class="btn xs ghost" data-act="ciSkip" data-i="${a.i}">Skip</button>`}</div>`).join('')}
    </div>` : ''}
    ${done ? `<div class="stack s8"><div class="strong small">Your reply</div>${r.finalText ? `<div class="q-draft">${esc(r.finalText)}</div>` : '<p class="small muted">Marked reviewed without a reply.</p>'}</div><div class="row small">${icon('check')} Reviewed</div>`
    : `<div class="stack s8">${editorBlock('ci', r.reply, c.id, { label: `Reply to ${first(c.name)}` })}</div>
    <div class="row wrap"><button class="btn primary" data-act="ciSend" data-insight="${r.id}">${icon('send')} Send reply & mark reviewed</button><button class="btn" data-act="ciMark">Mark reviewed without reply</button></div>`}
    <div class="tiny faint">${r.model === 'mock' ? 'Mock Assist (no AI key yet)' : esc(r.model || '')} · prompt ${esc(r.promptVersion || '')}</div>`;
}

async function loadAssist(det, refresh = false) {
  const el = document.getElementById('ci-ai'); if (!el || !det) return;
  try {
    const { insight } = await api.get(`/api/checkins/${det.checkin.id}/assist${refresh ? '?refresh=1' : ''}`);
    const el2 = document.getElementById('ci-ai'); if (!el2) return;
    el2.innerHTML = assistHtml(insight, det);
  } catch (e) {
    el.innerHTML = `<div class="stack s8"><p class="small">Assist couldn’t summarize this check-in: ${esc(e.message)}</p><div class="row"><button class="btn sm" data-act="ciRetry">Try again</button><button class="btn sm" data-act="ciMark">Mark reviewed</button></div></div>`;
  }
}

export default {
  nav: 'checkins',
  title: () => 'Check-ins',
  async load(params) {
    const list = await api.get('/api/checkins');
    const selId = params.id || list.toReview[0]?.id || list.reviewed[0]?.id || null;
    const det = selId ? await api.get(`/api/checkins/${selId}`) : null;
    return { ...list, selId, det };
  },
  render(d, params) {
    const total = d.toReview.length + d.reviewed.length;
    if (!total && !d.missing.length) return `<div class="page-head"><div><h1 class="h1">Check-ins</h1><p class="sub">Weekly check-ins from your clients</p></div></div><section class="card">${emptyState('clipboard', 'No check-ins yet', 'Once clients join, they send a weekly check-in (weight, sleep, energy, soreness and a note). Assist summarizes each one and drafts your reply.', '<button class="btn primary" data-act="invite">Invite a client</button>')}</section>`;
    const unreminded = d.missing.filter(m => !m.reminded);
    return `
    <div class="page-head"><div><h1 class="h1">Check-ins</h1><p class="sub">Week of ${fmtDate(weekMonday())} · ${d.toReview.length} to review · ${d.reviewed.length} reviewed · ${d.missing.length} missing</p></div>
      <div class="row wrap"><a class="btn" href="/app/automations">${icon('edit')} Reminder wording</a></div></div>
    <div class="split ci-split ${params.id ? 'has-detail' : ''}">
      <section class="card ci-list">
        <div class="card-head"><div class="h3">To review</div><span class="pill assist">${d.toReview.length}</span></div>
        <div class="list">${d.toReview.map(k => row(k, d.selId)).join('') || '<div class="pad-sm small muted">All caught up.</div>'}</div>
        <div class="card-head" style="border-top:1px solid var(--line)"><div class="h3">Missing</div>${unreminded.length ? `<button class="btn xs" data-act="remindAll">Remind all</button>` : ''}</div>
        <div class="list">${d.missing.map(m => `<div class="li">${avatar(m, 'sm')}<div class="grow"><a class="strong small" href="/app/clients/${m.clientId}" style="color:inherit;text-decoration:none">${esc(m.name)}</a><div class="tiny muted">${m.lastCheckinAt ? `Last sent ${rel(m.lastCheckinAt).toLowerCase()}` : 'Never sent one'}</div></div><button class="btn xs" data-act="remindOne" data-client="${m.clientId}" ${m.reminded ? 'disabled' : ''}>${m.reminded ? 'Reminded' : 'Remind'}</button></div>`).join('') || '<div class="pad-sm small muted">Everyone checked in.</div>'}</div>
        <div class="card-head" style="border-top:1px solid var(--line)"><div class="h3">Reviewed</div></div>
        <div class="list">${d.reviewed.map(k => row(k, d.selId)).join('') || '<div class="pad-sm small muted">None yet this week.</div>'}</div>
      </section>
      <section class="card ci-detail" id="ci-detail">${detail(d.det)}</section>
    </div>`;
  },
  mount(_root, d) { loadAssist(d.det); },
  actions: {
    ciRetry(_el, _e, ctx) { loadAssist(ctx.data.det, true); },
    async ciAction(el, _e, ctx) {
      busy(el, true, 'Applying…');
      try {
        const r = await api.post(`/api/checkins/${ctx.data.det.checkin.id}/actions/${el.dataset.i}/apply`);
        const box = document.querySelector(`[data-ci-act="${el.dataset.i}"]`);
        box?.querySelectorAll('button').forEach(b => b.remove());
        box?.insertAdjacentHTML('beforeend', `<span class="small row">${icon('check')} Done</span>`);
        toast(r.message || 'Applied', { assist: true });
      } catch (e) { busy(el, false); toastError(e); }
    },
    async ciSkip(el, _e, ctx) {
      await api.post(`/api/checkins/${ctx.data.det.checkin.id}/actions/${el.dataset.i}/skip`).catch(() => {});
      document.querySelector(`[data-ci-act="${el.dataset.i}"]`)?.remove();
    },
    async ciSend(el, _e, ctx) {
      const ta = document.getElementById('ci-text'), text = ta.value.trim();
      if (!text) { ta.focus(); return toast('Write a reply first, or mark it reviewed without one.'); }
      busy(el, true, 'Sending…');
      try {
        const r = await api.post(`/api/checkins/${ctx.data.det.checkin.id}/reply`, { insightId: el.dataset.insight, text });
        toast(`Reply sent to ${first(ctx.data.det.client.name)}`, { assist: true });
        refreshCounts();
        ctx.navigate(`/app/checkins/${r.nextId || ctx.data.det.checkin.id}`, { replace: true });
      } catch (e) { busy(el, false); toastError(e); }
    },
    async ciMark(el, _e, ctx) {
      busy(el, true);
      try {
        const r = await api.post(`/api/checkins/${ctx.data.det.checkin.id}/review`);
        toast('Marked reviewed'); refreshCounts();
        ctx.navigate(`/app/checkins/${r.nextId || ctx.data.det.checkin.id}`, { replace: true });
      } catch (e) { busy(el, false); toastError(e); }
    },
    async remindOne(el, _e, ctx) {
      busy(el, true, 'Sending…');
      try { await api.post('/api/checkins/remind', { clientIds: [el.dataset.client] }); el.textContent = 'Reminded'; el.disabled = true; toast(`Reminder sent to ${first(ctx.data.missing.find(m => m.clientId === el.dataset.client)?.name)}`); refreshCounts(); }
      catch (e) { busy(el, false); toastError(e); }
    },
    async remindAll(_el, _e, ctx) {
      const ids = ctx.data.missing.filter(m => !m.reminded).map(m => m.clientId);
      const { automations } = await api.get('/api/automations').catch(() => ({ automations: [] }));
      const tpl = automations.find(a => a.key === 'missing_checkin')?.template || 'Hey {first}! Quick reminder to send your weekly check-in. Takes 2 minutes and it’s how I adjust next week.';
      const m = openModal(`${modalHead('Remind everyone who’s missing', `${plural(ids.length, 'client')} · each gets it individually with their first name`)}
        <div class="modal-body">${editorBlock('rm', tpl, null, { label: 'Message', rows: 4 })}<p class="tiny muted">This is your fixed reminder text (no AI). {first} becomes each client’s first name.</p></div>
        <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="rm-go">${icon('send')} Send ${ids.length}</button></div>`, { label: 'Remind all' });
      m.querySelector('#rm-go').addEventListener('click', async ev => {
        busy(ev.currentTarget, true, 'Sending…');
        try { const r = await api.post('/api/checkins/remind', { clientIds: ids, text: m.querySelector('#rm-text').value }); closeModal(); toast(`${plural(r.sent, 'reminder')} sent`); refreshCounts(); ctx.refresh(); }
        catch (e) { busy(ev.currentTarget, false); toastError(e); }
      });
    },
  },
};

function weekMonday() {
  const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d;
}
