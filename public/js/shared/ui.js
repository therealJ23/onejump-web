// Modal, drawer, toast and confirm dialogs (from the prototype), with focus handling.
import { esc } from './format.js';
import { icon, arc } from './icons.js';

let lastFocus = null;
export function openModal(html, { wide = false, onMount, label = 'Dialog' } = {}) {
  closeModal();
  lastFocus = document.activeElement;
  const s = document.createElement('div');
  s.className = 'scrim'; s.id = 'modal';
  s.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div>`;
  s.addEventListener('mousedown', e => { if (e.target === s) closeModal(); });
  document.body.appendChild(s);
  const f = s.querySelector('[autofocus], input:not([type=hidden]), textarea, select, button.primary');
  if (f) setTimeout(() => f.focus(), 30);
  if (onMount) onMount(s);
  return s;
}
export function closeModal() {
  const m = document.getElementById('modal');
  if (m) { m.remove(); if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); }
}
export const modalHead = (title, sub = '') => `<div class="modal-head"><div class="stack s4"><div class="h2">${title}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div><button class="btn ghost icon sm" data-act="closeModal" aria-label="Close">${icon('x')}</button></div>`;

export function openDrawer(html, label = 'Panel') {
  closeDrawer();
  const d = document.createElement('aside');
  d.className = 'drawer'; d.id = 'drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', label);
  d.innerHTML = html;
  document.body.appendChild(d);
  d.querySelector('button')?.focus();
  return d;
}
export function closeDrawer() { document.getElementById('drawer')?.remove(); }

export function toast(msg, { undo, assist = false, ms = 4200, error = false } = {}) {
  let box = document.querySelector('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast';
  if (error) t.style.background = 'var(--crit)';
  t.innerHTML = `${assist ? arc() : icon(error ? 'alert' : 'check')}<span>${esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
  if (undo) t.querySelector('button').onclick = async () => { t.remove(); await undo(); };
  box.appendChild(t);
  setTimeout(() => t.remove(), undo ? Math.max(ms, 6000) : ms);
}
export const toastError = e => toast(e?.message || String(e), { error: true, ms: 6000 });

/** Promise<boolean> confirm dialog. */
export function confirmDialog({ title, body = '', confirm = 'Confirm', danger = false, input = null }) {
  return new Promise(resolve => {
    const m = openModal(`${modalHead(esc(title))}<div class="modal-body">${body}${input ? `<div class="field"><label for="cf-in">${esc(input.label)}</label><input class="input" id="cf-in" placeholder="${esc(input.placeholder || '')}" autocomplete="off"></div>` : ''}</div>
      <div class="modal-foot"><button class="btn" data-cf="no">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-cf="yes">${esc(confirm)}</button></div>`, { label: title });
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-cf]'); if (!b) return;
      const val = input ? m.querySelector('#cf-in').value : true;
      closeModal(); resolve(b.dataset.cf === 'yes' ? val : false);
    });
    m.querySelector('[data-act="closeModal"]').addEventListener('click', () => resolve(false));
  });
}

/** Shows API field errors next to the matching inputs (by name or id). */
export function showFieldErrors(root, fields = {}) {
  root.querySelectorAll('.field-error').forEach(e => e.remove());
  root.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
  for (const [k, msg] of Object.entries(fields)) {
    const el = root.querySelector(`[name="${k}"]`) || root.querySelector(`#${CSS.escape(k)}`);
    if (!el) continue;
    el.setAttribute('aria-invalid', 'true');
    const e = document.createElement('div'); e.className = 'field-error'; e.textContent = msg;
    el.closest('.field')?.appendChild(e);
  }
}
const busyButtons = new Set();
/** Shows a working label on a button. busy(null, false) (e.g. ev.currentTarget after an await) releases every busy button. */
export function busy(btn, on, label = 'Saving…') {
  if (!btn) { if (!on) for (const b of [...busyButtons]) busy(b, false); return; }
  if (on) { if (!busyButtons.has(btn)) btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = esc(label); busyButtons.add(btn); }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; busyButtons.delete(btn); }
}
export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Copied'); } catch { toast(t, { ms: 8000 }); }
}
