// Coaching → Nutrition: how clients are eating this week, what needs the coach (Assist), the
// client table, how clients log, meal plan templates and data credits.
import { api } from '../../shared/api.js';
import { esc, first, rel, plural } from '../../shared/format.js';
import { icon, arc } from '../../shared/icons.js';
import { avatar, assistBadge, emptyState, lock } from '../../shared/components.js';
import { toast, toastError, busy, openModal, closeModal, modalHead, confirmDialog } from '../../shared/ui.js';
import { hasPlan } from '../state.js';
import { refreshCounts } from '../shell.js';
import { editDraft } from '../modals.js';

export const APPROACH = { habits: 'Habits', targets: 'Targets', meal_plan: 'Meal plan' };
const fmt = n => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));

function attention(a) {
  if (a.kind === 'protein') {
    return `<div class="q-item" style="grid-template-columns:auto 1fr"><span class="q-icon ${a.sev}">${icon('utensils')}</span><div class="stack s8" style="min-width:0">
      <div class="row wrap" style="gap:8px"><span class="strong">${esc(a.title)}</span>${a.upgrade ? lock('PRO') : ''}</div><div class="small muted">${esc(a.text)}</div>
      ${a.drafts.map(d => `<div class="panel pad-sm stack s8" data-draft="${esc(d.insightId)}"><div class="row">${avatar({ name: d.name }, 'xs')}<a class="client-link small" href="/app/clients/${esc(d.clientId)}/nutrition">${esc(d.name)}</a><span class="tiny muted grow">${esc(d.detail)}</span></div>
        <div class="q-draft"><div class="row" style="margin-bottom:6px">${assistBadge('Draft')}<span class="tiny faint">number-free, in your voice</span></div><div data-text>${esc(d.text)}</div></div>
        <div class="row wrap"><button class="btn primary sm" data-act="nudgeSend" data-id="${esc(d.insightId)}">${icon('send')} Approve & send</button><button class="btn sm" data-act="nudgeEdit" data-id="${esc(d.insightId)}" data-client="${esc(d.clientId)}" data-name="${esc(d.name)}">Edit</button><button class="btn ghost sm" data-act="nudgeDismiss" data-id="${esc(d.insightId)}">Not now</button></div></div>`).join('')}
      ${a.drafts.length > 1 ? `<div><button class="btn sm" data-act="nudgeAll">${icon('send')} Approve and send all ${a.drafts.length}</button></div>` : ''}
      ${a.done && !a.drafts.length ? `<div class="tiny muted">${icon('check')} Handled this week.</div>` : ''}
      ${a.upgrade ? '<div><a class="btn sm" href="/app/billing">Get drafted reminders with Pro</a></div>' : ''}
    </div></div>`;
  }
  const actions = a.kind === 'low_target' ? `<a class="btn sm primary" href="/app/clients/${esc(a.clientId)}/nutrition">Review target</a>`
    : a.kind === 'flag' ? `<button class="btn sm primary" data-act="flagDraft" data-id="${esc(a.flagId)}" data-name="${esc(a.name)}">Draft a reply</button><a class="btn sm" href="/app/clients/${esc(a.clientId)}/nutrition">Open</a><button class="btn ghost sm" data-act="flagResolve" data-id="${esc(a.flagId)}">Mark resolved</button>`
    : `<a class="btn sm" href="/app/inbox/${esc(a.clientId)}">Message ${esc(first(a.name))}</a>`;
  return `<div class="q-item" style="grid-template-columns:auto 1fr"><span class="q-icon ${a.sev}">${icon(a.kind === 'flag' ? (a.sev === 'crit' ? 'alert' : 'eyeOff') : a.kind === 'low_target' ? 'alert' : 'clock')}</span><div class="stack s8" style="min-width:0">
    <div class="row wrap" style="gap:8px"><span class="strong">${esc(a.title)}</span>${a.kind === 'flag' ? '<span class="pill">Only you can see this</span>' : ''}</div>
    <div class="small muted">${esc(a.text)}</div>${a.quote ? `<div class="small" style="border-left:3px solid var(--line-strong);padding-left:10px">“${esc(a.quote)}”</div>` : ''}
    <div class="row wrap">${actions}</div></div></div>`;
}

const LOG_WAYS = [['camera', 'Photo with Assist', 'Snap the plate; Assist lists the foods and portions, the client checks them and adds.', 'PRO'], ['search', 'Search', 'USDA FoodData Central, whole foods first.', ''], ['scan', 'Barcode', 'Scan packaged food (Open Food Facts).', ''], ['mic', 'Voice', '“Two eggs and toast” becomes foods to review.', 'PRO'], ['plus', 'Quick add', 'Name, calories and protein.', ''], ['repeat', 'Favorites and repeat', 'Save a meal, or repeat yesterday’s lunch.', '']];

export default {
  nav: 'nutrition',
  title: () => 'Nutrition',
  load: () => api.get('/api/nutrition/overview'),
  render(d) {
    const k = d.kpis;
    return `
    <div class="page-head"><div><h1 class="h1">Nutrition</h1><p class="sub">How your clients are eating this week · you set every target</p></div><div class="row wrap"><button class="btn" data-act="newTemplate">${icon('plus')} Meal plan template</button></div></div>
    <section class="kpis" aria-label="This week">
      <div class="kpi"><span class="eyebrow">Logging 5+ days</span><span class="big-num">${k.logging5}<span class="muted" style="font-size:1rem;font-weight:600"> / ${k.active}</span></span><span class="tiny muted">active clients, last 7 days</span></div>
      <div class="kpi"><span class="eyebrow">Protein days hit</span><span class="big-num">${k.proteinHitPct == null ? '—' : k.proteinHitPct + '%'}</span><span class="tiny muted">of logged days, clients with a protein target</span></div>
      <div class="kpi"><span class="eyebrow">Meals photographed</span><span class="big-num">${k.photos}</span><span class="tiny muted">last 7 days</span></div>
      <div class="kpi"><span class="eyebrow">Habit check-ins</span><span class="big-num">${k.habitChecks}</span><span class="tiny muted">last 7 days</span></div>
    </section>
    <div class="split">
      <section class="card" aria-labelledby="att-h"><div class="card-head"><div class="h3" id="att-h">${arc()} Needs your attention</div><span class="pill assist">${d.attention.length}</span></div>
        <div>${d.attention.map(attention).join('') || emptyState('arc', 'Nothing needs you right now.', 'Clients missing protein most days, very low targets and private flags show up here.')}</div></section>
      <div class="stack s16">
        <section class="card pad stack s8"><div class="h3">How clients log</div><ul class="config-list small">${LOG_WAYS.map(([ic, t, s, p]) => `<li>${icon(ic)}<span><b>${t}</b>${p && !hasPlan(p) ? ` ${lock(p)}` : ''} · <span class="muted">${s}</span></span></li>`).join('')}</ul><p class="tiny faint">Nothing is saved until the client taps Add. Photos are private to you and the client.</p></section>
        <section class="card"><div class="card-head"><div class="h3">Meal plan templates</div>${hasPlan('PRO') ? `<button class="btn ghost sm" data-act="newTemplate">${icon('plus')} New</button>` : lock('PRO')}</div>
          <div class="list">${d.templates.map(t => `<button class="li click" style="width:100%;background:none;border-left:0;border-right:0;text-align:left" data-act="editTemplate" data-id="${esc(t.id)}"><span class="thumb" style="width:34px;height:34px">${icon('utensils')}</span><div class="grow"><div class="strong small">${esc(t.name)}</div><div class="tiny muted">${plural(t.days, 'day')} · assigned to ${plural(t.assigned, 'client')}</div></div>${icon('chevR')}</button>`).join('') || '<div class="pad-sm small muted">Build a plan once, assign it to many clients on their Nutrition tab.</div>'}</div>
          <div class="pad-sm tiny faint" style="border-top:1px solid var(--line)">In some states, individualized meal plans require a dietitian license. Check your state’s rules, or refer to a registered dietitian.</div></section>
        <section class="card pad-sm stack s4 credit">${d.credits.map(c => `<div>${esc(c.text)} · <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(new URL(c.url).host)}</a>${c.license ? ` · <a href="${esc(c.license)}" target="_blank" rel="noopener">license</a>` : ''}</div>`).join('')}${d.provider === 'mock' ? '<div>Offline sample food list in use (add an FDC key for the full USDA database).</div>' : ''}<div><a href="/data-sources" target="_blank" rel="noopener">About our food data</a></div></section>
      </div>
    </div>
    <section class="card"><div class="card-head"><div class="h3">Clients</div><span class="tiny muted">last 7 days</span></div>
      ${d.rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Client</th><th>Approach</th><th class="r">Days logged</th><th class="r">Calories vs target</th><th class="r">Protein days hit</th><th>Last log</th></tr></thead><tbody>${d.rows.map(r => `<tr class="click" data-go="/app/clients/${esc(r.id)}/nutrition"><td><span class="row" style="gap:8px">${avatar({ name: r.name }, 'xs')}<span class="strong small">${esc(r.name)}</span>${r.flags ? `<span class="pill" title="Private flags">${icon('eyeOff').replace('class="ico ', 'style="width:12px;height:12px" class="ico ')} ${r.flags}</span>` : ''}</span></td>
        <td class="small">${r.approach ? esc(APPROACH[r.approach]) : '<span class="faint">Not set</span>'}${r.hideNumbers ? ' <span class="tag">numbers hidden</span>' : ''}${r.lowTarget && !r.lowTarget.confirmed ? ' <span class="pill warn">review target</span>' : ''}</td>
        <td class="r num">${r.daysLogged}/7</td>
        <td class="r num small">${r.calories ? `${fmt(r.avgCalories)} / ${fmt(r.calories)}` : r.avgCalories ? fmt(r.avgCalories) : '—'}</td>
        <td class="r num small">${r.proteinG && r.approach !== 'habits' ? `${r.proteinHitDays} of ${r.daysLogged}` : '—'}${r.missedProtein ? ' <span class="pill warn">most missed</span>' : ''}</td>
        <td class="small muted">${r.lastLoggedAt ? esc(rel(r.lastLoggedAt)) : 'Never'}</td></tr>`).join('')}</tbody></table></div>` : emptyState('utensils', 'No active clients yet', 'Invite a client and pick their approach on their Nutrition tab.')}
      <div class="pad-sm tiny faint" style="border-top:1px solid var(--line)">Protein counts as hit at 90% of the target. Going over a target is shown in a neutral color in the client’s app.</div></section>`;
  },
  actions: {
    async nudgeSend(el, _e, ctx) {
      busy(el, true, 'Sending…');
      try { await api.post(`/api/insights/${el.dataset.id}/approve`); toast('Sent', { assist: true, undo: async () => { await api.post(`/api/insights/${el.dataset.id}/undo`); ctx.refresh(); } }); ctx.refresh(); refreshCounts(); }
      catch (e) { busy(el, false); toastError(e); }
    },
    nudgeEdit(el, _e, ctx) {
      const text = el.closest('[data-draft]').querySelector('[data-text]').textContent;
      editDraft({ title: 'Edit before sending', sub: `To ${esc(el.dataset.name)}`, text, clientId: el.dataset.client, onSend: async v => { await api.post(`/api/insights/${el.dataset.id}/approve`, { text: v }); toast('Sent'); ctx.refresh(); refreshCounts(); } });
    },
    async nudgeDismiss(el, _e, ctx) { await api.post(`/api/insights/${el.dataset.id}/dismiss`); toast('Dismissed', { undo: async () => { await api.post(`/api/insights/${el.dataset.id}/undo`); ctx.refresh(); } }); ctx.refresh(); refreshCounts(); },
    async nudgeAll(el, _e, ctx) {
      const ids = [...document.querySelectorAll('[data-act="nudgeSend"]')].map(b => b.dataset.id);
      busy(el, true, 'Sending…');
      let n = 0; for (const id of ids) { try { await api.post(`/api/insights/${id}/approve`); n++; } catch { /* already handled */ } }
      toast(`${plural(n, 'reminder')} sent`); ctx.refresh(); refreshCounts();
    },
    async flagDraft(el) {
      const r = await api.post(`/api/nutrition/flags/${el.dataset.id}/draft`);
      editDraft({ title: 'Reply privately', sub: `To ${esc(el.dataset.name)} · warm, no numbers. Assist never replies about this on its own.`, text: r.text, clientId: r.clientId, onSend: async v => { await api.post(`/api/threads/${r.clientId}/messages`, { body: v, insightId: r.insightId }); toast('Sent'); } });
    },
    async flagResolve(el, _e, ctx) { await api.post(`/api/nutrition/flags/${el.dataset.id}/resolve`); toast('Marked resolved'); ctx.refresh(); },
    newTemplate(_el, _e, ctx) { templateModal(null, ctx); },
    async editTemplate(el, _e, ctx) { const { templates } = await api.get('/api/nutrition/meal-plans'); templateModal(templates.find(t => t.id === el.dataset.id), ctx); },
  },
};

const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
/** Meal plan template editor: days, and for each meal a few lines of text. */
export function templateModal(t, ctx) {
  if (!hasPlan('PRO')) { toast('Meal plan templates are part of Pro.', { error: true }); return; }
  const days = t?.days?.length ? t.days : [{ label: 'Day 1', meals: [{ meal: 'breakfast', items: [] }, { meal: 'lunch', items: [] }, { meal: 'dinner', items: [] }, { meal: 'snack', items: [] }] }];
  const dayBlock = (d, i) => `<fieldset class="panel pad-sm stack s8" data-day="${i}"><legend class="sr">Day ${i + 1}</legend><div class="field"><label for="tp-d${i}">Day name</label><input class="input" id="tp-d${i}" data-f="label" value="${esc(d.label)}" maxlength="40"></div>
    ${['breakfast', 'lunch', 'dinner', 'snack'].map(m => { const meal = d.meals.find(x => x.meal === m); return `<div class="field"><label for="tp-${i}-${m}">${MEAL_LABEL[m]}</label><textarea class="textarea" id="tp-${i}-${m}" data-meal="${m}" rows="2" placeholder="One item per line">${esc((meal?.items || []).join('\n'))}</textarea></div>`; }).join('')}</fieldset>`;
  const m = openModal(`${modalHead(t ? 'Edit meal plan template' : 'New meal plan template', 'Build once, assign to many clients on their Nutrition tab')}
    <div class="modal-body"><div class="grid g2"><div class="field"><label for="tp-name">Name</label><input class="input" id="tp-name" value="${esc(t?.name || '')}" placeholder="e.g. Muscle builder · 2,400 kcal" maxlength="80"></div><div class="field"><label for="tp-cal">Approximate calories (optional)</label><input class="input" id="tp-cal" type="number" min="0" max="10000" value="${t?.calories ?? ''}"></div></div>
    <div class="field"><label for="tp-notes">Notes for the client</label><textarea class="textarea" id="tp-notes" rows="2">${esc(t?.notes || '')}</textarea></div>
    <div class="stack s8" id="tp-days">${days.map(dayBlock).join('')}</div><div><button class="btn sm" id="tp-add">${icon('plus')} Add a day</button></div>
    <div class="target-warn small">In some states, individualized meal plans require a dietitian license. Check your state’s rules, or refer to a registered dietitian.</div></div>
    <div class="modal-foot">${t ? '<button class="btn ghost" id="tp-del" style="margin-right:auto;color:var(--crit)">Delete</button>' : ''}<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="tp-save">Save template</button></div>`, { wide: true, label: 'Meal plan template' });
  m.querySelector('#tp-add').addEventListener('click', () => { const box = m.querySelector('#tp-days'); const i = box.children.length; box.insertAdjacentHTML('beforeend', dayBlock({ label: `Day ${i + 1}`, meals: [] }, i)); });
  m.querySelector('#tp-del')?.addEventListener('click', async () => { closeModal(); if (!(await confirmDialog({ title: `Delete ${t.name}?`, body: '<p class="small">Clients using it go back to logging without a plan. This can’t be undone.</p>', confirm: 'Delete', danger: true }))) return; await api.del(`/api/nutrition/meal-plans/${t.id}`); toast('Deleted'); ctx.refresh(); });
  m.querySelector('#tp-save').addEventListener('click', async ev => {
    const btn = ev.currentTarget;
    const body = {
      name: m.querySelector('#tp-name').value.trim(), calories: m.querySelector('#tp-cal').value ? Number(m.querySelector('#tp-cal').value) : null, notes: m.querySelector('#tp-notes').value.trim() || null,
      days: [...m.querySelectorAll('[data-day]')].map(fs => ({ label: fs.querySelector('[data-f="label"]').value.trim() || 'Day', meals: [...fs.querySelectorAll('[data-meal]')].map(ta => ({ meal: ta.dataset.meal, items: ta.value.split('\n').map(s => s.trim()).filter(Boolean) })).filter(x => x.items.length) })),
    };
    if (!body.name) { m.querySelector('#tp-name').focus(); return; }
    busy(btn, true);
    try { await (t ? api.put(`/api/nutrition/meal-plans/${t.id}`, body) : api.post('/api/nutrition/meal-plans', body)); closeModal(); toast('Template saved'); ctx.refresh(); }
    catch (e) { busy(btn, false); toastError(e); }
  });
}
