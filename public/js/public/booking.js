// Coach booking page (onejumpfit.com/coach/[slug], Pro): bio, packages and a
// request-a-call form. A request becomes a Lead (stage: consultation) for the coach.
import { api, $, showError, busy, validEmail, whoAmI } from './common.js';
import { esc, money, WD, fmtHour } from '../shared/format.js';
import { arc, wordmark } from '../shared/icons.js';

const slug = location.pathname.split('/')[2];
const app = $('#app');
const footer = name => `<footer class="footer"><div class="row between wrap" style="max-width:1180px;margin:0 auto;gap:16px"><span class="small">${esc(name)}</span><a class="row small" href="/" style="gap:8px">Powered by ${wordmark().replace('class="wordmark"', 'class="wordmark" style="height:16px"')}</a></div></footer>`;

await whoAmI();
let d;
try { d = await api.get(`/api/join/coach/${encodeURIComponent(slug)}`); }
catch (e) {
  app.innerHTML = `<main class="section" style="min-height:70vh;display:grid;place-items:center"><div class="empty">${arc()}<h1 class="h1" style="color:var(--ink)">We couldn’t find that coach</h1><p>${esc(e.message)}</p><a class="btn" href="/">OneJump home</a></div></main>`;
  throw e;
}
const b = d.business, coach = d.coach || { name: b.name };
document.title = `${coach.name} · ${b.name}`;
const ini = coach.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
const av = d.availability || {};
const times = [];
if ((av.from ?? 9) < 12) times.push(['Morning', `${fmtHour(av.from ?? 9)}–12 PM`]);
if ((av.to ?? 17) > 12 && (av.from ?? 9) < 17) times.push(['Afternoon', `${fmtHour(Math.max(12, av.from ?? 9))}–${fmtHour(Math.min(17, av.to ?? 17))}`]);
if ((av.to ?? 17) > 17) times.push(['Evening', `5 PM–${fmtHour(av.to)}`]);
const per = p => (p.interval === 'month' ? 'month' : p.interval === 'week' ? 'week' : 'one-time');

app.innerHTML = `
  <section class="booking-hero"><div class="section-in" style="gap:20px">
    <div class="row wrap" style="gap:20px">${b.logoUrl ? `<img src="${esc(b.logoUrl)}" alt="" style="width:72px;height:72px;border-radius:20px;object-fit:cover">` : `<span class="av lg" style="background:${esc(b.brandColor || '#D6FF3D')};color:#12281F;width:72px;height:72px;font-size:1.4rem">${esc(ini)}</span>`}<div class="stack s4"><div class="eyebrow" style="color:var(--volt)">${esc(b.name)}</div><h1 class="display" style="font-size:clamp(2rem,1.4rem + 2vw,3rem)">${esc(coach.name)}</h1>${coach.title ? `<div style="color:rgba(244,246,241,.75)">${esc(coach.title)}</div>` : ''}</div></div>
    ${coach.bio ? `<p style="max-width:60ch;color:rgba(244,246,241,.85);font-size:1.05rem">${esc(coach.bio)}</p>` : ''}
    <div class="row wrap">${[b.coachingType, ...(b.specialties || [])].filter(Boolean).map(s => `<span class="pill" style="background:rgba(244,246,241,.1);color:var(--bone)">${esc(s)}</span>`).join('')}</div>
  </div></section>
  <main class="section" style="padding-top:40px"><div class="section-in">
    <div class="split">
      <div class="stack s24">
        ${d.packages.length ? `<div class="stack s8"><div class="h2">Coaching options</div><p class="muted small">Ask about these on your call. Plans are month to month unless noted.</p></div>
        <div class="grid g2">${d.packages.map(p => `<div class="card pad stack s8"><div class="h3">${esc(p.name)}</div><div><span class="big-num">${money(p.priceCents)}</span><span class="muted small"> /${per(p)}</span></div>${p.description ? `<p class="small muted">${esc(p.description)}</p>` : ''}</div>`).join('')}</div>` : ''}
        <div class="panel pad stack s8"><div class="strong">How it works</div><ol class="small muted" style="margin:0;padding-left:20px"><li>Request a free 20-minute call below.</li><li>${esc(coach.name.split(' ')[0])} emails you to confirm a time.</li><li>If it’s a fit, you get your own training app with workouts, check-ins and messaging.</li></ol></div>
      </div>
      <div class="card pad stack s16" style="position:sticky;top:20px;align-self:start" id="book-card" aria-live="polite">
        ${d.enabled ? `<div class="h2">Book a free 20-minute call</div>
        <form class="stack s16" id="book-form" novalidate>
          <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="label">Days that suit you</legend><div class="row wrap" style="gap:6px">${(av.days || [1, 2, 3, 4, 5]).map(i => `<button type="button" class="chip" data-day="${WD[i]}" aria-pressed="false">${WD[i]}</button>`).join('')}</div></fieldset>
          ${times.length ? `<fieldset class="field" style="border:0;padding:0;margin:0"><legend class="label">Time of day</legend><div class="row wrap" style="gap:6px">${times.map(([t, r]) => `<button type="button" class="chip" data-time="${t}" aria-pressed="false" title="${esc(r)}">${t} <span class="tiny muted">${esc(r)}</span></button>`).join('')}</div><span class="hint">Times are ${esc((b.timezone || '').replace('_', ' '))}.</span></fieldset>` : ''}
          <div class="field"><label for="bk-name">Name</label><input class="input" id="bk-name" name="name" required autocomplete="name" maxlength="120"></div>
          <div class="field"><label for="bk-email">Email</label><input class="input" id="bk-email" name="email" type="email" required autocomplete="email" maxlength="190"></div>
          <div class="field"><label for="bk-goal">Your goal</label><input class="input" id="bk-goal" name="goal" maxlength="160" placeholder="e.g. lose 15 lb, first pull-up"></div>
          <div class="field"><label for="bk-note">Anything else? <span class="muted">(optional)</span></label><textarea class="textarea" id="bk-note" name="note" rows="2" maxlength="1000"></textarea></div>
          <div style="position:absolute;left:-9999px" aria-hidden="true"><label for="bk-web">Website</label><input id="bk-web" name="website" tabindex="-1" autocomplete="off"></div>
          <div class="form-error" id="bk-err" role="alert" hidden></div>
          <button class="btn primary" type="submit">Request a call</button>
          <p class="tiny faint">Your details go only to ${esc(b.name)}. No spam.</p>
        </form>` : `<div class="h2">Want to train with ${esc(coach.name.split(' ')[0])}?</div><p class="small muted">Online booking isn’t switched on for this coach yet. If you already have an invite or join link, use that, or reach out to them directly.</p><a class="btn" href="/login?as=client">I already have the app</a>`}
      </div>
    </div>
  </div></main>
  ${footer(b.name)}`;

const form = $('#book-form');
if (form) {
  app.addEventListener('click', e => {
    const c = e.target.closest('[data-day],[data-time]'); if (!c) return;
    const on = c.getAttribute('aria-pressed') !== 'true'; c.setAttribute('aria-pressed', on); c.classList.toggle('on', on);
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form)), err = $('#bk-err');
    if (!f.name.trim()) return showError(err, { message: 'Add your name.', data: { fields: { name: 1 } } }, form);
    if (!validEmail(f.email)) return showError(err, { message: 'Add a valid email so the coach can reply.', data: { fields: { email: 1 } } }, form);
    const days = [...app.querySelectorAll('[data-day][aria-pressed="true"]')].map(x => x.dataset.day), tod = [...app.querySelectorAll('[data-time][aria-pressed="true"]')].map(x => x.dataset.time.toLowerCase());
    const when = [days.join(', '), tod.join(' or ')].filter(Boolean).join(', ') || undefined;
    const btn = form.querySelector('[type=submit]'); busy(btn, true, 'Sending…');
    try {
      const r = await api.post(`/api/join/coach/${encodeURIComponent(slug)}/book`, { name: f.name.trim(), email: f.email.trim(), goal: f.goal.trim() || undefined, note: f.note.trim() || undefined, when, website: f.website || undefined });
      $('#book-card').innerHTML = `<div class="empty" style="padding:20px">${arc()}<div class="h2" style="color:var(--ink)">Request sent</div><p>${esc(r.message)}</p></div>`;
    } catch (e2) { busy(btn, false); showError(err, e2, form); }
  });
}


document.body.dataset.ready = '1';
