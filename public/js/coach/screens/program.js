// One program: its workouts by day, the clients on it, assign / duplicate / archive.
import { api } from '../../shared/api.js';
import { esc, plural, keyToday, first } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { avatar, emptyState } from '../../shared/components.js';
import { openModal, closeModal, modalHead, toast, toastError, busy, confirmDialog, showFieldErrors } from '../../shared/ui.js';

export default {
  nav: 'programs',
  title: d => d.program.name,
  async load(params) {
    const [p, cl] = await Promise.all([api.get(`/api/programs/${params.id}`), api.get('/api/clients')]);
    return { ...p, all: cl.clients };
  },
  render(d) {
    const p = d.program;
    return `
    <a class="btn ghost sm" style="align-self:flex-start;margin:-8px 0 -12px -8px" href="/app/programs">${icon('chevL')} Programs</a>
    <div class="page-head"><div><div class="eyebrow">${p.source === 'assist' ? 'Started from an Assist draft' : 'Program'}</div><h1 class="h1">${esc(p.name)}</h1><p class="sub">${p.weeks} weeks · ${p.daysPerWeek} days/week${p.level ? ` · ${esc(p.level)}` : ''} · ${plural(d.clients.length, 'active client')}</p></div>
      <div class="row wrap"><button class="btn" data-act="editProgram">${icon('edit')} Edit details</button><button class="btn" data-act="dupProgram">${icon('copy')} Duplicate</button><button class="btn primary" data-act="assignProg">${icon('user')} Assign to client</button></div></div>
    ${p.description ? `<p class="muted" style="max-width:70ch;margin-top:-8px">${esc(p.description)}</p>` : ''}
    <div class="split">
      <section class="card"><div class="card-head"><div class="h3">Workouts</div><button class="btn sm" data-act="addDay">${icon('plus')} Add workout</button></div>
        ${p.workouts.length ? `<div class="list">${p.workouts.map(w => `<a class="li click" href="/app/builder/${w.id}"><span class="block-letter">${w.day || '•'}</span><div class="grow" style="min-width:0"><div class="strong small">${esc(w.name)}</div><div class="tiny muted">${w.week ? `Week ${w.week} · ` : 'Every week · '}${w.exercises ? `${plural(w.exercises, 'exercise')} · ${plural(w.sets, 'set')} · ~${w.estMinutes} min` : '<span style="color:var(--warn)">Empty: add exercises</span>'}</div></div>${icon('chevR')}</a>`).join('')}</div>`
        : emptyState('dumbbell', 'No workouts yet', 'Add one workout per training day.', `<button class="btn primary" data-act="addDay">${icon('plus')} Add workout</button>`)}
        <div class="pad-sm tiny faint" style="border-top:1px solid var(--line)">Workouts repeat each week. Clients follow them in order on their training days. Edits apply to everyone on the program from their next workout.</div></section>
      <div class="stack s16">
        <section class="card"><div class="card-head"><div class="h3">Clients on this program</div></div>
          <div class="list">${d.clients.map(c => `<a class="li click" href="/app/clients/${c.id}/program">${avatar(c, 'sm')}<span class="grow strong small">${esc(c.name)}</span>${icon('chevR')}</a>`).join('') || '<div class="pad-sm small muted">Nobody yet.</div>'}</div></section>
        <section class="card pad stack s8"><div class="h3">Archive</div><p class="small muted">Hides the program from your list. Clients who finished it keep their history.</p><div><button class="btn sm" data-act="archiveProg">${icon('trash')} Archive program</button></div></section>
      </div>
    </div>`;
  },
  actions: {
    async addDay(el, _e, ctx) {
      busy(el, true, 'Adding…');
      try { const r = await api.post(`/api/programs/${ctx.data.program.id}/workouts`, {}); ctx.navigate(`/app/builder/${r.workout.id}`); }
      catch (e) { busy(el, false); toastError(e); }
    },
    async dupProgram(el, _e, ctx) {
      busy(el, true, 'Copying…');
      try { const r = await api.post(`/api/programs/${ctx.data.program.id}/duplicate`); toast('Copy created'); ctx.navigate(`/app/programs/${r.program.id}`); }
      catch (e) { busy(el, false); toastError(e); }
    },
    async archiveProg(_el, _e, ctx) {
      const p = ctx.data.program;
      if (!await confirmDialog({ title: `Archive ${p.name}?`, body: '<p class="small">You can’t assign it after this. Past workouts stay in your clients’ history.</p>', confirm: 'Archive' })) return;
      try { await api.del(`/api/programs/${p.id}`); toast('Archived'); ctx.navigate('/app/programs'); } catch (e) { toastError(e); }
    },
    editProgram(_el, _e, ctx) {
      const p = ctx.data.program;
      const m = openModal(`${modalHead('Program details')}<form class="modal-body" id="ep-form" novalidate>
        <div class="field"><label for="ep-name">Name</label><input class="input" id="ep-name" name="name" value="${esc(p.name)}"></div>
        <div class="grid g3"><div class="field"><label for="ep-w">Weeks</label><input class="input" id="ep-w" name="weeks" type="number" min="1" max="52" value="${p.weeks}"></div><div class="field"><label for="ep-d">Days per week</label><input class="input" id="ep-d" name="daysPerWeek" type="number" min="1" max="7" value="${p.daysPerWeek}"></div><div class="field"><label for="ep-l">Level</label><select class="select" id="ep-l" name="level">${['Beginner', 'Beginner–Intermediate', 'Intermediate', 'Advanced'].map(l => `<option ${p.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="field"><label for="ep-desc">Description</label><textarea class="textarea" id="ep-desc" name="description" rows="3">${esc(p.description || '')}</textarea></div></form>
        <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="ep-go">Save</button></div>`, { label: 'Program details' });
      m.querySelector('#ep-go').addEventListener('click', async ev => {
        const form = m.querySelector('#ep-form'), f = Object.fromEntries(new FormData(form));
        busy(ev.currentTarget, true);
        try { await api.patch(`/api/programs/${p.id}`, { ...f, weeks: Number(f.weeks), daysPerWeek: Number(f.daysPerWeek) }); closeModal(); toast('Saved'); ctx.refresh(); }
        catch (e) { busy(ev.currentTarget, false); showFieldErrors(form, e.data?.fields); toastError(e); }
      });
    },
    assignProg(_el, _e, ctx) {
      const p = ctx.data.program, on = new Set(ctx.data.clients.map(c => c.id));
      const list = ctx.data.all.filter(c => ['NEW', 'ACTIVE'].includes(c.status));
      if (!list.length) return toast('Invite a client first.');
      const m = openModal(`${modalHead('Assign program', esc(p.name))}<div class="modal-body">
        <div class="field"><label for="apc-c">Client</label><select class="select" id="apc-c">${list.map(c => `<option value="${c.id}" ${on.has(c.id) ? 'disabled' : ''}>${esc(c.name)}${on.has(c.id) ? ' (already on it)' : c.program ? ` · now on ${esc(c.program.name)}` : ''}</option>`).join('')}</select></div>
        <div class="field"><label for="apc-d">Start date</label><input class="input" id="apc-d" type="date" value="${keyToday()}"></div>
        <p class="small muted">Their workouts are scheduled on training days from the start date. Anything already scheduled after it is replaced.</p></div>
        <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="apc-go">Assign</button></div>`, { label: 'Assign program' });
      m.querySelector('#apc-go').addEventListener('click', async ev => {
        const id = m.querySelector('#apc-c').value; busy(ev.currentTarget, true);
        try { const r = await api.post(`/api/clients/${id}/program`, { programId: p.id, startDate: m.querySelector('#apc-d').value }); closeModal(); toast(`${first(list.find(c => c.id === id).name)} is on ${p.name}. ${plural(r.scheduled, 'workout')} scheduled.`); ctx.refresh(); }
        catch (e) { busy(ev.currentTarget, false); toastError(e); }
      });
    },
  },
};
