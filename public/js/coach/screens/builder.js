// Workout builder (prototype V.builder): library panel, blocks with set tables, supersets,
// swap for alternatives, drag and drop, autosave, assign, and the Assist workout generator.
import { api } from '../../shared/api.js';
import { esc, plural, keyToday, rel, clamp } from '../../shared/format.js';
import { icon, arc } from '../../shared/icons.js';
import { assistBadge, thinking, skeleton, emptyState, avatar } from '../../shared/components.js';
import { openModal, closeModal, modalHead, toast, toastError, busy } from '../../shared/ui.js';
import { ui, setUi } from '../state.js';
import { refreshCounts } from '../shell.js';

const MUSCLES = ['All', 'Legs', 'Push', 'Pull', 'Core', 'Power', 'Cardio'];
const MFN = {
  All: () => true,
  Legs: e => ['squat', 'hinge', 'lunge'].includes(e.pattern) || /Ham|Quad|Glute|Calv|Leg/.test(e.muscle),
  Push: e => e.pattern === 'push', Pull: e => e.pattern === 'pull', Core: e => ['core', 'carry'].includes(e.pattern), Power: e => e.pattern === 'jump', Cardio: e => e.pattern === 'cardio',
};
const GEN_EQUIP = ['Dumbbell', 'Barbell', 'Kettlebell', 'Machine', 'Cable', 'Band', 'Bodyweight', 'Box', 'Trap bar', 'Bike', 'Rower'];
const uid = p => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const newSet = () => ({ reps: '10', load: '', rpe: '7', rest: '75' });
const newBlock = exerciseId => ({ id: uid('b'), kind: 'single', items: [{ id: uid('i'), exerciseId, tempo: '', notes: '', sets: [newSet(), newSet(), newSet()] }] });
const countSets = blocks => blocks.reduce((n, b) => n + b.items.reduce((m, i) => m + i.sets.length, 0), 0);
const estMin = blocks => Math.max(10, Math.round(blocks.reduce((n, b) => n + b.items.reduce((m, it) => m + it.sets.reduce((k, s) => k + 0.9 + (Number(s.rest) || 60) / 60, 0), 0), 0) / 1.15));

let saveTimer = null;

function libList(d) {
  const q = ui('libq', '').toLowerCase(), mf = ui('libm', 'All');
  const list = d.library.filter(e => MFN[mf](e) && `${e.name} ${e.muscle} ${e.equipment}`.toLowerCase().includes(q));
  return list.slice(0, 120).map(e => `<div class="lib-item" draggable="true" data-ex="${e.id}"><span class="thumb">${icon('play')}</span><div class="grow" style="min-width:0"><div class="strong small">${esc(e.name)}</div><div class="tiny muted">${esc(e.muscle)} · ${esc(e.equipment)}${e.custom ? ' · custom' : ''}</div></div><button class="btn ghost icon sm" data-act="addEx" data-ex="${e.id}" aria-label="Add ${esc(e.name)}">${icon('plus')}</button></div>`).join('') || '<div class="pad-sm small muted">No exercises match.</div>';
}

function itemCard(d, it, label) {
  const e = d.ex.get(it.exerciseId) || { name: 'Unknown exercise', muscle: '', equipment: '' };
  return `<div class="block" data-item="${it.id}">
    <div class="block-head"><span class="block-letter">${label}</span><span class="thumb" style="width:34px;height:34px">${icon('play')}</span><div class="grow" style="min-width:0"><div class="strong">${esc(e.name)}</div><div class="tiny muted">${esc(e.muscle)} · ${esc(e.equipment)}${e.kneeLoad ? ' · knee-intensive' : ''}</div></div>
      <button class="btn ghost icon sm" data-act="swapEx" data-item="${it.id}" aria-label="Swap ${esc(e.name)}" title="Swap for an alternative">${icon('swap')}</button>
      <button class="btn ghost icon sm" data-act="delItem" data-item="${it.id}" aria-label="Remove ${esc(e.name)}">${icon('trash')}</button></div>
    <div style="padding:0 14px 12px;overflow-x:auto"><table class="sets"><thead><tr><th>Set</th><th>Reps</th><th>Load</th><th>RPE</th><th>Rest (s)</th><th><span class="sr">Remove</span></th></tr></thead><tbody>
      ${it.sets.map((s, si) => `<tr><td class="tiny strong muted" style="width:36px">${si + 1}</td>${['reps', 'load', 'rpe', 'rest'].map(f => `<td><input aria-label="Set ${si + 1} ${f}" value="${esc(s[f])}" maxlength="${f === 'rpe' || f === 'rest' ? 10 : 20}" data-input="setEdit" data-item="${it.id}" data-si="${si}" data-f="${f}"></td>`).join('')}<td style="width:30px"><button class="btn ghost icon xs" style="width:26px" data-act="delSet" data-item="${it.id}" data-si="${si}" aria-label="Remove set ${si + 1}" ${it.sets.length < 2 ? 'disabled' : ''}>${icon('x')}</button></td></tr>`).join('')}
    </tbody></table>
    <div class="row wrap" style="margin-top:8px;gap:8px"><button class="btn ghost xs" data-act="addSet" data-item="${it.id}">${icon('plus')} Set</button><label class="row tiny muted" style="gap:6px">Tempo <input class="input sm" style="width:90px" value="${esc(it.tempo)}" maxlength="20" placeholder="3-1-1" data-input="itemEdit" data-item="${it.id}" data-f="tempo"></label><label class="row tiny muted grow" style="gap:6px;min-width:180px">Notes <input class="input sm grow" value="${esc(it.notes)}" maxlength="200" placeholder="Coaching cue for the client" data-input="itemEdit" data-item="${it.id}" data-f="notes"></label></div></div>
  </div>`;
}

function blocksHtml(d) {
  const bl = d.workout.blocks;
  if (!bl.length) return `<div class="block empty" id="drop-end" style="padding:40px 22px;border-style:dashed">${icon('plus')}<div class="strong">Add your first exercise</div><div class="small muted">Tap + in the library, drag one here, or let Assist draft the whole workout.</div><div><button class="btn assist sm" data-act="aiWorkout">${arc()} Generate with Assist</button></div></div>`;
  let letter = 0;
  return bl.map((b, bi) => {
    const L = String.fromCharCode(65 + letter++);
    const items = b.items.map((it, ii) => itemCard(d, it, b.items.length > 1 ? `${L}${ii + 1}` : L)).join('');
    return b.items.length > 1
      ? `<div class="group-box block" draggable="true" data-block="${b.id}"><div class="row between"><span class="group-label">${b.kind === 'circuit' ? `Circuit · ${b.items[0].sets.length} rounds` : 'Superset'}</span><div class="row"><button class="btn ghost xs" data-act="toggleKind" data-b="${b.id}">${b.kind === 'circuit' ? 'Make superset' : 'Make circuit'}</button><span class="grip" title="Drag to reorder" aria-hidden="true">${icon('grip')}</span><button class="btn ghost xs" data-act="ungroup" data-b="${b.id}">Ungroup</button></div></div>${items}${bi < bl.length - 1 ? `<div class="row" style="justify-content:center"><button class="btn ghost xs" data-act="superset" data-b="${b.id}">${icon('link')} Add next exercise to this group</button></div>` : ''}</div>`
      : `<div class="block-wrap block" draggable="true" data-block="${b.id}" style="border:0;background:none">${items}<div class="row" style="justify-content:center;margin-top:6px;gap:4px">${bi > 0 ? `<button class="btn ghost xs" data-act="moveBlock" data-b="${b.id}" data-d="-1" aria-label="Move up">↑</button>` : ''}${bi < bl.length - 1 ? `<button class="btn ghost xs" data-act="moveBlock" data-b="${b.id}" data-d="1" aria-label="Move down">↓</button><button class="btn ghost xs" data-act="superset" data-b="${b.id}">${icon('link')} Superset with next</button>` : ''}</div></div>`;
  }).join('') + `<div class="block empty" id="drop-end" style="padding:22px;border-style:dashed">${icon('plus')}<div class="small">Drag an exercise here to add a block</div></div>`;
}

const subLine = w => `${plural(w.blocks.length, 'block')} · ${plural(countSets(w.blocks), 'set')} · about ${estMin(w.blocks)} min`;

function pickerView(d) {
  return `<div class="page-head"><div><h1 class="h1">Workout builder</h1><p class="sub">Open a workout, start a new one, or let Assist draft it.</p></div><div class="row wrap"><button class="btn assist" data-act="aiWorkout">${arc()} Generate with Assist</button><button class="btn primary" data-act="newWorkout">${icon('plus')} New workout</button></div></div>
  ${d.workouts.length ? `<section class="card"><div class="card-head"><div class="h3">Recent workouts</div><a class="btn ghost sm" href="/app/programs">Programs</a></div><div class="list">${d.workouts.map(w => `<a class="li click" href="/app/builder/${w.id}"><span class="thumb">${icon('dumbbell')}</span><div class="grow" style="min-width:0"><div class="strong small">${esc(w.name)}</div><div class="tiny muted">${w.programName ? `${esc(w.programName)}${w.day ? ` · Day ${w.day}` : ''}` : 'Standalone'} · updated ${rel(w.updatedAt).toLowerCase()}</div></div>${icon('chevR')}</a>`).join('')}</div></section>`
  : `<section class="card">${emptyState('dumbbell', 'No workouts yet', 'Build one from the exercise library, or describe it and let Assist draft it.')}</section>`}`;
}

export default {
  nav: 'builder',
  title: d => d.workout?.name || 'Workout builder',
  async load(params) {
    const lib = await api.get('/api/exercises');
    const ex = new Map(lib.exercises.map(e => [e.id, e]));
    if (!params.id) {
      const [{ workouts }, { programs }] = await Promise.all([api.get('/api/workouts'), api.get('/api/programs')]);
      const P = new Map(programs.map(p => [p.id, p.name]));
      return { library: lib.exercises, ex, workouts: workouts.map(w => ({ ...w, programName: P.get(w.programId) })), workout: null };
    }
    const w = await api.get(`/api/workouts/${params.id}`);
    return { library: lib.exercises, ex, ...w, saved: true };
  },
  render(d) {
    if (!d.workout) return pickerView(d);
    const w = d.workout;
    const ctxLine = [w.clientId && d.client ? `Tailored for ${esc(d.client.name)}` : null, d.program ? `${esc(d.program.name)}${w.day ? ` · Day ${w.day}` : ''}${w.week ? ` · Week ${w.week}` : ''}` : null].filter(Boolean).join(' · ') || 'Standalone workout';
    return `
    ${d.program ? `<a class="btn ghost sm" style="align-self:flex-start;margin:-8px 0 -12px -8px" href="/app/programs/${d.program.id}">${icon('chevL')} ${esc(d.program.name)}</a>` : `<a class="btn ghost sm" style="align-self:flex-start;margin:-8px 0 -12px -8px" href="/app/builder">${icon('chevL')} All workouts</a>`}
    <div class="page-head"><div class="stack s4" style="min-width:0;flex:1"><div class="eyebrow">${ctxLine}</div><label class="sr" for="w-name">Workout name</label><input id="w-name" class="h1" style="border:0;background:transparent;padding:0;width:100%;min-width:0;color:inherit" value="${esc(w.name)}" maxlength="80" data-input="wName"><p class="sub" id="w-sub">${subLine(w)} · <span id="save-state" class="tiny">${d.saved ? 'Saved' : 'Unsaved changes'}</span></p></div>
      <div class="row wrap"><button class="btn assist" data-act="aiWorkout">${arc()} Generate with Assist</button><button class="btn" data-act="saveNow">Save</button><button class="btn primary" data-act="assignWorkout">${icon('user')} Assign</button></div></div>
    <div class="builder">
      <aside class="card" aria-label="Exercise library">
        <div class="pad-sm stack s8" style="border-bottom:1px solid var(--line)"><label class="search"><span class="sr">Search exercises</span>${icon('search')}<input class="input sm" id="lib-q" value="${esc(ui('libq', ''))}" placeholder="Search ${d.library.length} exercises" data-input="libSearch" autocomplete="off"></label><div class="chips">${MUSCLES.map(m => `<button class="chip ${ui('libm', 'All') === m ? 'on' : ''}" style="height:28px;font-size:.76rem;padding:0 10px" data-act="libMuscle" data-m="${m}" aria-pressed="${ui('libm', 'All') === m}">${m}</button>`).join('')}</div></div>
        <div class="lib-list" id="lib-list">${libList(d)}</div>
        <div class="pad-sm tiny faint" style="border-top:1px solid var(--line)">Drag into the workout, or tap +. <a href="/app/library">Manage library</a></div>
      </aside>
      <div class="stack s16" id="blocks" aria-label="Workout blocks">${blocksHtml(d)}</div>
    </div>
    ${w.clientId ? '' : `<section class="card pad row wrap" style="gap:12px"><div class="grow small muted">Delete this workout? Only possible when no client has it scheduled.</div><button class="btn sm" data-act="delWorkout">${icon('trash')} Delete workout</button></section>`}`;
  },
  mount(root, d, _p, ctx) { if (d.workout) dnd(root, ctx); },
  actions: {
    async newWorkout(el, _e, ctx) {
      busy(el, true, 'Creating…');
      try { const r = await api.post('/api/workouts', { name: 'New workout', blocks: [] }); ctx.navigate(`/app/builder/${r.workout.id}`); } catch (e) { busy(el, false); toastError(e); }
    },
    libMuscle(el, _e, ctx) { setUi('libm', el.dataset.m); document.querySelectorAll('[data-act="libMuscle"]').forEach(b => { const on = b.dataset.m === el.dataset.m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); document.getElementById('lib-list').innerHTML = libList(ctx.data); dnd(document, ctx, true); },
    addEx(el, _e, ctx) { change(ctx, w => w.blocks.push(newBlock(el.dataset.ex))); toast(`Added ${ctx.data.ex.get(el.dataset.ex)?.name}`); },
    addSet(el, _e, ctx) { change(ctx, () => { const { it } = find(ctx, el.dataset.item); it.sets.push({ ...(it.sets.at(-1) || newSet()) }); }); },
    delSet(el, _e, ctx) { change(ctx, () => { const { it } = find(ctx, el.dataset.item); if (it.sets.length > 1) it.sets.splice(+el.dataset.si, 1); }); },
    delItem(el, _e, ctx) {
      const snapshot = JSON.stringify(ctx.data.workout.blocks);
      const { it } = find(ctx, el.dataset.item);
      change(ctx, w => { for (const b of w.blocks) b.items = b.items.filter(i => i.id !== it.id); w.blocks = w.blocks.filter(b => b.items.length); w.blocks.forEach(b => { if (b.items.length === 1) b.kind = 'single'; }); });
      toast(`Removed ${ctx.data.ex.get(it.exerciseId)?.name || 'exercise'}`, { undo: () => change(ctx, w => { w.blocks = JSON.parse(snapshot); }) });
    },
    superset(el, _e, ctx) { change(ctx, w => { const i = w.blocks.findIndex(b => b.id === el.dataset.b); if (i < w.blocks.length - 1) { const nx = w.blocks.splice(i + 1, 1)[0]; w.blocks[i].items.push(...nx.items); if (w.blocks[i].kind === 'single') w.blocks[i].kind = 'superset'; } }); toast('Grouped'); },
    ungroup(el, _e, ctx) { change(ctx, w => { const i = w.blocks.findIndex(b => b.id === el.dataset.b); const g = w.blocks[i]; w.blocks.splice(i, 1, ...g.items.map(it => ({ id: uid('b'), kind: 'single', items: [it] }))); }); },
    toggleKind(el, _e, ctx) { change(ctx, w => { const b = w.blocks.find(x => x.id === el.dataset.b); b.kind = b.kind === 'circuit' ? 'superset' : 'circuit'; }); },
    moveBlock(el, _e, ctx) { change(ctx, w => { const i = w.blocks.findIndex(b => b.id === el.dataset.b), j = clamp(i + Number(el.dataset.d), 0, w.blocks.length - 1); const [m] = w.blocks.splice(i, 1); w.blocks.splice(j, 0, m); }); },
    swapEx(el, _e, ctx) {
      const { it } = find(ctx, el.dataset.item); const e = ctx.data.ex.get(it.exerciseId);
      const alts = (e?.alternatives || []).filter(a => ctx.data.ex.has(a.id));
      openModal(`${modalHead('Swap ' + esc(e?.name || 'exercise'), 'Alternatives that train the same pattern')}
        <div class="modal-body">${alts.length ? `<div class="list card">${alts.map(a => `<button class="li click" style="width:100%;border-left:0;border-right:0;background:none;text-align:left" data-act="swapTo" data-item="${it.id}" data-ex="${a.id}"><span class="thumb">${icon('play')}</span><span class="grow"><span class="strong small" style="display:block">${esc(a.name)}</span><span class="tiny muted">${esc(a.equipment)} · ${esc(a.level)}${a.kneeLoad ? '' : ' · easier on knees'}</span></span>${icon('chevR')}</button>`).join('')}</div>` : '<p class="small muted">No alternatives set for this exercise. Pick any exercise from the library instead.</p>'}
        <div class="field"><label for="sw-q">Or search the library</label><input class="input" id="sw-q" placeholder="Exercise name" autocomplete="off"></div><div class="list card" id="sw-list" style="max-height:240px;overflow:auto"></div></div>`, { label: 'Swap exercise' });
      const q = document.getElementById('sw-q');
      q.addEventListener('input', () => { const s = q.value.toLowerCase().trim(); document.getElementById('sw-list').innerHTML = s ? ctx.data.library.filter(x => x.name.toLowerCase().includes(s)).slice(0, 20).map(x => `<button class="li click" style="width:100%;border-left:0;border-right:0;background:none;text-align:left" data-act="swapTo" data-item="${it.id}" data-ex="${x.id}"><span class="grow strong small">${esc(x.name)}</span><span class="tiny muted">${esc(x.equipment)}</span></button>`).join('') : ''; });
    },
    swapTo(el, _e, ctx) {
      const { it } = find(ctx, el.dataset.item); const old = ctx.data.ex.get(it.exerciseId)?.name;
      closeModal(); change(ctx, () => { it.exerciseId = el.dataset.ex; });
      toast(`${old} → ${ctx.data.ex.get(el.dataset.ex)?.name}`);
    },
    async saveNow(el, _e, ctx) { busy(el, true); await save(ctx, true); busy(el, false); },
    async delWorkout(_el, _e, ctx) {
      try { await api.del(`/api/workouts/${ctx.data.workout.id}`); toast('Workout deleted'); ctx.navigate(ctx.data.program ? `/app/programs/${ctx.data.program.id}` : '/app/builder'); } catch (e) { toastError(e); }
    },
    assignWorkout(_el, _e, ctx) { assignModal(ctx); },
    aiWorkout(_el, _e, ctx) { genModal(ctx); },
    genEq(el) { el.classList.toggle('on'); el.setAttribute('aria-pressed', el.classList.contains('on')); },
    genPreset(el, _e, ctx) {
      const p = { knee: { goal: 'Strength', level: 'Intermediate', injuries: 'Left knee pain when squatting', minutes: 60 }, db: { goal: 'Fat loss', level: 'Beginner', equipment: ['Dumbbell'], minutes: 30, injuries: '' }, jump: { goal: 'Athletic performance', level: 'Intermediate', equipment: ['Barbell', 'Dumbbell', 'Box', 'Trap bar'], minutes: 60, injuries: '' } }[el.dataset.p];
      Object.assign(genRead(), p); genModal(ctx);
    },
    genRun(_el, _e, ctx) { genRun(ctx); },
    genRegen(_el, _e, ctx) { genRead().seed++; genRun(ctx); },
    genBrief(_el, _e, ctx) { genModal(ctx); },
    genVolume(el, _e, ctx) { const r = ui('genResult'); const dlt = +el.dataset.d; r.draft.blocks.forEach(b => b.items.forEach(it => { if (dlt > 0 && it.sets.length < 6) it.sets.push({ ...it.sets[0] }); if (dlt < 0 && it.sets.length > 1) it.sets.pop(); })); genResult(ctx, dlt > 0 ? 'Volume up: one more set per exercise' : 'Volume down: one fewer set per exercise'); },
    genIntensity(el, _e, ctx) { const r = ui('genResult'); const dlt = +el.dataset.d; r.draft.blocks.forEach(b => b.items.forEach(it => it.sets.forEach(s => { const n = parseFloat(s.rpe); if (!isNaN(n)) s.rpe = String(clamp(n + dlt, 5, 10)); }))); genResult(ctx, dlt > 0 ? 'Intensity up: RPE +1' : 'Intensity down: RPE −1'); },
    genSwap(el, _e, ctx) {
      const r = ui('genResult'), knee = /knee/i.test(genRead().injuries || '');
      for (const b of r.draft.blocks) for (const it of b.items) if (it.id === el.dataset.item) {
        const e = ctx.data.ex.get(it.exerciseId);
        const alts = (e?.alternatives || []).filter(a => ctx.data.ex.has(a.id) && (!knee || !a.kneeLoad)).map(a => a.id);
        if (alts.length) it.exerciseId = alts[(alts.indexOf(it.exerciseId) + 1) % alts.length] || alts[0];
      }
      genResult(ctx, 'Exercise replaced');
    },
    async genAccept(el, _e, ctx) {
      const r = ui('genResult'); busy(el, true, 'Adding…');
      try {
        const out = await api.post(`/api/workouts/generate/${r.insightId}/accept`, { workoutId: ctx.data.workout?.id, blocks: r.draft.blocks, name: ctx.data.workout ? undefined : r.draft.name });
        closeModal(); setUi('genResult', null); refreshCounts();
        toast('Workout added to the builder. Edit anything.', { assist: true });
        if (ctx.data.workout) ctx.refresh(); else ctx.navigate(`/app/builder/${out.workout.id}`);
      } catch (e) { busy(el, false); toastError(e); }
    },
  },
  inputs: {
    wName(el, _e, ctx) { ctx.data.workout.name = el.value; dirty(ctx); },
    setEdit(el, _e, ctx) { const { it } = find(ctx, el.dataset.item); it.sets[+el.dataset.si][el.dataset.f] = el.value; dirty(ctx); },
    itemEdit(el, _e, ctx) { const { it } = find(ctx, el.dataset.item); it[el.dataset.f] = el.value; dirty(ctx); },
    libSearch(el, _e, ctx) { setUi('libq', el.value); document.getElementById('lib-list').innerHTML = libList(ctx.data); dnd(document, ctx, true); },
  },
};

function find(ctx, itemId) { for (const b of ctx.data.workout.blocks) { const it = b.items.find(i => i.id === itemId); if (it) return { b, it }; } return {}; }

/** Structural change: mutate, re-render blocks, schedule a save. */
function change(ctx, fn) {
  fn(ctx.data.workout);
  const box = document.getElementById('blocks');
  if (box) { box.innerHTML = blocksHtml(ctx.data); dnd(document, ctx, false, true); }
  dirty(ctx);
}
function dirty(ctx) {
  ctx.data.saved = false;
  const s = document.getElementById('w-sub'); if (s) s.innerHTML = `${subLine(ctx.data.workout)} · <span id="save-state" class="tiny">Unsaved changes</span>`;
  clearTimeout(saveTimer); saveTimer = setTimeout(() => save(ctx), 1200);
}
async function save(ctx, loud = false) {
  clearTimeout(saveTimer); saveTimer = null;
  const w = ctx.data.workout; if (!w) return;
  const st = () => document.getElementById('save-state');
  if (st()) st().textContent = 'Saving…';
  const body = { name: w.name.trim() || 'Workout', blocks: w.blocks.map(b => ({ id: b.id, kind: b.kind, items: b.items.map(i => ({ id: i.id, exerciseId: i.exerciseId, tempo: i.tempo || '', notes: i.notes || '', sets: i.sets })) })) };
  try {
    const r = await api.put(`/api/workouts/${w.id}`, body);
    if (ctx.data.workout?.id !== w.id) return;
    ctx.data.saved = true; w.estMinutes = r.workout.estMinutes;
    if (st()) st().textContent = 'Saved';
    if (loud) toast('Workout saved');
  } catch (e) { if (st()) st().textContent = 'Not saved'; toastError(e); }
}
window.addEventListener('beforeunload', e => { if (saveTimer) { e.preventDefault(); } });

function dnd(root, ctx, libOnly = false, blocksOnly = false) {
  let dragEx = null, dragBlock = null;
  if (!blocksOnly) root.querySelectorAll('.lib-item').forEach(el => el.addEventListener('dragstart', e => { dragEx = el.dataset.ex; window.__ojDragEx = dragEx; e.dataTransfer.setData('text/plain', dragEx); e.dataTransfer.effectAllowed = 'copy'; }));
  if (libOnly) return;
  const getEx = () => dragEx || window.__ojDragEx;
  root.querySelectorAll('#blocks > [data-block]').forEach(el => {
    el.addEventListener('dragstart', e => { if (e.target.closest('input,button')) { e.preventDefault(); return; } dragBlock = el.dataset.block; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragBlock); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('over');
      const ex = getEx(), target = el.dataset.block;
      if (dragBlock && dragBlock !== target) { const from = dragBlock; change(ctx, w => { const f = w.blocks.findIndex(b => b.id === from); const [m] = w.blocks.splice(f, 1); w.blocks.splice(w.blocks.findIndex(b => b.id === target), 0, m); }); toast('Reordered'); }
      else if (ex && !dragBlock) { change(ctx, w => w.blocks.splice(w.blocks.findIndex(b => b.id === target), 0, newBlock(ex))); toast(`Added ${ctx.data.ex.get(ex)?.name}`); }
      dragEx = dragBlock = window.__ojDragEx = null;
    });
  });
  const end = root.querySelector('#drop-end');
  if (end) {
    end.addEventListener('dragover', e => { e.preventDefault(); end.style.borderColor = 'var(--green)'; });
    end.addEventListener('dragleave', () => { end.style.borderColor = ''; });
    end.addEventListener('drop', e => { e.preventDefault(); const ex = getEx(); if (ex) { change(ctx, w => w.blocks.push(newBlock(ex))); toast(`Added ${ctx.data.ex.get(ex)?.name}`); } dragEx = window.__ojDragEx = null; });
  }
}

async function assignModal(ctx) {
  if (saveTimer || !ctx.data.saved) await save(ctx);
  const { clients } = await api.get('/api/clients');
  const list = clients.filter(c => ['NEW', 'ACTIVE'].includes(c.status));
  const w = ctx.data.workout;
  const m = openModal(`${modalHead('Assign workout', esc(w.name))}<div class="modal-body">
    ${list.length ? `<div class="field"><span class="label">Clients</span><div class="list card" style="max-height:280px;overflow:auto">${list.map(c => `<label class="li click" style="cursor:pointer"><input type="checkbox" name="as-c" value="${c.id}" ${w.clientId === c.id ? 'checked' : ''}>${avatar(c, 'sm')}<span class="grow small strong">${esc(c.name)}</span><span class="tiny muted">${c.program ? esc(c.program.name) : 'No program'}</span></label>`).join('')}</div></div>
    <div class="field"><label for="as-d">Date</label><input class="input" id="as-d" type="date" value="${keyToday()}"></div>
    <div class="field"><label for="as-n">Note for the client (optional)</label><input class="input" id="as-n" maxlength="500" placeholder="e.g. Extra session while you’re traveling"></div>
    <p class="tiny muted">Adds this as a one-off workout on that date. To give someone a whole program, assign the program from their profile.</p>` : '<p>No active clients yet. Invite one first.</p>'}
    </div><div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button>${list.length ? '<button class="btn primary" id="as-go">Assign</button>' : ''}</div>`, { label: 'Assign workout' });
  m.querySelector('#as-go')?.addEventListener('click', async ev => {
    const ids = [...m.querySelectorAll('[name="as-c"]:checked')].map(i => i.value);
    if (!ids.length) return toast('Pick at least one client.');
    busy(ev.currentTarget, true, 'Assigning…');
    try { const r = await api.post(`/api/workouts/${w.id}/assign`, { clientIds: ids, date: m.querySelector('#as-d').value, note: m.querySelector('#as-n').value || undefined }); closeModal(); toast(`Assigned to ${plural(r.assigned, 'client')}. They’ll see it in their app on that day.`); }
    catch (e) { busy(ev.currentTarget, false); toastError(e); }
  });
}

// ---------------------------------------------------------------- Assist workout generator
function genRead() {
  const g = ui('gen', null) || setUiRet('gen', { goal: 'Fat loss', level: 'Intermediate', equipment: ['Dumbbell', 'Barbell', 'Machine', 'Cable', 'Kettlebell', 'Bike'], daysPerWeek: 4, minutes: 45, injuries: '', prefs: '', seed: 1, clientId: '' });
  const v = id => document.getElementById(id)?.value;
  if (document.getElementById('g-goal')) Object.assign(g, { goal: v('g-goal'), level: v('g-level'), daysPerWeek: +v('g-days'), minutes: +v('g-min'), injuries: v('g-inj'), prefs: v('g-pref'), clientId: v('g-client'), equipment: [...document.querySelectorAll('[data-act="genEq"].on')].map(b => b.dataset.eq) });
  return g;
}
function setUiRet(k, v) { setUi(k, v); return v; }

async function genModal(ctx) {
  const g = genRead();
  const clients = ctx.data.clients || (ctx.data.clients = (await api.get('/api/clients')).clients.filter(c => ['NEW', 'ACTIVE'].includes(c.status)));
  if (!g.clientId && ctx.data.workout?.clientId) g.clientId = ctx.data.workout.clientId;
  openModal(`${modalHead(`${arc()} Generate a workout`, 'Assist drafts it from your brief. You review every exercise before it goes anywhere.')}
    <div class="modal-body" id="gen-body">
      <div class="grid g2">
        <div class="field"><label for="g-goal">Client goal</label><select class="select" id="g-goal">${['Fat loss', 'Strength', 'Muscle gain', 'Athletic performance', 'General fitness'].map(v => `<option ${g.goal === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label for="g-level">Experience</label><select class="select" id="g-level">${['Beginner', 'Intermediate', 'Advanced'].map(v => `<option ${g.level === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label for="g-days">Training days per week</label><select class="select" id="g-days">${[2, 3, 4, 5, 6].map(v => `<option ${g.daysPerWeek === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label for="g-min">Session length</label><select class="select" id="g-min">${[30, 45, 60, 75].map(v => `<option value="${v}" ${g.minutes === v ? 'selected' : ''}>${v} minutes</option>`).join('')}</select></div>
      </div>
      <div class="field"><span class="label">Available equipment</span><div class="row wrap" style="gap:6px">${GEN_EQUIP.map(e => `<button type="button" class="chip ${g.equipment.includes(e) ? 'on' : ''}" style="height:30px;font-size:.8rem" data-act="genEq" data-eq="${e}" aria-pressed="${g.equipment.includes(e)}">${e}</button>`).join('')}</div></div>
      <div class="field"><label for="g-inj">Injuries or limitations</label><input class="input" id="g-inj" maxlength="200" value="${esc(g.injuries)}" placeholder="e.g. left knee pain, shoulder impingement"><span class="hint">Assist leaves out exercises that load the area. It doesn’t create rehab plans.</span></div>
      <div class="field"><label for="g-pref">Exercise preferences</label><input class="input" id="g-pref" maxlength="200" value="${esc(g.prefs)}" placeholder="e.g. likes supersets; no burpees"></div>
      <div class="field"><label for="g-client">For a client (optional)</label><select class="select" id="g-client"><option value="">Nobody in particular</option>${clients.map(c => `<option value="${c.id}" ${g.clientId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><span class="hint">Assist reads their goal and anything they’ve flagged, nothing else.</span></div>
      <div class="row wrap tiny"><span class="muted">Try:</span><button type="button" class="link" data-act="genPreset" data-p="knee">Client with knee pain</button><button type="button" class="link" data-act="genPreset" data-p="db">Dumbbells only, 30 min</button><button type="button" class="link" data-act="genPreset" data-p="jump">Vertical jump athlete</button></div>
      ${ctx.data.workout?.blocks.length ? '<p class="tiny muted">Accepting replaces the exercises in this workout. You can undo by editing; nothing is sent to clients.</p>' : ''}
    </div>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn assist" data-act="genRun">${arc()} Generate workout</button></div>`, { wide: true, label: 'Generate a workout' });
}

async function genRun(ctx) {
  const g = genRead();
  const body = document.getElementById('gen-body'); if (!body) return;
  const foot = body.nextElementSibling;
  body.innerHTML = `<div class="stack s16" style="padding:20px 0">${thinking('Assist is choosing exercises, sets and rest for this client…')}${skeleton(4)}${skeleton(3)}</div>`; foot.innerHTML = '';
  try {
    const r = await api.post('/api/workouts/generate', { ...g, clientId: g.clientId || undefined });
    for (const [id, e] of Object.entries(r.exercises)) if (!ctx.data.ex.has(id)) ctx.data.ex.set(id, e);
    setUi('genResult', r);
    genResult(ctx);
  } catch (e) {
    body.innerHTML = `<div class="stack s8" style="padding:20px 0"><p>Assist couldn’t draft that: ${esc(e.message)}</p></div>`;
    foot.innerHTML = `<button class="btn" data-act="closeModal">Close</button><button class="btn" data-act="genBrief">Change brief</button>`;
  }
}

function genResult(ctx, msg) {
  const r = ui('genResult'), body = document.getElementById('gen-body'); if (!body || !r) return;
  const dr = r.draft; let L = 0;
  body.innerHTML = `
    <div class="row between wrap"><div class="stack s4"><div class="row">${assistBadge('Proposed workout')}</div><div class="h2">${esc(dr.name)}</div><div class="tiny muted">${plural(countSets(dr.blocks), 'set')} · about ${dr.estMinutes || estMin(dr.blocks)} min</div></div><div class="row wrap"><span class="tiny muted">Volume</span><div class="seg"><button data-act="genVolume" data-d="-1" aria-label="Less volume">−</button><button data-act="genVolume" data-d="1" aria-label="More volume">+</button></div><span class="tiny muted">Intensity</span><div class="seg"><button data-act="genIntensity" data-d="-1" aria-label="Lower intensity">−</button><button data-act="genIntensity" data-d="1" aria-label="Higher intensity">+</button></div></div></div>
    <p class="small muted">${esc(dr.rationale)}</p>
    ${(dr.notes || []).map(n => `<div class="pill warn" style="height:auto;padding:8px 12px;white-space:normal;line-height:1.4">${icon('alert')}<span>${esc(n)}</span></div>`).join('')}
    <div class="card list">${dr.blocks.map(b => { const letter = String.fromCharCode(65 + L++); return b.items.map((it, ii) => { const e = ctx.data.ex.get(it.exerciseId) || { name: it.exerciseId }; const s = it.sets[0] || {}; return `<div class="li"><span class="block-letter">${letter}${b.items.length > 1 ? ii + 1 : ''}</span><div class="grow" style="min-width:0"><div class="strong small">${esc(e.name)}${b.items.length > 1 && ii === 0 ? ` <span class="tag">${b.kind === 'circuit' ? 'Circuit' : 'Superset'}</span>` : ''}</div><div class="tiny muted">${it.sets.length} × ${esc(s.reps)}${s.rpe ? ' @ RPE ' + esc(s.rpe) : ''}${s.rest ? ` · rest ${esc(s.rest)}s` : ''}${it.notes ? ' · ' + esc(it.notes) : ''}</div></div><button class="btn ghost sm" data-act="genSwap" data-item="${it.id}">${icon('swap')} Replace</button></div>`; }).join(''); }).join('')}</div>
    ${msg ? `<div class="tiny assist-text" role="status">${esc(msg)}</div>` : ''}
    <p class="tiny faint">A suggestion for you to review. You’re responsible for the final programming. ${r.model === 'mock' || /mock/.test(r.model || '') ? '(Mock Assist: no AI key yet.)' : ''}</p>`;
  body.nextElementSibling.innerHTML = `<button class="btn" data-act="genRegen">${icon('refresh')} Regenerate</button><button class="btn" data-act="genBrief">Change brief</button><button class="btn primary" data-act="genAccept">${icon('check')} Accept and edit</button>`;
}

