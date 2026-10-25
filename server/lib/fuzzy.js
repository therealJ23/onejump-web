// Sounds-alike matching for names heard by speech recognition, which often mishears or gets a
// mispronounced name: "Mia" for Maya, "Marko" for Marcus, "Jesica" for Jessica, "Romanian dedlift"
// for Romanian deadlift. Works for English and Spanish names (accents, b/v, ll/y, silent h, c/k/s/z).
// Used only as a last step, after exact and partial matches found nothing.

/** Lowercase, no accents, letters, digits and spaces only. */
export const plain = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** A rough spelling of how a word sounds (English + Spanish), so near-misses compare equal. */
export function soundKey(word) {
  let w = plain(word).replace(/\s+/g, '');
  if (!w) return '';
  w = w
    .replace(/^h/, '').replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/^ps/, 's')
    .replace(/ph/g, 'f').replace(/gh/g, 'g').replace(/sch/g, 'sk').replace(/sh/g, 's').replace(/ch/g, 'c')
    .replace(/qu/g, 'k').replace(/q/g, 'k').replace(/ck/g, 'k').replace(/x/g, 'ks')
    .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/z/g, 's').replace(/ll/g, 'y').replace(/v/g, 'b')
    .replace(/w/g, 'u').replace(/j/g, 'y').replace(/g(?=[ei])/g, 'y').replace(/th/g, 't').replace(/dg/g, 'y')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/(?<=.)h/g, '');
  // Vowels after the first letter carry little of a name's identity when misheard.
  const first = w[0];
  const rest = w.slice(1).replace(/[aeiouy]+/g, m => (m.length ? 'a' : ''));
  return (first + rest).replace(/a+$/, 'a');
}

/** Edit distance between two short strings. */
export function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** 0…1: how alike two words are, by spelling and by sound. */
export function wordScore(a, b) {
  const pa = plain(a), pb = plain(b);
  if (!pa || !pb) return 0;
  if (pa === pb) return 1;
  const spell = 1 - distance(pa, pb) / Math.max(pa.length, pb.length);
  const ka = soundKey(pa), kb = soundKey(pb);
  const sound = ka && kb ? (ka === kb ? 0.95 : 1 - distance(ka, kb) / Math.max(ka.length, kb.length)) : 0;
  return Math.max(spell, sound * 0.97);
}

/**
 * How well the words someone said match a name (0…1). Each word of the name is matched to its
 * best word in what was said; the first word (a first name) counts most.
 */
export function nameScore(said, name) {
  const heard = plain(said).split(' ').filter(Boolean);
  const parts = plain(name).split(' ').filter(Boolean);
  if (!heard.length || !parts.length) return 0;
  const best = parts.map(p => Math.max(...heard.map(h => wordScore(h, p))));
  // A first name alone ("Maya") is how coaches usually say it.
  const firstOnly = best[0];
  const all = best.reduce((s, x) => s + x, 0) / best.length;
  const joined = wordScore(heard.join(''), parts.join(''));
  return Math.max(firstOnly * (parts.length > 1 && heard.length > 1 ? 0.92 : 1), all, joined);
}

/**
 * The one item whose name sounds most like `said`, if it's a clear winner.
 * @template T
 * @param {T[]} list
 * @param {string} said
 * @param {(x: T) => string} key
 * @returns {{ hit: T|null, close: T[] }} close = plausible matches when there's no clear winner
 */
export function soundsLike(list, said, key = x => x.name, { min = 0.78, margin = 0.06 } = {}) {
  const scored = list.map(x => ({ x, s: nameScore(said, key(x)) })).filter(r => r.s >= min).sort((a, b) => b.s - a.s);
  if (!scored.length) return { hit: null, close: [] };
  if (scored.length === 1 || scored[0].s - scored[1].s >= margin) return { hit: scored[0].x, close: [scored[0].x] };
  return { hit: null, close: scored.filter(r => scored[0].s - r.s < margin).slice(0, 4).map(r => r.x) };
}
