// Settings (prototype V.settings): profile, business & branding, Assist, notifications,
// switching apps, team (Studio, V2), integrations, security & privacy (2FA, sessions, export).
import { api } from '../../shared/api.js';
import { esc, plural } from '../../shared/format.js';
import { icon, arc } from '../../shared/icons.js';
import { avatar, stage, lock } from '../../shared/components.js';
import { openModal, closeModal, modalHead, toast, toastError, busy, showFieldErrors } from '../../shared/ui.js';
import { state, hasPlan } from '../state.js';
import { migration, importCsv } from '../modals.js';
import { renderShell } from '../shell.js';

const TABS = [['profile', 'Profile'], ['business', 'Business & branding'], ['assist', 'Assist'], ['notifications', 'Notifications'], ['switch', 'Switch from another app'], ['team', 'Team'], ['integrations', 'Integrations'], ['security', 'Security & privacy']];
const COLORS = ['#D6FF3D', '#7FD1C1', '#F4B942', '#F28C6B', '#A7B8FF'];
const NOTIFS = [['checkins', 'Check-in submitted'], ['messages', 'New message'], ['payments', 'Payment received or failed'], ['risk', 'Client at risk'], ['clients', 'New client joined'], ['daily', 'Daily summary at 7 AM (email)']];
const row = (title, sub, ctrl) => `<div class="li" style="padding:16px 20px;flex-wrap:wrap"><div class="grow stack s4" style="min-width:220px"><div class="strong small">${title}</div>${sub ? `<div class="tiny muted">${sub}</div>` : ''}</div>${ctrl}</div>`;
const tog = (on, label, act, extra = '', disabled = false) => `<button class="toggle ${on ? 'on' : ''}" data-act="${act}" ${extra} aria-pressed="${on}" aria-label="${esc(label)}" ${disabled ? 'disabled' : ''}></button>`;
const owner = () => state.me.role === 'OWNER';

const T = {
  profile(d) {
    const p = d.profile;
    return `<form class="card pad stack s16" data-form="profile" novalidate><div class="row">${avatar({ name: p.name }, 'lg')}<div class="stack s4"><div class="strong">${esc(p.name)}</div><div class="small muted">${esc(p.email)}</div></div></div>
      <div class="grid g2"><div class="field"><label for="sp-n">Name</label><input class="input" id="sp-n" name="name" value="${esc(p.name)}" maxlength="120" required></div><div class="field"><label for="sp-t">Title</label><input class="input" id="sp-t" name="title" value="${esc(p.title)}" maxlength="80" placeholder="e.g. Strength coach, NASM-CPT"></div></div>
      <div class="field"><label for="sp-b">Bio (shown on your booking page)</label><textarea class="textarea" id="sp-b" name="bio" rows="4" maxlength="1000">${esc(p.bio)}</textarea></div>
      <div><button class="btn primary" type="submit">Save</button></div></form>`;
  },
  business(d) {
    const b = d.business, col = b.brandColor || COLORS[0], ow = owner();
    return `<form class="card pad stack s16" data-form="business" novalidate>${ow ? '' : '<div class="notice small">Only the workspace owner can change these.</div>'}
      <div class="grid g2"><div class="field"><label for="sb-n">Business name</label><input class="input" id="sb-n" name="name" value="${esc(b.name)}" maxlength="120" ${ow ? '' : 'disabled'}></div><div class="field"><span class="label">Booking page link</span><div class="urlbar">${esc(location.host)}/coach/<b>${esc(b.slug)}</b></div></div></div>
      <div class="grid g2"><div class="field"><label for="sb-tz">Time zone</label><select class="select" id="sb-tz" name="timezone" ${ow ? '' : 'disabled'}>${tzOptions(b.timezone)}</select><span class="hint">Used for check-in deadlines, reminders and the nightly radar.</span></div><div class="field"><span class="label">Client join link</span><div class="row"><div class="urlbar grow" style="min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(b.joinLink.replace(/^https?:\/\//, ''))}</div><button type="button" class="btn sm" data-act="copyText" data-text="${esc(b.joinLink)}">${icon('copy')}</button></div></div></div>
      <div class="row wrap" style="gap:24px"><div class="field"><span class="label">Logo</span><div class="row">${b.logo ? `<img src="${esc(b.logo)}" alt="Your logo" style="width:56px;height:56px;border-radius:16px;object-fit:cover">` : `<span class="av lg" style="background:${col};border-radius:16px;color:#12281F">${esc(initials(b.name))}</span>`}${ow ? `<label class="btn sm" style="cursor:pointer">${icon('upload')} Upload<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-change="logoUpload" class="sr"></label>` : ''}</div></div>
      <div class="field"><span class="label">Client app accent ${hasPlan('PRO') ? '' : lock('PRO')}</span><div class="row" role="radiogroup" aria-label="Accent color">${COLORS.map(c => `<button type="button" role="radio" aria-checked="${col === c}" aria-label="Accent ${c}" data-act="brandColor" data-c="${c}" style="width:34px;height:34px;border-radius:50%;background:${c};border:${col === c ? '3px solid var(--ink)' : '1px solid var(--line-strong)'};cursor:pointer" ${hasPlan('PRO') && ow ? '' : 'disabled'}></button>`).join('')}</div></div></div>
      <div class="panel pad row wrap"><div class="today-card grow" style="max-width:320px;padding:16px"><div class="row between"><span class="strong small">${esc(b.name)}</span><span class="tiny" style="opacity:.6">Powered by Onejump</span></div><div class="h3">Lower Body A</div><button type="button" class="btn sm" style="background:${col};border-color:${col};color:#12281F;align-self:flex-start">Start workout</button></div><div class="small muted grow" style="min-width:200px">Your clients see your name, logo and accent color. OneJump stays in the background.</div></div>
      ${ow ? '<div><button class="btn primary" type="submit">Save</button></div>' : ''}</form>`;
  },
  assist(d) {
    const a = d.assist, s = a.settings || {}, ow = owner();
    return `<section class="card"><div class="card-head"><div class="h3">${arc()} How Assist works for you</div></div><div class="list">
      ${row('Writing style', 'Used for every draft. Set during onboarding.', `<select class="select" style="width:auto" data-change="writingStyle" aria-label="Writing style" ${ow ? '' : 'disabled'}>${['Supportive', 'Direct', 'Data-driven', 'Playful'].map(x => `<option ${d.business.writingStyle === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}
      ${row('Draft replies to check-ins automatically', 'Ready when you open each check-in.', tog(s.draftCheckins !== false, 'Draft replies to check-ins', 'assistPref', 'data-k="draftCheckins"', !ow))}
      ${row(`Daily retention radar ${hasPlan('PRO') ? '' : lock('PRO')}`, 'Scores every client nightly and drafts outreach when someone looks likely to cancel.', tog(s.radar !== false && hasPlan('PRO'), 'Retention radar', 'assistPref', 'data-k="radar"', !ow || !hasPlan('PRO')))}
      ${row('Ask before sending anything Assist wrote', 'Always on. Fixed-text reminders you switch on in Automations can still send.', '<button class="toggle on" disabled aria-pressed="true" aria-label="Always ask before sending"></button>')}
      ${row('Medical safety guard', 'Pain, injury or medical topics switch drafts to a referral and flag the client to you. Can’t be turned off.', `<span class="pill good">${icon('shield')} Always on</span>`)}
    </div></section>
    <section class="card pad stack s16"><div class="row between"><div class="h3">Usage this month</div><span class="pill ${a.provider === 'mock' ? '' : 'good'}">${a.provider === 'mock' ? 'Mock Assist (no AI key yet)' : esc(`${a.provider} · ${a.model}`)}</span></div>
      <div class="grid g3"><div><div class="eyebrow">Assist calls</div><div class="big-num" style="font-size:1.4rem">${a.callsThisMonth}</div></div><div><div class="eyebrow">Approved as-is</div><div class="big-num" style="font-size:1.4rem">${a.approvedAsIs == null ? '—' : a.approvedAsIs + '%'}</div></div><div><div class="eyebrow">Prompt version</div><div class="big-num" style="font-size:1.4rem">${esc(a.promptVersion)}</div></div></div>
      <p class="tiny faint">OneJump sends Assist only what each task needs (first names, goals, logged numbers), never emails, phone numbers or payment details. Your approve, edit and dismiss decisions are how drafts improve.</p></section>`;
  },
  notifications(d) {
    const n = d.notifications;
    return `<section class="card"><div class="card-head"><div class="h3">Notify me about</div><span class="tiny muted">In the app (bell) · daily summary by email</span></div><div class="list">${NOTIFS.map(([k, l]) => row(l, '', tog(n[k] !== false && (k !== 'daily' || n.daily), l, 'notifPref', `data-k="${k}"`, !owner()))).join('')}</div></section>
    <p class="tiny faint">Push notifications to your phone arrive with the native apps in V2.</p>`;
  },
  switch() {
    return `<section class="card pad stack s16"><div class="h3">Moving from Trainerize, TrueCoach, Everfit or a spreadsheet?</div>
      <div class="grid g2"><div class="panel pad stack s8"><div class="strong">Import a CSV yourself</div><p class="small muted">Export clients from your old app and drop the file in. We match the columns, show a preview, and you choose who gets an invite.</p><div><button class="btn sm" data-act="importCsvHere">${icon('upload')} Import CSV</button></div></div>
      <div class="panel pad stack s8"><div class="strong">Free concierge migration</div><p class="small muted">Send us your exports and PDFs. We move clients and programs within 48 hours, before you invite anyone.</p><div><button class="btn primary sm" data-act="migrationHere">Request migration</button></div></div></div></section>`;
  },
  team(d) {
    return `<section class="card"><div class="card-head"><div class="h3">People in this workspace</div>${stage('V2')}</div><div class="list">${d.team.map(m => `<div class="li">${avatar({ name: m.name }, 'sm')}<div class="grow"><div class="strong small">${esc(m.name)}</div><div class="tiny muted">${esc(m.email)}</div></div><span class="pill">${m.role === 'OWNER' ? 'Owner' : 'Coach'}</span></div>`).join('')}</div></section>
    <section class="card pad stack s8"><div class="row">${lock('STUDIO')}<div class="h3">Multiple coaches and roles</div></div><p class="small muted">Studio adds a second coach, client assignment and roles (coaches see only their clients). Coming with Studio in V2.</p></section>`;
  },
  integrations(d) {
    const st = d.connect?.status;
    return `<section class="card list">${[['card', 'Stripe', 'Client payments and payouts', st === 'active' ? 'Connected' : 'Set up in Payments', 'MVP'], ['mail', 'Email', 'Invites, login links and reminders', 'Built in', 'MVP'], ['calendar', 'Google Calendar', 'Two-way calendar sync', 'Coming later', 'V2'], ['message', 'Instagram DMs', 'Turn DMs into leads automatically', 'Coming later', 'V2'], ['heart', 'Apple Health and Garmin', 'Steps, sleep and heart rate as risk signals', 'Coming later', 'Future']].map(([ic, n, s, label, sg]) => `<div class="li"><span class="thumb">${icon(ic)}</span><div class="grow"><div class="row" style="gap:8px"><span class="strong small">${n}</span>${stage(sg)}</div><div class="tiny muted">${s}</div></div>${label === 'Connected' || label === 'Built in' ? `<span class="pill good">${label}</span>` : label === 'Set up in Payments' ? '<a class="btn sm" href="/app/payments">Set up</a>' : `<span class="pill">${label}</span>`}</div>`).join('')}</section>`;
  },
  security(d) {
    const on = d.security.totpEnabled;
    return `<section class="card"><div class="list">
      ${row('Two-step login', on ? 'On. You’ll enter a code from your authenticator app when you log in.' : 'Protect your account with a code from an authenticator app (Google Authenticator, 1Password, Authy).', on ? '<button class="btn sm" data-act="twofaOff">Turn off</button>' : '<button class="btn sm primary" data-act="twofaOn">Turn on</button>')}
      ${row('Other sessions', 'Signs you out on every other browser and device.', '<button class="btn sm" data-act="signOutOthers">Sign out others</button>')}
      ${owner() ? row('Export all data', 'Clients, programs, check-ins, messages and payments as JSON.', '<a class="btn sm" href="/api/settings/export" download>Export</a>') : ''}
    </div></section>
    <section class="card pad stack s16"><div class="row">${icon('shield')}<div class="h3">How your data is protected</div></div>
      <div class="grid g3 small">${[['Coaches', 'See only their own business. Every query is scoped to your workspace and tested.'], ['Clients', 'See only their own workouts, check-ins, photos and messages.'], ['OneJump staff', 'See totals, not client details. Sensitive actions are logged.']].map(([h, s]) => `<div class="panel pad-sm stack s4"><span class="strong">${h}</span><span class="muted tiny">${s}</span></div>`).join('')}</div>
      <p class="tiny faint">Progress photos are private files behind links that expire in 5 minutes. Card data stays with Stripe. OneJump never contacts, markets to or recruits your clients.</p></section>`;
  },
};

function initials(n) { return String(n || '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function tzOptions(cur) {
  const zones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Dublin', 'Europe/Madrid', 'Europe/Berlin', 'Australia/Sydney', 'UTC'];
  if (cur && !zones.includes(cur)) zones.unshift(cur);
  return zones.map(z => `<option ${z === cur ? 'selected' : ''}>${z}</option>`).join('');
}

export default {
  nav: 'settings',
  title: () => 'Settings',
  async load(params) {
    const tab = params.tab || 'profile';
    const [s, team, pay] = await Promise.all([
      api.get('/api/settings'),
      tab === 'team' ? api.get('/api/team') : null,
      tab === 'integrations' ? api.get('/api/payments').catch(() => null) : null,
    ]);
    return { ...s, team: team?.members || [], connect: pay?.connect };
  },
  render(d, params) {
    const tab = T[params.tab] ? params.tab : 'profile';
    return `<div class="page-head"><div><h1 class="h1">Settings</h1><p class="sub">${esc(d.business.name)}</p></div></div>
      <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}" href="/app/settings/${k}">${l}</a>`).join('')}</div>
      <div style="max-width:860px" class="stack s16">${T[tab](d)}</div>`;
  },
  actions: {
    importCsvHere() { importCsv(); },
    migrationHere() { migration(); },
    async brandColor(el, _e, ctx) {
      try { await api.put('/api/settings/business', { brandColor: el.dataset.c }); ctx.data.business.brandColor = el.dataset.c; ctx.rerender(); toast('Accent saved'); } catch (e) { toastError(e); }
    },
    async writingStyle(el, _e, ctx) { try { await api.put('/api/settings/business', { writingStyle: el.value }); ctx.data.business.writingStyle = el.value; toast('Saved. New drafts use this style.'); } catch (e) { toastError(e); } },
    async assistPref(el, _e, ctx) {
      const on = !el.classList.contains('on');
      try { await api.put('/api/settings/preferences', { assist: { [el.dataset.k]: on } }); el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); ctx.data.assist.settings = { ...ctx.data.assist.settings, [el.dataset.k]: on }; toast('Saved'); } catch (e) { toastError(e); }
    },
    async notifPref(el, _e, ctx) {
      const on = !el.classList.contains('on');
      try { await api.put('/api/settings/preferences', { notifications: { [el.dataset.k]: on } }); el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); ctx.data.notifications[el.dataset.k] = on; toast('Saved'); } catch (e) { toastError(e); }
    },
    async logoUpload(el, _e, ctx) {
      const f = el.files?.[0]; if (!f) return;
      if (f.size > 2 * 1024 * 1024) return toast('Pick an image under 2 MB.', { error: true });
      const fd = new FormData(); fd.append('logo', f);
      try { await api('POST', '/api/onboarding/logo', fd); toast('Logo updated'); ctx.refresh(); } catch (e) { toastError(e); }
    },
    async signOutOthers() {
      try { const r = await api.post('/api/settings/sign-out-others'); toast(r.signedOut ? `Signed out ${plural(r.signedOut, 'other session')}` : 'No other sessions were open'); } catch (e) { toastError(e); }
    },
    async twofaOn(_el, _e, ctx) {
      let s;
      try { s = await api.post('/api/auth/2fa/setup'); } catch (e) { return toastError(e); }
      const m = openModal(`${modalHead('Turn on two-step login', 'Scan with your authenticator app')}<form class="modal-body" id="tf-form" novalidate>
        <ol class="small stack s8" style="margin:0;padding-left:20px"><li>Open Google Authenticator, 1Password or Authy and add an account.</li><li>Scan this code, or type the key below.</li><li>Enter the 6-digit code it shows.</li></ol>
        <div class="row wrap" style="gap:20px"><img src="${s.qr}" alt="QR code for your authenticator app" width="180" height="180" style="border-radius:12px;background:#fff;padding:6px"><div class="stack s8" style="min-width:0"><span class="tiny muted">Setup key</span><code class="small" style="word-break:break-all">${esc(s.secret)}</code></div></div>
        <div class="field"><label for="tf-code">6-digit code</label><input class="input" id="tf-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" style="max-width:180px"></div></form>
        <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="tf-go">Turn on</button></div>`, { label: 'Two-step login' });
      m.querySelector('#tf-code').focus();
      const go = async ev => {
        const form = m.querySelector('#tf-form'); busy(m.querySelector('#tf-go'), true, 'Checking…'); ev?.preventDefault?.();
        try { await api.post('/api/auth/2fa/enable', { code: form.code.value.replace(/\s/g, '') }); closeModal(); toast('Two-step login is on'); ctx.refresh(); }
        catch (e) { busy(m.querySelector('#tf-go'), false); showFieldErrors(form, e.data?.fields || { code: e.message }); }
      };
      m.querySelector('#tf-go').addEventListener('click', go);
      m.querySelector('#tf-form').addEventListener('submit', go);
    },
    twofaOff(_el, _e, ctx) {
      const m = openModal(`${modalHead('Turn off two-step login')}<form class="modal-body" id="tfo-form" novalidate><div class="field"><label for="tfo-p">Password</label><input class="input" id="tfo-p" name="password" type="password" autocomplete="current-password"></div><div class="field"><label for="tfo-c">Code from your app</label><input class="input" id="tfo-c" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10"></div></form>
        <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn danger" id="tfo-go">Turn off</button></div>`, { label: 'Turn off two-step login' });
      m.querySelector('#tfo-go').addEventListener('click', async ev => {
        const form = m.querySelector('#tfo-form'); busy(ev.currentTarget, true, 'Checking…');
        try { await api.post('/api/auth/2fa/disable', { password: form.password.value, code: form.code.value.replace(/\s/g, '') }); closeModal(); toast('Two-step login is off'); ctx.refresh(); }
        catch (e) { busy(ev.currentTarget, false); toastError(e); }
      });
    },
  },
  forms: {
    async profile(form, _e, ctx) {
      const f = Object.fromEntries(new FormData(form)); const btn = form.querySelector('[type=submit]'); busy(btn, true);
      try { await api.put('/api/settings/profile', f); state.me.user.name = f.name; renderShell(); toast('Saved'); ctx.refresh(); } catch (e) { busy(btn, false); showFieldErrors(form, e.data?.fields); toastError(e); }
    },
    async business(form, _e, ctx) {
      const f = Object.fromEntries(new FormData(form)); const btn = form.querySelector('[type=submit]'); busy(btn, true);
      try { await api.put('/api/settings/business', { name: f.name, timezone: f.timezone }); state.me.business.name = f.name; renderShell(); toast('Saved'); ctx.refresh(); } catch (e) { busy(btn, false); showFieldErrors(form, e.data?.fields); toastError(e); }
    },
  },
};
