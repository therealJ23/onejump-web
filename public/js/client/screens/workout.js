// Client: log a workout (prototype cWorkout / cFinish / cDone). Progress is saved on the
// phone as you go, so a closed tab or a lost signal doesn't lose sets.
import { api } from '../../shared/api.js';
import { micButton, listenOnce, dictationSupported } from '../../shared/dictation.js';
import { createRecorder, recordingSupported, MIC_OFF } from '../../shared/media.js';
import { onRemoved } from '../../shared/lifecycle.js';
import { esc, plural } from '../../shared/format.js';
import { icon, arc } from '../../shared/icons.js';
import { openModal, modalHead, toast } from '../../shared/ui.js';
import { state } from '../main.js';

const key = id => `oj.workout.${id}`;
const loadDraft = id => { try { return JSON.parse(localStorage.getItem(key(id)) || 'null'); } catch { return null; } };
const saveDraft = (id, d) => { try { localStorage.setItem(key(id), JSON.stringify(d)); } catch { /* private mode: keep in memory */ } };
const clearDraft = id => { try { localStorage.removeItem(key(id)); } catch { /* ignore */ } };
let restTimer = null;

async function loadWorkout(params) {
  const r = await api.get(`/api/me/workouts/${params.id}`);
  let log = loadDraft(params.id);
  if (!log || log.workoutId !== r.workout.id) {
    log = { workoutId: r.workout.id, rpe: null, soreness: null, note: '', exs: r.workout.exercises.map(e => ({ exerciseId: e.exerciseId, sets: e.sets.map(s => ({ w: s.weight === '' ? '' : String(s.weight), r: s.reps === '' ? '' : String(s.reps), done: false, rest: s.rest })) })) };
  }
  return { ...r, log };
}
const totals = log => { const all = log.exs.flatMap(e => e.sets); return { total: all.length, done: all.filter(s => s.done).length }; };
const header = (title, back) => `<div class="row between" style="padding-top:4px">${back ? `<a class="btn ghost icon sm" href="${back}" aria-label="Back">${icon('chevL')}</a>` : '<span style="width:32px"></span>'}<span class="strong" style="text-align:center">${title}</span><span style="width:32px"></span></div>`;

export default {
  tab: 'today', focus: true,
  title: d => d.workout.name,
  load: loadWorkout,
  render(d, params) {
    if (d.assignment.status === 'completed') return `${header(esc(d.workout.name), '/client')}<div class="empty">${icon('check')}<div class="h3" style="color:var(--ink)">Already logged</div><p>This workout is done. Nice work.</p><a class="btn" href="/client">Back to today</a></div>`;
    const { total, done } = totals(d.log);
    return `${header(esc(d.workout.name), '/client')}
    <div class="stack s4"><div class="row between small"><span class="muted">${done} of ${total} sets</span><span class="strong">${total ? Math.round((done / total) * 100) : 0}%</span></div><div class="bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div></div>
    ${d.features?.voice && (dictationSupported || recordingSupported) && done < total ? `<button class="btn sm" style="align-self:flex-start" data-act="voiceSet" id="voice-set" aria-live="polite">${icon('mic')} <span>Log next set by voice</span></button>` : ''}
    ${d.assignment.note ? `<div class="card pad small" style="border-left:3px solid var(--volt-deep)"><b>Coach’s note:</b> ${esc(d.assignment.note)}</div>` : ''}
    <div id="rest-banner" hidden class="today-card rest-banner" role="timer" aria-live="polite">${icon('clock')}<span class="grow strong">Rest <span id="rest-left">1:30</span></span><button class="btn assist sm" data-act="restSkip">Skip</button></div>
    ${d.workout.exercises.map((e, ei) => `<section class="card pad stack s8" aria-label="${esc(e.name)}">
      ${e.group ? `<span class="tag" style="align-self:flex-start">${esc(e.group)}</span>` : ''}
      <div class="row"><button class="thumb" style="border:0;cursor:pointer" data-act="howTo" data-e="${ei}" aria-label="How to do ${esc(e.name)}">${icon('play')}</button><div class="grow"><div class="strong">${esc(e.name)}</div><div class="tiny muted">${plural(e.sets.length, 'set')} · ${esc(e.sets[0]?.target || '')}${e.tempo ? ` · tempo ${esc(e.tempo)}` : ''}${e.notes ? ' · ' + esc(e.notes) : ''}</div></div></div>
      <div class="set-row tiny muted strong" aria-hidden="true"><span>Set</span><span style="text-align:center">lb</span><span style="text-align:center">Reps</span><span></span></div>
      ${d.log.exs[ei].sets.map((s, si) => `<div class="set-row" data-row="${ei}-${si}"><span class="strong small" style="text-align:center">${si + 1}</span><input inputmode="decimal" aria-label="${esc(e.name)} set ${si + 1} weight in pounds" value="${esc(s.w)}" placeholder="${esc(String(e.sets[si]?.weight ?? ''))}" data-input="setVal" data-e="${ei}" data-s="${si}" data-f="w" maxlength="7"><input inputmode="numeric" aria-label="${esc(e.name)} set ${si + 1} reps" value="${esc(s.r)}" data-input="setVal" data-e="${ei}" data-s="${si}" data-f="r" maxlength="4"><button class="check ${s.done ? 'on' : ''}" data-act="setDone" data-e="${ei}" data-s="${si}" aria-label="Set ${si + 1} done" aria-pressed="${s.done}">${icon('check')}</button></div>`).join('')}
    </section>`).join('')}
    <a class="btn primary lg" href="/client/workout/${params.id}/finish" style="width:100%">Finish workout</a>
    <p class="tiny faint" style="text-align:center">Your sets are saved on this phone as you go.</p>`;
  },
  actions: {
    setDone(el, _e, ctx) {
      const d = ctx.data, s = d.log.exs[+el.dataset.e].sets[+el.dataset.s];
      s.done = !s.done; saveDraft(ctx.params.id, d.log);
      el.classList.toggle('on', s.done); el.setAttribute('aria-pressed', s.done);
      paintProgress(d.log);
      if (s.done && s.rest) startRest(s.rest);
      if (s.done && navigator.vibrate) navigator.vibrate(15);
    },
    /** "10 reps at 55" → fills and ticks the next unchecked set, with Undo. */
    async voiceSet(el, _e, ctx) {
      if (el.dataset.busy) { if (el.dataset.busy === 'rec') el.dispatchEvent(new CustomEvent('vstop')); else listenOnce.stop?.(); return; }
      const d = ctx.data, next = nextOpenSet(d.log);
      if (!next) { toast('All sets are logged.'); return; }
      const label = el.querySelector('span'), reset = () => { delete el.dataset.busy; el.classList.remove('mic-live'); label.textContent = 'Log next set by voice'; };
      el.classList.add('mic-live'); el.dataset.busy = 'listen'; label.textContent = 'Listening… say “10 reps at 55”';
      let text = '', transcribed = false;
      try {
        if (dictationSupported) {
          const unwatch = onRemoved(el, () => listenOnce.stop?.()); // leaving the screen stops listening
          text = await listenOnce({ onInterim: v => { label.textContent = `“${v}”`; } });
          unwatch();
        }
        else {
          // No speech recognition in this browser: record a few seconds and transcribe on the server.
          const rec = createRecorder({ maxMs: 10000 });
          await rec.start();
          if (!document.contains(el)) { rec.cancel(); return; } // left the workout while the mic was starting
          el.dataset.busy = 'rec'; label.textContent = 'Listening… tap when done';
          const unwatch = onRemoved(el, () => rec.cancel()); // leaving the screen stops the mic
          await new Promise(res => { el.addEventListener('vstop', res, { once: true }); rec.done.then(res); onRemoved(el, res); });
          unwatch();
          if (!document.contains(el)) return;
          const out = await rec.stop();
          el.dataset.busy = 'listen'; label.textContent = 'One moment…';
          const fd = new FormData();
          fd.append('audio', out.blob, `set.${/mp4/.test(out.mimeType) ? 'm4a' : 'webm'}`); fd.append('durationMs', String(out.durationMs)); fd.append('kind', 'set_log');
          text = (await api.post('/api/me/voice/transcribe', fd)).transcript; transcribed = true;
        }
      } catch (e) { reset(); toast(e.code === 'denied' ? MIC_OFF : e.message, { ms: 6000 }); return; }
      if (!document.contains(el)) return; // they left the workout: don't log anything
      if (!text) { reset(); toast('I didn’t catch that. Try “10 reps at 55”.'); return; }
      label.textContent = `“${text}”`;
      let r;
      try { r = await api.post('/api/me/voice/set', { text, spoken: !transcribed }); }
      catch (e) { reset(); toast(e.message, { ms: 6000 }); return; }
      reset();
      const target = nextOpenSet(d.log) || next, s = d.log.exs[target.ei].sets[target.si], before = { ...s };
      s.r = String(r.reps); s.w = r.bodyweight || r.weight == null ? (r.bodyweight ? '' : s.w) : String(r.weight); s.done = true;
      saveDraft(ctx.params.id, d.log); paintSet(target.ei, target.si, s); paintProgress(d.log);
      const ex = d.workout.exercises[target.ei];
      if (s.rest) startRest(s.rest);
      if (navigator.vibrate) navigator.vibrate(15);
      toast(`Logged ${ex.name}, set ${target.si + 1}: ${s.w ? `${s.w} lb × ` : r.bodyweight ? 'bodyweight × ' : ''}${s.r}`, {
        undo: () => { Object.assign(s, before); saveDraft(ctx.params.id, d.log); paintSet(target.ei, target.si, s); paintProgress(d.log); clearInterval(restTimer); const b = document.getElementById('rest-banner'); if (b) b.hidden = true; },
      });
    },
    restSkip() { clearInterval(restTimer); const b = document.getElementById('rest-banner'); if (b) b.hidden = true; },
    howTo(el, _e, ctx) {
      const e = ctx.data.workout.exercises[+el.dataset.e];
      openModal(`${modalHead(esc(e.name), [e.muscle, e.equipment].filter(Boolean).map(esc).join(' · '))}<div class="modal-body">${e.videoUrl ? `<a class="btn" href="${esc(e.videoUrl)}" target="_blank" rel="noopener">${icon('video')} Watch demo</a>` : ''}${e.howTo?.length ? `<ol class="small" style="margin:0;padding-left:20px">${e.howTo.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : '<p class="small muted">Ask your coach if you’re unsure how to do this one.</p>'}<p class="tiny muted">If something hurts, stop and tell your coach.</p></div><div class="modal-foot"><button class="btn primary" data-act="closeModal">Got it</button></div>`, { label: e.name });
    },
  },
  inputs: {
    setVal(el, _e, ctx) { const s = ctx.data.log.exs[+el.dataset.e].sets[+el.dataset.s]; s[el.dataset.f] = el.value.replace(/[^\d.]/g, ''); saveDraft(ctx.params.id, ctx.data.log); },
  },
};

const nextOpenSet = log => { for (let ei = 0; ei < log.exs.length; ei++) { const si = log.exs[ei].sets.findIndex(s => !s.done); if (si >= 0) return { ei, si }; } return null; };
/** Updates one set row in place after a voice entry (or its Undo). */
function paintSet(ei, si, s) {
  const row = document.querySelector(`[data-row="${ei}-${si}"]`); if (!row) return;
  row.querySelector('[data-f="w"]').value = s.w; row.querySelector('[data-f="r"]').value = s.r;
  const c = row.querySelector('[data-act="setDone"]'); c.classList.toggle('on', s.done); c.setAttribute('aria-pressed', s.done);
  row.classList.remove('set-flash'); void row.offsetWidth; row.classList.add('set-flash');
  row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function paintProgress(log) {
  const { total, done } = totals(log);
  const bar = document.querySelector('.bar i'); if (bar) bar.style.width = `${total ? (done / total) * 100 : 0}%`;
  const lbl = document.querySelector('.stack.s4 .row span'); if (lbl) lbl.textContent = `${done} of ${total} sets`;
  const pct = document.querySelector('.stack.s4 .row .strong'); if (pct) pct.textContent = `${total ? Math.round((done / total) * 100) : 0}%`;
  const vb = document.getElementById('voice-set'); if (vb) vb.hidden = done >= total;
}

function startRest(sec) {
  clearInterval(restTimer);
  const b = document.getElementById('rest-banner'); if (!b) return;
  b.hidden = false; let left = sec;
  const tick = () => {
    const el = document.getElementById('rest-left'); if (!el) { clearInterval(restTimer); return; }
    el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (left-- <= 0) { clearInterval(restTimer); b.hidden = true; if (navigator.vibrate) navigator.vibrate([80, 60, 80]); }
  };
  tick(); restTimer = setInterval(tick, 1000);
}

const rate = (k, v, label) => `<div class="rate" role="radiogroup" aria-label="${label}">${Array.from({ length: 10 }, (_, i) => `<button type="button" role="radio" class="${v === i + 1 ? 'on' : ''}" data-act="rate" data-k="${k}" data-v="${i + 1}" aria-checked="${v === i + 1}">${i + 1}</button>`).join('')}</div>`;

export const finish = {
  tab: 'today', focus: true,
  title: () => 'How did it go?',
  load: loadWorkout,
  render(d, params) {
    const { done } = totals(d.log);
    return `${header('How did it go?', `/client/workout/${params.id}`)}
    ${done ? '' : '<div class="notice small">No sets are ticked yet. Go back and tap ✓ on the sets you did, or save anyway if you trained without logging.</div>'}
    <div class="stack s8"><div class="strong" id="rpe-l">How hard was it overall?</div><div class="tiny muted">1 = very easy · 10 = max effort</div>${rate('rpe', d.log.rpe, 'How hard was it')}</div>
    <div class="stack s8"><div class="strong">How sore are you today?</div><div class="tiny muted">1 = not at all · 10 = very sore</div>${rate('soreness', d.log.soreness, 'How sore are you')}</div>
    <div class="field"><div class="row between"><label for="cw-note">Anything for your coach?</label>${micButton('cw-note', { cls: 'btn ghost icon sm' })}</div><textarea class="textarea" id="cw-note" rows="3" maxlength="1000" placeholder="e.g. last set of RDLs felt heavy" data-input="note">${esc(d.log.note)}</textarea><span class="hint">If something hurts, say so here. Your coach will follow up.</span></div>
    <div class="form-error" id="fin-err" role="alert" hidden></div>
    <button class="btn primary lg" data-act="save" style="width:100%">Save workout</button>`;
  },
  actions: {
    rate(el, _e, ctx) { ctx.data.log[el.dataset.k] = +el.dataset.v; saveDraft(ctx.params.id, ctx.data.log); el.parentElement.querySelectorAll('button').forEach(b => { const on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); },
    async save(el, _e, ctx) {
      const log = ctx.data.log, err = document.getElementById('fin-err');
      if (!log.rpe) { err.textContent = 'Pick how hard it felt (1–10).'; err.hidden = false; return; }
      el.disabled = true; el.textContent = 'Saving…';
      try {
        const r = await api.post(`/api/me/workouts/${ctx.params.id}/complete`, {
          sets: log.exs.map(e => ({ exerciseId: e.exerciseId, sets: e.sets.map(s => ({ weight: s.w === '' ? '' : Number(s.w), reps: s.r === '' ? '' : Math.round(Number(s.r)), done: !!s.done })) })),
          rpe: log.rpe, soreness: log.soreness || undefined, note: log.note.trim() || undefined,
        });
        clearDraft(ctx.params.id); state.done = r;
        ctx.navigate(`/client/workout/${ctx.params.id}/done`, { replace: true });
      } catch (e) {
        el.disabled = false; el.textContent = 'Save workout';
        err.textContent = e.offline ? 'You’re offline. Your workout is saved on this phone; try again when you’re back online.' : e.message; err.hidden = false;
      }
    },
  },
  inputs: { note(el, _e, ctx) { ctx.data.log.note = el.value; saveDraft(ctx.params.id, ctx.data.log); } },
};

export const done = {
  tab: 'today',
  title: () => 'Workout done',
  load: async () => state.done,
  render(r) {
    if (!r) return `<div class="empty" style="padding-top:40px">${arc()}<h2 class="h1" style="color:var(--ink)">Workout saved</h2><a class="btn primary" href="/client">Back to today</a></div>`;
    return `<div class="empty" style="padding-top:40px">${arc()}<h2 class="h1" style="color:var(--ink);font-size:1.8rem">Workout #${r.workoutNumber} done</h2><p>Nice work, ${esc(state.me.user.name.split(' ')[0])}.</p></div>
    <div class="grid g2" style="grid-template-columns:1fr 1fr"><div class="card pad"><div class="eyebrow">Sets</div><div class="big-num">${r.sets}</div></div><div class="card pad"><div class="eyebrow">Volume</div><div class="big-num">${r.volume.toLocaleString()}<span class="small muted"> lb</span></div></div></div>
    <div class="card pad small muted">Your coach gets your log, effort and soreness. If anything needs changing, they’ll adjust next week.</div>
    <a class="btn primary lg" href="/client" style="width:100%">Back to today</a>`;
  },
};
