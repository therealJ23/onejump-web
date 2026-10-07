// The coach workspace shell from the prototype: deep-green rail, top bar, mobile tab bar.
import { esc, fmtSaved, planName, plural } from '../shared/format.js';
import { icon, arc, wordmark } from '../shared/icons.js';
import { avatar, lock } from '../shared/components.js';
import { api } from '../shared/api.js';
import { state, hasPlan } from './state.js';

const NAV = [
  ['today', '/app', 'home', 'Today', 'queue'],
  ['clients', '/app/clients', 'users', 'Clients'],
  ['checkins', '/app/checkins', 'clipboard', 'Check-ins', 'checkins'],
  ['inbox', '/app/inbox', 'message', 'Messages', 'unread'],
  ['-', 'Coaching'],
  ['programs', '/app/programs', 'layers', 'Programs'],
  ['builder', '/app/builder', 'dumbbell', 'Workout builder'],
  ['library', '/app/library', 'list', 'Exercise library'],
  ['-', 'Business'],
  ['payments', '/app/payments', 'card', 'Payments'],
  ['leads', '/app/leads', 'funnel', 'Leads', null, 'PRO'],
  ['-', 'Assist'],
  ['automations', '/app/automations', 'zap', 'Automations'],
];

function navItem([id, href, ic, label, badge, plan], active) {
  const on = active === id;
  const b = badge && state.counts[badge] ? `<span class="badge" data-badge="${badge}">${state.counts[badge]}</span>` : `<span class="badge" data-badge="${badge || ''}" hidden></span>`;
  return `<a class="nav-item ${on ? 'on' : ''}" href="${href}" data-nav="${id}" ${on ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${badge ? b : ''}${plan && !hasPlan(plan) ? `<span style="margin-left:auto">${lock(plan)}</span>` : ''}</a>`;
}

export function renderShell() {
  const b = state.me.business, u = state.me.user;
  const short = b.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const trial = b.plan === 'TRIAL' ? `<a class="pill assist hide-sm" href="/app/billing" style="text-decoration:none">${b.trialDaysLeft ? `Pro trial · ${plural(b.trialDaysLeft, 'day')} left` : 'Trial ended · pick a plan'}</a>` : '';
  document.getElementById('app').innerHTML = `
  <a class="sr" href="#view">Skip to content</a>
  <div class="shell">
    <aside class="rail" aria-label="Main navigation">
      <div class="brand">${wordmark()}<span class="ws">Coach</span></div>
      <div class="biz"><span class="logo">${esc(short)}</span><div class="grow"><div class="strong small" style="color:var(--rail-ink)">${esc(b.name)}</div><div class="tiny" style="color:var(--rail-muted)" id="rail-plan">${planName(b.plan)} plan</div></div></div>
      <nav class="stack s4" style="gap:2px" id="rail-nav">${NAV.map(n => (n[0] === '-' ? `<div class="group-label">${n[1]}</div>` : navItem(n, null))).join('')}</nav>
      <div class="foot">
        <div class="saved">Assist saved you<b id="saved-time">${fmtSaved(state.counts.minutesSaved)}</b>this week</div>
        ${navItem(['settings', '/app/settings', 'settings', 'Settings'], null)}
        ${navItem(['billing', '/app/billing', 'receipt', 'Plan & billing'], null)}
        <div class="me">${avatar({ name: u.name, tone: 0 }, 'sm')}<span class="grow"><span class="strong small" style="display:block">${esc(u.name)}</span><span class="tiny" style="color:var(--rail-muted)">${state.me.role === 'OWNER' ? 'Owner' : 'Coach'}</span></span><button class="btn ghost icon sm" style="color:var(--rail-ink)" data-act="logout" aria-label="Log out" title="Log out">${icon('logout')}</button></div>
      </div>
    </aside>
    <div class="rail-scrim" data-act="closeRail"></div>
    <div class="main">
      <header class="topbar">
        <button class="btn ghost icon mobile-only" data-act="openRail" aria-label="Open menu">${icon('menu')}</button>
        <span class="mobile-only" style="color:var(--ink)">${wordmark('height:20px;width:auto')}</span>
        <div class="search" style="flex:1;max-width:420px"><label class="sr" for="global-search">Search</label>${icon('search')}<input class="input" id="global-search" placeholder="Search clients, programs, exercises" data-input="globalSearch" autocomplete="off"><span class="kbd hide-sm">/</span></div>
        <div class="grow"></div>
        ${trial}
        <button class="btn primary sm" data-act="newMenu">${icon('plus')}<span class="hide-sm">New</span></button>
        <button class="btn ghost icon bell" data-act="notifs" aria-label="Notifications">${icon('bell')}<span class="dot" id="bell-dot" ${state.counts.notifications ? '' : 'hidden'}></span></button>
        <button class="btn ghost icon hide-sm" data-act="theme" aria-label="Toggle dark mode">${icon('moon')}</button>
      </header>
      <main class="content" id="view" tabindex="-1"></main>
    </div>
  </div>
  <nav class="tabbar" aria-label="Quick navigation">
    ${[['today', '/app', 'home', 'Today', 'queue'], ['clients', '/app/clients', 'users', 'Clients'], ['inbox', '/app/inbox', 'message', 'Messages', 'unread'], ['checkins', '/app/checkins', 'clipboard', 'Check-ins', 'checkins']].map(([id, href, ic, l, b]) => `<a href="${href}" data-tab="${id}">${icon(ic)}${l}${b ? `<span class="badge" data-badge="${b}" ${state.counts[b] ? '' : 'hidden'}>${state.counts[b] || ''}</span>` : ''}</a>`).join('')}
    <button data-act="openRail">${icon('menu')}More</button>
  </nav>`;
}

export function updateShell(active) {
  document.querySelectorAll('[data-nav]').forEach(a => {
    const on = a.dataset.nav === active;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('.tabbar [data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === active));
}

function paintCounts() {
  document.querySelectorAll('[data-badge]').forEach(el => {
    const k = el.dataset.badge; if (!k) return;
    const n = state.counts[k] || 0;
    el.textContent = n || ''; el.hidden = !n;
  });
  const d = document.getElementById('bell-dot'); if (d) d.hidden = !state.counts.notifications;
  const s = document.getElementById('saved-time'); if (s) s.textContent = fmtSaved(state.counts.minutesSaved);
}

let timer = null;
export async function refreshCounts() {
  try { Object.assign(state.counts, await api.get('/api/counts')); paintCounts(); } catch { /* keep old counts */ }
  clearTimeout(timer);
  timer = setTimeout(refreshCounts, 60e3);
}
export { arc };
