// Coach workspace entry: checks the session, draws the shell, wires event delegation.
import { applyTheme, toggleTheme } from '../shared/theme.js';
import { api, setCsrf } from '../shared/api.js';
import { esc, rel, money } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { avatar } from '../shared/components.js';
import { openModal, closeModal, modalHead, openDrawer, closeDrawer, toast, toastError, copyText, busy, showFieldErrors } from '../shared/ui.js';
import { rewrite } from '../shared/editor.js';
import { state } from './state.js';
import { renderShell, refreshCounts } from './shell.js';
import { navigate, render, ctx } from './router.js';
import { chatActions, proposalActions, submitChat } from './assist.js';
import { toggleDictation } from '../shared/dictation.js';
import { startTranslation } from '../shared/i18n.js';

applyTheme();
startTranslation(); // English or Spanish (Settings → Profile → Language, or the device's language)

// ---------------------------------------------------------------- global actions
const NOTIF_ICON = { risk: 'alert', checkin: 'clipboard', message: 'message', payment: 'card', lead: 'funnel', missed: 'clock', assist: 'zap', client: 'user', automation: 'zap' };
const NOTIF_TONE = { risk: 'crit', checkin: 'assist', payment: 'warn', missed: 'warn', assist: 'assist' };

export const globalActions = {
  ...chatActions,
  ...proposalActions,
  dictate(el) { toggleDictation(el, { onError: msg => toast(msg, { error: true, ms: 7000 }) }); },
  talk() { return import('./voice.js').then(m => m.openTalk()); },
  briefing() { return import('./voice.js').then(m => m.openBriefing()); },
  openRail() { document.body.classList.add('rail-open'); },
  closeRail() { document.body.classList.remove('rail-open'); },
  closeModal() { closeModal(); },
  closeDrawer() { closeDrawer(); },
  theme() { toggleTheme(); },
  retry() { render(); },
  rewrite(el) { return rewrite(el); },
  copyText(el) { copyText(el.dataset.text); },
  async logout() { await api.post('/api/auth/logout'); location.href = '/login'; },

  async notifs() {
    const d = openDrawer(`<div class="drawer-head">${icon('bell')}<div class="h3 grow">Notifications</div><button class="btn ghost icon sm" data-act="closeDrawer" aria-label="Close">${icon('x')}</button></div><div class="drawer-body" id="notif-body">${'<div class="skel"></div>'.repeat(4)}</div>`, 'Notifications');
    try {
      const { notifications } = await api.get('/api/notifications');
      d.querySelector('#notif-body').outerHTML = `<div class="drawer-body" style="padding:0;gap:0">${notifications.length ? notifications.map(n => `<button class="li click sev ${!n.readAt ? (NOTIF_TONE[n.kind] || 'assist') : ''}" style="width:100%;border-left:0;border-right:0;border-bottom:0;background:none;text-align:left" data-act="openNotif" data-id="${n.id}" data-link="${esc(n.link || '')}">
        <span class="q-icon ${NOTIF_TONE[n.kind] || ''}" style="width:34px;height:34px">${icon(NOTIF_ICON[n.kind] || 'bell')}</span>
        <span class="grow"><span class="${!n.readAt ? 'strong' : ''} small" style="display:block">${esc(n.title)}</span>${n.body ? `<span class="tiny muted">${esc(n.body)}</span>` : ''}</span><span class="tiny faint nowrap">${rel(n.createdAt)}</span></button>`).join('') : `<div class="empty">${icon('bell')}<div>You’re all caught up.</div></div>`}</div>
        <div class="drawer-foot row between"><span class="tiny muted">New clients, messages, check-ins, payments and at-risk clients.</span><button class="btn ghost sm" data-act="markRead">Mark all read</button></div>`;
    } catch (e) { d.querySelector('#notif-body').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  },
  async markRead() { await api.post('/api/notifications/read-all'); closeDrawer(); refreshCounts(); toast('All caught up'); },
  async openNotif(el) {
    api.post(`/api/notifications/${el.dataset.id}/read`).then(refreshCounts).catch(() => {});
    closeDrawer();
    if (el.dataset.link) navigate(el.dataset.link);
  },

  newMenu() {
    openModal(`${modalHead('Create')}<div class="modal-body"><div class="choice-grid">${[['user', 'Invite a client', 'act:invite'], ['upload', 'Import clients', 'act:importCsv'], ['dumbbell', 'Workout', 'go:/app/builder'], ['layers', 'Program', 'act:newProgram'], ['card', 'Package', 'act:newPackage'], ['funnel', 'Lead', 'act:newLead']].map(([ic, l, a]) => `<button class="choice" ${a.startsWith('go:') ? `data-go="${a.slice(3)}"` : `data-act="${a.slice(4)}"`}>${icon(ic)}<span>${l}</span></button>`).join('')}</div></div>`, { label: 'Create' });
  },
  async invite(el) {
    const [{ programs }, pay, link] = await Promise.all([api.get('/api/programs'), api.get('/api/payments'), api.get('/api/clients/invite-link')]);
    openModal(`${modalHead('Invite a client', 'They get your branded app with their program ready')}
      <form class="modal-body" data-form="invite" novalidate>
        <div class="field"><label for="inv-name">Client name</label><input class="input" id="inv-name" name="name" placeholder="e.g. Jordan Lee" required autocomplete="off"></div>
        <div class="field"><label for="inv-email">Email</label><input class="input" id="inv-email" name="email" type="email" placeholder="jordan@example.com" autocomplete="off"><span class="hint">We email them a one-time link to your app.</span></div>
        <div class="field"><label for="inv-goal">Goal</label><input class="input" id="inv-goal" name="goal" placeholder="e.g. Lose 15 lb and keep strength"></div>
        <div class="grid g2"><div class="field"><label for="inv-prog">Program</label><select class="select" id="inv-prog" name="programId"><option value="">Choose later</option>${programs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="inv-pkg">Package</label><select class="select" id="inv-pkg" name="clientPlanId"><option value="">Choose later</option>${pay.plans.filter(k => k.active).map(k => `<option value="${k.id}">${esc(k.name)} · ${k.priceCents ? money(k.priceCents) : 'Free'}</option>`).join('')}</select></div></div>
        <div class="panel pad-sm row wrap"><span class="grow small">Or share your join link: <b>${esc(link.link.replace(/^https?:\/\//, ''))}</b></span><button type="button" class="btn sm" data-act="copyText" data-text="${esc(link.link)}">${icon('copy')} Copy</button></div>
        <div id="inv-result"></div>
      </form>
      <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="inviteSend">${icon('send')} Send invite</button></div>`, { label: 'Invite a client' });
    if (el?.dataset?.name) document.getElementById('inv-name').value = el.dataset.name;
  },
  async inviteSend(el) {
    const form = document.querySelector('[data-form="invite"]');
    const f = Object.fromEntries(new FormData(form));
    busy(el, true, 'Sending…');
    try {
      const r = await api.post('/api/clients', { ...f, sendInvite: !!f.email });
      document.getElementById('inv-result').innerHTML = `<div class="panel pad-sm stack s8"><div class="strong small">${icon('check')} ${esc(r.client.name)} added${r.emailed ? ' and invited by email' : ''}.</div><div class="row wrap"><span class="tiny muted grow" style="word-break:break-all">${esc(r.inviteLink)}</span><button type="button" class="btn xs" data-act="copyText" data-text="${esc(r.inviteLink)}">${icon('copy')} Copy invite link</button></div></div>`;
      el.outerHTML = `<button class="btn primary" data-go="/app/clients/${r.client.id}">Open profile</button>`;
      toast(r.emailed ? `Invite sent to ${r.client.name}` : `${r.client.name} added`);
      refreshCounts();
      if (['clients', 'today'].includes(ctx.screen?.nav)) ctx.refresh();
    } catch (e) { busy(el, false); showFieldErrors(form, e.data?.fields); if (e.status === 402) toast(e.message, { error: true, ms: 7000 }); else toastError(e); }
  },
  importCsv() { import('./modals.js').then(m => m.importCsv()); },
  newPackage() { import('./modals.js').then(m => m.newPackage()); },
  newProgram() { import('./modals.js').then(m => m.newProgram()); },
  newLead() { import('./modals.js').then(m => m.newLead()); },
};

const globalInputs = {
  globalSearch: (() => {
    let t = null;
    return el => {
      clearTimeout(t);
      t = setTimeout(async () => {
        document.getElementById('search-pop')?.remove();
        const q = el.value.trim(); if (!q) return;
        try {
          const r = await api.get(`/api/search?q=${encodeURIComponent(q)}`);
          const pop = document.createElement('div');
          pop.id = 'search-pop'; pop.className = 'card'; pop.setAttribute('role', 'listbox');
          pop.style.cssText = 'position:absolute;top:48px;left:0;right:0;z-index:30;padding:6px;box-shadow:var(--shadow-2)';
          const row = (go, thumb, title, sub) => `<a class="li click" style="border:0;border-radius:8px;text-decoration:none" href="${go}">${thumb}<span class="grow">${esc(title)}<span class="tiny muted" style="display:block">${esc(sub)}</span></span></a>`;
          pop.innerHTML = (r.clients.length + r.programs.length + r.exercises.length === 0) ? `<div class="pad-sm muted small">No matches for “${esc(q)}”</div>` :
            r.clients.map(c => row(`/app/clients/${c.id}`, avatar(c, 'sm'), c.name, `Client${c.goal ? ' · ' + c.goal : ''}`)).join('') +
            r.programs.map(p => row(`/app/programs/${p.id}`, `<span class="thumb">${icon('layers')}</span>`, p.name, 'Program')).join('') +
            r.exercises.map(x => row(`/app/library?ex=${x.id}`, `<span class="thumb">${icon('dumbbell')}</span>`, x.name, 'Exercise')).join('');
          el.parentElement.appendChild(pop);
          el.addEventListener('blur', () => setTimeout(() => pop.remove(), 200), { once: true });
        } catch { /* ignore */ }
      }, 180);
    };
  })(),
};

// ---------------------------------------------------------------- event delegation
function handler(kind, name) {
  const s = ctx.screen;
  return (s?.[kind] && s[kind][name]) || (kind === 'actions' ? globalActions[name] : kind === 'inputs' ? globalInputs[name] : null);
}
async function run(fn, el, ev) {
  try { await fn(el, ev, ctx); } catch (e) { console.error(e); toastError(e); }
}

document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (a && a.getAttribute('href').startsWith('/app') && !a.target && !a.hasAttribute('download')) { e.preventDefault(); navigate(a.getAttribute('href')); return; }
  const go = e.target.closest('[data-go]');
  if (go && !go.disabled) { e.preventDefault(); navigate(go.dataset.go); return; }
  const act = e.target.closest('[data-act]');
  if (act && !act.disabled) { const fn = handler('actions', act.dataset.act); if (fn) { e.preventDefault(); run(fn, act, e); } }
});
document.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el) { const fn = handler('inputs', el.dataset.input); if (fn) run(fn, el, e); } });
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el) { const fn = handler('actions', el.dataset.change) || handler('inputs', el.dataset.change); if (fn) run(fn, el, e); } });
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  const fn = ctx.screen?.forms?.[f.dataset.form] || (f.dataset.form === 'invite' ? () => globalActions.inviteSend(document.querySelector('[data-act="inviteSend"]')) : f.dataset.form === 'chat' ? submitChat : null);
  if (fn) run(fn, f, e);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (document.getElementById('modal')) closeModal(); else if (document.getElementById('drawer')) closeDrawer(); else document.body.classList.remove('rail-open'); }
  if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); globalActions.copilot(); return; }
  if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '') && !document.activeElement?.isContentEditable) { const s = document.getElementById('global-search'); if (s) { e.preventDefault(); s.focus(); } }
});

// ---------------------------------------------------------------- boot
(async function boot() {
  let me;
  try { me = await api.get('/api/auth/me'); }
  catch { document.getElementById('app').innerHTML = '<div class="empty" style="padding:80px 20px"><div class="h3">Can’t reach OneJump right now.</div><p>Check your connection and refresh.</p></div>'; return; }
  setCsrf(me.csrfToken);
  if (!me.user) { location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return; }
  if (me.role === 'CLIENT') { location.href = '/client'; return; }
  if (!me.business) { location.href = me.isPlatformAdmin ? '/admin' : '/login'; return; }
  if (!me.business.onboarded) { location.href = '/onboarding'; return; }
  state.me = me;
  renderShell();
  await refreshCounts();
  render();
})();

