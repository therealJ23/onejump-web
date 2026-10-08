// Client joining: /invite/:token (personal invite from the coach) or /join/:slug (the
// coach's open link). Joining by link always confirms the email with a login link.
import { api, $, showError, busy, validEmail, whoAmI } from './common.js';
import { esc } from '../shared/format.js';
import { icon } from '../shared/icons.js';

const [, kind, key] = location.pathname.split('/');
const brandBox = $('#join-brand'), wrap = $('#join-form-wrap');
const fail = msg => { brandBox.innerHTML = '<h1 class="display" style="font-size:2rem;line-height:1.05">Hmm.</h1>'; wrap.innerHTML = `<div class="stack s16"><h2 class="h1">This link isn’t working</h2><p class="muted">${esc(msg)}</p><a class="btn" href="/login?as=client">I already have the app</a></div>`; };

function brand(b) {
  const ini = b.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  brandBox.innerHTML = `<div class="row" style="gap:14px">${b.logoUrl ? `<img src="${esc(b.logoUrl)}" alt="" style="width:56px;height:56px;border-radius:16px;object-fit:cover">` : `<span class="av lg" style="background:${esc(b.brandColor || '#D6FF3D')};border-radius:16px;color:#12281F">${esc(ini)}</span>`}<div class="stack s4"><div class="eyebrow" style="color:var(--volt)">${esc(b.name)}</div>${b.coach ? `<div style="color:rgba(244,246,241,.75)">${esc(b.coach.name)}${b.coach.title ? ` · ${esc(b.coach.title)}` : ''}</div>` : ''}</div></div>
    <h1 class="display" style="font-size:clamp(2rem,1.4rem + 2.4vw,3.2rem);line-height:1">Your training, in one app.</h1>
    <ul class="config-list" style="color:rgba(244,246,241,.85)">${['Your workouts for each day, with sets to log', 'A 2-minute weekly check-in', 'Message your coach any time', 'Your progress: weight, lifts and photos (private)'].map(t => `<li style="border-color:rgba(244,246,241,.12)">${icon('check')}<span>${t}</span></li>`).join('')}</ul>`;
  document.title = `Join ${b.name} · OneJump`;
}

await whoAmI();
if (kind === 'invite') {
  try {
    const { business, client } = await api.get(`/api/join/invite/${encodeURIComponent(key)}`);
    brand(business);
    wrap.innerHTML = `<div class="stack s8"><h2 class="h1">Hi ${esc((client.name || '').split(' ')[0] || 'there')}!</h2><p class="muted">${esc(business.coach?.name || business.name)} invited you. Confirm your details to open your app.</p></div>
      <form class="stack s16" id="join-form" novalidate>
        <div class="field"><label for="j-name">Your name</label><input class="input" id="j-name" name="name" value="${esc(client.name || '')}" autocomplete="name" required maxlength="120"></div>
        <div class="field"><label for="j-email">Email</label><input class="input" id="j-email" name="email" type="email" value="${esc(client.email || '')}" autocomplete="email" required maxlength="190"><span class="hint">You’ll use this to log in. No password needed.</span></div>
        <div class="form-error" id="j-err" role="alert" hidden></div>
        <button class="btn primary lg" type="submit">Open my app</button>
      </form><p class="tiny faint">By joining you agree to OneJump’s <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>. Only your coach sees your data.</p>`;
    const form = $('#join-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form)), err = $('#j-err');
      if (!f.name.trim()) return showError(err, { message: 'Enter your name.', data: { fields: { name: 1 } } }, form);
      if (!validEmail(f.email)) return showError(err, { message: 'Enter a valid email.', data: { fields: { email: 1 } } }, form);
      const btn = form.querySelector('[type=submit]'); busy(btn, true, 'Opening your app…');
      try { const r = await api.post(`/api/join/invite/${encodeURIComponent(key)}/accept`, { name: f.name.trim(), email: f.email.trim() }); location.href = r.redirect || '/client'; }
      catch (e2) { busy(btn, false); showError(err, e2, form); }
    });
  } catch (e) { fail(e.message); }
} else {
  try {
    const { business } = await api.get(`/api/join/link/${encodeURIComponent(key)}`);
    brand(business);
    wrap.innerHTML = `<div class="stack s8"><h2 class="h1">Join ${esc(business.name)}</h2><p class="muted">We’ll email you a link that opens your app. No password needed.</p></div>
      <form class="stack s16" id="join-form" novalidate>
        <div class="field"><label for="j-name">Your name</label><input class="input" id="j-name" name="name" autocomplete="name" required maxlength="120"></div>
        <div class="field"><label for="j-email">Email</label><input class="input" id="j-email" name="email" type="email" autocomplete="email" required maxlength="190"></div>
        <div class="field"><label for="j-goal">Your main goal <span class="muted">(optional)</span></label><input class="input" id="j-goal" name="goal" maxlength="160" placeholder="e.g. lose 15 lb, first pull-up"></div>
        <div class="form-error" id="j-err" role="alert" hidden></div>
        <button class="btn primary lg" type="submit">${icon('mail')} Send my link</button>
      </form>
      <div id="j-done" class="notice" role="status" hidden></div>
      <p class="small muted">Already joined? <a href="/login?as=client">Email me a login link</a></p>`;
    const form = $('#join-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form)), err = $('#j-err');
      if (!f.name.trim()) return showError(err, { message: 'Enter your name.', data: { fields: { name: 1 } } }, form);
      if (!validEmail(f.email)) return showError(err, { message: 'Enter a valid email.', data: { fields: { email: 1 } } }, form);
      const btn = form.querySelector('[type=submit]'); busy(btn, true, 'Sending…');
      try { const r = await api.post(`/api/join/link/${encodeURIComponent(key)}`, { name: f.name.trim(), email: f.email.trim(), goal: f.goal.trim() || undefined }); form.hidden = true; const d = $('#j-done'); d.hidden = false; d.textContent = `${r.message} It works once and expires in an hour.`; }
      catch (e2) { busy(btn, false); showError(err, e2, form); }
    });
  } catch (e) { fail(e.message); }
}

document.body.dataset.ready = '1';
