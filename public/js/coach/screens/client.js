// Client profile with tabs (prototype V.client + PROFILE), backed by /api/clients/:id/*.
import { api } from '../../shared/api.js';
import { esc, money, rel, fmtDate, fmtFullDate, fmtKey, plural, first, stamp, interval, keyToday } from '../../shared/format.js';
import { icon, arc } from '../../shared/icons.js';
import { avatar, statusPill, payPill, assistBadge, thinking, skeleton, emptyState, small, riskPill } from '../../shared/components.js';
import { lineChart, barChart, silhouette } from '../../shared/charts.js';
import { openModal, closeModal, modalHead, toast, toastError, busy, confirmDialog, showFieldErrors, copyText } from '../../shared/ui.js';
import { state, hasPlan } from '../state.js';
import { refreshCounts } from '../shell.js';
import { editDraft } from '../modals.js';
import { nutritionTab, mountNutritionTab, nutritionActions, nutritionInputs, nutritionForms } from '../nutritionTab.js';
import { micButton } from '../../shared/dictation.js';

const TABS = [['overview', 'Overview'], ['goals', 'Goals'], ['program', 'Program'], ['progress', 'Progress'], ['measurements', 'Measurements'], ['photos', 'Photos'], ['checkins', 'Check-ins'], ['messages', 'Messages'], ['nutrition', 'Nutrition'], ['notes', 'Notes'], ['payments', 'Payments'], ['insights', 'Assist insights']];
const TAB_DATA = {
  overview: id => api.get(`/api/clients/${id}/progress`),
  progress: id => api.get(`/api/clients/${id}/progress`),
  program: id => api.get(`/api/clients/${id}/program`),
  measurements: id => api.get(`/api/clients/${id}/measurements`),
  photos: id => api.get(`/api/clients/${id}/photos`),
  checkins: id => api.get(`/api/clients/${id}/checkins`),
  messages: id => api.get(`/api/clients/${id}/messages?limit=8`),
  notes: id => api.get(`/api/clients/${id}/notes`),
  nutrition: id => api.get(`/api/clients/${id}/nutrition`),
  payments: id => api.get(`/api/clients/${id}/payments`),
  insights: id => api.get(`/api/clients/${id}/insights`),
};
const KIND = { checkin_summary: 'Check-in summary', message_draft: 'Message draft', risk: 'Risk check', workout: 'Workout draft', adjustment: 'Program adjustment', automation: 'Automation draft', lead_reply: 'Lead reply' };
const DECISION = { approved: ['good', 'Approved'], edited: ['assist', 'Edited'], dismissed: ['', 'Dismissed'], pending: ['info', 'Waiting'], expired: ['', 'No action'], info: ['', 'Info'] };
const wLabels = arr => arr.map(w => fmtDate(w.date));

function weightChart(p, height = 200) {
  if (!p?.weights?.length) return `<div class="empty small" style="padding:24px">No weigh-ins yet. They come from weekly check-ins.</div>`;
  return lineChart({ labels: wLabels(p.weights), series: p.weights.map(w => w.value), height });
}

const T = {
  nutrition: nutritionTab,
  overview(d, td) {
    const c = d.client, pr = d.program;
    const icons = { checkin: 'clipboard', workout: 'dumbbell', open: 'user', payment: 'card' };
    return `<div class="split">
      <div class="stack s16">
        <section class="card pad stack s16"><div class="row between"><div class="h3">${arc()} What’s happening with ${esc(first(c.name))}</div><a class="btn ghost sm" href="/app/clients/${c.id}/insights">History</a></div><div class="stack s16" id="prog-ai">${skeleton(4)}</div></section>
        <section class="card pad stack s8"><div class="row between"><div class="h3">Weight</div><span class="small muted">lb · weekly</span></div>${weightChart(td)}</section>
        <section class="card pad stack s16"><div class="h3">This week</div><div class="grid" style="grid-template-columns:repeat(7,minmax(0,1fr));gap:8px">${d.week.map(w => { const s = w.state; const bg = s === 'done' ? 'var(--good-tint)' : s === 'missed' ? 'var(--crit-tint)' : s === 'today' ? 'var(--assist-tint)' : 'var(--surface-3)'; const fg = s === 'done' ? 'var(--good)' : s === 'missed' ? 'var(--crit)' : 'var(--muted)'; return `<div class="stack s4" style="align-items:center"><span class="tiny faint">${fmtKey(w.date).slice(0, 3)}</span><span title="${s.replace('-rest', '')}" style="width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:${bg};color:${fg}">${s === 'done' ? icon('check') : s === 'missed' ? icon('x') : s === 'today' ? '•' : s === 'upcoming' ? small(icon('dumbbell'), 14) : ''}</span></div>`; }).join('')}</div><div class="tiny faint">Done · missed · today · upcoming training days. Blank days are rest.</div></section>
      </div>
      <div class="stack s16">
        <section class="card pad stack s8"><div class="h3">Current program</div>${pr ? `<div class="strong">${esc(pr.name)}</div><div class="small muted">Week ${pr.week} of ${pr.weeks} · ${pr.daysPerWeek} days/week</div><div class="bar"><i style="width:${pr.week / pr.weeks * 100}%"></i></div><div class="row"><a class="btn sm" href="/app/clients/${c.id}/program">View</a><a class="btn sm" href="/app/programs/${pr.id}">Edit workouts</a></div>` : `<div class="small muted">No program yet.</div><div><button class="btn sm primary" data-act="assignProgram">Assign a program</button></div>`}</section>
        <section class="card"><div class="card-head"><div class="h3">Recent activity</div></div><div class="list">${d.activity.map(a => `<div class="li"><span class="thumb" style="width:32px;height:32px">${icon(icons[a.kind])}</span><div class="grow small">${esc(a.text)}</div><span class="tiny faint nowrap">${rel(a.at)}</span></div>`).join('') || '<div class="pad-sm small muted">Nothing yet. Activity appears once they open the app.</div>'}</div></section>
        <section class="card pad stack s8"><div class="row between"><div class="h3">Payment</div>${payPill(c.payStatus)}</div><div class="small muted">${d.plan ? `${esc(d.plan.name)} · ${money(d.plan.priceCents)}${interval(d.plan)}` : 'No package yet'}${d.subscription?.currentPeriodEnd ? ` · renews ${fmtDate(d.subscription.currentPeriodEnd)}` : ''}</div></section>
      </div></div>`;
  },
  goals(d) {
    const c = d.client;
    return `<div class="grid g2">
      <section class="card pad stack s16"><div class="eyebrow">Main goal</div><div class="h2">${esc(c.goal || 'No goal set')}</div><div class="small muted">Set ${fmtFullDate(c.startedAt)} · ${esc(c.goalType || 'No goal type')}</div>
        ${c.targetWeight ? `<div class="small">Target weight: <b>${c.targetWeight} lb</b></div>` : ''}
        <div><button class="btn sm" data-act="editClient">${icon('edit')} Edit goal</button></div></section>
      <section class="card pad stack s16"><div class="eyebrow">Daily habits</div><p class="small muted">Habits ${esc(first(c.name))} ticks off each day live on the Nutrition tab, with 7-day streaks. Assist can suggest one from a check-in (for example a sleep target).</p><div><a class="btn sm" href="/app/clients/${c.id}/nutrition">${icon('check')} Manage habits</a></div></section>
      <section class="card pad stack s8" style="grid-column:1/-1"><div class="eyebrow">Why it matters to ${esc(first(c.name))}</div><p>${c.why ? `“${esc(c.why)}”` : '<span class="muted">Not recorded yet. Ask on your onboarding call and add it in Edit.</span>'}</p></section>
    </div>`;
  },
  program(d, td) {
    const c = d.client;
    if (!td.program) return `<section class="card">${emptyState('layers', 'No program assigned', `Assign a program and ${first(c.name)} gets their workouts in the app.`, '<button class="btn primary" data-act="assignProgram">Assign a program</button>')}</section>`;
    return `<div class="split"><section class="card"><div class="card-head"><div class="stack s4"><div class="h3">${esc(td.program.name)}</div><div class="tiny muted">Week ${d.program?.week || 1} of ${td.program.weeks} · ${esc(td.program.level || '')}</div></div><div class="row"><button class="btn sm" data-act="assignProgram">Change</button><a class="btn sm" href="/app/programs/${td.program.id}">${icon('edit')} Edit program</a></div></div>
      <div class="list">${td.days.length ? td.days.map((x, i) => `<a class="li click" style="text-decoration:none" href="/app/builder/${x.workout?.id}"><span class="block-letter">${i + 1}</span><div class="grow" style="min-width:0"><div class="strong small">${esc(x.workout?.name || 'Workout')} ${x.workout?.tailored ? '<span class="tag">Tailored for this week</span>' : ''}</div><div class="tiny muted">${fmtKey(x.date)} · ${x.workout?.exercises.length || 0} exercises${x.workout?.estMinutes ? ` · ~${x.workout.estMinutes} min` : ''}</div></div>${x.status === 'completed' ? '<span class="pill good">Done</span>' : new Date(x.date) < new Date(keyToday()) ? '<span class="pill crit">Missed</span>' : '<span class="pill">Scheduled</span>'}</a>`).join('') : '<div class="pad small muted">No workouts scheduled this week.</div>'}</div></section>
      <section class="card pad stack s16"><div class="row between"><div class="h3">${arc()} Suggested adjustments</div><button class="btn ghost xs" data-act="refreshAdj">${icon('refresh')}</button></div><div class="stack s8" id="adj-ai">${skeleton(3)}</div><div class="tiny faint">Based on logged RPE, soreness, completion and check-ins. You decide what changes.</div></section></div>`;
  },
  progress(d, td) {
    const l = td.lift;
    return `<div class="split"><div class="stack s16">
      <section class="card pad stack s8"><div class="row between"><div class="h3">Weight</div><span class="small muted">lb${td.targetWeight ? ` · target ${td.targetWeight}` : ''}</span></div>${weightChart(td, 190)}</section>
      <section class="card pad stack s8"><div class="row between"><div class="h3">${esc(l?.name || 'Main lift')}</div><span class="small muted">best working set, lb</span></div>${l ? lineChart({ labels: l.dates.map(fmtDate), series: l.values, height: 190 }) : '<div class="empty small" style="padding:24px">Shows once weighted sets are logged.</div>'}</section>
      <section class="card pad stack s8"><div class="row between"><div class="h3">Workout completion</div><span class="small muted">% per week</span></div>${barChart({ labels: td.completion.map(w => w.label), a: td.completion.map(w => w.pct ?? 0), height: 160, fmt: v => v + '%' })}</section>
    </div><div class="stack s16"><section class="card pad stack s16"><div class="h3">${arc()} Progress analysis</div><div class="stack s16" id="prog-ai">${skeleton(4)}</div></section>
      <section class="card pad stack s8"><div class="h3">Personal bests</div>${td.bests.length ? td.bests.map(b => `<div class="row between small"><span>${esc(b.name)}</span><span class="strong">${b.weight} lb × ${b.reps}</span></div>`).join('') : '<p class="small muted">None logged yet.</p>'}</section></div></div>`;
  },
  measurements(d, td) {
    const rows = td.measurements;
    const cell = v => (v == null ? '<span class="faint">—</span>' : v);
    return `<section class="card"><div class="card-head"><div class="h3">Measurements</div><button class="btn sm" data-act="addMeasurement">${icon('plus')} Add</button></div>${rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th class="r">Weight (lb)</th><th class="r">Waist (in)</th><th class="r">Hips (in)</th><th class="r">Chest (in)</th><th class="r">Arm (in)</th><th class="r">Thigh (in)</th><th>From</th></tr></thead><tbody>${rows.map(r => `<tr><td class="strong nowrap">${fmtFullDate(r.takenAt)}</td>${['weight', 'waist', 'hips', 'chest', 'arm', 'thigh'].map(k => `<td class="r num">${cell(r[k])}</td>`).join('')}<td class="tiny muted">${esc(r.source)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('ruler', 'No measurements yet', 'Clients log them in their app, or add them here.')}<div class="pad-sm tiny faint" style="border-top:1px solid var(--line)">Weight also comes from weekly check-ins.</div></section>`;
  },
  photos(d, td) {
    return `<section class="card pad stack s16"><div class="row between wrap"><div class="h3">Progress photos</div><span class="pill">${icon('lock')} Private: only you and ${esc(first(d.client.name))}</span></div>
      ${td.photos.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">${td.photos.map(p => `<a class="photo" href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="${esc(p.pose)} photo, ${fmtDate(p.takenAt)}" loading="lazy"><span>${fmtDate(p.takenAt)} · ${esc(p.pose)}</span></a>`).join('')}</div>` : `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">${['Front', 'Side'].map(s => `<div class="photo">${silhouette()}<span>${s}</span></div>`).join('')}</div><p class="small muted">No photos yet. ${esc(first(d.client.name))} adds them from the app with their check-in.</p>`}
      <div class="tiny faint">Photos live in private storage behind links that expire after 5 minutes. Viewing them is recorded in your audit log.</div></section>`;
  },
  checkins(d, td) {
    const rows = td.checkins;
    return `<section class="card"><div class="card-head"><div class="h3">Weekly check-ins</div>${rows[0]?.status === 'submitted' ? `<a class="btn primary sm" href="/app/checkins/${rows[0].id}">Review this week</a>` : ''}</div>${rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Sent</th><th class="r">Weight</th><th class="r">Sleep (h)</th><th class="r">Energy</th><th class="r">Soreness</th><th class="r">Workouts</th><th>Status</th></tr></thead><tbody>${rows.map(r => `<tr class="click" data-go="/app/checkins/${r.id}"><td class="strong nowrap">${fmtFullDate(r.submittedAt)}</td><td class="r num">${r.weight ?? '—'}</td><td class="r num">${r.sleepHours ?? '—'}</td><td class="r num">${r.energy ?? '—'}/10</td><td class="r num">${r.soreness ?? '—'}/10</td><td class="r num">${r.workoutsDone ?? '—'}/${r.workoutsPlanned ?? '—'}</td><td>${r.flagged ? '<span class="pill crit">Pain mentioned</span> ' : ''}${r.status === 'submitted' ? '<span class="pill assist">Needs review</span>' : '<span class="pill good">Reviewed</span>'}</td></tr>`).join('')}</tbody></table></div>` : emptyState('clipboard', 'No check-ins yet', 'Weekly check-ins are due on Sundays.')}</section>`;
  },
  messages(d, td) {
    return `<section class="card"><div class="card-head"><div class="h3">Recent messages</div><a class="btn sm" href="/app/inbox/${d.client.id}">Open conversation</a></div><div class="pad stack s8">${td.messages.length ? td.messages.map(m => `<div class="bubble ${m.senderRole === 'CLIENT' ? 'them' : 'me'}">${esc(m.body)}<span class="time">${stamp(m.createdAt)}${m.aiInsightId ? ' · from an Assist draft' : ''}</span></div>`).join('') : '<p class="muted">No messages yet.</p>'}</div></section>`;
  },
  notes(d, td) {
    return `<section class="card"><div class="card-head"><div class="h3">Private notes</div><span class="pill">${icon('lock')} Only you</span></div><form class="pad stack s8" data-form="note"><label class="sr" for="note-new">New note</label><div class="row top"><textarea class="textarea grow" id="note-new" name="body" rows="3" placeholder="Add a note about ${esc(first(d.client.name))}…"></textarea>${micButton('note-new')}</div><div><button class="btn primary sm" type="submit">Save note</button></div></form><div class="list">${td.notes.map(n => `<div class="li"><div class="grow small" style="white-space:pre-wrap">${esc(n.body)}</div><span class="tiny faint nowrap">${fmtDate(n.createdAt)}</span></div>`).join('') || '<div class="pad-sm small muted">No notes yet.</div>'}</div></section>`;
  },
  payments(d, td) {
    const failed = td.payments.find(p => p.status === 'failed');
    return `<div class="grid g2"><section class="card pad stack s16"><div class="row between"><div class="h3">Plan</div>${payPill(td.payStatus)}</div><div class="h2">${esc(td.plan?.name || 'No package')}</div><div class="muted small">${td.plan ? `${td.plan.priceCents ? money(td.plan.priceCents) + ' per ' + td.plan.interval : 'Free'}` : 'Pick a package to start charging.'}${td.subscription?.currentPeriodEnd ? ` · next charge ${fmtDate(td.subscription.currentPeriodEnd)}` : ''}</div>${failed ? `<div class="pill crit" style="align-self:flex-start">${esc(failed.failureReason || 'Payment failed')}</div>` : ''}<div class="row wrap"><button class="btn sm" data-act="changePlan">Change package</button>${failed ? '<a class="btn primary sm" href="/app/payments">Fix payment</a>' : ''}</div></section>
      <section class="card"><div class="card-head"><div class="h3">History</div></div><div class="list">${td.payments.map(p => `<div class="li"><div class="grow small">${fmtFullDate(p.paidAt || p.dueAt || p.createdAt)}</div><span class="num small">${money(p.amountCents)}</span>${payPill(p.status)}</div>`).join('') || '<div class="pad-sm small muted">No payments yet.</div>'}</div></section></div>`;
  },
  insights(d, td) {
    return `<section class="card"><div class="card-head"><div class="h3">${arc()} Everything Assist suggested for ${esc(first(d.client.name))}</div><span class="tiny faint">Kept for 12 months</span></div>${td.insights.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th>Type</th><th>Suggestion</th><th>Your decision</th></tr></thead><tbody>${td.insights.map(i => { const [cls, l] = DECISION[i.status] || ['', i.status]; return `<tr><td class="nowrap small">${fmtDate(i.createdAt)}</td><td class="nowrap small strong">${KIND[i.kind] || i.kind}</td><td class="small muted">${esc((i.summary || i.finalText || i.draft?.text || i.draft?.draft || '').slice(0, 180))}</td><td><span class="pill ${cls}">${l}</span></td></tr>`; }).join('')}</tbody></table></div>` : emptyState('arc', 'Nothing yet', 'Check-in summaries, drafts and risk checks appear here.')}<div class="pad-sm tiny faint" style="border-top:1px solid var(--line)">Your approve, edit and dismiss decisions are how Assist’s drafts get better.</div></section>`;
  },
};

async function loadAssist(root, d, params) {
  const c = d.client, tab = params.tab || 'overview';
  if (c.risk && c.risk.level !== 'LOW' && ['ACTIVE', 'NEW'].includes(c.status) && hasPlan('PRO')) {
    api.get(`/api/clients/${c.id}/risk`).then(r => {
      const box = root.querySelector('#risk-ai'); if (!box) return;
      const i = r.insight;
      box.innerHTML = i ? `<p>${esc(i.summary)}</p><div class="row wrap tiny muted risk-tags" style="gap:6px">${(i.draft.reasons || []).map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>
        <div class="stack s8" style="margin-top:6px"><div class="strong small">Suggested action</div><div class="small">${esc(i.draft.action)}</div><div class="q-draft" id="risk-draft">${esc(i.draft.draft)}</div>
        <div class="row wrap"><button class="btn primary sm" data-act="riskSend" data-id="${i.id}">${icon('send')} Approve & send</button><button class="btn sm" data-act="riskEdit" data-id="${i.id}">Edit</button><button class="btn ghost sm" data-act="riskDismiss" data-id="${i.id}">Not now</button></div></div>`
        : `<div class="row wrap tiny muted" style="gap:6px">${(r.risk?.reasons || []).map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div><p class="small muted">You handled this recently. Assist drafts a new message if the score rises.</p>`;
    }).catch(() => {});
  }
  if (tab === 'overview' || tab === 'progress') {
    api.get(`/api/clients/${c.id}/progress-ai`).then(r => {
      const el = root.querySelector('#prog-ai'); if (!el) return;
      el.innerHTML = r.items.map(i => `<div class="row top" style="gap:10px"><span class="pill ${i.tone}" style="height:20px;padding:0 6px"><span class="dot"></span></span><div class="stack s4"><div class="strong small">${esc(i.title)}</div><div class="small muted">${esc(i.text)}</div></div></div>`).join('') + `<div class="tiny faint">${esc(r.note)}</div>`;
    }).catch(e => { const el = root.querySelector('#prog-ai'); if (el) el.innerHTML = `<p class="small muted">${esc(e.message)}</p>`; });
  }
  if (tab === 'program' && root.querySelector('#adj-ai')) loadAdjustments(root, c.id);
}
async function loadAdjustments(root, id, refresh = false) {
  const el = root.querySelector('#adj-ai'); if (!el) return;
  el.innerHTML = thinking('Assist is reading the last few weeks…');
  try {
    const { insight } = await api.get(`/api/clients/${id}/adjustments${refresh ? '?refresh=1' : ''}`);
    el.innerHTML = insight.items.map((i, n) => {
      const applied = insight.applied.includes(n), skipped = insight.skipped.includes(n);
      if (skipped) return '';
      return `<div class="panel pad-sm stack s8" data-adj="${n}"><div class="small">${esc(i.text)}</div><div class="row wrap tiny"><span class="tag">Change: ${esc(i.change)}</span><span class="tag">Signal: ${esc(i.why)}</span></div>${applied ? `<div class="small row">${icon('check')} Applied</div>` : i.op && i.op.type !== 'none' ? `<div class="row"><button class="btn primary xs" data-act="adjApply" data-insight="${insight.id}" data-n="${n}">Apply</button><a class="btn xs" href="/app/clients/${id}/program">Modify in builder</a><button class="btn ghost xs" data-act="adjSkip" data-insight="${insight.id}" data-n="${n}">Dismiss</button></div>` : ''}</div>`;
    }).join('') || '<p class="small muted">Nothing to change right now.</p>';
  } catch (e) { el.innerHTML = `<p class="small muted">${esc(e.message)}</p>`; }
}

function editClientModal(ctx) {
  const c = ctx.data.client;
  const m = openModal(`${modalHead('Edit client', esc(c.name))}
    <form class="modal-body" id="ec-form" novalidate>
      <div class="grid g2"><div class="field"><label for="ec-name">Name</label><input class="input" id="ec-name" name="name" value="${esc(c.name)}"></div><div class="field"><label for="ec-email">Email</label><input class="input" id="ec-email" name="email" type="email" value="${esc(c.email || '')}"></div></div>
      <div class="field"><label for="ec-goal">Main goal</label><input class="input" id="ec-goal" name="goal" value="${esc(c.goal || '')}"></div>
      <div class="grid g3"><div class="field"><label for="ec-type">Goal type</label><select class="select" id="ec-type" name="goalType">${['', 'Fat loss', 'Strength', 'Muscle', 'Hybrid', 'Beginner', 'Athletic', 'General fitness'].map(x => `<option ${c.goalType === x ? 'selected' : ''} value="${x}">${x || 'Not set'}</option>`).join('')}</select></div>
      <div class="field"><label for="ec-tw">Target weight (lb)</label><input class="input" id="ec-tw" name="targetWeight" type="number" value="${c.targetWeight ?? ''}"></div>
      <div class="field"><label for="ec-mode">Coaching</label><select class="select" id="ec-mode" name="mode">${['Online', 'Hybrid', 'In person'].map(x => `<option ${c.mode === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
      <div class="grid g2"><div class="field"><label for="ec-by">Birth year</label><input class="input" id="ec-by" name="birthYear" type="number" value="${c.birthYear ?? ''}"></div><div class="field"><label for="ec-phone">Phone</label><input class="input" id="ec-phone" name="phone" value="${esc(c.phone || '')}"></div></div>
      <div class="field"><label for="ec-why">Why it matters to them</label><textarea class="textarea" id="ec-why" name="why" rows="2">${esc(c.why || '')}</textarea></div>
      <div class="field"><label for="ec-tags">Tags and habits</label><input class="input" id="ec-tags" name="tags" value="${esc((c.tags || []).join(', '))}"><span class="hint">Comma-separated, for you only. Daily habits are on the Nutrition tab.</span></div>
    </form>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="ec-save">Save</button></div>`, { wide: true, label: 'Edit client' });
  m.querySelector('#ec-save').addEventListener('click', async ev => {
    const form = m.querySelector('#ec-form'), f = Object.fromEntries(new FormData(form));
    busy(ev.currentTarget, true);
    try {
      await api.patch(`/api/clients/${c.id}`, { name: f.name, email: f.email || null, goal: f.goal || null, goalType: f.goalType || null, targetWeight: f.targetWeight ? Number(f.targetWeight) : null, mode: f.mode, birthYear: f.birthYear ? Number(f.birthYear) : null, phone: f.phone || null, why: f.why || null, tags: f.tags.split(',').map(s => s.trim()).filter(Boolean) });
      closeModal(); toast('Saved'); ctx.refresh();
    } catch (e) { busy(ev.currentTarget, false); showFieldErrors(form, e.data?.fields); toastError(e); }
  });
}

export default {
  nav: 'clients',
  title: d => d.client.name,
  async load(params) {
    const tab = params.tab || 'overview';
    const [p, td] = await Promise.all([api.get(`/api/clients/${params.id}`), TAB_DATA[tab] ? TAB_DATA[tab](params.id) : Promise.resolve({})]);
    return { ...p, td };
  },
  render(d, params) {
    const c = d.client, tab = params.tab || 'overview';
    const showRisk = c.risk && c.risk.level !== 'LOW' && ['ACTIVE', 'NEW'].includes(c.status) && hasPlan('PRO');
    const dw = d.stats.weightDelta;
    return `
    <a class="btn ghost sm" style="align-self:flex-start;margin:-8px 0 -12px -8px" href="/app/clients">${icon('chevL')} Clients</a>
    <div class="profile-head">
      ${avatar(c, 'lg')}
      <div class="grow stack s4" style="min-width:220px"><div class="row wrap" style="gap:10px"><h1 class="h1">${esc(c.name)}</h1>${statusPill(c)}</div>
        <div class="muted">${esc(c.goal || 'No goal set yet')}</div>
        <div class="row wrap" style="gap:6px;margin-top:4px"><span class="tag">${esc(c.mode)}</span>${d.plan ? `<span class="tag">${esc(d.plan.name)} · ${d.plan.priceCents ? money(d.plan.priceCents) + interval(d.plan) : 'Trial'}</span>` : ''}${c.age ? `<span class="tag">Age ${c.age}</span>` : ''}${(c.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>
      <div class="row wrap"><a class="btn" href="/app/inbox/${c.id}">${icon('message')} Message</a><button class="btn" data-act="editClient">${icon('edit')} Edit</button><button class="btn ghost icon" data-act="moreMenu" aria-label="More actions">${icon('more')}</button></div>
    </div>
    ${c.invited ? `<div class="notice row wrap">${icon('mail')}<span class="grow small"><b>${esc(first(c.name))} hasn’t opened the app yet.</b> ${c.email ? `Invite sent to ${esc(c.email)}.` : 'Add their email to send the invite.'}</span><button class="btn sm" data-act="resendInvite">${c.email ? 'Resend invite' : 'Get invite link'}</button></div>` : ''}
    ${showRisk ? `<div class="assist-card pad stack s8" id="risk-box"><div class="row wrap">${riskPill(c.risk)}<span class="strong">Client at risk · score ${c.risk.score}</span><span class="grow"></span>${assistBadge('Explained by Assist')}</div><div id="risk-ai">${thinking('Assist is reading the signals…')}</div></div>` : ''}
    ${d.pain && !d.pain.reviewed ? `<div class="card pad row top" style="border-color:var(--crit)"><span class="q-icon crit">${icon('alert')}</span><div class="stack s4 grow"><div class="strong">Pain or a medical topic in this week’s check-in</div><div class="small muted">“${esc(d.pain.text.slice(0, 200))}” Assist won’t suggest loading through pain. Recommend a physical therapist or sports-medicine doctor.</div></div><a class="btn sm" href="/app/checkins/${d.pain.checkInId}">Review check-in</a></div>` : ''}
    <div class="card stat-row">
      <div class="stat"><div class="eyebrow">Adherence</div><div class="big-num" style="font-size:1.5rem">${c.adherence == null ? '—' : c.adherence + '%'}</div><div class="tiny muted">last 4 weeks</div></div>
      <div class="stat"><div class="eyebrow">Workouts</div><div class="big-num" style="font-size:1.5rem">${c.workoutsDone}</div><div class="tiny muted">completed</div></div>
      <div class="stat"><div class="eyebrow">Weight</div><div class="big-num" style="font-size:1.5rem">${dw == null ? '—' : (dw === 0 ? '±0' : (dw > 0 ? '+' : '') + dw) + ' lb'}</div><div class="tiny muted">since start</div></div>
      <div class="stat"><div class="eyebrow">Client since</div><div class="big-num" style="font-size:1.5rem">${fmtDate(c.startedAt)}</div><div class="tiny muted">${plural(d.stats.weeks, 'week')}</div></div>
      <div class="stat"><div class="eyebrow">Lifetime value</div><div class="big-num" style="font-size:1.5rem">${money(d.stats.lifetimeCents)}</div><div class="tiny muted">paid to date</div></div>
    </div>
    <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}" href="/app/clients/${c.id}${k === 'overview' ? '' : '/' + k}" style="text-decoration:none">${l}${k === 'insights' ? ' ' + small(arc(), 14) : ''}</a>`).join('')}</div>
    <div id="tab-body">${T[tab] ? T[tab](d, d.td) : ''}</div>`;
  },
  mount(root, d, params) { loadAssist(root, d, params); if ((params.tab || 'overview') === 'nutrition') mountNutritionTab(root, d); },
  inputs: { ...nutritionInputs },
  actions: {
    ...nutritionActions,
    editClient(_el, _e, ctx) { editClientModal(ctx); },
    async riskSend(el, _e, ctx) {
      busy(el, true, 'Sending…');
      await api.post(`/api/insights/${el.dataset.id}/approve`);
      document.getElementById('risk-box').innerHTML = `<div class="row">${icon('check')}<span class="strong">Sent to ${esc(first(ctx.data.client.name))}.</span><span class="muted small">Assist will watch for a reply and update the score.</span></div>`;
      toast('Message sent', { assist: true, undo: async () => { await api.post(`/api/insights/${el.dataset.id}/undo`); ctx.refresh(); } });
      refreshCounts();
    },
    riskEdit(el, _e, ctx) {
      editDraft({ title: 'Edit message', sub: `To ${esc(ctx.data.client.name)}`, text: document.getElementById('risk-draft').textContent, clientId: ctx.data.client.id, onSend: async text => { await api.post(`/api/insights/${el.dataset.id}/approve`, { text }); toast('Sent'); refreshCounts(); ctx.refresh(); } });
    },
    async riskDismiss(el, _e, ctx) { await api.post(`/api/insights/${el.dataset.id}/dismiss`); document.getElementById('risk-box')?.remove(); toast('Hidden. Assist drafts again if the score rises.'); refreshCounts(); void ctx; },
    async adjApply(el, _e, ctx) {
      busy(el, true, 'Applying…');
      const r = await api.post(`/api/clients/${ctx.data.client.id}/adjustments/${el.dataset.insight}/apply/${el.dataset.n}`);
      toast(r.message || 'Applied'); refreshCounts(); ctx.refresh();
    },
    async adjSkip(el, _e, ctx) { await api.post(`/api/clients/${ctx.data.client.id}/adjustments/${el.dataset.insight}/skip/${el.dataset.n}`); el.closest('[data-adj]')?.remove(); },
    refreshAdj(_el, _e, ctx) { loadAdjustments(document, ctx.data.client.id, true); },
    async assignProgram(_el, _e, ctx) {
      const { programs } = await api.get('/api/programs');
      const c = ctx.data.client;
      const m = openModal(`${modalHead('Assign a program', esc(c.name))}<div class="modal-body">
        ${programs.length ? `<div class="field"><label for="ap-p">Program</label><select class="select" id="ap-p">${programs.map(p => `<option value="${p.id}" ${p.id === c.programId ? 'selected' : ''}>${esc(p.name)} · ${p.weeks} wk · ${p.daysPerWeek} days</option>`).join('')}</select></div>
        <div class="field"><label for="ap-d">Start date</label><input class="input" id="ap-d" type="date" value="${keyToday()}"></div><p class="small muted">Workouts are scheduled from this date. Anything already scheduled after it is replaced.</p>` : `<p>You don’t have any programs yet.</p><a class="btn primary" href="/app/programs">Create a program</a>`}
        </div><div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button>${programs.length ? '<button class="btn primary" id="ap-go">Assign</button>' : ''}</div>`, { label: 'Assign a program' });
      m.querySelector('#ap-go')?.addEventListener('click', async ev => {
        busy(ev.currentTarget, true);
        try { const r = await api.post(`/api/clients/${c.id}/program`, { programId: m.querySelector('#ap-p').value, startDate: m.querySelector('#ap-d').value }); closeModal(); toast(`${plural(r.scheduled, 'workout')} scheduled`); ctx.refresh(); }
        catch (e) { busy(ev.currentTarget, false); toastError(e); }
      });
    },
    async changePlan(_el, _e, ctx) {
      const pay = await api.get('/api/payments');
      const c = ctx.data.client;
      const m = openModal(`${modalHead('Change package', esc(c.name))}<div class="modal-body"><div class="field"><label for="cp-p">Package</label><select class="select" id="cp-p">${pay.plans.filter(p => p.active).map(p => `<option value="${p.id}" ${p.id === c.clientPlanId ? 'selected' : ''}>${esc(p.name)} · ${p.priceCents ? money(p.priceCents) + interval(p) : 'Free'}</option>`).join('')}</select></div><label class="row small"><input type="checkbox" id="cp-msg" checked> Message ${esc(first(c.name))} a link to pay in the app</label></div><div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="cp-go">Save</button></div>`, { label: 'Change package' });
      m.querySelector('#cp-go').addEventListener('click', async ev => {
        busy(ev.currentTarget, true);
        try {
          const id = m.querySelector('#cp-p').value;
          if (m.querySelector('#cp-msg').checked) await api.post(`/api/payments/clients/${c.id}/charge`, { clientPlanId: id });
          else await api.patch(`/api/clients/${c.id}`, { clientPlanId: id });
          closeModal(); toast('Package updated'); ctx.refresh();
        } catch (e) { busy(ev.currentTarget, false); toastError(e); }
      });
    },
    async addMeasurement(_el, _e, ctx) {
      const m = openModal(`${modalHead('Add measurements', esc(ctx.data.client.name))}<form class="modal-body" id="am-form"><div class="grid g3">${[['weight', 'Weight (lb)'], ['waist', 'Waist (in)'], ['hips', 'Hips (in)'], ['chest', 'Chest (in)'], ['arm', 'Arm (in)'], ['thigh', 'Thigh (in)']].map(([k, l]) => `<div class="field"><label for="am-${k}">${l}</label><input class="input" id="am-${k}" name="${k}" type="number" step="0.1" min="0"></div>`).join('')}</div><div class="field"><label for="am-d">Date</label><input class="input" id="am-d" name="takenAt" type="date" value="${keyToday()}"></div></form><div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="am-go">Save</button></div>`, { label: 'Add measurements' });
      m.querySelector('#am-go').addEventListener('click', async ev => {
        const f = Object.fromEntries(new FormData(m.querySelector('#am-form')));
        const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '').map(([k, v]) => [k, k === 'takenAt' ? v : Number(v)]));
        busy(ev.currentTarget, true);
        try { await api.post(`/api/clients/${ctx.data.client.id}/measurements`, body); closeModal(); toast('Saved'); ctx.refresh(); } catch (e) { busy(ev.currentTarget, false); toastError(e); }
      });
    },
    async resendInvite(el, _e, ctx) {
      busy(el, true, 'Sending…');
      try { const r = await api.post(`/api/clients/${ctx.data.client.id}/invite`); busy(el, false); if (r.emailed) toast('Invite sent'); else copyText(r.inviteLink); }
      catch (e) { busy(el, false); toastError(e); }
    },
    moreMenu(_el, _e, ctx) {
      const c = ctx.data.client, owner = state.me.role === 'OWNER';
      openModal(`${modalHead('More', esc(c.name))}<div class="modal-body"><div class="list card">
        <button class="li click" style="width:100%;border-left:0;border-right:0;background:none;text-align:left" data-act="assignProgram">${icon('layers')}<span class="grow">Assign or change program</span></button>
        <button class="li click" style="width:100%;border-left:0;border-right:0;background:none;text-align:left" data-act="changePlan">${icon('card')}<span class="grow">Change package</span></button>
        <button class="li click" style="width:100%;border-left:0;border-right:0;background:none;text-align:left" data-act="toggleStatus">${icon(c.status === 'PAUSED' ? 'play' : 'pause')}<span class="grow">${c.status === 'PAUSED' || c.status === 'INACTIVE' ? 'Reactivate client' : 'Pause client'}</span></button>
        <a class="li click" style="text-decoration:none" href="/api/clients/${c.id}/export" download>${icon('download')}<span class="grow">Export their data (JSON)</span></a>
        ${owner ? `<button class="li click" style="width:100%;border-left:0;border-right:0;background:none;text-align:left;color:var(--crit)" data-act="deleteClient">${icon('trash')}<span class="grow">Delete client and all their data</span></button>` : ''}
      </div></div>`, { label: 'More actions' });
    },
    async toggleStatus(_el, _e, ctx) {
      const c = ctx.data.client, pausing = !(c.status === 'PAUSED' || c.status === 'INACTIVE');
      closeModal();
      await api.patch(`/api/clients/${c.id}`, { status: pausing ? 'PAUSED' : 'ACTIVE' });
      toast(pausing ? `${first(c.name)} is paused. They keep app access; the radar stops scoring them.` : `${first(c.name)} is active again`);
      ctx.refresh();
    },
    async deleteClient(_el, _e, ctx) {
      const c = ctx.data.client;
      closeModal();
      const name = await confirmDialog({ title: `Delete ${c.name}?`, body: `<p class="small">This permanently deletes their profile, workouts, check-ins, messages, photos and payment records in OneJump. Stripe keeps its own records. <b>This can’t be undone.</b></p>`, confirm: 'Delete forever', danger: true, input: { label: `Type “${c.name}” to confirm`, placeholder: c.name } });
      if (!name) return;
      try { await api.del(`/api/clients/${c.id}`, { confirmName: name }); toast(`${c.name} was deleted`); refreshCounts(); ctx.navigate('/app/clients'); } catch (e) { toastError(e); }
    },
  },
  forms: {
    ...nutritionForms,
    async note(form, _e, ctx) {
      const body = form.body.value.trim(); if (!body) { form.body.focus(); return; }
      await api.post(`/api/clients/${ctx.data.client.id}/notes`, { body });
      toast('Note saved'); ctx.refresh();
    },
  },
};
