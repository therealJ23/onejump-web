// Dictation (🎤): the browser's built-in speech recognition writes what you say into a text box,
// with live (interim) results. Nothing is ever sent automatically: you still press Send.
// Where the browser has no speech recognition (e.g. Firefox), the mic buttons are hidden.
// Note: some browsers (Chrome, Safari) send dictation audio to their own servers to turn it into
// text; the privacy policy says so.
import { icon } from './icons.js';

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const dictationSupported = !!SR;
export const MIC_OFF = 'Microphone access is off. Turn it on in your browser settings to use voice.';
if (typeof document !== 'undefined' && !SR) document.documentElement.classList.add('no-sr');

/** A mic button that dictates into the element with id `target`. */
export function micButton(target, { cls = 'btn icon', style = '', label = 'Dictate' } = {}) {
  return `<button type="button" class="${cls}"${style ? ` style="${style}"` : ''} data-dictate data-act="dictate" data-target="${target}" aria-label="${label}" aria-pressed="false" title="Dictate: talk instead of type">${icon('mic')}</button>`;
}

let active = null;
const tidy = (s, startOfBox) => { const t = s.replace(/\s+/g, ' ').trimStart(); return startOfBox && t ? t.charAt(0).toUpperCase() + t.slice(1) : t; };

export function stopDictation() { if (active) active.rec.stop(); }

/**
 * Starts (or stops) dictation for a mic button.
 * @param {HTMLElement} btn  has data-target = id of an input or textarea
 * @param {{ onError?: (msg:string)=>void, onFinal?: (text:string)=>void, lang?: string }} opts
 */
export function toggleDictation(btn, { onError, onFinal, lang } = {}) {
  if (!SR) { onError?.('Dictation isn’t available in this browser. You can still type.'); return null; }
  if (active) { const same = active.btn === btn; active.rec.stop(); if (same) return null; }
  const target = document.getElementById(btn.dataset.target);
  if (!target) return null;
  const rec = new SR();
  rec.lang = lang || document.documentElement.lang || navigator.language || 'en-US';
  rec.interimResults = true;
  rec.continuous = true;
  const base = target.value && !/\s$/.test(target.value) ? `${target.value} ` : target.value;
  let heard = '';
  rec.onresult = e => {
    heard = Array.from(e.results).map(r => r[0].transcript).join(' ');
    target.value = base + tidy(heard, !base);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') onError?.(MIC_OFF);
    else if (!['no-speech', 'aborted'].includes(e.error)) onError?.('Dictation stopped. Try again, or type instead.');
  };
  rec.onend = () => {
    btn.classList.remove('mic-live'); btn.setAttribute('aria-pressed', 'false'); btn.title = 'Dictate: talk instead of type';
    if (active?.rec === rec) active = null;
    if (heard) onFinal?.(heard.trim());
    if (document.contains(target)) target.focus();
  };
  try { rec.start(); } catch { onError?.('Dictation couldn’t start. Try again.'); return null; }
  btn.classList.add('mic-live'); btn.setAttribute('aria-pressed', 'true'); btn.title = 'Stop dictation';
  active = { rec, btn };
  return rec;
}

/** One-shot listening (no text box): resolves with what was said, or '' if nothing. */
export function listenOnce({ lang, onInterim } = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(Object.assign(new Error('Speech recognition isn’t available in this browser.'), { code: 'unsupported' }));
    const rec = new SR();
    rec.lang = lang || navigator.language || 'en-US';
    rec.interimResults = true; rec.continuous = false;
    let heard = '', failed = null;
    rec.onresult = e => { heard = Array.from(e.results).map(r => r[0].transcript).join(' '); onInterim?.(heard); };
    rec.onerror = e => { failed = e.error; };
    rec.onend = () => {
      if (failed === 'not-allowed' || failed === 'service-not-allowed') reject(Object.assign(new Error(MIC_OFF), { code: 'denied' }));
      else if (failed && !['no-speech', 'aborted'].includes(failed)) reject(Object.assign(new Error('I didn’t catch that. Try again.'), { code: failed }));
      else resolve(heard.trim());
    };
    try { rec.start(); } catch (e) { reject(e); }
    listenOnce.stop = () => rec.stop();
  });
}
