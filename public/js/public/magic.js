// Consumes a login link. The token is sent with POST (not on page load by a GET) so
// email link scanners that prefetch URLs can't use it up.
import { api, $, whoAmI } from './common.js';
import { esc } from '../shared/format.js';

const box = $('#magic-box');
const token = new URLSearchParams(location.search).get('token');
history.replaceState(null, '', '/login/magic');
const fail = msg => { box.innerHTML = `<div class="h2">That link didn’t work</div><p class="muted">${esc(msg)}</p><a class="btn primary" href="/login?as=client">Send me a new link</a>`; };
if (!token) fail('The link is missing its code. Open it straight from the email.');
else {
  await whoAmI();
  try { const r = await api.post('/api/auth/magic', { token }); location.replace(r.redirect || '/client'); }
  catch (e) { fail(e.message); }
}
