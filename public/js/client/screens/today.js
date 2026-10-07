// Client: Today (prototype cToday) with today's workout, coach note, check-in and goal.
import { api } from '../../shared/api.js';
import { esc, fmtDay, fmtKey, plural } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { state } from '../main.js';

export function brandRow(d) {
  const b = d?.business || { name: state.brand?.name || '' };
  const ini = b.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return `<div class="brand-row">${b.logoUrl ? `<img src="${esc(b.logoUrl)}" alt="">` : `<span class="av" style="background:var(--volt);color:#12281F;font-size:.7rem">${esc(ini)}</span>`}<span class="tiny strong muted">${esc(b.name)}</span></div>`;
}
const hello = () => { const h = new Date().getHours(); return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'; };

export default {
  tab: 'today',
  title: () => 'Today',
  load: () => api.get('/api/me/today'),
  render(d) {
    const t = d.today, n = d.next;
    const wk = d.week.planned ? `${d.week.done} of ${d.week.planned} workouts this week` : '';
    let main;
    if (t && t.status === 'completed') main = `<div class="card pad row" style="gap:12px"><span class="q-icon good">${icon('check')}</span><div class="grow"><div class="strong">Workout done</div><div class="tiny muted">${esc(d.coach.first)} will see your log.</div></div></div>`;
    else if (t?.workout) main = `<div class="today-card"><div class="row between"><span class="eyebrow" style="color:var(--volt)">Today</span><span class="tiny" style="opacity:.7">~${t.workout.estMinutes} min</span></div><div class="h2" style="color:var(--bone);font-size:1.5rem">${esc(t.workout.name)}</div><div class="small" style="opacity:.8">${plural(t.workout.count, 'exercise')}${t.workout.first ? ` · ${esc(t.workout.first)} first` : ''}</div><a class="btn assist lg" href="/client/workout/${t.assignmentId}" style="width:100%">${icon('play')} ${hasDraft(t.assignmentId) ? 'Continue workout' : 'Start workout'}</a></div>`;
    else main = `<div class="card pad stack s8"><div class="row" style="gap:12px"><span class="q-icon">${icon('heart')}</span><div class="grow"><div class="strong">Rest day</div><div class="tiny muted">${n?.workout ? `Next: ${esc(n.workout.name)} on ${fmtKey(n.date)}` : 'Your coach hasn’t scheduled your next workout yet.'}</div></div></div></div>`;
    return `
    <div class="row between" style="padding-top:4px">${brandRow(d)}<span></span></div>
    <div class="stack s4"><h1 class="h1" style="font-size:1.7rem">${hello()}, ${esc(d.client.first)}</h1><div class="row small muted wrap" style="gap:6px">${d.streak > 1 ? `<span style="color:var(--warn);display:grid">${icon('flame')}</span>${d.streak}-day streak · ` : ''}${d.program ? `Week ${d.program.week} of ${d.program.weeks}` : esc(fmtDay(new Date()))}</div></div>
    ${d.paymentProblem ? `<a class="card pad row" href="/client/me" style="gap:12px;border-color:var(--crit);text-decoration:none;color:inherit"><span class="q-icon crit">${icon('card')}</span><div class="grow"><div class="strong small">Your last payment didn’t go through</div><div class="tiny muted">Update your card in Me → Billing.</div></div>${icon('chevR')}</a>` : ''}
    ${main}
    ${d.coachNote ? `<div class="card pad stack s8" style="border-left:3px solid var(--volt-deep)"><div class="row" style="gap:8px"><span class="av xs" style="background:var(--volt);color:#12281F" aria-hidden="true">${esc(d.coach.first[0] || '')}</span><span class="tiny strong">Note from ${esc(d.coach.first)}</span></div><div class="small">${esc(d.coachNote.text)}</div>${t?.note ? '' : `<a class="tiny" href="/client/chat">Reply</a>`}</div>` : ''}
    ${d.checkin.doneThisWeek ? `<div class="card pad row" style="gap:12px"><span class="q-icon good">${icon('check')}</span><div class="grow small"><b>Check-in sent.</b> Next one due Sunday.</div></div>` : `<a class="card pad row" style="gap:12px;text-decoration:none;color:inherit" href="/client/checkin"><span class="q-icon assist">${icon('clipboard')}</span><div class="grow"><div class="strong">Weekly check-in</div><div class="tiny muted">Due Sunday · about 2 minutes</div></div>${icon('chevR')}</a>`}
    ${goalCard(d)}
    ${d.client.habits?.length ? `<div class="card pad stack s8"><div class="strong small">Daily habits</div>${d.client.habits.map(h => `<div class="row small" style="gap:8px">${icon('check')}<span>${esc(h)}</span></div>`).join('')}</div>` : ''}
    ${wk ? `<div class="tiny muted" style="text-align:center">${wk}</div>` : ''}`;
  },
};

function goalCard(d) {
  if (!d.client.goal) return '';
  const w = d.weight, tw = d.client.targetWeight;
  if (w && tw && w.start !== tw) {
    const total = Math.abs(w.start - tw), doneAmt = Math.max(0, w.start > tw ? w.start - w.current : w.current - w.start), pct = Math.max(0, Math.min(100, (doneAmt / total) * 100));
    return `<div class="card pad stack s8"><div class="row between"><span class="strong small">Goal: ${esc(d.client.goal)}</span><span class="small strong nowrap">${Math.round(doneAmt * 10) / 10} lb ${w.start > tw ? 'down' : 'up'}</span></div><div class="bar"><i style="width:${pct}%"></i></div><div class="tiny muted">${w.start} → ${w.current} lb · target ${tw} lb</div></div>`;
  }
  return `<div class="card pad stack s4"><span class="strong small">Your goal</span><span class="small">${esc(d.client.goal)}</span>${d.workoutsDone ? `<span class="tiny muted">${plural(d.workoutsDone, 'workout')} done so far</span>` : ''}</div>`;
}

function hasDraft(id) { try { return !!localStorage.getItem(`oj.workout.${id}`); } catch { return false; } }
