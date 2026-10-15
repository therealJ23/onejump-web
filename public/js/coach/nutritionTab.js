// Client profile → Nutrition tab: approach, Hide numbers, targets with the calculator and the
// safety warnings, Assist's weekly summary with charts, today's log with meal photos, habits,
// the coach note and private flags. The coach sets every number; the calculator only estimates.
import { api } from '../shared/api.js';
import { esc, first, fmtDate, fmtTime, plural } from '../shared/format.js';
import { icon, arc } from '../shared/icons.js';
import { skeleton, lock } from '../shared/components.js';
import { barChart } from '../shared/charts.js';
import { openModal, closeModal, modalHead, toast, toastError, busy, showFieldErrors } from '../shared/ui.js';
import { hasPlan } from './state.js';
import { editDraft } from './modals.js';
import { micButton } from '../shared/dictation.js';
import { getLang } from '../shared/i18n.js';

const APPROACHES = [['habits', 'Habits', 'Daily habit checkboxes only, no numbers. Best for beginners.'], ['targets', 'Targets', 'Calories and protein (plus carbs and fat) against your targets.'], ['meal_plan', 'Meal plan', 'Your meal plan template, plus logging.']];
const MEAL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const CAT = { at_risk: 'May be at risk', purging: 'Purging', compensating: 'Compensating', earning: 'Earning or burning off food', restriction: 'Extreme restriction', fast_loss: 'Fast weight loss' };
const n = v => (v == null ? '' : v);
const fmt = v => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
const dayLabel = ymd => { const d = new Date(`${ymd}T12:00:00`); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]; };

function entryRow(e) {
  return `<div class="food-row">${e.photoUrl ? `<a href="${esc(e.photoUrl)}" target="_blank" rel="noopener"><img src="${esc(e.photoUrl)}" alt="Meal photo: ${esc(e.title)}" loading="lazy"></a>` : `<span class="food-thumb">${icon(e.source === 'barcode' ? 'scan' : e.source === 'voice' ? 'mic' : 'utensils')}</span>`}
    <div class="grow" style="min-width:0"><div class="strong small">${esc(e.title)}</div><div class="tiny muted">${MEAL[e.meal]} · ${fmtTime(e.loggedAt)} · ${e.items.map(i => esc(i.name) + (i.confidence === 'estimate' ? ' (estimate)' : '')).join(', ')}</div>${e.note ? `<div class="tiny" style="margin-top:2px">Note: “${esc(e.note)}”</div>` : ''}</div>
    <div class="stack s4" style="align-items:flex-end"><span class="small strong num">${fmt(e.totals.calories)} kcal</span><span class="tiny muted num">${fmt(e.totals.proteinG)} g protein</span></div></div>`;
}

export function nutritionTab(d, td) {
  td.clientName = d.client.name;
  const c = d.client, f = first(c.name), p = td.plan, w = td.week;
  const showTargets = p.approach !== 'habits';
  const days = w.days.map(x => dayLabel(x.day));
  return `<div class="split">
    <div class="stack s16">
      ${assistCard(f)}
      <section class="card pad stack s16" id="nt-plan">
        <div class="row between wrap"><div class="h3">Approach</div>${p.saved ? `<span class="tiny faint">Updated ${fmtDate(p.updatedAt)}</span>` : '<span class="pill">Not set yet</span>'}</div>
        <div class="seg" role="radiogroup" aria-label="Nutrition approach">${APPROACHES.map(([k, l]) => `<button type="button" role="radio" aria-checked="${p.approach === k}" class="${p.approach === k ? 'on' : ''}" data-act="ntApproach" data-v="${k}">${l}</button>`).join('')}</div>
        <p class="small muted" id="nt-approach-desc">${esc(APPROACHES.find(a => a[0] === p.approach)[2])}</p>
        <div id="nt-mealplan" ${p.approach === 'meal_plan' ? '' : 'hidden'} class="stack s8">
          <div class="field"><label for="nt-mp">Meal plan template</label><select class="select" id="nt-mp"><option value="">Choose a template</option>${td.templates.map(t => `<option value="${esc(t.id)}" ${t.id === p.mealPlanId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>${hasPlan('PRO') ? '' : `<span class="hint">${lock('PRO')} Templates are part of Pro.</span>`}</div>
          ${td.templates.length ? '' : '<p class="tiny muted">No templates yet. Create one on the Nutrition page.</p>'}
          <div class="target-warn small" ${td.scopeReminder || p.approach === 'meal_plan' ? '' : 'hidden'}>${icon('alert')} In some states, individualized meal plans require a dietitian license. Check your state’s rules, or refer to a registered dietitian.</div>
        </div>
        <label class="row" style="gap:10px"><button type="button" class="toggle ${p.hideNumbers ? 'on' : ''}" id="nt-hide" data-act="ntHide" aria-pressed="${p.hideNumbers}" aria-label="Hide numbers"></button><span class="small"><b>Hide numbers</b> · ${esc(f)} never sees calories or macros anywhere in the app. You still do.</span></label>
      </section>

      <section class="card pad stack s16" id="nt-targets" ${showTargets ? '' : 'hidden'}>
        <div class="row between wrap"><div class="h3">Targets</div><button class="btn sm" data-act="ntCalc">${icon('target')} Estimate with calculator</button></div>
        <form class="stack s16" data-form="ntSave" novalidate>
          <div class="grid g4" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
            ${[['calories', 'Calories', 'kcal'], ['proteinG', 'Protein', 'g'], ['carbsG', 'Carbs', 'g'], ['fatG', 'Fat', 'g']].map(([k, l, u]) => `<div class="field"><label for="nt-${k}">${l} <span class="faint">(${u})</span></label><input class="input" id="nt-${k}" name="${k}" type="number" inputmode="numeric" min="0" max="10000" value="${n(p[k])}" data-input="ntTarget"></div>`).join('')}
          </div>
          <div id="nt-warn">${warnHtml(td, p.calories, p.lowTargetConfirmedAt)}</div>
          <div class="tiny faint">${td.inputs.rmr ? `Estimated resting needs: about ${fmt(td.inputs.rmr)} kcal (Mifflin-St Jeor, from ${td.inputs.weightLb} lb, ${td.inputs.heightIn} in, age ${td.inputs.age}).` : 'Add sex and height with the calculator (and a birth year on their profile) so OneJump can check targets against resting needs.'}</div>
          <div class="field"><label for="nt-note">Note for ${esc(f)} <span class="faint">(shown in their app)</span></label><textarea class="textarea" id="nt-note" name="coachNote" rows="2" maxlength="2000" placeholder="e.g. Protein at every meal, weekends included.">${esc(p.coachNote || '')}</textarea></div>
          <div class="row"><button class="btn primary" type="submit">Save</button><span class="tiny muted">You set every target. Assist never changes them.</span></div>
        </form>
      </section>
      <section class="card pad stack s8" id="nt-note-only" ${showTargets ? 'hidden' : ''}>
        <div class="field"><label for="nt-note2">Note for ${esc(f)} <span class="faint">(shown in their app)</span></label><textarea class="textarea" id="nt-note2" rows="2" maxlength="2000">${esc(p.coachNote || '')}</textarea></div>
        <div><button class="btn primary sm" data-act="ntSaveNote">Save</button></div>
      </section>

      <section class="card pad stack s16"><div class="row between"><div class="h3">${arc()} This week</div>${hasPlan('PRO') ? '<button class="btn ghost xs" data-act="ntSummaryRefresh" aria-label="Refresh summary">' + icon('refresh') + '</button>' : lock('PRO')}</div>
        <div id="nt-summary">${hasPlan('PRO') ? skeleton(3) : `<p class="small muted">Logged on ${w.daysLogged} of 7 days${p.proteinG ? `, protein target reached on ${w.proteinHitDays}` : ''}. Assist’s weekly summary is part of Pro.</p>`}</div>
        <div class="stack s16">
          <div class="stack s4"><div class="row between"><span class="strong small">Protein</span><span class="tiny muted">g logged${p.proteinG ? ` · target ${p.proteinG}` : ''}</span></div>${barChart({ labels: days, a: w.days.map(x => x.proteinG), b: p.proteinG ? w.days.map(() => p.proteinG) : null, height: 150 })}</div>
          <div class="stack s4"><div class="row between"><span class="strong small">Calories</span><span class="tiny muted">kcal logged${p.calories ? ` · target ${fmt(p.calories)}` : ''}</span></div>${barChart({ labels: days, a: w.days.map(x => x.calories), b: p.calories ? w.days.map(() => p.calories) : null, height: 150, fmt: v => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v) })}</div>
        </div>
        <div class="tiny faint">Dark bars: logged. Light bars: your target. Days with nothing logged show as empty.</div>
      </section>

      <section class="card"><div class="card-head"><div class="h3">Today’s log</div><span class="tiny muted">${plural(td.today.length, 'entry', 'entries')}</span></div>
        <div class="pad stack s8">${td.today.map(entryRow).join('') || `<p class="small muted">${esc(f)} hasn’t logged anything today.</p>`}
        ${td.yesterday.length ? `<details><summary class="small strong" style="cursor:pointer">Yesterday (${td.yesterday.length})</summary><div class="stack s8" style="margin-top:8px">${td.yesterday.map(entryRow).join('')}</div></details>` : ''}</div>
        <div class="pad-sm tiny faint" style="border-top:1px solid var(--line)">Meal photos are private to you and ${esc(f)}, behind links that expire after 5 minutes.</div></section>
    </div>

    <div class="stack s16">
      ${td.flags.length ? `<section class="card" style="border-color:var(--warn)"><div class="card-head"><div class="h3">${icon('eyeOff')} Private flags</div><span class="pill">Only you</span></div>${td.flags.map(fl => `<div class="pad stack s8" style="border-top:1px solid var(--line)"><div class="row wrap"><span class="pill ${fl.severity === 'urgent' ? 'crit' : 'warn'}">${esc(CAT[fl.category] || fl.category)}</span><span class="tiny muted">${fmtDate(fl.createdAt)} · ${esc(fl.sourceType.replace('_', ' '))}</span></div><div class="small">“${esc(fl.text.slice(0, 300))}”</div>${fl.severity === 'urgent' ? '<div class="small strong">Please check on them today. If you believe they’re in immediate danger, contact local emergency services.</div>' : ''}<div class="row wrap"><button class="btn primary xs" data-act="ntFlagDraft" data-id="${esc(fl.id)}">Draft a reply</button><button class="btn ghost xs" data-act="ntFlagResolve" data-id="${esc(fl.id)}">Mark resolved</button></div></div>`).join('')}<div class="pad-sm tiny faint" style="border-top:1px solid var(--line)">${esc(f)} doesn’t see flags, and Assist never replies about them on its own.</div></section>` : ''}
      <section class="card pad stack s8"><div class="h3">Habits</div>
        ${td.habits.map(h => `<div class="row between" style="gap:8px"><div class="stack s4" style="min-width:0"><span class="small strong">${esc(h.title)}</span><span class="streak-dots" aria-label="${h.daysThisWeek} of the last 7 days">${h.last7.map(x => `<i class="${x ? 'on' : ''}"></i>`).join('')}</span></div><span class="tiny muted nowrap">${h.daysThisWeek}/7${h.streak > 1 ? ` · ${h.streak}-day streak` : ''}</span><button class="btn ghost icon sm" data-act="ntHabitRemove" data-id="${esc(h.id)}" aria-label="Remove ${esc(h.title)}">${icon('x')}</button></div>`).join('') || `<p class="small muted">No habits yet. ${esc(f)} ticks them off each day in the app.</p>`}
        <form class="row" data-form="ntHabitAdd"><label class="grow"><span class="sr">New habit</span><input class="input sm" name="title" placeholder="e.g. Protein at every meal" maxlength="80" autocomplete="off"></label><button class="btn sm" type="submit">${icon('plus')} Add</button></form>
      </section>
      <section class="card pad stack s8"><div class="h3">How ${esc(f)} logs</div><p class="small muted">Photo with Assist${hasPlan('PRO') ? '' : ' (Pro)'}, search, barcode, voice${hasPlan('PRO') ? '' : ' (Pro)'}, quick add, favorites and “repeat yesterday”. Nothing is saved until they tap Add.</p><a class="btn sm" href="/app/nutrition" style="align-self:flex-start">Nutrition page</a></section>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Assist builds the plan
function assistCard(f) {
  const pro = hasPlan('PRO');
  return `<section class="card pad stack s12" id="nt-assist">
    <div class="row between wrap"><div class="h3">${arc()} Build a plan with Assist</div>${pro ? '<span class="pill">Draft first</span>' : lock('PRO')}</div>
    <p class="small muted">Type or tap the mic and say what ${esc(f)} needs. Assist uses ${esc(f)}’s age, height, weight, goal, notes and recent check-ins. You review everything; ${esc(f)} sees nothing until you tap Use this plan.</p>
    ${pro ? `<div class="row" style="gap:8px;align-items:flex-start"><label class="grow"><span class="sr">What should the plan focus on?</span><textarea class="textarea" id="nt-ask" rows="2" maxlength="1500" placeholder="e.g. Fat loss, vegetarian, quick meals, she cooks on Sundays"></textarea></label>${micButton('nt-ask', { label: 'Talk instead of typing' })}</div>
    <div class="row wrap" style="gap:8px"><button class="btn primary" data-act="ntBuild">${arc()} Build plan</button><span class="tiny muted">Takes about 10 seconds.</span></div>` : `<p class="small muted">Assist-built nutrition plans are part of Pro.</p>`}
    <div id="nt-draft" aria-live="polite"></div>
  </section>`;
}

let draft = null, lastAsk = '';
const MEALS_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];
function draftHtml(r, f) {
  const d = r.draft, nums = d.calories != null;
  const label = { habits: 'Habits', targets: 'Targets', meal_plan: 'Meal plan' }[d.approach];
  return `<div class="panel pad stack s12" id="nt-draft-card">
    <div class="row between wrap"><span class="pill info">${arc()} Draft · only you see this</span><span class="tiny muted">Approach: ${esc(label)}</span></div>
    <p class="small" data-no-translate>${esc(d.summary)}</p>
    ${d.needsProfessional ? `<div class="target-warn small" role="alert">${icon('alert')} <span>${esc(d.professionalReason || 'This client may need a professional’s guidance.')}</span> <span>A registered dietitian or doctor should guide their nutrition.</span></div>` : ''}
    ${r.notes.map(x => `<div class="tiny muted">• ${esc(x)}</div>`).join('')}
    ${nums ? `<div class="grid g4" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">${[['calories', 'Calories', 'kcal'], ['proteinG', 'Protein', 'g'], ['carbsG', 'Carbs', 'g'], ['fatG', 'Fat', 'g']].map(([k, l, u]) => `<div class="field"><label for="nd-${k}">${l} <span class="faint">(${u})</span></label><input class="input" id="nd-${k}" type="number" inputmode="numeric" min="0" max="10000" value="${n(d[k])}"></div>`).join('')}</div>
      ${r.estimate?.rmr ? `<div class="tiny faint">Resting needs about ${fmt(r.estimate.rmr)} kcal, about ${fmt(r.estimate.maintenance)} kcal to maintain. Assist never goes below resting needs.</div>` : ''}` : ''}
    ${d.habits.length ? `<div class="stack s4"><span class="tiny strong muted">Daily habits</span>${d.habits.map((h, i) => `<label class="row small" style="gap:8px"><input type="checkbox" class="nd-habit" data-i="${i}" checked> <span data-no-translate>${esc(h)}</span></label>`).join('')}</div>` : ''}
    ${d.mealPlan ? `<div class="stack s8"><label class="row small strong" style="gap:8px"><input type="checkbox" id="nd-mp" checked> Meal plan: ${esc(d.mealPlan.name)}</label>
      <div class="grid g2" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">${d.mealPlan.days.map(day => `<div class="card pad-sm stack s4"><div class="small strong" data-no-translate>${esc(day.label)}</div>${[...day.meals].sort((a, b) => MEALS_ORDER.indexOf(a.meal) - MEALS_ORDER.indexOf(b.meal)).map(m => `<div class="tiny"><span class="muted">${MEAL[m.meal]}:</span> <span data-no-translate>${m.items.map(esc).join('; ')}</span></div>`).join('')}</div>`).join('')}</div>
      ${r.scopeReminder ? `<div class="target-warn small">${icon('alert')} ${esc(r.scopeReminder)}</div>` : ''}
      <div class="tiny faint">Saved as a meal plan template you can edit later on the Nutrition page.</div></div>` : ''}
    <div class="field"><label for="nd-note">Note for ${esc(f)} <span class="faint">(shown in their app)</span></label><textarea class="textarea" id="nd-note" rows="2" maxlength="2000">${esc(d.coachNote || '')}</textarea></div>
    <div id="nd-warn"></div>
    <div class="row wrap" style="gap:8px"><button class="btn primary" data-act="ntUseDraft">${icon('check')} Use this plan</button><button class="btn" data-act="ntBuild" data-again="1">${icon('refresh')} Try again</button><button class="btn ghost" data-act="ntDiscard">Discard</button></div>
  </div>`;
}
function readDraft() {
  const d = draft.draft, num = id => { const el = document.getElementById(id); return el && el.value !== '' ? Math.round(Number(el.value)) : null; };
  const nums = d.calories != null;
  return {
    approach: d.approach,
    calories: nums ? num('nd-calories') : null, proteinG: nums ? num('nd-proteinG') : null, carbsG: nums ? num('nd-carbsG') : null, fatG: nums ? num('nd-fatG') : null,
    habits: [...document.querySelectorAll('.nd-habit')].filter(x => x.checked).map(x => d.habits[Number(x.dataset.i)]),
    mealPlan: d.mealPlan && document.getElementById('nd-mp')?.checked ? d.mealPlan : null,
    coachNote: document.getElementById('nd-note')?.value.trim() || null,
    confirmLowTarget: !!document.getElementById('nd-confirm')?.checked,
  };
}

function warnHtml(td, calories, confirmedAt) {
  const rmr = td.inputs.rmr, cal = calories === '' || calories == null ? null : Number(calories);
  if (cal == null) return '';
  const low = rmr ? cal < rmr : cal < 1200;
  if (!low) return '';
  const unchanged = confirmedAt && Number(td.plan.calories) === cal;
  return `<div class="target-warn" role="alert"><div class="strong small">${icon('alert')} ${rmr ? `${fmt(cal)} kcal is below ${esc(first(td.clientName || ''))}${td.clientName ? '’s' : 'the client’s'} estimated resting needs (about ${fmt(rmr)} kcal).` : `${fmt(cal)} kcal is very low.`}</div><div class="small">Targets this low can be unsafe without medical supervision. Consider a higher target, or refer to a registered dietitian or doctor.</div>
    ${unchanged ? `<div class="tiny muted">${icon('check')} You reviewed this target on ${fmtDate(confirmedAt)}.</div>` : '<label class="row small" style="gap:8px"><input type="checkbox" id="nt-confirm" name="confirmLowTarget"> I’ve reviewed this target</label>'}</div>`;
}

let pending = {};
export function mountNutritionTab(root, d) {
  pending = {};
  d.td.clientName = d.client.name;
  if (hasPlan('PRO')) loadSummary(root, d.client.id);
  root.querySelector('#nt-mp')?.addEventListener('change', e => { pending.mealPlanId = e.target.value || null; savePlan(d, {}, root.querySelector('#nt-mp')); });
}
async function loadSummary(root, id, refresh = false) {
  const el = root.querySelector('#nt-summary'); if (!el) return;
  try {
    const s = await api.get(`/api/clients/${id}/nutrition-summary${refresh ? '?refresh=1' : ''}`);
    el.innerHTML = `<p class="small">${esc(s.summary)}</p>${s.wins.length || s.focus.length ? `<div class="grid g2 small">${s.wins.length ? `<div class="stack s4"><span class="tiny strong muted">Going well</span>${s.wins.map(x => `<span>${icon('check')} ${esc(x)}</span>`).join('')}</div>` : ''}${s.focus.length ? `<div class="stack s4"><span class="tiny strong muted">Worth a look</span>${s.focus.map(x => `<span>• ${esc(x)}</span>`).join('')}</div>` : ''}</div>` : ''}`;
  } catch (e) { el.innerHTML = `<p class="small muted">${esc(e.message)}</p>`; }
}

async function savePlan(d, extra, btn) {
  const c = d.client;
  const body = { ...pending, ...extra };
  busy(btn, true);
  try {
    const r = await api.put(`/api/clients/${c.id}/nutrition-plan`, body);
    Object.assign(d.td, r); pending = {};
    toast('Saved');
    return r;
  } catch (e) {
    if (e.data?.code === 'low_target') { const w = document.getElementById('nt-warn'); if (w) { w.innerHTML = warnHtml(d.td, body.calories ?? d.td.plan.calories, null); w.querySelector('#nt-confirm')?.focus(); } }
    toastError(e); throw e;
  } finally { busy(btn, false); }
}

export const nutritionActions = {
  async ntApproach(el, _e, ctx) {
    const v = el.dataset.v;
    el.parentElement.querySelectorAll('button').forEach(b => { const on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    document.getElementById('nt-approach-desc').textContent = APPROACHES.find(a => a[0] === v)[2];
    document.getElementById('nt-mealplan').hidden = v !== 'meal_plan';
    document.getElementById('nt-targets').hidden = v === 'habits';
    document.getElementById('nt-note-only').hidden = v !== 'habits';
    try { await savePlan(ctx.data, { approach: v }, null); } catch { /* shown */ }
  },
  async ntHide(el, _e, ctx) {
    const on = el.getAttribute('aria-pressed') !== 'true';
    el.classList.toggle('on', on); el.setAttribute('aria-pressed', on);
    try { await savePlan(ctx.data, { hideNumbers: on }, null); toast(on ? `${first(ctx.data.client.name)} won’t see any numbers` : 'Numbers are visible again'); } catch { el.classList.toggle('on', !on); el.setAttribute('aria-pressed', !on); }
  },
  async ntSaveNote(el, _e, ctx) { try { await savePlan(ctx.data, { coachNote: document.getElementById('nt-note2').value.trim() || null }, el); } catch { /* shown */ } },
  ntCalc(_el, _e, ctx) { calculator(ctx); },
  async ntBuild(el, _e, ctx) {
    const box = document.getElementById('nt-ask'), out = document.getElementById('nt-draft');
    const ask = el.dataset.again ? lastAsk : (box?.value.trim() || '');
    lastAsk = ask;
    busy(el, true, 'Building…');
    out.innerHTML = `<div class="panel pad stack s8">${skeleton(4)}<span class="tiny muted">Assist is looking at ${esc(first(ctx.data.client.name))}’s details…</span></div>`;
    try {
      draft = await api.post(`/api/clients/${ctx.data.client.id}/nutrition-plan/assist`, { request: ask, lang: getLang() });
      out.innerHTML = draftHtml(draft, first(ctx.data.client.name));
      out.querySelector('#nt-draft-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { out.innerHTML = `<p class="small" style="color:var(--crit)">${esc(e.message)}</p>`; }
    finally { busy(el, false); }
  },
  ntDiscard() { draft = null; const out = document.getElementById('nt-draft'); if (out) out.innerHTML = ''; },
  async ntUseDraft(el, _e, ctx) {
    if (!draft) return;
    const body = readDraft();
    busy(el, true, 'Saving…');
    try {
      const r = await api.post(`/api/clients/${ctx.data.client.id}/nutrition-plan/apply-draft`, body);
      draft = null;
      toast(r.message || 'Plan saved');
      ctx.refresh();
    } catch (e) {
      if (e.data?.code === 'low_target') document.getElementById('nd-warn').innerHTML = `<div class="target-warn" role="alert"><div class="small strong">${icon('alert')} ${esc(e.message)}</div><label class="row small" style="gap:8px"><input type="checkbox" id="nd-confirm"> I’ve reviewed this target</label></div>`;
      toastError(e);
    } finally { busy(el, false); }
  },
  ntSummaryRefresh(_el, _e, ctx) { const el = document.getElementById('nt-summary'); el.innerHTML = skeleton(3); loadSummary(document, ctx.data.client.id, true); },
  async ntFlagDraft(el, _e, ctx) {
    const r = await api.post(`/api/nutrition/flags/${el.dataset.id}/draft`);
    editDraft({ title: 'Reply privately', sub: `To ${esc(ctx.data.client.name)} · warm, no numbers`, text: r.text, clientId: r.clientId, onSend: async v => { await api.post(`/api/threads/${r.clientId}/messages`, { body: v, insightId: r.insightId }); toast('Sent'); } });
  },
  async ntFlagResolve(el, _e, ctx) { await api.post(`/api/nutrition/flags/${el.dataset.id}/resolve`); toast('Marked resolved'); ctx.refresh(); },
  async ntHabitRemove(el, _e, ctx) { await api.del(`/api/clients/${ctx.data.client.id}/habits/${el.dataset.id}`); toast('Habit removed'); ctx.refresh(); },
};
export const nutritionInputs = {
  ntTarget(el, _e, ctx) {
    pending[el.name] = el.value === '' ? null : Number(el.value);
    if (el.name === 'calories') document.getElementById('nt-warn').innerHTML = warnHtml(ctx.data.td, el.value, ctx.data.td.plan.lowTargetConfirmedAt);
  },
};
export const nutritionForms = {
  async ntSave(form, _e, ctx) {
    const f = Object.fromEntries(new FormData(form));
    const body = { calories: f.calories === '' ? null : Number(f.calories), proteinG: f.proteinG === '' ? null : Number(f.proteinG), carbsG: f.carbsG === '' ? null : Number(f.carbsG), fatG: f.fatG === '' ? null : Number(f.fatG), coachNote: f.coachNote.trim() || null, confirmLowTarget: !!form.querySelector('#nt-confirm')?.checked };
    try { await savePlan(ctx.data, body, form.querySelector('[type=submit]')); ctx.refresh(); } catch (e) { showFieldErrors(form, e.data?.fields); }
  },
  async ntHabitAdd(form, _e, ctx) {
    const t = form.title.value.trim(); if (!t) return form.title.focus();
    try { await api.post(`/api/clients/${ctx.data.client.id}/habits`, { title: t }); toast('Habit added'); ctx.refresh(); } catch (e) { toastError(e); }
  },
};

function calculator(ctx) {
  const d = ctx.data, p = d.td.plan, i = d.td.inputs, f = first(d.client.name);
  const ft = i.heightIn ? Math.floor(i.heightIn / 12) : '', inch = i.heightIn ? Math.round(i.heightIn % 12) : '';
  const m = openModal(`${modalHead('Estimate with calculator', `For ${esc(d.client.name)} · an estimate you confirm`)}
    <form class="modal-body" id="calc-form" novalidate>
      <div class="grid g2"><div class="field"><label for="calc-sex">Sex <span class="faint">(for the formula only)</span></label><select class="select" id="calc-sex" name="sex"><option value="">Choose</option><option value="female" ${i.sex === 'female' ? 'selected' : ''}>Female</option><option value="male" ${i.sex === 'male' ? 'selected' : ''}>Male</option></select></div>
      <div class="field"><label for="calc-age">Age</label><input class="input" id="calc-age" name="age" type="number" min="13" max="100" value="${n(i.age)}"></div></div>
      <div class="grid g3"><div class="field"><label for="calc-ft">Height (ft)</label><input class="input" id="calc-ft" name="ft" type="number" min="3" max="8" value="${ft}"></div><div class="field"><label for="calc-in">(in)</label><input class="input" id="calc-in" name="in" type="number" min="0" max="11" value="${inch}"></div><div class="field"><label for="calc-w">Weight (lb)</label><input class="input" id="calc-w" name="weightLb" type="number" min="60" max="800" value="${n(i.weightLb)}"><span class="hint">Latest weigh-in</span></div></div>
      <div class="field"><label for="calc-act">Activity</label><select class="select" id="calc-act" name="activity">${d.td.activityOptions.map(a => `<option value="${a.value}" ${Number(i.activity) === a.value ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select></div>
      <div class="field"><label for="calc-goal">Goal</label><select class="select" id="calc-goal" name="goal">${[['lose', 'Fat loss'], ['maintain', 'Maintain'], ['gain', 'Muscle gain']].map(([v, l]) => `<option value="${v}" ${i.goal === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div id="calc-out"></div>
      <p class="tiny faint">Mifflin-St Jeor resting needs × activity, adjusted for the goal, never below resting needs. Protein 0.7–1 g per lb. It’s an estimate: you set the final numbers, and ${esc(f)} doesn’t see this.</p>
    </form>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn" id="calc-go">Estimate</button><button class="btn primary" id="calc-use" disabled>Use these numbers</button></div>`, { label: 'Calculator' });
  let est = null, form = m.querySelector('#calc-form');
  const read = () => { const v = Object.fromEntries(new FormData(form)); return { sex: v.sex || undefined, age: v.age ? Number(v.age) : undefined, heightIn: v.ft ? Number(v.ft) * 12 + Number(v.in || 0) : undefined, weightLb: v.weightLb ? Number(v.weightLb) : undefined, activity: Number(v.activity), goal: v.goal }; };
  m.querySelector('#calc-go').addEventListener('click', async ev => {
    const btn = ev.currentTarget;
    busy(btn, true, 'Working…');
    try {
      est = (await api.post(`/api/clients/${d.client.id}/nutrition-plan/estimate`, read())).estimate;
      m.querySelector('#calc-out').innerHTML = `<div class="panel pad stack s8"><div class="row between"><span class="pill info">Estimate</span><span class="tiny muted">resting ${fmt(est.rmr)} · maintain ${fmt(est.maintenance)} kcal</span></div>
        <div class="grid g4" style="grid-template-columns:repeat(4,minmax(0,1fr))">${[['Calories', fmt(est.calories)], ['Protein', `${est.proteinG} g`], ['Carbs', `${est.carbsG} g`], ['Fat', `${est.fatG} g`]].map(([l, v]) => `<div><div class="tiny faint">${l}</div><div class="strong">${v}</div></div>`).join('')}</div>
        <ul class="small" style="margin:0;padding-left:18px">${est.notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
      m.querySelector('#calc-use').disabled = false;
    } catch (e) { showFieldErrors(form, e.data?.fields); m.querySelector('#calc-out').innerHTML = `<div class="small" style="color:var(--crit)">${esc(e.message)}</div>`; }
    busy(btn, false);
  });
  m.querySelector('#calc-use').addEventListener('click', () => {
    const v = read();
    Object.assign(pending, { sex: v.sex || null, heightIn: v.heightIn || null, activity: v.activity, goal: v.goal });
    for (const [k, val] of [['calories', est.calories], ['proteinG', est.proteinG], ['carbsG', est.carbsG], ['fatG', est.fatG]]) { const inp = document.getElementById(`nt-${k}`); if (inp) { inp.value = val; pending[k] = val; } }
    d.td.inputs = { ...d.td.inputs, rmr: est.rmr };
    document.getElementById('nt-warn').innerHTML = warnHtml(d.td, est.calories, null);
    closeModal();
    toast('Filled in. Check the numbers, then Save.');
    document.getElementById('nt-calories')?.focus();
  });
}
