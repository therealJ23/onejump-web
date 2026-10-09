// Client: Nutrition (log food by photo, search, barcode, voice or quick add; habits; the coach's
// plan). Logging is always fast and always confirmed: nothing is saved before Add. If the coach
// turned on "Hide numbers", the API sends no calories or macros, so none are shown anywhere.
import { api } from '../../shared/api.js';
import { esc, fmtTime, plural } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { openModal, closeModal, modalHead, toast, toastError, busy } from '../../shared/ui.js';
import { resizeToJpeg, scanBarcode, MIC_OFF } from '../../shared/media.js';
import { dictationSupported, listenOnce } from '../../shared/dictation.js';
import { brandRow } from './today.js';

const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snacks']];
const MEAL1 = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const MULT = [[0.5, '½×'], [1, '1×'], [1.5, '1½×'], [2, '2×']];
const r0 = v => Math.round(v || 0);
const kcal = v => r0(v).toLocaleString('en-US');
const fmtDayHead = (day, today) => { if (day === today) return 'Today'; const d = new Date(`${day}T12:00:00`); const y = new Date(`${today}T12:00:00`); y.setDate(y.getDate() - 1); return d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
const shiftDay = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let D = null; // current screen data
const hidden = () => D?.hideNumbers;

function macro(label, value, target, unit = '') {
  const over = target && value > target, pct = target ? Math.min(100, (value / target) * 100) : 0;
  return `<div class="macro ${over ? 'over' : ''}"><div class="row between small"><span class="strong">${label}</span><span class="num">${kcal(value)}${unit}${target ? ` <span class="muted">/ ${kcal(target)}${unit}</span>` : ''}</span></div>${target ? `<div class="bar" role="img" aria-label="${label}: ${kcal(value)} of ${kcal(target)}${unit}"><i style="width:${pct}%"></i></div>` : ''}</div>`;
}
function summaryCard(d) {
  const logged = d.entries.length;
  if (d.hideNumbers || d.approach === 'habits' || !d.totals) {
    return `<div class="card pad row" style="gap:12px"><span class="q-icon">${icon('utensils')}</span><div class="grow"><div class="strong">${logged ? `${plural(logged, 'meal')} logged` : 'Nothing logged yet'}</div><div class="tiny muted">${d.approach === 'habits' ? 'Your habits are what count. Logging meals is a bonus.' : 'Log what you eat; your coach takes it from there.'}</div></div></div>`;
  }
  const t = d.targets || {};
  return `<div class="card pad stack s16">${macro('Calories', d.totals.calories, t.calories)}${macro('Protein', d.totals.proteinG, t.proteinG, ' g')}
    ${t.carbsG || t.fatG ? `<div class="grid g2" style="grid-template-columns:1fr 1fr">${macro('Carbs', d.totals.carbsG, t.carbsG, ' g')}${macro('Fat', d.totals.fatG, t.fatG, ' g')}</div>` : ''}
    <div class="tiny faint">Targets from your coach. Over or under is just information.</div></div>`;
}
function habitsCard(d) {
  if (!d.habits.length) return '';
  return `<section class="stack s8" aria-label="Daily habits"><div class="strong small">Daily habits</div>${d.habits.map(h => `<button class="habit-row ${h.done ? 'on' : ''}" data-act="habit" data-id="${esc(h.id)}" aria-pressed="${h.done}"><span class="check ${h.done ? 'on' : ''}" aria-hidden="true">${icon('check')}</span><span class="grow stack s4"><span class="small strong">${esc(h.title)}</span><span class="streak-dots" aria-hidden="true">${h.last7.map(x => `<i class="${x ? 'on' : ''}"></i>`).join('')}</span></span><span class="tiny muted nowrap">${h.streak > 1 ? `${h.streak}-day streak` : `${h.daysThisWeek}/7`}</span></button>`).join('')}</section>`;
}
function entryRow(e) {
  return `<div class="food-row">${e.photoUrl ? `<img src="${esc(e.photoUrl)}" alt="">` : `<span class="food-thumb">${icon(e.source === 'barcode' ? 'scan' : e.source === 'voice' ? 'mic' : e.source === 'favorite' ? 'star' : 'utensils')}</span>`}
    <div class="grow" style="min-width:0"><div class="strong small">${esc(e.title)}</div><div class="tiny muted clamp2">${e.items.map(i => esc(i.name)).join(', ')}${e.totals ? ` · ${kcal(e.totals.calories)} kcal · ${r0(e.totals.proteinG)} g protein` : ''}</div></div>
    <button class="btn ghost icon sm" data-act="favEntry" data-id="${esc(e.id)}" aria-label="Save ${esc(e.title)} as a favorite" title="Save as favorite">${icon('star')}</button><button class="btn ghost icon sm" data-act="delEntry" data-id="${esc(e.id)}" aria-label="Remove ${esc(e.title)}">${icon('trash')}</button></div>`;
}
function mealPlanCard(mp) {
  if (!mp) return '';
  return `<details class="card pad stack s8"><summary class="strong" style="cursor:pointer">Your meal plan: ${esc(mp.name)}</summary>${mp.notes ? `<p class="small muted">${esc(mp.notes)}</p>` : ''}${mp.days.map(day => `<div class="stack s4"><div class="tiny strong muted">${esc(day.label)}</div>${day.meals.map(m => `<div class="small"><b>${MEAL1[m.meal]}:</b> ${m.items.map(esc).join(' · ')}</div>`).join('')}</div>`).join('')}</details>`;
}
const credits = d => `<p class="credit" style="text-align:center">${d.credits.map(c => `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.text.replace('Contains data from ', '').replace(', available under the Open Database License', ' (ODbL)'))}</a>`).join(' · ')} · <a href="/data-sources" target="_blank" rel="noopener">About our food data</a></p>`;

export default {
  tab: 'nutrition',
  title: () => 'Nutrition',
  async load(params) { D = await api.get(`/api/me/nutrition/today${params.query?.day ? `?day=${params.query.day}` : ''}`); return D; },
  render(d) {
    const isToday = d.day === d.today;
    const byMeal = m => d.entries.filter(e => e.meal === m);
    return `<div class="row between" style="padding-top:4px">${brandRow()}<span class="strong">Nutrition</span></div>
      <div class="row between"><a class="btn ghost icon sm" href="/client/nutrition?day=${shiftDay(d.day, -1)}" aria-label="Previous day">${icon('chevL')}</a><span class="strong">${esc(fmtDayHead(d.day, d.today))}</span>${isToday ? '<span style="width:32px"></span>' : `<a class="btn ghost icon sm" href="/client/nutrition${shiftDay(d.day, 1) === d.today ? '' : `?day=${shiftDay(d.day, 1)}`}" aria-label="Next day">${icon('chevR')}</a>`}</div>
      ${d.coachNote ? `<div class="card pad small" style="border-left:3px solid var(--volt-deep)"><b>From your coach:</b> ${esc(d.coachNote)}</div>` : ''}
      ${summaryCard(d)}
      <button class="btn assist lg" data-act="logFood" style="width:100%">${icon('plus')} Log food</button>
      ${isToday && d.repeat.length ? `<div class="row wrap" style="gap:6px"><span class="tiny strong muted">${icon('repeat').replace('class="ico ', 'style="width:14px;height:14px;vertical-align:-3px" class="ico ')} Repeat yesterday’s</span>${d.repeat.map(m => `<button class="chip" style="height:30px;font-size:.8rem" data-act="repeat" data-meal="${m}" aria-label="Repeat yesterday’s ${MEAL1[m].toLowerCase()}">${MEAL1[m].toLowerCase()}</button>`).join('')}</div>` : ''}
      ${isToday && d.favorites.length ? `<div class="row wrap" style="gap:6px"><span class="tiny strong muted">${icon('star').replace('class="ico ', 'style="width:14px;height:14px;vertical-align:-3px" class="ico ')} Favorites</span>${d.favorites.slice(0, 6).map(f => `<button class="chip" style="height:30px;font-size:.8rem" data-act="useFav" data-id="${esc(f.id)}">${esc(f.title)}</button>`).join('')}</div>` : ''}
      ${habitsCard(d)}
      ${mealPlanCard(d.mealPlan)}
      ${MEALS.map(([m, l]) => `<section class="meal-group" aria-label="${l}"><div class="row between"><span class="strong small">${l}</span>${byMeal(m).length && !hidden() ? `<span class="tiny muted num">${kcal(byMeal(m).reduce((n, e) => n + (e.totals?.calories || 0), 0))} kcal</span>` : ''}</div>${byMeal(m).map(entryRow).join('') || `<button class="food-row" style="width:100%;cursor:pointer;color:inherit;font:inherit;text-align:left;border-style:dashed" data-act="logFood" data-meal="${m}"><span class="food-thumb">${icon('plus')}</span><span class="small muted">Add ${l.toLowerCase()}</span></button>`}</section>`).join('')}
      ${credits(d)}`;
  },
  actions: {
    logFood(el) { logSheet(el.dataset.meal || D.suggestedMeal); },
    async habit(el, _e, ctx) {
      const on = el.getAttribute('aria-pressed') !== 'true';
      el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); el.querySelector('.check').classList.toggle('on', on);
      try { await api.post(`/api/me/habits/${el.dataset.id}/check`, { day: D.day }); if (on && navigator.vibrate) navigator.vibrate(12); ctx.refresh(); }
      catch (e) { toastError(e); ctx.refresh(); }
    },
    async delEntry(el, _e, ctx) { await api.del(`/api/me/food-entries/${el.dataset.id}`); toast('Removed'); ctx.refresh(); },
    async favEntry(el) { await api.post('/api/me/food-favorites', { entryId: el.dataset.id }); toast('Saved to favorites'); },
    async repeat(el, _e, ctx) { busy(el, true, 'Adding…'); try { await api.post('/api/me/food-entries/repeat', { meal: el.dataset.meal }); toast(`Yesterday’s ${MEAL1[el.dataset.meal].toLowerCase()} added`); ctx.refresh(); } catch (e) { busy(el, false); toastError(e); } },
    async useFav(el, _e, ctx) { busy(el, true, 'Adding…'); try { await api.post('/api/me/food-entries', { meal: D.suggestedMeal, source: 'favorite', favoriteId: el.dataset.id, day: D.day }); toast('Added'); ctx.refresh(); } catch (e) { busy(el, false); toastError(e); } },
  },
};

// ---------------------------------------------------------------- the log sheet
const proLock = '<span class="lock">PRO</span>';
function logSheet(meal) {
  const f = D.features;
  const m = openModal(`${modalHead('Log food', 'Nothing is saved until you tap Add')}
    <div class="modal-body">
      <div class="log-options">
        <button data-pick="photo" ${f.photo ? '' : 'aria-disabled="true"'}>${f.photo ? '' : proLock}${icon('camera')}Photo</button>
        <button data-pick="search">${icon('search')}Search</button>
        <button data-pick="scan">${icon('scan')}Scan</button>
        <button data-pick="voice" ${f.voice ? '' : 'aria-disabled="true"'}>${f.voice ? '' : proLock}${icon('mic')}Voice</button>
        <button data-pick="quick">${icon('plus')}Quick add</button>
      </div>
      <input type="file" accept="image/*" capture="environment" id="food-cam" class="sr" tabindex="-1" aria-hidden="true">
      <p class="tiny muted" id="ls-hint">${f.photo ? 'Photo: snap your plate and Assist lists the foods and portions for you to check.' : 'Photo and voice logging are part of your coach’s Pro plan.'}</p>
    </div>`, { label: 'Log food' });
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    const k = b.dataset.pick;
    if (b.getAttribute('aria-disabled') === 'true') { m.querySelector('#ls-hint').innerHTML = `<b>${k === 'photo' ? 'Photo' : 'Voice'} logging is part of Pro.</b> Ask your coach about it. Search, scan and quick add work on every plan.`; return; }
    if (k === 'photo') m.querySelector('#food-cam').click();
    if (k === 'search') searchSheet(meal);
    if (k === 'scan') scanSheet(meal);
    if (k === 'voice') voiceSheet(meal);
    if (k === 'quick') quickSheet(meal);
  });
  m.querySelector('#food-cam').addEventListener('change', e => { const file = e.target.files?.[0]; if (file) photoFlow(file, meal); });
}

const mealSelect = (meal, id = 'meal-sel') => `<div class="field"><label for="${id}">Meal</label><select class="select" id="${id}">${MEALS.map(([k]) => `<option value="${k}" ${k === meal ? 'selected' : ''}>${MEAL1[k]}</option>`).join('')}</select></div>`;
async function save(body, btn) {
  busy(btn, true, 'Adding…');
  try {
    await api.post('/api/me/food-entries', { day: D.day, ...body });
    closeModal(); toast('Added'); if (navigator.vibrate) navigator.vibrate(12);
    const { ctx } = await import('../main.js'); ctx.refresh();
  } catch (e) { busy(btn, false); toastError(e); }
}

// ----- review (photo, voice, text): portion chips, grams, remove, add, meal
function reviewSheet(state) {
  const { title, photoUrl = null, photoToken = null, source } = state;
  const list = state.list || (state.list = state.items.map(i => ({ ...i, base: i.base || i.grams || 100 })));
  const meal = state.meal, note = state.note || '';
  const html = () => list.map((it, i) => `<div class="review-item ${it.check ? 'needs-check' : ''}" data-i="${i}">
      <div class="row between top"><div class="stack s4" style="min-width:0"><span class="strong small">${esc(it.name)}</span><span class="tiny muted">${esc(it.portionText || '')}${it.matched && it.matched !== it.name ? ` · matched to ${esc(it.matched)}` : ''}${it.confidence === 'estimate' ? ' · estimate' : ''}</span>${it.check ? `<span class="tiny" style="color:var(--warn);font-weight:700">${icon('alert')} Check this portion</span>` : ''}</div><button class="btn ghost icon sm" data-rm="${i}" aria-label="Remove ${esc(it.name)}">${icon('x')}</button></div>
      <div class="row wrap" style="gap:8px"><div class="portion-chips" role="group" aria-label="Portion">${MULT.map(([k, l]) => `<button type="button" data-mult="${k}" class="${Math.abs(it.grams - it.base * k) < 1 ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label class="row small" style="gap:6px"><input class="input sm" style="width:84px" type="number" min="0" max="3000" inputmode="numeric" value="${r0(it.grams)}" data-g="${i}" aria-label="${esc(it.name)} grams"> g</label>
        ${!hidden() && it.per100g ? `<span class="tiny muted num" data-n="${i}">${kcal(it.per100g.calories * it.grams / 100)} kcal · ${r0(it.per100g.proteinG * it.grams / 100)} g protein</span>` : ''}</div></div>`).join('') || '<p class="small muted">No items. Add one below.</p>';
  const m = openModal(`${modalHead(esc(title || 'Check and add'), source === 'photo' ? 'Assist estimated these from your photo. Adjust anything.' : 'Check the foods and portions')}
    <div class="modal-body">${photoUrl ? `<img src="${esc(photoUrl)}" alt="Your meal photo" style="width:100%;max-height:220px;object-fit:cover;border-radius:14px">` : ''}
      <div class="stack s8" id="rv-items">${html()}</div>
      <div><button class="btn sm" id="rv-add">${icon('plus')} Add an item</button></div>
      ${mealSelect(meal)}
      <div class="field"><label for="rv-note">Note <span class="faint">(optional)</span></label><input class="input" id="rv-note" maxlength="300" value="${esc(note)}" placeholder="e.g. ate out with friends"></div>
      ${source === 'photo' ? '<p class="tiny faint">Portions are estimated from the photo. Your photo is private to you and your coach.</p>' : ''}
    </div>
    <div class="modal-foot"><button class="btn" id="rv-cancel">Cancel</button><button class="btn primary" id="rv-save">Add</button></div>`, { label: 'Check and add' });
  const box = m.querySelector('#rv-items');
  const redraw = () => { box.innerHTML = html(); };
  box.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]'); if (rm) { list.splice(+rm.dataset.rm, 1); redraw(); return; }
    const mu = e.target.closest('[data-mult]'); if (mu) { const i = +mu.closest('[data-i]').dataset.i; list[i].grams = Math.round(list[i].base * Number(mu.dataset.mult)); list[i].check = false; redraw(); }
  });
  box.addEventListener('input', e => { const g = e.target.closest('[data-g]'); if (g) { const i = +g.dataset.g; list[i].grams = Number(g.value) || 0; list[i].check = false; const n = box.querySelector(`[data-n="${i}"]`); if (n && list[i].per100g) n.textContent = `${kcal(list[i].per100g.calories * list[i].grams / 100)} kcal · ${r0(list[i].per100g.proteinG * list[i].grams / 100)} g protein`; } });
  const keep = () => { state.meal = m.querySelector('#meal-sel').value; state.note = m.querySelector('#rv-note').value; };
  m.querySelector('#rv-add').addEventListener('click', () => { keep(); pickFood(f => { list.push({ name: f.name, foodRef: f.ref, grams: f.defaultGrams || 100, base: f.defaultGrams || 100, portionText: f.servings?.[0]?.label, per100g: f.per100g }); reviewSheet(state); }, { onBack: () => reviewSheet(state) }); });
  m.querySelector('#rv-cancel').addEventListener('click', async () => { closeModal(); if (photoToken) api.del(`/api/me/food-photo/${photoToken}`).catch(() => {}); });
  m.querySelector('#rv-save').addEventListener('click', ev => {
    if (!list.length) { toast('Add at least one food.', { error: true }); return; }
    save({ meal: m.querySelector('#meal-sel').value, source, title, photoToken: photoToken || undefined, note: m.querySelector('#rv-note').value.trim() || undefined,
      items: list.map(it => ({ name: it.name, grams: it.grams, foodRef: it.foodRef, portionText: it.portionText || null, confidence: it.confidence || null })) }, ev.currentTarget);
  });
}

// ----- photo with Assist
async function photoFlow(file, meal) {
  const m = openModal(`${modalHead('Reading your photo…')}<div class="modal-body"><div class="thinking" role="status">${icon('camera')}<span>Assist is looking at your plate…</span></div></div>`, { label: 'Reading your photo' });
  try {
    const jpg = await resizeToJpeg(file, 1024, 0.8);
    const fd = new FormData(); fd.append('photo', jpg, 'meal.jpg');
    const r = await api.post('/api/me/food-photo', fd);
    if (!document.contains(m)) { api.del(`/api/me/food-photo/${r.photoToken}`).catch(() => {}); return; }
    reviewSheet({ title: r.title, items: r.items.map(i => ({ ...i, base: i.grams })), photoUrl: r.photoUrl, photoToken: r.photoToken, source: 'photo', meal });
  } catch (e) {
    const notFood = e.data?.code === 'not_food';
    m.querySelector('.modal-body').innerHTML = `<div class="empty">${icon(notFood ? 'camera' : 'alert')}<p>${esc(notFood ? 'I couldn’t recognize food in this photo. Try again or search instead.' : e.message)}</p><div class="row"><button class="btn" id="pf-search">${icon('search')} Search instead</button></div></div>`;
    m.querySelector('#pf-search').addEventListener('click', () => searchSheet(meal));
  }
}

// ----- search (USDA)
function pickFood(onPick, { title = 'Search foods', onBack = null } = {}) {
  const m = openModal(`${modalHead(title)}<div class="modal-body"><div class="field"><label for="fs-q">Food</label><input class="input" id="fs-q" placeholder="e.g. chicken breast, Greek yogurt" autocomplete="off" maxlength="80" enterkeyhint="search"></div><div class="list card" id="fs-res" style="max-height:50vh;overflow:auto" aria-live="polite"><div class="pad-sm small muted">Type at least 2 letters.</div></div><p class="credit" id="fs-credit"></p></div>${onBack ? '<div class="modal-foot"><button class="btn" id="fs-back">Back</button></div>' : ''}`, { label: title });
  m.querySelector('#fs-back')?.addEventListener('click', () => onBack());
  const q = m.querySelector('#fs-q'), out = m.querySelector('#fs-res');
  let t = null, results = [];
  q.addEventListener('input', () => {
    clearTimeout(t);
    const v = q.value.trim(); if (v.length < 2) { out.innerHTML = '<div class="pad-sm small muted">Type at least 2 letters.</div>'; return; }
    out.innerHTML = '<div class="pad-sm small muted">Searching…</div>';
    t = setTimeout(async () => {
      try {
        const r = await api.get(`/api/foods/search?q=${encodeURIComponent(v)}`); results = r.results;
        m.querySelector('#fs-credit').innerHTML = `<a href="${esc(r.credit.url)}" target="_blank" rel="noopener">${esc(r.credit.text)}</a>`;
        out.innerHTML = results.map((f, i) => `<button class="li click" style="width:100%;background:none;border-left:0;border-right:0;text-align:left" data-r="${i}"><span class="grow"><span class="small strong" style="display:block">${esc(f.name)}</span><span class="tiny muted">${[f.brand, f.servings?.[0]?.label, !hidden() && f.per100g ? `${kcal(f.per100g.calories * (f.defaultGrams || 100) / 100)} kcal` : ''].filter(Boolean).map(esc).join(' · ')}</span></span>${icon('chevR')}</button>`).join('') || `<div class="pad-sm small muted">No matches for “${esc(v)}”. Try a simpler word, or use Quick add.</div>`;
      } catch (e) { out.innerHTML = `<div class="pad-sm small" style="color:var(--crit)">${esc(e.message)}</div>`; }
    }, 300);
  });
  out.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) { const f = results[+b.dataset.r]; closeModal(); onPick(f); } });
  setTimeout(() => q.focus(), 40);
}
function searchSheet(meal) { pickFood(f => portionSheet(f, meal, 'search')); }

/** One food: choose a serving, grams and meal, then Add. */
function portionSheet(f, meal, source, credit = null) {
  let grams = f.defaultGrams || 100;
  const nums = () => (!hidden() && f.per100g ? `<div class="grid g4" style="grid-template-columns:repeat(4,minmax(0,1fr))">${[['kcal', f.per100g.calories], ['protein', f.per100g.proteinG], ['carbs', f.per100g.carbsG], ['fat', f.per100g.fatG]].map(([l, v], i) => `<div><div class="tiny faint">${l}</div><div class="strong num">${i ? r0(v * grams / 100) + ' g' : kcal(v * grams / 100)}</div></div>`).join('')}</div>` : '');
  const m = openModal(`${modalHead(esc(f.name), esc(f.brand || ''))}
    <div class="modal-body">
      <div class="field"><span class="small strong">Serving</span><div class="portion-chips" id="ps-serv">${(f.servings || []).map((s, i) => `<button type="button" data-s="${i}" class="${i === 0 ? 'on' : ''}">${esc(s.label)}</button>`).join('')}</div></div>
      <div class="row wrap" style="gap:8px"><div class="portion-chips" id="ps-mult">${MULT.map(([k, l]) => `<button type="button" data-m="${k}" class="${k === 1 ? 'on' : ''}">${l}</button>`).join('')}</div><label class="row small" style="gap:6px"><input class="input sm" id="ps-g" style="width:90px" type="number" min="1" max="3000" value="${r0(grams)}" aria-label="Grams"> g</label></div>
      <div id="ps-n">${nums()}</div>
      ${mealSelect(meal)}
      ${credit ? `<p class="credit"><a href="${esc(credit.url)}" target="_blank" rel="noopener">${esc(credit.text)}</a>${credit.license ? ` · <a href="${esc(credit.license)}" target="_blank" rel="noopener">ODbL</a>` : ''}</p>` : ''}
    </div>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="ps-add">Add</button></div>`, { label: f.name });
  let base = grams;
  const upd = () => { m.querySelector('#ps-g').value = r0(grams); m.querySelector('#ps-n').innerHTML = nums(); };
  m.querySelector('#ps-serv').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; base = grams = f.servings[+b.dataset.s].grams; m.querySelectorAll('#ps-serv button').forEach(x => x.classList.toggle('on', x === b)); m.querySelectorAll('#ps-mult button').forEach(x => x.classList.toggle('on', x.dataset.m === '1')); upd(); });
  m.querySelector('#ps-mult').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; grams = base * Number(b.dataset.m); m.querySelectorAll('#ps-mult button').forEach(x => x.classList.toggle('on', x === b)); upd(); });
  m.querySelector('#ps-g').addEventListener('input', e => { grams = Number(e.target.value) || 0; m.querySelector('#ps-n').innerHTML = nums(); });
  m.querySelector('#ps-add').addEventListener('click', ev => {
    const serv = m.querySelector('#ps-serv .on')?.textContent, mult = m.querySelector('#ps-mult .on')?.textContent;
    save({ meal: m.querySelector('#meal-sel').value, source, title: f.name, items: [{ name: f.name, grams: r0(grams), foodRef: f.ref, portionText: serv ? `${mult && mult !== '1×' ? mult + ' ' : ''}${serv}` : `${r0(grams)} g` }] }, ev.currentTarget);
  });
}

// ----- barcode (Open Food Facts)
function scanSheet(meal) {
  const m = openModal(`${modalHead('Scan a barcode', 'Point the camera at the barcode on the package')}
    <div class="modal-body"><div class="scan-box"><video id="sc-v" playsinline muted aria-label="Camera preview"></video><span class="scan-line" aria-hidden="true"></span></div>
      <p class="small" id="sc-msg" role="status">Starting the camera…</p>
      <form class="row" id="sc-form"><label class="grow"><span class="sr">Barcode numbers</span><input class="input" id="sc-code" inputmode="numeric" pattern="[0-9]*" maxlength="14" placeholder="Or type the numbers under the barcode" autocomplete="off"></label><button class="btn" type="submit">Look up</button></form>
      <p class="credit">Contains data from <a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener">Open Food Facts</a>, available under the <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">Open Database License</a>.</p></div>`, { label: 'Scan a barcode' });
  const msg = m.querySelector('#sc-msg');
  const scan = scanBarcode(m.querySelector('#sc-v'));
  const lookup = async code => {
    scan.stop(); msg.textContent = `Looking up ${code}…`;
    try { const r = await api.get(`/api/foods/barcode/${encodeURIComponent(code)}`); portionSheet(r.food, meal, 'barcode', r.credit); }
    catch (e) {
      if (e.data?.quickAdd) { m.querySelector('.modal-body').insertAdjacentHTML('beforeend', `<div class="panel pad-sm stack s8"><div class="small"><b>We couldn’t find that product.</b> Add it yourself in a few seconds.</div><button class="btn primary sm" id="sc-quick">${icon('plus')} Quick add</button></div>`); msg.textContent = ''; m.querySelector('#sc-quick').addEventListener('click', () => quickSheet(meal)); }
      else msg.textContent = e.message;
    }
  };
  scan.result.then(code => { if (document.contains(m)) lookup(code); }).catch(e => { if (e.code !== 'stopped') msg.textContent = e.message; });
  msg.textContent = 'Hold steady. It reads on its own.';
  m.querySelector('#sc-form').addEventListener('submit', e => { e.preventDefault(); const c = m.querySelector('#sc-code').value.replace(/\D/g, ''); if (c.length < 8) { msg.textContent = 'Barcodes have 8 to 14 digits.'; return; } lookup(c); });
  const obs = new MutationObserver(() => { if (!document.contains(m)) { scan.stop(); obs.disconnect(); } });
  obs.observe(document.body, { childList: true });
}

// ----- voice (dictation → foods → review)
async function textToReview(text, meal, source, btn) {
  busy(btn, true, 'Finding foods…');
  try { const r = await api.post('/api/me/food-text', { text, source }); reviewSheet({ title: r.items.length === 1 ? r.items[0].name : 'Check and add', items: r.items, source, meal }); if (r.unmatched?.length) toast(`Couldn’t match: ${r.unmatched.join(', ')}. Add it with search.`, { ms: 7000 }); }
  catch (e) { busy(btn, false); toastError(e); }
}
function voiceSheet(meal) {
  const m = openModal(`${modalHead('Say what you ate', 'e.g. “two eggs and toast”')}
    <div class="modal-body" style="align-items:center;text-align:center"><button class="voice-orb" id="vf-orb" aria-label="Tap to talk">${icon('mic').replace('class="ico ', 'style="width:56px;height:56px" class="ico ')}</button>
      <div class="field" style="width:100%;text-align:left"><label for="vf-text">What you said</label><textarea class="textarea" id="vf-text" rows="2" placeholder="Tap the circle and talk, or type here"></textarea></div>
      <p class="small" id="vf-msg" role="status">${dictationSupported ? 'Tap the circle to start. Your browser turns speech into text.' : 'Voice isn’t available in this browser. Type what you ate instead.'}</p></div>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="vf-go">Find foods</button></div>`, { label: 'Voice food logging' });
  const orb = m.querySelector('#vf-orb'), ta = m.querySelector('#vf-text'), msg = m.querySelector('#vf-msg');
  if (!dictationSupported) orb.disabled = true;
  orb.addEventListener('click', async () => {
    if (orb.classList.contains('listening')) { listenOnce.stop?.(); return; }
    orb.classList.add('listening'); msg.innerHTML = '<span class="rec-dot">Listening</span>';
    try { const t = await listenOnce({ onInterim: v => { ta.value = v; } }); if (t) ta.value = t; msg.textContent = t ? 'Check the text, then Find foods.' : 'I didn’t catch that. Try again or type it.'; }
    catch (e) { msg.textContent = e.code === 'denied' ? MIC_OFF : e.message; }
    orb.classList.remove('listening');
  });
  m.querySelector('#vf-go').addEventListener('click', ev => { const t = ta.value.trim(); if (!t) { ta.focus(); return; } textToReview(t, meal, 'voice', ev.currentTarget); });
}

// ----- quick add
function quickSheet(meal) {
  if (hidden()) {
    const m = openModal(`${modalHead('Quick add', 'Describe it in a few words')}<div class="modal-body"><div class="field"><label for="qa-t">What did you have?</label><input class="input" id="qa-t" placeholder="e.g. turkey sandwich and an apple" maxlength="300"></div></div><div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="qa-go">Next</button></div>`, { label: 'Quick add' });
    m.querySelector('#qa-go').addEventListener('click', ev => { const t = m.querySelector('#qa-t').value.trim(); if (!t) return m.querySelector('#qa-t').focus(); textToReview(t, meal, 'text', ev.currentTarget); });
    return;
  }
  const m = openModal(`${modalHead('Quick add', 'For when you know the numbers')}
    <form class="modal-body" id="qa-form" novalidate><div class="field"><label for="qa-name">Name</label><input class="input" id="qa-name" name="name" maxlength="120" placeholder="e.g. Turkey sandwich" required></div>
      <div class="grid g2" style="grid-template-columns:1fr 1fr"><div class="field"><label for="qa-cal">Calories</label><input class="input" id="qa-cal" name="calories" type="number" inputmode="numeric" min="0" max="10000" required></div><div class="field"><label for="qa-p">Protein (g)</label><input class="input" id="qa-p" name="proteinG" type="number" inputmode="numeric" min="0" max="1000" required></div>
      <div class="field"><label for="qa-c">Carbs (g) <span class="faint">optional</span></label><input class="input" id="qa-c" name="carbsG" type="number" inputmode="numeric" min="0" max="2000"></div><div class="field"><label for="qa-f">Fat (g) <span class="faint">optional</span></label><input class="input" id="qa-f" name="fatG" type="number" inputmode="numeric" min="0" max="1000"></div></div>
      ${mealSelect(meal)}<div class="form-error" id="qa-err" role="alert" hidden></div></form>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="qa-add">Add</button></div>`, { label: 'Quick add' });
  m.querySelector('#qa-add').addEventListener('click', ev => {
    const f = Object.fromEntries(new FormData(m.querySelector('#qa-form'))), err = m.querySelector('#qa-err');
    if (!f.name.trim() || f.calories === '' || f.proteinG === '') { err.textContent = 'Add a name, calories and protein.'; err.hidden = false; return; }
    save({ meal: m.querySelector('#meal-sel').value, source: 'quick', title: f.name.trim(), items: [{ name: f.name.trim(), calories: Number(f.calories), proteinG: Number(f.proteinG), carbsG: f.carbsG === '' ? 0 : Number(f.carbsG), fatG: f.fatG === '' ? 0 : Number(f.fatG) }] }, ev.currentTarget);
  });
}

export { fmtTime };
