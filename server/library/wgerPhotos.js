// Pictures for OneJump's global exercise library from wger.de, the open exercise database.
// wger's exercise images are Creative Commons BY-SA: free to use with credit to the author,
// so every photo keeps its author and license and the app shows them. Only images whose license
// is a Creative Commons BY or BY-SA one are taken; anything else is skipped.
//
// Runs on the server (it needs the internet): once at start-up in production when no exercise has
// a photo yet, and from HQ (POST /api/admin/library/photos). Exercises without a match keep their
// built-in drawing (public/img/exercises/<pattern>.jpg), and a coach's own video always wins.
import { exercisesGlobal } from '../db/system.js';
import { StorageService, sniffImage } from '../storage/StorageService.js';

const API = 'https://wger.de/api/v2/exerciseinfo/?limit=100&offset=';
const ENGLISH = 2;

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|a|an|with|on)\b/g, ' ').replace(/\s+/g, ' ').trim()
  .split(' ').map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).join(' ');

/** Our names that wger spells differently. */
const ALIASES = {
  'back squat': ['squat', 'barbell squat', 'barbell back squat'], 'bench press': ['barbell bench press', 'bench press barbell'],
  'romanian deadlift': ['romanian deadlift', 'rdl', 'stiff legged deadlift'], 'conventional deadlift': ['deadlift', 'barbell deadlift'],
  'pull up': ['pull up', 'pullup', 'chin up wide'], 'push up': ['push up', 'pushup'], 'overhead press': ['shoulder press barbell', 'military press', 'overhead press'],
  'bent over row': ['bent over rowing', 'barbell row', 'bent over barbell row'], 'lat pulldown': ['lat pull down', 'pulldown'],
  'plank': ['plank'], 'walking lunge': ['lunge', 'walking lunge', 'dumbbell lunge'], 'hip thrust': ['hip thrust', 'barbell hip thrust'],
  'goblet squat': ['goblet squat'], 'leg press': ['leg press'], 'biceps curl': ['biceps curl', 'dumbbell curl', 'bicep curl'],
};

const isOpenLicense = img => {
  const t = `${img.license_title || ''} ${img.license_object_url || ''}`.toLowerCase();
  if (/nc|nd|noncommercial|no ?deriv/.test(t)) return false;
  // wger's license ids: 1 = CC BY-SA 3.0, 2 = CC BY-SA 4.0 (and the title says so when present).
  return /by-?sa|by\b|cc0|public domain/.test(t) || [1, 2].includes(Number(img.license));
};

/** Index of wger exercises with an open-licensed image, by normalized English name and aliases. */
export async function wgerIndex(fetchImpl = fetch, { maxPages = 20 } = {}) {
  const index = new Map();
  for (let page = 0; page < maxPages; page++) {
    const r = await fetchImpl(API + page * 100, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`wger ${r.status}`);
    const j = await r.json();
    for (const ex of j.results || []) {
      const img = (ex.images || []).find(i => i.is_main && isOpenLicense(i)) || (ex.images || []).find(isOpenLicense);
      if (!img?.image) continue;
      const tr = (ex.translations || []).find(t => t.language === ENGLISH);
      if (!tr?.name) continue;
      const entry = { url: img.image, author: String(img.license_author || 'wger.de contributors').slice(0, 120), license: img.license_title || (Number(img.license) === 1 ? 'CC BY-SA 3.0' : 'CC BY-SA 4.0'), source: `https://wger.de/en/exercise/${ex.id}/view/` };
      for (const n of [tr.name, ...(tr.aliases || []).map(a => a.alias || a)]) { const k = norm(n); if (k && !index.has(k)) index.set(k, entry); }
    }
    if (!j.next) break;
  }
  return index;
}

/** The wger entry for one of our exercises: its own name, our aliases, then "equipment + name". */
export function matchExercise(index, e) {
  const n = norm(e.name);
  for (const k of [n, ...(ALIASES[n] || []).map(norm), norm(`${e.equipment} ${e.name}`)]) if (index.has(k)) return index.get(k);
  return null;
}

export async function importWgerPhotos({ fetchImpl = fetch, log = console.log, force = false } = {}) {
  const list = await exercisesGlobal.list();
  const todo = list.filter(e => force || !e.photoKey);
  if (!todo.length) return { matched: 0, stored: 0, total: list.length };
  const index = await wgerIndex(fetchImpl);
  let matched = 0, stored = 0;
  for (const e of todo) {
    const m = matchExercise(index, e);
    if (!m) continue;
    matched++;
    try {
      const r = await fetchImpl(m.url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const type = sniffImage(buf);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(type) || buf.length > 3 * 1024 * 1024) continue;
      const key = `exercise-photos/${e.id}.${type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'}`;
      await StorageService.put(key, buf, type);
      await exercisesGlobal.setPhoto(e.id, key, { author: m.author, license: m.license, source: m.source });
      stored++;
    } catch (err) { log(`[library] photo for ${e.name} failed: ${err.message}`); }
  }
  log(`[library] wger photos: ${stored} stored, ${matched} matched, ${list.length} exercises`);
  return { matched, stored, total: list.length };
}
