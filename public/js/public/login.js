// Log in: coaches with password (+ two-step code), clients with an emailed link.
import { api, $, showError, busy, validEmail, whoAmI, homeFor } from './common.js';

const me = await whoAmI();
const params = new URLSearchParams(location.search);
if (me && !params.has('switch')) location.replace(homeFor(me));

const tabs = { coach: [$('#tab-coach'), $('#coach-pane')], client: [$('#tab-client'), $('#client-pane')] };
function show(which) {
  for (const [k, [tab, pane]] of Object.entries(tabs)) { const on = k === which; tab.classList.toggle('on', on); tab.setAttribute('aria-selected', on); pane.hidden = !on; }
  (which === 'coach' ? $('#li-email') : $('#mg-email')).focus();
}
tabs.coach[0].addEventListener('click', () => show('coach'));
tabs.client[0].addEventListener('click', () => show('client'));
if (params.get('as') === 'client') show('client');
if (params.get('expired')) showError($('#mg-err'), { message: 'That login link expired or was already used. Ask for a new one.' });

const lf = $('#login-form'), le = $('#li-err'), of = $('#otp-form'), oe = $('#otp-err');
lf.addEventListener('submit', async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(lf));
  if (!validEmail(f.email)) return showError(le, { message: 'Enter your email.', data: { fields: { email: 1 } } }, lf);
  if (!f.password) return showError(le, { message: 'Enter your password.', data: { fields: { password: 1 } } }, lf);
  const btn = lf.querySelector('[type=submit]'); busy(btn, true, 'Logging in…'); showError(le, '');
  try {
    const r = await api.post('/api/auth/login', { email: f.email.trim(), password: f.password });
    if (r.twoFactor) { lf.hidden = true; of.hidden = false; $('#li-code').focus(); busy(btn, false); return; }
    location.href = r.redirect || '/app';
  } catch (e2) {
    busy(btn, false);
    if (e2.data?.code === 'use_magic_link') { show('client'); $('#mg-email').value = f.email.trim(); showError($('#mg-err'), e2); return; }
    showError(le, e2, lf);
  }
});
of.addEventListener('submit', async e => {
  e.preventDefault();
  const code = $('#li-code').value.replace(/\s/g, '');
  if (code.length < 6) return showError(oe, { message: 'Enter the 6-digit code.', data: { fields: { code: 1 } } }, of);
  const btn = of.querySelector('[type=submit]'); busy(btn, true, 'Checking…'); showError(oe, '');
  try { const r = await api.post('/api/auth/login/2fa', { code }); location.href = r.redirect || '/app'; }
  catch (e2) { busy(btn, false); showError(oe, e2, of); }
});
$('#otp-back').addEventListener('click', () => { of.hidden = true; lf.hidden = false; $('#li-pass').value = ''; $('#li-email').focus(); });

const mf = $('#magic-form'), me2 = $('#mg-err');
mf.addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#mg-email').value.trim();
  if (!validEmail(email)) return showError(me2, { message: 'Enter the email your coach invited.', data: { fields: { email: 1 } } }, mf);
  const btn = mf.querySelector('[type=submit]'); busy(btn, true, 'Sending…'); showError(me2, '');
  try {
    const r = await api.post('/api/auth/magic-link', { email });
    mf.hidden = true; const d = $('#mg-done'); d.hidden = false;
    d.textContent = `${r.message} It works once and expires in 30 minutes.`;
  } catch (e2) { busy(btn, false); showError(me2, e2, mf); }
});
