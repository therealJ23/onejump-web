// English / Spanish for the whole site.
//
// The pages are written in English. In Spanish, a small translator swaps every piece of text it
// knows (from ./i18n-es.js) as the page draws, including text that appears later (modals,
// toasts, drawers). Strings built in code can also call t('English text', { name }) directly.
//
// Language: the coach's choice in Settings (or the switch on public pages), remembered on this
// device; otherwise the device's own language (a phone set to Spanish gets Spanish).
import { ES, ES_PATTERNS } from './i18n-es.js';

const KEY = 'oj-lang';
export const LANGS = [['en', 'English'], ['es', 'Español']];

function deviceLang() {
  const list = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
  return String(list[0] || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}
export function savedLang() { try { const v = localStorage.getItem(KEY); return v === 'es' || v === 'en' ? v : null; } catch { return null; } }
export function getLang() { return savedLang() || deviceLang(); }
export const isEs = () => getLang() === 'es';

/** Remembers the choice and redraws the page in that language. */
export function setLang(lang) {
  try { localStorage.setItem(KEY, lang === 'es' ? 'es' : 'en'); } catch { /* private mode */ }
  location.reload();
}

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
const norm = s => s.replace(/\s+/g, ' ').trim();

/** Spanish for one piece of text (or the English if there's no translation yet). */
function lookup(text) {
  const key = norm(text);
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(ES, key)) return ES[key];
  for (const [re, out] of ES_PATTERNS) {
    const m = key.match(re);
    if (!m) continue;
    const r = typeof out === 'function' ? out(...m.slice(1)) : key.replace(re, out);
    if (r != null) return r;
  }
  // "A · B · C" lists of system phrases (risk reasons, payment details): translate the parts.
  if (key.includes(' · ')) {
    const parts = key.split(' · ');
    const es = parts.map(p => (p ? lookup(p) : null));
    if (es.some(x => x != null)) return parts.map((p, i) => es[i] ?? p).join(' · ');
  }
  return null;
}

/** t('Hi {name}', { name }) → the right language. */
export function t(text, vars) {
  if (!isEs()) return fill(text, vars);
  return fill(lookup(text) ?? text, vars);
}

// ---------------------------------------------------------------- page translator
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'svg', 'SVG']);

function translateText(node) {
  const raw = node.nodeValue;
  if (!raw || !/[A-Za-z]/.test(raw)) return;
  const es = lookup(raw);
  if (es == null) return;
  const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
  const next = lead + es + trail;
  if (next !== raw) node.nodeValue = next;
}
function translateEl(el) {
  if (el.closest?.('[data-no-translate]')) return;
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (v) { const es = lookup(v); if (es != null && es !== v) el.setAttribute(a, es); }
  }
  if (el.tagName === 'INPUT' && /^(submit|button)$/i.test(el.type) && el.value) { const es = lookup(el.value); if (es != null) el.value = es; }
}
export function translateTree(root) {
  if (!root) return;
  if (root.nodeType === 3) { if (!root.parentElement?.closest('[data-no-translate]') && !SKIP.has(root.parentElement?.tagName)) translateText(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.tagName) || root.closest?.('[data-no-translate]')) return;
  translateEl(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.nodeType === 1 && (SKIP.has(n.tagName) || n.hasAttribute('data-no-translate')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n;
  while ((n = walker.nextNode())) { if (n.nodeType === 3) translateText(n); else translateEl(n); }
}

let observer = null;
/** Call once per page: sets <html lang> and keeps everything that's drawn later translated. */
export function startTranslation() {
  const lang = getLang();
  document.documentElement.lang = lang;
  if (lang !== 'es' || observer) return;
  if (document.title) document.title = lookup(document.title) ?? document.title;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) { const es = lookup(meta.content); if (es) meta.content = es; }
  translateTree(document.body);
  observer = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') translateText(m.target);
      else if (m.type === 'attributes') translateEl(m.target);
      else m.addedNodes.forEach(translateTree);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/** A small EN | ES switch for public pages. */
export function langSwitchHtml() {
  const cur = getLang();
  return `<div class="lang-switch" role="group" aria-label="Language" data-no-translate>${LANGS.map(([k, label]) => `<button type="button" data-lang="${k}" aria-pressed="${k === cur}" title="${label}">${k.toUpperCase()}</button>`).join('')}</div>`;
}
export function wireLangSwitch(root = document) {
  root.addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b && b.dataset.lang !== getLang()) setLang(b.dataset.lang); });
}
