// Exercise library (prototype V.library): shared OneJump library plus custom exercises.
import { api } from '../../shared/api.js';
import { esc } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { small } from '../../shared/components.js';
import { openModal, closeModal, modalHead, toast, toastError, busy, showFieldErrors, confirmDialog } from '../../shared/ui.js';
import { ui, setUi } from '../state.js';

const PATTERNS = [['iso', 'Isolation / other'], ['squat', 'Squat'], ['hinge', 'Hinge'], ['lunge', 'Lunge'], ['push', 'Push'], ['pull', 'Pull'], ['core', 'Core'], ['carry', 'Carry'], ['jump', 'Jump / power'], ['cardio', 'Cardio']];

function filtered(d) {
  const q = ui('lq', '').toLowerCase(), eq = ui('leq', 'All'), lv = ui('llv', 'All'), mine = ui('lmine', false);
  return d.exercises.filter(e => (eq === 'All' || e.equipment === eq) && (lv === 'All' || e.level === lv) && (!mine || e.custom) && `${e.name} ${e.muscle}`.toLowerCase().includes(q));
}
function grid(list) {
  return list.length ? list.map(e => `<button class="card cc" style="gap:10px" data-act="exDetail" data-ex="${e.id}"><div class="photo" style="aspect-ratio:16/9;place-items:center;background:var(--surface-3)"><span style="background:none;padding:0;color:var(--muted)">${small(icon('play'), 28)}</span></div><div class="strong">${esc(e.name)}</div><div class="row wrap" style="gap:6px"><span class="tag">${esc(e.muscle)}</span><span class="tag">${esc(e.equipment)}</span><span class="tag">${esc(e.level)}</span>${e.custom ? '<span class="pill assist">Custom</span>' : ''}</div></button>`).join('')
    : `<div class="card empty" style="grid-column:1/-1">${icon('search')}<div>No exercises match. Try another filter or create a custom exercise.</div></div>`;
}

export default {
  nav: 'library',
  title: () => 'Exercise library',
  load: () => api.get('/api/exercises'),
  render(d) {
    const eqs = ['All', ...[...new Set(d.exercises.map(e => e.equipment))].sort()];
    const eq = ui('leq', 'All'), lv = ui('llv', 'All');
    const custom = d.exercises.filter(e => e.custom).length;
    return `
    <div class="page-head"><div><h1 class="h1">Exercise library</h1><p class="sub">${d.exercises.length} exercises · ${custom} custom</p></div><button class="btn primary" data-act="newExercise">${icon('plus')} Custom exercise</button></div>
    <div class="row wrap"><label class="search grow" style="max-width:360px"><span class="sr">Search</span>${icon('search')}<input class="input" id="lq" placeholder="Search by name or muscle" value="${esc(ui('lq', ''))}" data-input="lSearch" autocomplete="off"></label>
      <label class="row small muted" for="leq">Equipment <select class="select" id="leq" style="width:auto;min-height:36px" data-change="lEq">${eqs.map(x => `<option ${eq === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="row small muted" for="llv">Level <select class="select" id="llv" style="width:auto;min-height:36px" data-change="lLv">${['All', 'Beginner', 'Intermediate', 'Advanced'].map(x => `<option ${lv === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="row small muted"><input type="checkbox" data-change="lMine" ${ui('lmine', false) ? 'checked' : ''}> Only my custom ones</label></div>
    <div class="client-grid" id="lib-grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">${grid(filtered(d))}</div>`;
  },
  actions: {
    lEq(el, _e, ctx) { setUi('leq', el.value); ctx.rerender(); },
    lLv(el, _e, ctx) { setUi('llv', el.value); ctx.rerender(); },
    lMine(el, _e, ctx) { setUi('lmine', el.checked); ctx.rerender(); },
    async exDetail(el, _e, ctx) {
      const e = ctx.data.exercises.find(x => x.id === el.dataset.ex);
      openModal(`${modalHead(esc(e.name), `${esc(e.muscle)} · ${esc(e.equipment)} · ${esc(e.level)}${e.kneeLoad ? ' · knee-intensive' : ''}`)}
        <div class="modal-body">${e.videoUrl ? `<a class="photo" style="aspect-ratio:16/9;place-items:center;display:grid" href="${esc(e.videoUrl)}" target="_blank" rel="noopener"><span style="display:flex;gap:8px;align-items:center">${icon('video')} Watch demo</span></a>` : `<div class="photo" style="aspect-ratio:16/9;place-items:center"><span style="display:flex;gap:8px;align-items:center">${icon('video')} Demo video coming soon</span></div>`}
        <div class="stack s8"><div class="strong">How to do it</div><ol class="small" style="margin:0;padding-left:20px">${(e.howTo || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>
        <div class="stack s8"><div class="strong">Alternatives</div><div class="row wrap" style="gap:6px">${e.alternatives.map(a => `<span class="tag">${esc(a.name)}</span>`).join('') || '<span class="muted small">None set</span>'}</div></div></div>
        <div class="modal-foot">${e.custom ? `<button class="btn ghost" data-act="delExercise" data-ex="${e.id}">${icon('trash')} Delete</button><span class="grow"></span>` : ''}<button class="btn" data-act="closeModal">Close</button><button class="btn primary" data-act="addToWorkout" data-ex="${e.id}">Add to a workout</button></div>`, { label: e.name });
    },
    async addToWorkout(el, _e, ctx) {
      const { workouts } = await api.get('/api/workouts');
      const name = ctx.data.exercises.find(x => x.id === el.dataset.ex)?.name;
      const m = openModal(`${modalHead('Add to a workout', esc(name))}<div class="modal-body">${workouts.length ? `<div class="field"><label for="aw-w">Workout</label><select class="select" id="aw-w">${workouts.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>` : '<p class="small muted">No workouts yet. A new one will be created.</p>'}</div><div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="aw-go">Add and open</button></div>`, { label: 'Add to a workout' });
      m.querySelector('#aw-go').addEventListener('click', async ev => {
        busy(ev.currentTarget, true, 'Adding…');
        try {
          const set = { reps: '10', load: '', rpe: '7', rest: '75' };
          const block = { kind: 'single', items: [{ exerciseId: el.dataset.ex, sets: [set, set, set] }] };
          let id = m.querySelector('#aw-w')?.value;
          if (id) { const w = await api.get(`/api/workouts/${id}`); await api.put(`/api/workouts/${id}`, { name: w.workout.name, blocks: [...w.workout.blocks, block] }); }
          else id = (await api.post('/api/workouts', { name: 'New workout', blocks: [block] })).workout.id;
          closeModal(); toast(`Added ${name}`); ctx.navigate(`/app/builder/${id}`);
        } catch (e) { busy(ev.currentTarget, false); toastError(e); }
      });
    },
    async delExercise(el, _e, ctx) {
      closeModal();
      if (!await confirmDialog({ title: 'Delete this custom exercise?', body: '<p class="small">Workouts that already use it keep working until you swap it out.</p>', confirm: 'Delete', danger: true })) return;
      try { await api.del(`/api/exercises/${el.dataset.ex}`); toast('Deleted'); ctx.refresh(); } catch (e) { toastError(e); }
    },
    newExercise(_el, _e, ctx) {
      const m = openModal(`${modalHead('Custom exercise', 'Only your business sees it')}
        <form class="modal-body" id="nx-form" novalidate><div class="field"><label for="nx-name">Name</label><input class="input" id="nx-name" name="name" maxlength="120" placeholder="e.g. Banded hip airplane" required></div>
        <div class="grid g3"><div class="field"><label for="nx-m">Muscle group</label><input class="input" id="nx-m" name="muscle" maxlength="60" placeholder="Glutes"></div><div class="field"><label for="nx-e">Equipment</label><select class="select" id="nx-e" name="equipment">${['Bodyweight', 'Dumbbell', 'Barbell', 'Band', 'Cable', 'Machine', 'Kettlebell', 'Other'].map(x => `<option>${x}</option>`).join('')}</select></div><div class="field"><label for="nx-l">Difficulty</label><select class="select" id="nx-l" name="level"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></div></div>
        <div class="grid g2"><div class="field"><label for="nx-p">Movement pattern</label><select class="select" id="nx-p" name="pattern">${PATTERNS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><span class="hint">Helps Assist pick it and suggest swaps.</span></div><div class="field"><span class="label">Flags</span><label class="row small"><input type="checkbox" name="kneeLoad"> Loads the knees a lot</label><label class="row small"><input type="checkbox" name="overhead"> Overhead</label></div></div>
        <div class="field"><label for="nx-i">Instructions</label><textarea class="textarea" id="nx-i" name="instructions" rows="3" maxlength="2000" placeholder="One step per line"></textarea></div>
        <div class="field"><label for="nx-v">Video link</label><input class="input" id="nx-v" name="videoUrl" maxlength="190" placeholder="https://…"><span class="hint">A YouTube or Vimeo link works.</span></div></form>
        <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="nx-go">Create</button></div>`, { label: 'Custom exercise' });
      m.querySelector('#nx-go').addEventListener('click', async ev => {
        const form = m.querySelector('#nx-form'), f = Object.fromEntries(new FormData(form));
        if (!f.name?.trim()) { showFieldErrors(form, { name: 'Give it a name' }); return form.name.focus(); }
        busy(ev.currentTarget, true, 'Creating…');
        try { await api.post('/api/exercises', { ...f, muscle: f.muscle || 'Full body', kneeLoad: !!f.kneeLoad, overhead: !!f.overhead }); closeModal(); toast(`${f.name} added to your library`); setUi('lmine', false); ctx.refresh(); }
        catch (e) { busy(ev.currentTarget, false); showFieldErrors(form, e.data?.fields); toastError(e); }
      });
    },
  },
  inputs: { lSearch(el, _e, ctx) { setUi('lq', el.value); document.getElementById('lib-grid').innerHTML = grid(filtered(ctx.data)); } },
};
