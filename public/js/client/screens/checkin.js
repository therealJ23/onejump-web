// Client: weekly check-in (prototype cCheckin), with optional private progress photos.
import { api } from '../../shared/api.js';
import { micButton } from '../../shared/dictation.js';
import { fmtDate } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { toast } from '../../shared/ui.js';

const SLIDERS = [['sleepHours', 'Average sleep', 3, 12, 0.25, ' h', 7], ['energy', 'Energy', 1, 10, 1, '/10', 6], ['stress', 'Stress', 1, 10, 1, '/10', 5], ['soreness', 'Soreness', 1, 10, 1, '/10', 5], ['nutrition', 'Stuck to the nutrition plan', 1, 10, 1, '/10', 7], ['mood', 'Mood', 1, 10, 1, '/10', 7]];

export default {
  tab: 'today',
  title: () => 'Weekly check-in',
  load: () => api.get('/api/me/checkin'),
  render(d) {
    const last = d.last || {};
    return `<div class="row between" style="padding-top:4px"><a class="btn ghost icon sm" href="/client" aria-label="Back">${icon('chevL')}</a><span class="strong">Weekly check-in</span><span style="width:32px"></span></div>
    ${d.doneThisWeek ? `<div class="notice small">You already sent one ${fmtDate(d.last.submittedAt)}. Sending another is fine if something changed.</div>` : '<p class="small muted">Takes about 2 minutes. Your coach reads every one.</p>'}
    <form class="stack s16" data-form="checkin" novalidate>
      <div class="field"><label for="ck-w">Weight this morning (lb) <span class="muted">(optional)</span></label><input class="input" id="ck-w" name="weight" inputmode="decimal" value="${d.weight ?? ''}" maxlength="6"></div>
      ${SLIDERS.map(([k, label, min, max, step, unit, def]) => { const v = last[k] ?? def; return `<div class="field"><div class="row between"><label for="ck-${k}">${label}</label><span class="strong small slider-val" id="ck-${k}-v">${v}${unit}</span></div><input type="range" id="ck-${k}" name="${k}" min="${min}" max="${max}" step="${step}" value="${v}" data-input="range" data-unit="${unit}"></div>`; }).join('')}
      <div class="panel pad-sm small row">${icon('check')} ${d.workouts.done} of ${d.workouts.planned} workouts logged this week</div>
      <div class="field"><div class="row between"><label for="ck-t">How was your week?</label>${micButton('ck-t', { cls: 'btn ghost icon sm' })}</div><textarea class="textarea" id="ck-t" name="text" rows="4" maxlength="3000" placeholder="Wins, struggles, anything that hurts"></textarea><span class="hint">Mention any pain or injury here. Your coach will follow up and may suggest seeing a professional.</span></div>
      <label class="dropzone" for="ck-photo" style="padding:16px;cursor:pointer">${icon('camera')}<span class="small grow" id="ck-photo-l">Add progress photos (optional, private)</span></label><input type="file" id="ck-photo" accept="image/jpeg,image/png,image/webp,image/heic" multiple class="sr" data-change="photos">
      <div class="form-error" id="ck-err" role="alert" hidden></div>
      <button class="btn primary lg" type="submit" style="width:100%">Send to your coach</button>
    </form>`;
  },
  inputs: { range(el) { const v = document.getElementById(`${el.id}-v`); if (v) v.textContent = el.value + el.dataset.unit; } },
  actions: {
    photos(el, _e, ctx) {
      const files = [...(el.files || [])].slice(0, 3);
      ctx.data.photos = files;
      document.getElementById('ck-photo-l').textContent = files.length ? `${files.length} photo${files.length > 1 ? 's' : ''} ready (only you and your coach can see them)` : 'Add progress photos (optional, private)';
    },
  },
  forms: {
    async checkin(form, _e, ctx) {
      const f = Object.fromEntries(new FormData(form)), err = document.getElementById('ck-err');
      const weight = f.weight.trim() ? Number(f.weight) : null;
      if (weight != null && (isNaN(weight) || weight < 50 || weight > 800)) { err.textContent = 'Check your weight; it should be a number in pounds.'; err.hidden = false; form.weight.focus(); return; }
      const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        for (const file of ctx.data.photos || []) {
          if (file.size > 8 * 1024 * 1024) continue;
          const fd = new FormData(); fd.append('photo', file); fd.append('pose', 'front');
          await api('POST', '/api/me/photos', fd);
        }
        await api.post('/api/me/checkins', { weight, sleepHours: Number(f.sleepHours), energy: Number(f.energy), stress: Number(f.stress), soreness: Number(f.soreness), nutrition: Number(f.nutrition), mood: Number(f.mood), text: f.text.trim() });
        toast('Check-in sent');
        ctx.navigate('/client', { replace: true });
      } catch (e) { btn.disabled = false; btn.textContent = 'Send to your coach'; err.textContent = e.offline ? 'You’re offline. Try again when you have signal.' : e.message; err.hidden = false; }
    },
  },
};
