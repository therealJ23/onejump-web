// Spoken answers. Uses the browser's own voice (speechSynthesis, free) unless the server is set
// up for Deepgram voices (VOICE_TTS=deepgram), in which case it plays the server's audio.
// "Speak answers out loud" is remembered per device.
import { api } from './api.js';
import { getLang } from './i18n.js';

const KEY = 'oj.voice.speak';
export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
export function speakOn() { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } }
export function setSpeakOn(on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ } if (!on) stopSpeaking(); }

let audio = null;
export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  if (audio) { audio.pause(); audio = null; }
}

/** Speaks text (if the toggle is on, or force for an explicit Play). Calls onEnd when finished, or right away if muted. */
export async function speak(text, { onEnd, tts = 'browser', force = false } = {}) {
  const done = () => onEnd?.();
  if (!text || (!force && !speakOn())) { setTimeout(done, 0); return; }
  stopSpeaking();
  if (tts === 'deepgram') {
    try {
      const res = await fetch('/api/voice/speak', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': api.csrf?.() || '' }, body: JSON.stringify({ text, lang: getLang() }) });
      if (res.status === 200) { audio = new Audio(URL.createObjectURL(await res.blob())); audio.onended = done; audio.onerror = done; await audio.play(); return; }
    } catch { /* fall back to the browser voice */ }
  }
  if (!speechSupported) { setTimeout(done, Math.min(4000, 400 + text.length * 35)); return; }
  try {
    const u = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const es = getLang() === 'es';
    const v = es
      ? voices.find(x => /^es[-_](US|MX|419)/i.test(x.lang) && /paulina|m[oó]nica|helena|sabina|google/i.test(x.name)) || voices.find(x => /^es/i.test(x.lang))
      : voices.find(x => /en[-_]US/i.test(x.lang) && /samantha|aria|jenny|google us|female/i.test(x.name)) || voices.find(x => /^en/i.test(x.lang));
    u.lang = es ? (v?.lang || 'es-US') : (v?.lang || 'en-US');
    if (v) u.voice = v;
    u.rate = 1.03;
    let finished = false; const fin = () => { if (!finished) { finished = true; done(); } };
    u.onend = fin; u.onerror = fin;
    setTimeout(fin, 1500 + text.length * 90);
    speechSynthesis.speak(u);
  } catch { done(); }
}
