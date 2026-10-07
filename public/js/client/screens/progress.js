// Client: progress (prototype cProgress) with weight, main lift, bests and private photos.
import { api } from '../../shared/api.js';
import { esc, fmtDate } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { lineChart, silhouette } from '../../shared/charts.js';
import { small } from '../../shared/components.js';
import { toast, toastError, confirmDialog } from '../../shared/ui.js';

export default {
  tab: 'progress',
  title: () => 'Progress',
  load: () => api.get('/api/me/progress'),
  render(d) {
    const wc = d.weightChange;
    return `<div class="row between" style="padding-top:4px"><span class="h2">Progress</span></div>
    <div class="grid g2" style="grid-template-columns:1fr 1fr"><div class="card pad"><div class="eyebrow">Weight</div><div class="big-num" style="font-size:1.5rem">${wc == null ? '—' : `${wc > 0 ? '+' : wc < 0 ? '−' : '±'}${Math.abs(wc)} lb`}</div></div><div class="card pad"><div class="eyebrow">Workouts</div><div class="big-num" style="font-size:1.5rem">${d.workoutsDone}</div></div></div>
    <section class="card pad stack s8"><div class="strong small">Weight (lb)</div>${d.weights.length ? lineChart({ labels: d.weights.map(w => fmtDate(w.date)), series: d.weights.map(w => w.value), height: 180 }) : '<p class="small muted">Add your weight in your weekly check-in and it shows up here.</p>'}</section>
    ${d.lift ? `<section class="card pad stack s8"><div class="strong small">${esc(d.lift.name)} (lb)</div>${lineChart({ labels: d.lift.dates.map(fmtDate), series: d.lift.values, height: 160 })}</section>` : ''}
    <section class="card pad stack s8"><div class="strong small">Personal bests</div>${d.bests.length ? d.bests.map(b => `<div class="row between small"><span>${esc(b.name)}</span><span class="strong">${b.weight} lb × ${b.reps}</span></div>`).join('') : '<p class="small muted">Log weights in your workouts to see your bests.</p>'}</section>
    <section class="card pad stack s8"><div class="row between"><span class="strong small">Photos</span><span class="tiny muted">${small(icon('lock'), 12)} Only you and your coach</span></div>
      <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px">${d.photos.length ? d.photos.map(p => `<div class="photo" style="padding:0;position:relative"><img src="${esc(p.url)}" alt="Progress photo, ${fmtDate(p.takenAt)}" loading="lazy" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:10px"><span style="font-size:.66rem">${fmtDate(p.takenAt)}</span><button class="btn ghost icon xs" style="position:absolute;top:4px;right:4px;background:var(--surface)" data-act="delPhoto" data-id="${p.id}" aria-label="Delete photo from ${fmtDate(p.takenAt)}">${icon('trash')}</button></div>`).join('') : ['Front', 'Side', 'Back'].map(s => `<div class="photo" style="padding:6px">${silhouette()}<span style="font-size:.66rem">${s}</span></div>`).join('')}</div>
      <label class="btn sm" style="align-self:flex-start;cursor:pointer">${icon('camera')} Add a photo<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" class="sr" data-change="addPhoto"></label></section>
    <section class="card pad stack s8"><div class="strong small">Measurements</div>${d.measurements.length ? d.measurements.map(m => `<div class="row between small"><span>${fmtDate(m.takenAt)}</span><span class="muted">${[m.waist && `waist ${m.waist}″`, m.hips && `hips ${m.hips}″`, m.chest && `chest ${m.chest}″`].filter(Boolean).join(' · ')}</span></div>`).join('') : ''}
      <form class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px" data-form="meas" novalidate>${[['waist', 'Waist'], ['hips', 'Hips'], ['chest', 'Chest']].map(([k, l]) => `<div class="field"><label for="ms-${k}" class="tiny">${l} (in)</label><input class="input" id="ms-${k}" name="${k}" inputmode="decimal" maxlength="5"></div>`).join('')}<button class="btn sm" type="submit" style="grid-column:1/-1;justify-self:start">Save measurements</button></form></section>`;
  },
  actions: {
    async addPhoto(el, _e, ctx) {
      const f = el.files?.[0]; if (!f) return;
      if (f.size > 8 * 1024 * 1024) return toast('Pick a photo under 8 MB.', { error: true });
      const fd = new FormData(); fd.append('photo', f); fd.append('pose', 'front');
      try { await api('POST', '/api/me/photos', fd); toast('Photo added. Only you and your coach can see it.'); ctx.refresh(); } catch (e) { toastError(e); }
    },
    async delPhoto(el, _e, ctx) {
      if (!await confirmDialog({ title: 'Delete this photo?', body: '<p class="small">It’s removed for you and your coach.</p>', confirm: 'Delete', danger: true })) return;
      try { await api.del(`/api/me/photos/${el.dataset.id}`); toast('Photo deleted'); ctx.refresh(); } catch (e) { toastError(e); }
    },
  },
  forms: {
    async meas(form, _e, ctx) {
      const f = Object.fromEntries(new FormData(form));
      const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number(v)]));
      if (!Object.keys(body).length) return toast('Enter at least one measurement.');
      if (Object.values(body).some(v => isNaN(v) || v <= 0 || v > 100)) return toast('Use inches, like 34.5.', { error: true });
      try { await api.post('/api/me/measurements', body); toast('Saved'); ctx.refresh(); } catch (e) { toastError(e); }
    },
  },
};
