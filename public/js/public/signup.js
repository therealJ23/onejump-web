// Coach sign-up: creates the account + workspace (14-day Pro trial), then onboarding.
import { api, $, showError, busy, validEmail, whoAmI, homeFor } from './common.js';

const me = await whoAmI();
if (me) location.replace(homeFor(me));

const form = $('#signup-form'), err = $('#su-err');
form.addEventListener('submit', async e => {
  e.preventDefault();
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
