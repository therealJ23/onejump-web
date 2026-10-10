// Voice notes in the chat (client ↔ coach): record up to 60 seconds with a visible recording
// bar, then Send or Cancel. Nothing records until the mic is tapped and nothing is sent until
// Send is tapped. Playback fetches a fresh 5-minute link each time.
import { api } from './api.js';
import { esc } from './format.js';
import { icon, arc } from './icons.js';
import { createRecorder, meter, recordingSupported, MIC_OFF } from './media.js';
import { listenOnce, dictationSupported } from './dictation.js';
import { toast } from './ui.js';
import { onRemoved } from './lifecycle.js';

export const fmtDur = s => `${Math.floor((s || 0) / 60)}:${String(Math.round(s || 0) % 60).padStart(2, '0')}`;
const BARS = [5, 9, 13, 8, 15, 11, 6, 12, 16, 9, 7, 13, 10, 6, 11, 8];

/** The voice-note button for a chat composer (hidden where the browser can't record). */
export function voiceNoteButton({ cls = 'btn icon', style = '' } = {}) {
  if (!recordingSupported) return '';
  return `<button type="button" class="${cls}"${style ? ` style="${style}"` : ''} data-voice-note aria-label="Record a voice note" title="Record a voice note (up to 1 minute)">${icon('wave')}</button>`;
}

/**
 * Bubble content for a voice note. audioPath is the API path that returns { url }.
 * For the coach, m.voice.summary (Assist) and m.voice.flag (health topic) are shown too.
 */
export function voiceNoteBody(m, audioPath) {
  const v = m.voice || {};
  return `<div class="vnote"><button type="button" class="vnote-play" data-voice-play="${esc(audioPath)}" data-dur="${v.durationS || 0}" aria-label="Play voice note, ${fmtDur(v.durationS)}">${icon('play')}</button><span class="vnote-bars" aria-hidden="true">${BARS.map(h => `<i style="height:${h}px"></i>`).join('')}</span><span class="tiny vnote-len">${fmtDur(v.durationS)}</span></div>
    ${v.summary ? `<div class="vnote-sum">${arc()} <span>${esc(v.summary)}</span></div>` : ''}
    ${v.flag ? `<div class="vnote-flag" role="note">Health flag: mentions ${esc(v.flag)}. Only you can see this.</div>` : ''}
    <div class="vnote-text"><span class="sr">Transcript: </span>“${esc(m.body)}”</div>`;
}

// ---------------------------------------------------------------- playback (one at a time)
let player = null, playingBtn = null;
function stopPlayback() {
  if (player) { player.pause(); player.src = ''; }
  if (playingBtn) { playingBtn.innerHTML = icon('play'); playingBtn.setAttribute('aria-label', 'Play voice note'); playingBtn.closest('.vnote')?.style.setProperty('--p', '0'); playingBtn.closest('.vnote')?.querySelectorAll('.vnote-bars i').forEach(i => i.classList.remove('on')); }
  playingBtn = null;
}
async function togglePlay(btn) {
  if (playingBtn === btn) { stopPlayback(); return; }
  stopPlayback();
  playingBtn = btn; btn.innerHTML = icon('pause'); btn.setAttribute('aria-label', 'Pause voice note');
  try {
    const { url } = await api.get(btn.dataset.voicePlay);
    if (playingBtn !== btn) return;
    player ||= new Audio();
    const bars = [...btn.closest('.vnote').querySelectorAll('.vnote-bars i')], dur = Number(btn.dataset.dur) || 0;
    player.ontimeupdate = () => { const d = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : dur; const n = d ? Math.round((player.currentTime / d) * bars.length) : 0; bars.forEach((b, i) => b.classList.toggle('on', i < n)); };
    player.onended = stopPlayback;
    player.onerror = () => { if (playingBtn === btn) { stopPlayback(); toast('That voice note couldn’t be played. Try again.'); } };
    player.src = url;
    await player.play();
  } catch (e) { if (playingBtn === btn) stopPlayback(); toast(e.message || 'That voice note couldn’t be played.'); }
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => { const b = e.target.closest('[data-voice-play]'); if (b) { e.preventDefault(); togglePlay(b); } });
}

// ---------------------------------------------------------------- recording
/**
 * Turns a chat form into a recording bar. send(formData) uploads; it resolves with the message.
 * @param {HTMLFormElement} form
 * @param {{ maxSeconds?: number, provider?: string, send: (fd: FormData) => Promise<any>, onSent?: (r: any) => void }} opts
 */
export async function recordVoiceNote(form, { maxSeconds = 60, provider = 'mock', send, onSent }) {
  if (form.classList.contains('recording') || form.dataset.vnStarting) return; // ignore taps while the mic is starting
  stopPlayback();
  const bar = document.createElement('div');
  bar.className = 'vnote-rec';
  bar.innerHTML = `<button type="button" class="btn ghost icon sm" data-vn="cancel" aria-label="Cancel voice note">${icon('x')}</button><span class="rec-dot" role="status" aria-live="polite">Recording 0:00</span><div class="wave live grow" aria-hidden="true">${'<i></i>'.repeat(9)}</div><button type="button" class="btn primary icon" data-vn="send" aria-label="Send voice note">${icon('send')}</button>`;
  const dot = bar.querySelector('.rec-dot'), sendBtn = bar.querySelector('[data-vn="send"]');
  let hint = '', listening = null, timer = null, finished = false;
  const recorder = createRecorder({ maxMs: maxSeconds * 1000, onLevel: meter(bar.querySelector('.wave')), onAutoStop: () => { clearInterval(timer); dot.textContent = `${fmtDur(maxSeconds)} · that’s the limit. Send or cancel.`; dot.classList.add('stopped'); } });
  let unwatch = () => {};
  const close = () => { finished = true; unwatch(); clearInterval(timer); listenOnce.stop?.(); bar.remove(); form.classList.remove('recording'); };
  form.dataset.vnStarting = '1';
  try { await recorder.start(); }
  catch (e) { delete form.dataset.vnStarting; toast(e.code === 'denied' ? MIC_OFF : e.message, { ms: 6000 }); return; }
  delete form.dataset.vnStarting;
  if (!document.contains(form)) { recorder.cancel(); return; } // left the screen while the mic was starting
  form.classList.add('recording'); form.appendChild(bar); sendBtn.focus();
  unwatch = onRemoved(form, () => { recorder.cancel(); close(); }); // navigating away discards the recording
  const t0 = Date.now();
  timer = setInterval(() => { dot.textContent = `Recording ${fmtDur((Date.now() - t0) / 1000)} / ${fmtDur(maxSeconds)}`; }, 250);
  // Development (mock voice): the browser's own transcript stands in for the speech provider.
  if (provider === 'mock' && dictationSupported) listening = listenOnce({ continuous: true, onInterim: v => { hint = v; } }).then(v => { if (v) hint = v; }).catch(() => {});

  bar.querySelector('[data-vn="cancel"]').addEventListener('click', () => { recorder.cancel(); close(); toast('Voice note discarded.'); });
  sendBtn.addEventListener('click', async () => {
    if (finished) return;
    sendBtn.disabled = true; clearInterval(timer); dot.classList.remove('stopped'); dot.textContent = 'Sending…';
    let out = null;
    try { out = await recorder.stop(); } catch { out = null; }
    listenOnce.stop?.(); await Promise.race([listening, new Promise(r => setTimeout(r, 600))]);
    if (!out?.blob?.size) { close(); toast('Nothing was recorded. Try again.'); return; }
    if (out.durationMs < 700) { close(); toast('That was too short. Hold on a little longer.'); return; }
    const fd = new FormData();
    fd.append('audio', out.blob, `note.${/mp4/.test(out.mimeType) ? 'm4a' : 'webm'}`);
    fd.append('durationMs', String(out.durationMs));
    if (hint) fd.append('hint', hint);
    try { const r = await send(fd); close(); onSent?.(r); }
    catch (e) { close(); toast(e.message, { ms: 6000 }); }
  });
}
