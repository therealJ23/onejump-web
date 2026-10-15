// Spoken answers. Uses the server's voice (Deepgram, VOICE_TTS=deepgram) when it's set up, and the
// browser's own voice (speechSynthesis) otherwise or if the server voice fails.
// "Speak answers out loud" is remembered per device.
//
// Why unlockAudio(): browsers (Safari above all) only let a page start sound from a tap. Answers
// arrive seconds after the tap, so the tap handler calls unlockAudio(), which starts a silent sound
// on a shared audio context; everything played later goes through that same, now-allowed, context.
// Long answers are split: the first sentence is fetched and played while the rest is fetched.
import { api } from './api.js';
import { getLang } from './i18n.js';

const KEY = 'oj.voice.speak';
export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
export function speakOn() { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } }
export function setSpeakOn(on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ } if (!on) stopSpeaking(); }

// A tiny silent WAV as a blob: address (the page's security policy allows blob: audio, not data:).
let silent = null;
const silentUrl = () => (silent ||= URL.createObjectURL(new Blob([Uint8Array.from(atob('UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA=='), c => c.charCodeAt(0))], { type: 'audio/wav' })));
let ctx = null, node = null, el = null, playId = 0;

/** Call at the start of a tap or click handler so answers that arrive later can be heard. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      ctx ||= new AC();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0);
    }
  } catch { /* no Web Audio */ }
  try { el ||= new Audio(); el.muted = true; el.src = silentUrl(); const p = el.play(); p?.then?.(() => { el.pause(); el.muted = false; }).catch(() => { el.muted = false; }); } catch { /* ignore */ }
  try { if (speechSupported && !speechSynthesis.speaking) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch { /* ignore */ }
}

export function stopSpeaking() {
  playId++;
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  try { node?.stop(); } catch { /* already stopped */ }
  node = null;
  if (el) { try { el.pause(); } catch { /* ignore */ } }
}

/** First sentence on its own (so it starts sooner), then the rest. */
export function splitForSpeech(text) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (t.length < 120) return [t];
  const m = t.match(/^(.{20,180}?[.!?…])\s+(.+)$/);
  return m ? [m[1], m[2]] : [t];
}

async function fetchVoice(text) {
  const res = await fetch('/api/voice/speak', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': api.csrf?.() || '' }, body: JSON.stringify({ text: text.slice(0, 1000), lang: getLang() }) });
  if (res.status !== 200) throw new Error(`voice ${res.status}`);
  return res.arrayBuffer();
}

async function playBuffer(buf, id) {
  if (ctx && ctx.state !== 'closed') {
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    if (ctx.state === 'running') {
      const audio = await new Promise((res, rej) => { const p = ctx.decodeAudioData(buf.slice(0), res, rej); p?.catch?.(rej); });
      if (id !== playId) return;
      await new Promise(res => { const s = ctx.createBufferSource(); s.buffer = audio; s.connect(ctx.destination); s.onended = res; node = s; s.start(0); });
      return;
    }
  }
  el ||= new Audio();
  const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
  try {
    await new Promise((res, rej) => { el.muted = false; el.onended = res; el.onerror = () => rej(new Error('audio')); el.src = url; el.play().catch(rej); });
  } finally { URL.revokeObjectURL(url); }
}

function pickVoice(es) {
  const voices = speechSynthesis.getVoices();
  return es
    ? voices.find(x => /^es[-_](US|MX|419)/i.test(x.lang) && /paulina|m[oó]nica|helena|sabina|google/i.test(x.name)) || voices.find(x => /^es/i.test(x.lang))
    : voices.find(x => /en[-_]US/i.test(x.lang) && /samantha|aria|jenny|ava|google us|female/i.test(x.name)) || voices.find(x => /^en/i.test(x.lang));
}
function browserSpeak(text, done, id) {
  if (!speechSupported) { setTimeout(done, Math.min(4000, 400 + text.length * 35)); return; }
  try {
    const es = getLang() === 'es', v = pickVoice(es);
    // One utterance per sentence: Chrome stops long utterances partway.
    const parts = (String(text).match(/[^.!?…]+[.!?…]*\s*/g) || [text]).map(s => s.trim()).filter(Boolean);
    let finished = false; const fin = () => { if (!finished && id === playId) { finished = true; done(); } };
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = v?.lang || (es ? 'es-US' : 'en-US'); if (v) u.voice = v; u.rate = 1.04;
      if (i === parts.length - 1) { u.onend = fin; u.onerror = fin; }
      speechSynthesis.speak(u);
    });
    setTimeout(fin, 2000 + text.length * 90); // in case the browser never says it finished
  } catch { done(); }
}

/** Speaks text (if the toggle is on, or force for an explicit Play). Calls onEnd when finished, or right away if muted. */
export async function speak(text, { onEnd, tts = 'browser', force = false } = {}) {
  let ended = false;
  const done = () => { if (!ended) { ended = true; onEnd?.(); } };
  if (!text || (!force && !speakOn())) { setTimeout(done, 0); return; }
  stopSpeaking();
  const id = playId;
  if (tts === 'deepgram') {
    const parts = splitForSpeech(text);
    const jobs = parts.map(fetchVoice);
    jobs.forEach(j => j.catch(() => {}));
    let i = 0;
    try {
      for (; i < jobs.length; i++) {
        const buf = await jobs[i];
        if (id !== playId) return;
        await playBuffer(buf, id);
        if (id !== playId) return;
      }
      done(); return;
    } catch (e) {
      if (id !== playId) return;
      console.warn('[voice] server voice didn’t play, using the browser voice:', e?.message || e);
      text = parts.slice(i).join(' ');
    }
  }
  browserSpeak(text, done, id);
}
