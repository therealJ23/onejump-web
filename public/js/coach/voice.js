// Ask Assist: the green "Ask Assist" button opens this window. Assist greets the coach by name and
// says what it can do. Typing works straight away; tapping the OneJump logo (the orb) turns on
// talking: it listens, sends when the coach stops talking, answers out loud and listens again,
// until the coach taps the logo again or closes the window. It never acts without an on-screen
// Confirm. The conversation is kept while the tab is open, so follow-up questions work.
import { api } from '../shared/api.js';
import { esc } from '../shared/format.js';
import { icon, arc } from '../shared/icons.js';
import { openModal, closeModal, modalHead } from '../shared/ui.js';
import { createRecorder, recordingSupported, MIC_OFF } from '../shared/media.js';
import { listenOnce, dictationSupported } from '../shared/dictation.js';
import { speak, stopSpeaking, speakOn, setSpeakOn, speechSupported } from '../shared/speech.js';
import { answerBlock, proposalEvents } from './assist.js';
import { refreshCounts } from './shell.js';
import { chime } from '../shared/sounds.js';
import { coachFirst } from './state.js';
import { t, getLang } from '../shared/i18n.js';

let cfg = null;
const loadCfg = async () => (cfg ||= await api.get('/api/voice/config').catch(() => ({ provider: 'mock', tts: 'browser', maxSeconds: 30 })));

// Voice detection: louder than this counts as talking; this much quiet after talking sends it;
// this long with no talking at all pauses listening (so the mic is never left on for nothing).
const TALK_LEVEL = 0.1, END_AFTER_MS = 1200, PAUSE_AFTER_MS = 8000;

/** The conversation in this tab: [{ role: 'q'|'a', text, r? }]. Sent back as context so follow-ups work. */
const thread = [];
/** The last few turns as plain text, for Assist's memory. */
export const historyFor = list => list.filter(m => m.text && !m.greeting).slice(-12).map(m => ({ role: m.role === 'q' ? 'user' : 'assistant', text: String(m.text).slice(0, 1500) }));
const plain = html => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.replace(/\s+/g, ' ').trim(); };

function greetingText() {
  const name = coachFirst();
  return t(name ? 'Hi {name}! I’m Assist. I can tell you who needs you today, who’s drifting or hasn’t checked in, how your revenue and payments look, and catch you up on any client. I can also draft messages, notes, leads and reminders for you to approve.' : 'Hi! I’m Assist. I can tell you who needs you today, who’s drifting or hasn’t checked in, how your revenue and payments look, and catch you up on any client. I can also draft messages, notes, leads and reminders for you to approve.', { name });
}

const greetingHtml = () => `<p>${esc(greetingText())}</p><p class="small muted">${esc(t('Type your question below, or tap the OneJump logo above to talk to me.'))}</p>`;

export async function openTalk(q) {
  stopSpeaking();
  const c = await loadCfg();
  const m = openModal(`${modalHead(`${arc()} ${t('Ask Assist')}`, t('Type below, or tap the OneJump logo to talk. Nothing happens without your OK.'))}
    <div class="modal-body talk" style="align-items:center;text-align:center">
      <button class="voice-orb small" id="v-orb" aria-label="${esc(t('Tap to talk'))}" aria-pressed="false" ${recordingSupported ? '' : 'disabled'}>${arc()}</button>
      <div class="wave" id="v-wave" aria-hidden="true">${'<i></i>'.repeat(9)}</div>
      <div class="voice-said" id="v-said" aria-live="polite">${recordingSupported ? esc(t('Tap the logo to talk')) : esc(t('Voice isn’t available in this browser. Type below.'))}</div>
      <div id="v-rec" class="tiny"></div>
      <div class="chat talk-thread" id="v-thread" aria-live="polite"></div>
      <form class="row" id="v-form" style="width:100%"><label class="grow"><span class="sr">${esc(t('Type to Assist'))}</span><input class="input" id="v-type" placeholder="${esc(t('Ask Assist anything…'))}" autocomplete="off" maxlength="600" style="border-radius:999px"></label><button class="btn assist icon" type="submit" aria-label="${esc(t('Ask'))}">${icon('send')}</button></form>
      <div class="row between" style="width:100%;flex-wrap:wrap;gap:8px"><label class="row small" style="gap:8px"><button type="button" class="toggle ${speakOn() ? 'on' : ''}" id="v-speak" aria-pressed="${speakOn()}" aria-label="${esc(t('Speak answers out loud'))}"></button>${esc(t('Speak answers out loud'))}${speechSupported || c.tts === 'deepgram' ? '' : ` <span class="faint">${esc(t('(not supported in this browser)'))}</span>`}</label><button type="button" class="btn ghost sm" id="v-new">${icon('repeat')} ${esc(t('New conversation'))}</button></div>
      <div class="tiny faint" style="width:100%;text-align:left">${esc(t('Health details are shown, never read aloud. Audio is turned into text, then deleted.'))}</div>
    </div>`, { wide: true, label: t('Ask Assist') });
  const $ = s => m.querySelector(s);
  const orb = $('#v-orb'), wave = $('#v-wave'), said = $('#v-said'), list = $('#v-thread'), rec = $('#v-rec');
  let glow = 0;
  const draw = level => { glow = glow * 0.7 + level * 0.3; orb.style.setProperty('--lvl', Math.min(1, glow * 1.6).toFixed(3)); }; // the orb glows with your voice
  let recorder = null, hint = '', listening = null, starting = false, busy = false, vad = null, talking = false;
  const open = () => document.contains(m);

  if (!thread.length) thread.push({ role: 'a', greeting: true, html: greetingHtml() });
  const draw_ = () => {
    list.innerHTML = thread.map(x => x.role === 'q' ? `<div class="q">${esc(x.text)}</div>`
      : `<div class="a"><span class="who">${arc()}</span><div class="body">${x.pending ? `<div class="thinking" role="status">${arc()}<span>${esc(t('Looking at your data…'))}</span></div>` : x.error ? `<p class="small" style="color:var(--crit)">${esc(x.error)}</p>` : x.r ? answerBlock(x.r) : x.html}</div></div>`).join('');
    list.scrollTop = list.scrollHeight;
  };
  draw_();

  const setOrb = st => {
    orb.className = `voice-orb small ${st}`; orb.setAttribute('aria-pressed', st === 'listening');
    orb.setAttribute('aria-label', talking ? t('Stop talking') : t('Tap to talk'));
    wave.classList.toggle('on', st === 'speaking'); wave.classList.toggle('live', st === 'listening');
    if (st !== 'listening') wave.querySelectorAll('i').forEach(i => { i.style.height = ''; });
    rec.innerHTML = st === 'listening' ? `<span class="sr">${esc(t('Listening'))}</span>` : '';
    if (st !== 'listening') { glow = 0; orb.style.setProperty('--lvl', 0); }
  };
  const idleText = () => { said.textContent = talking ? t('Go ahead, I’m listening') : t('Tap the logo to talk'); };
  /** After Assist has finished talking, listen again while talking is on. */
  const listenAgain = () => { if (open() && talking && !recorder && !starting && !busy) start(); };

  function push(qText) {
    if (qText) thread.push({ role: 'q', text: qText });
    const a = { role: 'a', pending: true }; thread.push(a); draw_();
    return a;
  }
  function settle(a, r, spokenQuestion) {
    a.pending = false; a.r = r; a.text = plain(r.answerText || r.answerHtml) || r.spokenText || '';
    if (r.transcript != null) { const qm = thread[thread.indexOf(a) - 1]; if (qm?.role === 'q') qm.text = r.transcript || t('(I didn’t catch that)'); }
    draw_();
    if (r.action === 'briefing') { closeModal(); openBriefing({ autoplay: true }); return; }
    refreshCounts();
    if (spokenQuestion || speakOn()) {
      setOrb('speaking'); idleText();
      speak(r.spokenText, { tts: c.tts, onEnd: () => { if (!open()) return; setOrb(''); idleText(); listenAgain(); } });
    } else { setOrb(''); idleText(); }
  }
  const failed = (a, e) => { a.pending = false; a.error = e.message; draw_(); setOrb(''); idleText(); };
  const pause = text => { const r = recorder; recorder = null; r?.cancel(); listenOnce.stop?.(); setOrb(''); if (text != null) said.textContent = text; };

  async function ask(text) {
    if (recorder) pause(null);
    stopSpeaking();
    const history = historyFor(thread);
    const a = push(text); setOrb('thinking'); busy = true;
    try { const r = await api.post('/api/assist/ask', { question: text, voice: talking, history, lang: getLang() }); busy = false; settle(a, r, false); }
    catch (e) { busy = false; failed(a, e); }
  }
  /** Voice detection on the live mic level: send after a short pause once the coach has spoken. */
  function onLevel(level) {
    draw(level);
    if (!vad || !recorder) return;
    const now = Date.now();
    if (level > TALK_LEVEL) { vad.heard = true; vad.quietSince = 0; return; }
    if (vad.heard) { vad.quietSince ||= now; if (now - vad.quietSince > END_AFTER_MS) finish(); }
    else if (now - vad.startedAt > PAUSE_AFTER_MS) { talking = false; pause(t('Paused so the mic isn’t left on. Tap the logo when you’re ready.')); }
  }
  async function start() {
    stopSpeaking(); hint = '';
    const r = createRecorder({ maxMs: (c.maxSeconds || 30) * 1000, onLevel, onAutoStop: () => finish() });
    starting = true; said.textContent = t('Starting the microphone…');
    try { await r.start(); }
    catch (e) { starting = false; talking = false; setOrb(''); said.textContent = e.code === 'denied' ? MIC_OFF : e.message; return; }
    starting = false;
    if (!open() || !talking) { r.cancel(); return; } // closed or stopped while the mic was starting
    recorder = r; vad = { startedAt: Date.now(), heard: false, quietSince: 0 };
    setOrb('listening'); said.textContent = t('Go ahead, I’m listening');
    // Development (mock voice): the browser's live transcript stands in for the speech provider.
    if (c.provider === 'mock' && dictationSupported) listening = listenOnce({ onInterim: v => { hint = v; said.textContent = `“${v}”`; } }).then(v => { if (v) hint = v; }).catch(() => {});
  }
  async function finish() {
    if (!recorder) return;
    const r = recorder; recorder = null; vad = null; busy = true;
    setOrb('thinking'); said.textContent = t('One moment…');
    let out;
    try { out = await r.stop(); } catch { out = null; }
    listenOnce.stop?.(); await Promise.race([listening, new Promise(res => setTimeout(res, 600))]);
    if (!out?.blob?.size) { busy = false; setOrb(''); said.textContent = t('Nothing was recorded. Tap the logo to try again.'); talking = false; return; }
    const fd = new FormData();
    fd.append('audio', out.blob, `talk.${/mp4/.test(out.mimeType) ? 'm4a' : 'webm'}`);
    fd.append('durationMs', String(out.durationMs));
    fd.append('lang', getLang());
    fd.append('history', JSON.stringify(historyFor(thread)));
    if (hint) fd.append('hint', hint);
    const a = push('…');
    try { const res = await api.post('/api/voice/ask', fd); busy = false; settle(a, res, true); } catch (e) { busy = false; failed(a, e); }
  }

  // The logo turns talking on and off. Taps while the mic starts or Assist is thinking are ignored.
  orb.addEventListener('click', () => {
    if (starting || busy) return;
    if (talking) {
      talking = false;
      if (recorder && vad?.heard) { finish(); return; } // send what was said, then stop
      pause(null); stopSpeaking(); setOrb(''); idleText(); return;
    }
    talking = true; stopSpeaking(); chime().catch(() => {}); start();
  });
  $('#v-form').addEventListener('submit', e => { e.preventDefault(); const v = $('#v-type').value.trim(); if (!v) return; $('#v-type').value = ''; ask(v); });
  $('#v-speak').addEventListener('click', e => { const on = !speakOn(); setSpeakOn(on); e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', on); });
  $('#v-new').addEventListener('click', () => { pause(null); stopSpeaking(); talking = false; thread.length = 0; thread.push({ role: 'a', greeting: true, html: greetingHtml() }); draw_(); setOrb(''); idleText(); $('#v-type').focus(); });
  const onDone = ev => {
    if (!open() || !talking) return;
    if (recorder && !vad?.heard) pause(null); // don't record Assist's own "Done"
    speak(ev.detail.confirmed ? `${t('Done.')} ${ev.detail.message || ''}` : t('Okay, I won’t do that.'), { tts: c.tts, onEnd: listenAgain });
  };
  proposalEvents.addEventListener('done', onDone);
  const obs = new MutationObserver(() => { if (!open()) { obs.disconnect(); proposalEvents.removeEventListener('done', onDone); recorder?.cancel(); recorder = null; talking = false; listenOnce.stop?.(); stopSpeaking(); } });
  obs.observe(document.body, { childList: true });
  setTimeout(() => $('#v-type')?.focus(), 60);
  if (q) ask(q);
}

// ---------------------------------------------------------------- morning briefing
/** Plays today's briefing line by line, highlighting the line being read. */
export async function openBriefing({ autoplay = false } = {}) {
  stopSpeaking();
  const c = await loadCfg();
  const m = openModal(`${modalHead(`${icon('speaker')} Morning briefing`, '<span id="br-sub">About 40 seconds · listen while you drive or warm up</span>')}
    <div class="modal-body" id="br-body" aria-busy="true"><div class="skel" style="height:40px;width:180px"></div>${'<div class="skel"></div>'.repeat(4)}</div>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Close</button><a class="btn primary" href="/app">Open Today</a></div>`, { label: 'Morning briefing' });
  const body = m.querySelector('#br-body');
  let b, playing = false, marked = false;
  const load = async (refresh = false) => {
    try { b = (refresh ? await api.post('/api/briefing/today/refresh') : await api.get('/api/briefing/today')).briefing; }
    catch (e) {
      body.removeAttribute('aria-busy');
      body.innerHTML = e.data?.upgrade ? `<div class="upsell">${arc()}<div class="grow stack s4"><div class="h3">The morning briefing is part of Pro</div><div class="muted small">A 40-second spoken rundown of your day at 7 AM: who needs you, check-ins, payments and one piece of good news.</div></div><a class="btn primary" href="/app/billing">See plans</a></div>`
        : `<div class="notice small" role="alert">${esc(e.message)}</div><button class="btn" id="br-retry">Try again</button>`;
      body.querySelector('#br-retry')?.addEventListener('click', () => load(refresh));
      return false;
    }
    body.removeAttribute('aria-busy');
    m.querySelector('#br-sub').textContent = `About ${b.seconds} seconds · listen while you drive or warm up`;
    body.innerHTML = `<div class="row wrap"><button class="btn assist" id="br-play">${icon('play')} Play briefing</button><div class="wave" id="br-wave" aria-hidden="true">${'<i></i>'.repeat(9)}</div><button class="btn ghost sm" id="br-refresh" style="margin-left:auto">${icon('repeat')} Refresh</button></div>
      <ol class="stack s8 brief-lines" id="br-lines">${b.lines.map((l, i) => `<li data-i="${i}" class="small">${esc(l)}</li>`).join('')}</ol>
      ${speechSupported || c.tts === 'deepgram' ? '' : '<div class="pill warn">This browser can’t speak, so the transcript is shown instead.</div>'}
      <p class="tiny faint">Built from your data at 6:30 AM; a notification arrives at 7. Health details are never read aloud; they stay on screen in the app.</p>`;
    body.querySelector('#br-play').addEventListener('click', toggle);
    body.querySelector('#br-refresh').addEventListener('click', async ev => { stop(); ev.currentTarget.disabled = true; if (await load(true)) toast('Briefing updated with the latest data.'); });
    return true;
  };
  const btn = () => body.querySelector('#br-play'), wave = () => body.querySelector('#br-wave');
  const mark = (i = -1) => body.querySelectorAll('#br-lines li').forEach(li => { const on = +li.dataset.i === i; li.classList.toggle('on', on); if (on) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current'); });
  function stop() { playing = false; stopSpeaking(); mark(); wave()?.classList.remove('on'); if (btn()) btn().innerHTML = `${icon('play')} Play briefing`; }
  async function toggle() {
    if (playing) { stop(); return; }
    playing = true; btn().innerHTML = `${icon('stop')} Stop`; wave()?.classList.add('on');
    if (!marked) { marked = true; api.post('/api/briefing/today/played').then(() => refreshBanner()).catch(() => {}); }
    for (let i = 0; i < b.lines.length && playing && document.contains(m); i++) {
      mark(i);
      await new Promise(r => speak(b.lines[i], { tts: c.tts, force: true, onEnd: r }));
    }
    if (!playing) return;
    playing = false; mark(); wave()?.classList.remove('on');
    if (btn()) btn().innerHTML = `${icon('play')} Play again`;
  }
  const obs = new MutationObserver(() => { if (!document.contains(m)) { obs.disconnect(); playing = false; stopSpeaking(); } });
  obs.observe(document.body, { childList: true });
  if (await load() && autoplay) toggle();
}

/** Hides the Today banner once the briefing was played (on any device). */
export function refreshBanner() { document.querySelector('[data-brief-banner]')?.remove(); }
