// Spanish for server-made text sent to the iPhone app. Uses the same dictionary and patterns as
// the web app (public/js/shared/i18n-es.js), so both say the same thing. Text without a
// translation (names, AI drafts already written in the coach's language) stays as it is.
import { ES, ES_PATTERNS } from '../../public/js/shared/i18n-es.js';

const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Spanish for one piece of text, or null if there's no translation. */
export function toEs(text) {
  const key = norm(text);
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(ES, key)) return ES[key];
  for (const [re, out] of ES_PATTERNS) {
    const m = key.match(re);
    if (!m) continue;
    const r = typeof out === 'function' ? out(...m.slice(1)) : key.replace(re, out);
    if (r != null) return r;
  }
  if (key.includes(' · ')) {
    const parts = key.split(' · ');
    const es = parts.map(p => (p ? toEs(p) : null));
    if (es.some(x => x != null)) return parts.map((p, i) => es[i] ?? p).join(' · ');
  }
  return null;
}

/** { en, es } for the app's Loc type. Pass `es` to give the Spanish yourself. */
export const L = (en, es) => {
  const e = String(en ?? '');
  return { en: e, es: es != null ? String(es) : (toEs(e) ?? e) };
};
