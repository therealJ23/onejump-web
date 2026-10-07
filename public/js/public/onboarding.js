// The 10-step coach onboarding from the prototype. Each step saves as you go, so
// closing the tab doesn't lose anything. Finishing shows how the workspace was set up.
import { api, whoAmI } from './common.js';
import { esc, WD, fmtHour, plural } from '../shared/format.js';
import { icon, arc, wordmark } from '../shared/icons.js';
import { assistBadge } from '../shared/components.js';
import { toast, toastError, copyText } from '../shared/ui.js';

const STEPS = ['Your name', 'Business', 'Logo', 'Training type', 'Clients', 'Specialties', 'Coaching style', 'Pricing', 'Availability', 'Goals'];
const SPECS = ['Fat loss', 'Strength', 'Muscle gain', 'Beginners', 'Athletes', 'Older adults', 'Pre and postnatal', 'Mobility', 'Endurance and hybrid', 'Nutrition coaching'];
const GOALS = [['Save time', 'Fewer hours on admin'], ['Keep clients longer', 'Fewer cancellations'], ['Get more clients', 'Leads and a booking page'], ['Make more per client', 'Packages and upsells'], ['Look more professional', 'Branding and booking page']];
const STYLE_SAMPLES = {
  Supportive: 'Great week, Mike! Down another 1.4 lb during a crazy work week is no small thing. Let’s ease off the legs a little so you can recover.',
  Direct: 'Down 1.4 lb, good. Soreness at 8 two weeks running means too much leg volume, so I cut a set from each lower-body lift. Sleep 7 hours.',
  'Data-driven': 'Weight: −1.4 lb (−8.6 total). Soreness 8/10 for 2 weeks; sleep 6.4 h (−0.7). Lower-body volume −25% this week; load unchanged.',
  Playful: 'Another 1.4 lb gone! Your legs are clearly filing a complaint, so we’re giving them a lighter week. Sleep is your secret weapon.',
};
const FIELDS = [['name'], ['biz'], [], ['type'], ['count'], ['spec'], ['style'], ['pkgName', 'price', 'interval'], ['days', 'from', 'to'], ['goals']];

const app = document.getElementById('app');
const me = await whoAmI();
if (!me) location.replace('/login');
else if (me.role !== 'OWNER') location.replace(me.role === 'CLIENT' ? '/client' : '/app');

let o, step = 0, done = null, saving = false;
try { o = await api.get('/api/onboarding'); } catch (e) { app.innerHTML = `<div class="empty" style="padding:80px 20px"><div class="h3">Couldn’t load your setup.</div><p>${esc(e.message)}</p><a class="btn" href="/onboarding">Try again</a></div>`; throw e; }
const slugPreview = v => String(v || '').toLowerCase().split(' ')[0].normalize('NFKD').replace(/[^a-z0-9]/g, '') || 'you';

const ch = (key, val, label, sub = '', multi = false) => {
  const on = multi ? o[key].includes(val) : o[key] === val;
  return `<button type="button" class="choice ${on ? 'on' : ''}" data-pick="${key}" data-val="${esc(val)}" data-multi="${multi ? 1 : ''}" aria-pressed="${on}">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
};
const BODY = [
  () => `<div class="stack s8"><div class="eyebrow">Step 1 of 10</div><h1 class="h1">What should your clients call you?</h1><p class="muted">This shows on your booking page and in messages.</p></div>
    <div class="field"><label for="onb-name">Your name</label><input class="input" id="onb-name" value="${esc(o.name)}" data-text="name" maxlength="120" autocomplete="name"></div>`,
  () => `<div class="stack s8"><div class="eyebrow">Step 2 of 10</div><h1 class="h1">What’s your business called?</h1><p class="muted">Your clients see this name and logo in their app.</p></div>
    <div class="field"><label for="onb-biz">Business name</label><input class="input" id="onb-biz" value="${esc(o.biz)}" data-text="biz" maxlength="80" autocomplete="organization"></div>
    <div class="urlbar">${icon('globe')}<span>${esc(location.host)}/coach/<b id="onb-slug">${esc(o.onboarded ? o.slug : slugPreview(o.biz))}</b></span></div>${o.onboarded ? '<p class="tiny faint">Your link stays the same after setup so old links keep working.</p>' : '<p class="tiny faint">If that link is taken we’ll keep your current one.</p>'}`,
  () => `<div class="stack s8"><div class="eyebrow">Step 3 of 10</div><h1 class="h1">Add your logo</h1><p class="muted">Optional. We’ll use your initials until you add one.</p></div>
    <label class="dropzone" for="onb-logo" style="cursor:pointer">
      <span class="av lg" style="background:var(--volt);border-radius:18px;overflow:hidden;color:#12281F">${o.logoUrl ? `<img src="${esc(o.logoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover">` : esc(o.biz.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span>
      <span class="stack s4 grow"><span class="strong">${o.logoUrl ? 'Logo added' : 'Upload a PNG, JPG or WebP'}</span><span class="small muted">Square works best, at least 256 px, under 3 MB.</span></span>
      <span class="btn sm">${icon('upload')} Choose file</span>
    </label><input type="file" id="onb-logo" accept="image/png,image/jpeg,image/webp,image/gif" class="sr">`,
  () => `<div class="stack s8"><div class="eyebrow">Step 4 of 10</div><h1 class="h1">How do you train clients?</h1><p class="muted">This shapes your workspace. You can change it later.</p></div>
    <div class="choice-grid">${ch('type', 'Online', 'Online', 'Programs, check-ins and messaging')}${ch('type', 'In person', 'In person', 'Sessions at a gym or studio')}${ch('type', 'Hybrid', 'Hybrid', 'A mix of both')}</div>`,
  () => `<div class="stack s8"><div class="eyebrow">Step 5 of 10</div><h1 class="h1">How many clients do you coach now?</h1><p class="muted">Helps us suggest the right plan. You can import them after setup.</p></div>
    <div class="choice-grid">${['0–5', '6–15', '16–30', '31–60', '60+'].map(v => ch('count', v, v)).join('')}</div>`,
  () => `<div class="stack s8"><div class="eyebrow">Step 6 of 10</div><h1 class="h1">What do you specialize in?</h1><p class="muted">Pick any. Assist uses these when it drafts workouts.</p></div>
    <div class="choice-grid">${SPECS.map(v => ch('spec', v, v, '', true)).join('')}</div>`,
  () => `<div class="stack s8"><div class="eyebrow">Step 7 of 10</div><h1 class="h1">How do you talk to clients?</h1><p class="muted">Assist writes drafts in this style. You can edit every one.</p></div>
    <div class="choice-grid">${['Supportive', 'Direct', 'Data-driven', 'Playful'].map(v => ch('style', v, v)).join('')}</div>
    <div class="assist-card pad stack s8"><div class="row">${assistBadge('Sample draft')}<span class="tiny muted">Reply to a client’s check-in</span></div><p>${esc(STYLE_SAMPLES[o.style])}</p></div>`,
  () => `<div class="stack s8"><div class="eyebrow">Step 8 of 10</div><h1 class="h1">What do you charge?</h1><p class="muted">Your main offer. Add more packages later in Payments.</p></div>
    <div class="grid g3"><div class="field"><label for="onb-pkg">Package name</label><input class="input" id="onb-pkg" value="${esc(o.pkgName)}" data-text="pkgName" maxlength="80"></div>
    <div class="field"><label for="onb-price">Price (USD)</label><input class="input" id="onb-price" type="number" min="0" max="100000" value="${o.price}" data-text="price"></div>
    <div class="field"><label for="onb-int">Billing</label><select class="select" id="onb-int" data-sel="interval">${['month', 'week', 'once'].map(v => `<option ${o.interval === v ? 'selected' : ''} value="${v}">${v === 'once' ? 'One-time' : 'Every ' + v}</option>`).join('')}</select></div></div>
    <p class="small muted">Clients pay through your own Stripe account. OneJump takes no cut of your client payments.</p>`,
  () => `<div class="stack s8"><div class="eyebrow">Step 9 of 10</div><h1 class="h1">When are you available?</h1><p class="muted">${o.type === 'Online' ? 'For calls and consultations.' : 'For sessions and consultations.'} Shown on your booking page.</p></div>
    <div class="row wrap" role="group" aria-label="Days">${WD.map((d, i) => `<button type="button" class="chip ${o.days.includes(i) ? 'on' : ''}" data-day="${i}" aria-pressed="${o.days.includes(i)}">${d}</button>`).join('')}</div>
    <div class="grid g2"><div class="field"><label for="onb-from">From</label><select class="select" id="onb-from" data-sel="from">${Array.from({ length: 15 }, (_, i) => i + 5).map(h => `<option value="${h}" ${o.from === h ? 'selected' : ''}>${fmtHour(h)}</option>`).join('')}</select></div>
    <div class="field"><label for="onb-to">To</label><select class="select" id="onb-to" data-sel="to">${Array.from({ length: 12 }, (_, i) => i + 12).map(h => `<option value="${h}" ${o.to === h ? 'selected' : ''}>${fmtHour(h)}</option>`).join('')}</select></div></div>`,
  () => `<div class="stack s8"><div class="eyebrow">Step 10 of 10</div><h1 class="h1">What matters most right now?</h1><p class="muted">We’ll put the tools for these front and centre.</p></div>
    <div class="choice-grid">${GOALS.map(([v, s]) => ch('goals', v, v, s, true)).join('')}</div>`,
];

function render() {
  if (done) return renderDone();
  const pct = ((step + 1) / STEPS.length) * 100;
  app.innerHTML = `<div class="onb">
    <div class="onb-top"><a href="/" aria-label="OneJump home" style="display:flex;color:var(--ink)">${wordmark()}</a><span class="small muted">${STEPS[step]}</span><button type="button" class="btn ghost sm" id="onb-skip">Skip setup</button></div>
    <div class="progress" role="progressbar" aria-label="Setup progress" aria-valuenow="${step + 1}" aria-valuemin="1" aria-valuemax="10"><i style="width:${pct}%"></i></div>
    <form class="onb-body" id="onb-form" novalidate>${BODY[step]()}<div class="form-error" id="onb-err" role="alert" hidden></div></form>
    <div class="onb-foot"><button type="button" class="btn" id="onb-back" ${step === 0 ? 'disabled' : ''}>${icon('chevL')} Back</button><button type="button" class="btn primary" id="onb-next">${step === 9 ? 'Set up my workspace' : 'Continue'} ${icon('arrowR')}</button></div>
  </div>`;
  app.querySelector('h1')?.setAttribute('tabindex', '-1');
  app.querySelector('input:not([type=file])')?.focus();
}

function renderDone() {
  app.innerHTML = `<div class="onb"><div class="onb-top"><span style="color:var(--ink);display:flex">${wordmark()}</span><span class="small muted">All set</span><span></span></div><div class="progress"><i style="width:100%"></i></div>
    <div class="onb-body">
      <div class="stack s8"><span class="assist-badge" style="align-self:flex-start">${arc()}Workspace ready</span><h1 class="h1">Welcome, ${esc(o.name.split(' ')[0])}. Here’s how we set you up.</h1><p class="muted">Based on your answers. Change any of it in Settings.</p></div>
      <ul class="config-list card pad">${done.map((t, i) => `<li style="${i === 0 ? 'border-top:0' : ''}">${icon('check')}<span>${esc(t)}</span></li>`).join('')}</ul>
      <div class="card pad stack s16"><div class="h3">Next: bring your clients in</div>
        <div class="grid g3">
          <a class="choice" href="/app/clients?import=1" style="text-decoration:none;color:inherit">${icon('upload')}<span>Import a CSV</span><small>From Trainerize, TrueCoach, Everfit or a spreadsheet</small></a>
          <button type="button" class="choice" id="onb-link">${icon('link')}<span>Copy your join link</span><small>Clients sign up and land in your workspace</small></button>
          <a class="choice" href="/app/payments" style="text-decoration:none;color:inherit">${icon('card')}<span>Connect Stripe</span><small>Start charging in a few minutes</small></a>
        </div></div>
      <div class="panel pad row wrap" style="gap:12px"><div class="grow stack s4" style="min-width:220px"><div class="strong">Want to look around first?</div><div class="small muted">Load ${plural(18, 'sample client')} with workouts, check-ins and payments. Remove them any time from Clients.</div></div><button type="button" class="btn" id="onb-sample">Load sample clients</button></div>
      <div class="row wrap"><a class="btn primary lg" href="/app">Go to my workspace ${icon('arrowR')}</a></div>
    </div></div>`;
  app.querySelector('h1').focus?.();
  document.getElementById('onb-link').addEventListener('click', () => copyText(`${location.origin}/join/${o.slug}`));
  document.getElementById('onb-sample').addEventListener('click', async ev => {
    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Loading…';
    try { await api.post('/api/onboarding/sample-data'); location.href = '/app'; } catch (e) { b.disabled = false; b.textContent = 'Load sample clients'; toastError(e); }
  });
}

function validate() {
  if (step === 0 && !o.name.trim()) return 'Enter your name.';
  if (step === 1 && !o.biz.trim()) return 'Enter your business name.';
  if (step === 5 && !o.spec.length) return 'Pick at least one specialty.';
  if (step === 7 && (!o.pkgName.trim() || !(o.price >= 0))) return 'Add a package name and a price (0 is fine).';
  if (step === 8 && !o.days.length) return 'Pick at least one day.';
  if (step === 8 && o.to <= o.from) return '“To” must be after “From”.';
  return null;
}
async function saveStep(extra = {}) {
  const body = { ...extra };
  for (const k of FIELDS[step]) body[k] = k === 'price' ? Number(o.price) : o[k];
  if (step === 0) body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return api.put('/api/onboarding', body);
}

app.addEventListener('click', async e => {
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    const k = pick.dataset.pick, v = pick.dataset.val;
    if (pick.dataset.multi) o[k] = o[k].includes(v) ? o[k].filter(x => x !== v) : [...o[k], v]; else o[k] = v;
    render(); app.querySelector(`[data-pick="${k}"][data-val="${CSS.escape(v)}"]`)?.focus(); return;
  }
  const day = e.target.closest('[data-day]');
  if (day) { const d = +day.dataset.day; o.days = o.days.includes(d) ? o.days.filter(x => x !== d) : [...o.days, d].sort(); render(); app.querySelector(`[data-day="${d}"]`)?.focus(); return; }
  if (e.target.closest('#onb-back')) { if (step > 0) { step--; render(); } return; }
  if (e.target.closest('#onb-skip')) { location.href = '/app'; return; }
  if (e.target.closest('#onb-next')) {
    if (saving) return;
    const err = validate(), box = document.getElementById('onb-err');
    if (err) { box.textContent = err; box.hidden = false; return; }
    saving = true; const btn = e.target.closest('#onb-next'); btn.disabled = true;
    try {
      const r = await saveStep(step === 9 ? { finish: true } : {});
      o = { ...o, ...r, spec: r.spec, goals: r.goals, days: r.days };
      if (step === 9) done = r.summary; else step++;
      render();
    } catch (e2) { btn.disabled = false; box.textContent = e2.message; box.hidden = false; }
    saving = false;
  }
});
app.addEventListener('input', e => {
  const t = e.target.closest('[data-text]'); if (!t) return;
  o[t.dataset.text] = t.dataset.text === 'price' ? (t.value === '' ? NaN : Number(t.value)) : t.value;
  if (t.dataset.text === 'biz' && !o.onboarded) { const s = document.getElementById('onb-slug'); if (s) s.textContent = slugPreview(t.value); }
});
app.addEventListener('change', async e => {
  const s = e.target.closest('[data-sel]');
  if (s) { o[s.dataset.sel] = isNaN(+s.value) ? s.value : +s.value; return; }
  if (e.target.id === 'onb-logo') {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 3 * 1024 * 1024) return toast('Pick an image under 3 MB.', { error: true });
    const fd = new FormData(); fd.append('logo', f);
    try { const r = await api('POST', '/api/onboarding/logo', fd); o.logoUrl = r.logoUrl; render(); toast('Logo added'); } catch (e2) { toastError(e2); }
  }
});
app.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input:not([type=file])')) { e.preventDefault(); document.getElementById('onb-next')?.click(); } });
render();

