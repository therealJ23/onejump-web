// Small helpers for the public pages (auth, onboarding, join, booking).
import { api, setCsrf } from '../shared/api.js';

export { api };

// Until a page's script has wired up its forms (body[data-ready]), block plain browser form posts:
// a very quick tap on a slow connection would otherwise post the form to a page that doesn't exist.
document.addEventListener('submit', e => { if (!document.body.dataset.ready) e.preventDefault(); }, true);
export const $ = (sel, root = document) => root.querySelector(sel);

/** Shows a form-level error (role=alert) and marks fields the API flagged. */
export function showError(box, err, form) {
  if (!box) return;
  box.textContent = err?.message || String(err || '');
  box.hidden = !box.textContent;
  if (form) {
    form.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    for (const k of Object.keys(err?.data?.fields || {})) form.querySelector(`[name="${k}"]`)?.setAttribute('aria-invalid', 'true');
    form.querySelector('[aria-invalid]')?.focus();
  }
}
export function busy(btn, on, label = 'One moment…') {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.textContent = label; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}
export const validEmail = v => /^\S+@\S+\.\S+$/.test(String(v || '').trim());

/** Who is logged in (or null). Also primes the CSRF token. */
export async function whoAmI() {
  try { const me = await api.get('/api/auth/me'); setCsrf(me.csrfToken); return me.user ? me : null; } catch { return null; }
}
export function homeFor(me) {
  if (!me) return '/login';
  if (me.role === 'CLIENT') return '/client';
  if (me.business) return me.business.onboarded ? '/app' : '/onboarding';
  return me.isPlatformAdmin ? '/admin' : '/login';
}
