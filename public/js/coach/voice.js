// Talk to Assist (push to talk, spoken answers, confirmation cards) and the morning briefing.
// Nothing records until the coach taps the circle; it stops on a second tap or after 30 seconds.
import { api } from '../shared/api.js';
import { esc } from '../shared/format.js';
import { icon, arc } from '../shared/icons.js';
import { openModal, closeModal, modalHead, toast } from '../shared/ui.js';
import { createRecorder, meter, recordingSupported, MIC_OFF } from '../shared/media.js';
import { listenOnce, dictationSupported } from '../shared/dictation.js';
import { speak, stopSpeaking, speakOn, setSpeakOn, speechSupported } from '../shared/speech.js';
import { answerBlock, proposalEvents } from './assist.js';
import { refreshCounts } from './shell.js';

const PHRASES = ['Who hasn’t checked in this week?', 'Which clients are at risk of leaving?', 'Who’s struggling with nutrition this week?', 'What was my revenue last month?', 'Send Marcus the drafted message', 'Add a lead: Jake, wants to get stronger for climbing, found me on Instagram', 'Remind everyone who hasn’t checked in', 'Start my morning briefing'];
let cfg = null;
const loadCfg = async () => (cfg ||= await api.get('/api/voice/config').catch(() => ({ provider: 'mock', tts: 'browser', maxSeconds: 30 })));

export async function openTalk() {
  stopSpeaking();
  const c = await loadCfg();
  const m = openModal(`${modalHead(`${arc()} Talk to Assist`, 'Push to talk. Assist answers out loud and never does anything without your OK.')}
    <div class="modal-body" style="align-items:center;text-align:center">
      <button class="voice-orb" id="v-orb" aria-label="Tap to talk" aria-pressed="false" ${recordingSupported ? '' : 'disabled'}>${arc()}</button>
      <div class="wave" id="v-wave" aria-hidden="true">${'<i></i>'.repeat(9)}</div>
      <div id="v-rec" class="tiny" aria-live="polite"></div>
      <div class="voice-said" id="v-said" aria-live="polite">${recordingSupported ? 'Tap the circle and ask anything' : 'Voice isn’t available in this browser. Type below or tap a phrase.'}</div>
      <div id="v-answer" class="stack s8" style="width:100%;text-align:left" aria-live="polite"></div>
      <form class="row" id="v-form" style="width:100%"><label class="grow"><span class="sr">Or type to Assist</span><input class="input" id="v-type" placeholder="Or type here" autocomplete="off" maxlength="600" style="border-radius:999px"></label><button class="btn assist icon" type="submit" aria-label="Ask">${icon('send')}</button></form>
      <div class="stack s8" style="width:100%"><div class="tiny faint">Try saying</div><div class="suggest" style="justify-content:center">${PHRASES.map(p => `<button type="button" data-say="${esc(p)}">“${esc(p)}”</button>`).join('')}</div></div>
      <div class="row between" style="width:100%;flex-wrap:wrap;gap:8px"><label class="row small" style="gap:8px"><button type="button" class="toggle ${speakOn() ? 'on' : ''}" id="v-speak" aria-pressed="${speakOn()}" aria-label="Speak answers out loud"></button>Speak answers out loud${speechSupported || c.tts === 'deepgram' ? '' : ' <span class="faint">(not supported in this browser)</span>'}</label><span class="tiny faint">Health details are shown, never read aloud. Audio is turned into text, then deleted.</span></div>
    </div>`, { wide: true, label: 'Talk to Assist' });
  const $ = s => m.querySelector(s);
  const orb = $('#v-orb'), wave = $('#v-wave'), said = $('#v-said'), ans = $('#v-answer'), rec = $('#v-rec');
  let recorder = null, timer = null, hint = '', listening = null;

  const setOrb = st => { orb.className = `voice-orb ${st}`; orb.setAttribute('aria-pressed', st === 'listening'); orb.setAttribute('aria-label', st === 'listening' ? 'Tap to stop' : 'Tap to talk'); wave.classList.toggle('on', st === 'speaking'); wave.classList.toggle('live', st === 'listening'); if (st !== 'listening') wave.querySelectorAll('i').forEach(i => { i.style.height = ''; }); };
  const reply = r => {
    if (r.transcript != null) said.textContent = r.transcript ? `“${r.transcript}”` : 'I didn’t catch that.';
    ans.innerHTML = `<div class="chat"><div class="a"><span class="who">${arc()}</span><div class="body">${answerBlock(r)}</div></div></div>`;
    if (r.action === 'briefing') { closeModal(); openBriefing({ autoplay: true }); return; }
    setOrb('speaking');
    speak(r.spokenText, { tts: c.tts, onEnd: () => { if (document.contains(orb)) setOrb(''); } });
    refreshCounts();
  };
  const fail = e => { setOrb(''); said.textContent = e.message; ans.innerHTML = ''; if (e.data?.code === 'voice_limit') ans.innerHTML = '<p class="small muted">You can keep typing below.</p>'; };

  async function ask(text) {
    stopSpeaking(); said.textContent = `“${text}”`; ans.innerHTML = `<div class="thinking" role="status">${arc()}<span>Looking at your data…</span></div>`; setOrb('thinking');
    try { reply(await api.post('/api/assist/ask', { question: text, voice: true })); } catch (e) { fail(e); }
  }
  async function start() {
    stopSpeaking(); ans.innerHTML = ''; hint = '';
    recorder = createRecorder({ maxMs: (c.maxSeconds || 30) * 1000, onLevel: meter(wave), onAutoStop: () => finish() });
    try { await recorder.start(); }
    catch (e) { recorder = null; said.textContent = e.code === 'denied' ? MIC_OFF : e.message; ans.innerHTML = '<p class="small muted">Typing still works: use the box below or tap a phrase.</p>'; return; }
    if (!recorder) return;
    setOrb('listening'); said.textContent = 'Listening…';
    const t0 = Date.now();
    rec.innerHTML = '<span class="rec-dot">Recording 0:00</span>';
    timer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); rec.innerHTML = `<span class="rec-dot">Recording 0:${String(s).padStart(2, '0')} / 0:${c.maxSeconds || 30}</span>`; }, 250);
    // Development (mock voice): the browser's live transcript stands in for the speech provider.
    if (c.provider === 'mock' && dictationSupported) listening = listenOnce({ onInterim: v => { hint = v; said.textContent = `“${v}”`; } }).then(v => { if (v) hint = v; }).catch(() => {});
  }
  async function finish() {
    if (!recorder) return;
    const r = recorder; recorder = null;
    clearInterval(timer); rec.textContent = '';
    setOrb('thinking'); said.textContent = said.textContent === 'Listening…' ? 'One moment…' : said.textContent;
    let out;
    try { out = await r.stop(); } catch { out = null; }
    listenOnce.stop?.(); await Promise.race([listening, new Promise(res => setTimeout(res, 600))]);
    if (!out?.blob?.size) { fail(new Error('Nothing was recorded. Try again.')); return; }
    const fd = new FormData();
    fd.append('audio', out.blob, `talk.${/mp4/.test(out.mimeType) ? 'm4a' : 'webm'}`);
    fd.append('durationMs', String(out.durationMs));
    if (hint) fd.append('hint', hint);
    ans.innerHTML = `<div class="thinking" role="status">${arc()}<span>Looking at your data…</span></div>`;
    try { reply(await api.post('/api/voice/ask', fd)); } catch (e) { fail(e); }
  }

  orb.addEventListener('click', () => (recorder ? finish() : start()));
  $('#v-form').addEventListener('submit', e => { e.preventDefault(); const v = $('#v-type').value.trim(); if (!v) return; $('#v-type').value = ''; ask(v); });
  m.addEventListener('click', e => { const b = e.target.closest('[data-say]'); if (b) ask(b.dataset.say); });
  $('#v-speak').addEventListener('click', e => { const on = !speakOn(); setSpeakOn(on); e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', on); });
  const onDone = ev => { if (document.contains(m)) speak(ev.detail.confirmed ? `Done. ${ev.detail.message || ''}` : 'Okay, I won’t do that.', { tts: c.tts }); };
  proposalEvents.addEventListener('done', onDone);
  const obs = new MutationObserver(() => { if (!document.contains(m)) { obs.disconnect(); proposalEvents.removeEventListener('done', onDone); recorder?.cancel(); clearInterval(timer); listenOnce.stop?.(); stopSpeaking(); } });
  obs.observe(document.body, { childList: true });
}

export async function openBriefing() { toast('The morning briefing is coming in a later step.'); }
