// Coach sign-up: creates the account + workspace (14-day Pro trial), then onboarding.
import { api, $, showError, busy, validEmail, whoAmI, homeFor } from './common.js';

// The submit handler is attached before anything is awaited, so a quick tap on a slow connection
// never falls through to a plain browser form post.
const form = $('#signup-form'), err = $('#su-err');
const ready = whoAmI().then(me => { if (me) location.replace(homeFor(me)); return me; });
form.addEventListener('submit', async e => {
  e.preventDefault();
  await ready; // primes the CSRF token
  const f = Object.fromEntries(new FormData(form));
  if (!f.name.trim()) return showError(err, { message: 'Enter your name.', data: { fields: { name: 1 } } }, form);
  if (!validEmail(f.email)) return showError(err, { message: 'Enter a valid email.', data: { fields: { email: 1 } } }, form);
  if (f.password.length < 10) return showError(err, { message: 'Use at least 10 characters for your password.', data: { fields: { password: 1 } } }, form);
  const btn = form.querySelector('[type=submit]'); busy(btn, true, 'Creating your workspace…'); showError(err, '');
  try {
    const r = await api.post('/api/auth/signup', { name: f.name.trim(), email: f.email.trim(), password: f.password, businessName: f.businessName.trim() || undefined });
    location.href = r.redirect || '/onboarding';
  } catch (e2) { busy(btn, false); showError(err, e2, form); }
});

document.body.dataset.ready = '1';
