// A message editor with the Assist rewrite bar (from the prototype). Rewrites go through the
// server (AIService); the coach always sends the final text themselves.
import { esc } from './format.js';
import { arc } from './icons.js';
import { api } from './api.js';
import { toastError } from './ui.js';

export const REWRITES = [['motivate', 'More motivational'], ['professional', 'More professional'], ['shorter', 'Shorter'], ['consistency', 'Explain consistency'], ['recovery', 'Recovery advice']];

/** @param {string} idp id prefix; the textarea is #${idp}-text  @param {string|null} clientId */
export function editorBlock(idp, text, clientId, { label = 'Message', rows = 6 } = {}) {
  return `<div class="field"><label for="${idp}-text">${esc(label)}</label><textarea class="textarea" id="${idp}-text" rows="${rows}">${esc(text)}</textarea></div>
    ${clientId ? `<div class="assist-bar" role="toolbar" aria-label="Assist rewrite">${arc()}${REWRITES.map(([k, l]) => `<button type="button" class="chip" data-act="rewrite" data-intent="${k}" data-target="${idp}-text" data-client="${esc(clientId)}">${l}</button>`).join('')}</div>` : ''}`;
}

export async function rewrite(el) {
  const ta = document.getElementById(el.dataset.target);
  if (!ta) return;
  const old = ta.value;
  ta.disabled = true; ta.value = 'Assist is rewriting…';
  try {
    const r = await api.post(`/api/threads/${el.dataset.client}/rewrite`, { intent: el.dataset.intent, current: old });
    ta.value = r.text;
  } catch (e) { ta.value = old; toastError(e); }
  ta.disabled = false; ta.focus();
}
