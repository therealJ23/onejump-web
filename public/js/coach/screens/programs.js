// Programs list (prototype V.programs, MVP part: the Assist program builder is V2).
import { api } from '../../shared/api.js';
import { esc, plural, rel } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { emptyState, stage } from '../../shared/components.js';
import { newProgram } from '../modals.js';

export default {
  nav: 'programs',
  title: () => 'Programs',
  load: () => api.get('/api/programs'),
  render(d) {
    const enrolled = d.programs.reduce((n, p) => n + p.clients, 0);
    return `
    <div class="page-head"><div><h1 class="h1">Programs</h1><p class="sub">${plural(d.programs.length, 'program')} · ${plural(enrolled, 'client')} enrolled</p></div><div class="row wrap"><a class="btn" href="/app/builder">${icon('dumbbell')} Workout builder</a><button class="btn primary" data-act="newProgramHere">${icon('plus')} New program</button></div></div>
    ${d.programs.length ? `<section class="client-grid">${d.programs.map(p => `<a class="card cc" href="/app/programs/${p.id}">
      <div class="row"><span class="thumb">${icon('layers')}</span><div class="grow" style="min-width:0"><div class="h3">${esc(p.name)}</div><div class="tiny muted">${p.weeks} weeks · ${p.daysPerWeek} days/week${p.level ? ` · ${esc(p.level)}` : ''}</div></div></div>
      ${p.description ? `<div class="small muted clamp2">${esc(p.description)}</div>` : ''}
      <div class="row wrap" style="gap:6px"><span class="tag">${plural(p.clients, 'client')}</span><span class="tag">${plural(p.workouts, 'workout')}</span><span class="tag">${p.source === 'assist' ? 'Started from an Assist draft' : 'Written by you'}</span></div>
      <div class="row between"><span class="tiny faint">Updated ${rel(p.updatedAt).toLowerCase()}</span><span class="btn sm">Open</span></div></a>`).join('')}</section>`
    : `<section class="card">${emptyState('layers', 'No programs yet', 'A program is a multi-week plan: a few workouts per week that you assign to clients. Start with one you already use.', `<button class="btn primary" data-act="newProgramHere">${icon('plus')} New program</button>`)}</section>`}
    <section class="card pad row wrap" style="gap:12px"><div class="grow stack s4"><div class="row">${stage('V2')}<span class="strong">Assist program builder</span></div><div class="small muted">Describe a whole program in plain words and Assist drafts phases and workouts. Coming after launch; for now Assist drafts single workouts in the builder.</div></div><a class="btn sm" href="/app/builder">Try the workout generator</a></section>`;
  },
  actions: { newProgramHere() { newProgram(); } },
};
