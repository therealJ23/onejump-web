// Client app (installable web app). Same structure as the coach workspace: one router,
// one state object, small screen modules, event delegation. No AI labels, risk scores or
// business data appear here; everything comes from /api/me (scoped to this client).
import { api, setCsrf, setUnauthorizedHandler } from '../shared/api.js';
import { icon } from '../shared/icons.js';
import { errorState } from '../shared/components.js';
import { closeModal, toastError } from '../shared/ui.js';

export const state = { me: null, brand: null, done: null };

const ROUTES = [
  ['/client', 'today'], ['/client/workout/:id', 'workout'], ['/client/workout/:id/finish', 'finish'], ['/client/workout/:id/done', 'done'],
  ['/client/checkin', 'checkin'], ['/client/chat', 'chat'], ['/client/nutrition', 'nutrition'], ['/client/progress', 'progress'], ['/client/me', 'me'], ['/client/checkout', 'checkout'],
];
const LOADERS = {
  today: () => import('./screens/today.js'), workout: () => import('./screens/workout.js'), finish: () => import('./screens/workout.js').then(m => ({ default: m.finish })),
  done: () => import('./screens/workout.js').then(m => ({ default: m.done })), checkin: () => import('./screens/checkin.js'), chat: () => import('./screens/chat.js'),
  progress: () => import('./screens/progress.js'), nutrition: () => import('./screens/nutrition.js'), me: () => import('./screens/me.js'), checkout: () => import('./screens/me.js').then(m => ({ default: m.checkout })),
};
const TABS = [['today', '/client', 'home', 'Today'], ['nutrition', '/client/nutrition', 'utensils', 'Nutrition'], ['progress', '/client/progress', 'chart', 'Progress'], ['chat', '/client/chat', 'message', 'Coach'], ['me', '/client/me', 'user', 'Me']];

function match(pathname) {
  const parts = pathname.replace(/\/+$/, '').split('/');
  for (const [pattern, name] of ROUTES) {
    const pp = pattern.split('/'); if (pp.length !== parts.length) continue;
    const params = {};
    if (pp.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(parts[i])), true) : p === parts[i]))) return { name, params };
  }
  return { name: 'today', params: {} };
}

let current = { name: null, screen: null, data: null, params: {} }, token = 0;
const view = () => document.getElementById('view');

export const ctx = {
  navigate, refresh: () => render({ silent: true, keepScroll: true }), rerender: () => paint(true), state,
  get data() { return current.data; }, set data(v) { current.data = v; }, get params() { return current.params; },
};

function paint(keepScroll = false) {
  const y = window.scrollY;
  view().innerHTML = current.screen.render(current.data, current.params, ctx);
  current.screen.mount?.(view(), current.data, current.params, ctx);
  if (keepScroll) window.scrollTo(0, y);
}
function setTab(tab) {
  document.querySelectorAll('.ctabbar a').forEach(a => { const on = a.dataset.tab === tab; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}

async function render({ silent = false, keepScroll = false } = {}) {
  const url = new URL(location.href);
  const { name, params } = match(url.pathname);
  params.query = Object.fromEntries(url.searchParams);
  const my = ++token;
  const screen = (await LOADERS[name]()).default;
  if (my !== token) return;
  current = { name, screen, params, data: silent && current.name === name ? current.data : null };
  setTab(screen.tab || 'today');
  document.body.classList.toggle('in-workout', !!screen.focus);
  if (!silent) view().innerHTML = `<div class="stack s16" aria-busy="true"><div class="skel" style="height:28px;width:55%"></div><div class="skel" style="height:160px;border-radius:22px"></div><div class="skel" style="height:72px"></div><div class="skel" style="height:72px"></div></div>`;
  try {
    const data = screen.load ? await screen.load(params, ctx) : null;
    if (my !== token) return;
    current.data = data;
    paint(keepScroll);
    document.title = `${screen.title ? screen.title(data) : 'Your training'} · ${state.brand?.name || 'OneJump'}`;
    if (!keepScroll) window.scrollTo(0, 0);
  } catch (e) {
    if (my !== token) return;
    view().innerHTML = errorState(e.message);
  }
}

export function navigate(path, { replace = false } = {}) {
  closeModal();
  if (path !== location.pathname + location.search) history[replace ? 'replaceState' : 'pushState'](null, '', path);
  return render();
}

function handler(name) { return current.screen?.actions?.[name] || GLOBAL[name]; }
async function run(fn, el, e) { try { await fn(el, e, ctx); } catch (err) { toastError(err); } }
const GLOBAL = {
  retry() { render(); },
  closeModal() { closeModal(); },
  async logout() { await api.post('/api/auth/logout').catch(() => {}); location.href = '/login?as=client'; },
};

document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="/client"]');
  if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && a.target !== '_blank' && !a.hasAttribute('download')) { e.preventDefault(); navigate(a.getAttribute('href')); return; }
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const fn = handler(el.dataset.act); if (fn) { e.preventDefault(); run(fn, el, e); }
});
document.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el) { const fn = current.screen?.inputs?.[el.dataset.input]; if (fn) run(fn, el, e); } });
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el) { const fn = current.screen?.actions?.[el.dataset.change] || current.screen?.inputs?.[el.dataset.change]; if (fn) run(fn, el, e); } });
document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); const fn = current.screen?.forms?.[f.dataset.form]; if (fn) run(fn, f, e); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('modal')) closeModal(); });
window.addEventListener('popstate', () => render());

(async function boot() {
  setUnauthorizedHandler(() => { location.href = '/login?as=client'; });
  let me;
  try { me = await api.get('/api/auth/me'); } catch { document.getElementById('app').innerHTML = '<div class="empty" style="padding:80px 20px"><div class="h3">You seem to be offline.</div><p>Check your connection and try again.</p><a class="btn" href="/client">Try again</a></div>'; return; }
  setCsrf(me.csrfToken);
  if (!me.user) { location.replace('/login?as=client'); return; }
  if (me.role !== 'CLIENT') { location.replace(me.business ? '/app' : '/admin'); return; }
  state.me = me;
  const b = me.business;
  state.brand = { name: b.name, color: b.effectivePlan === 'STARTER' ? null : b.brandColor };
  if (state.brand.color) document.documentElement.style.setProperty('--client-accent', state.brand.color);
  document.getElementById('app').innerHTML = `
    <a class="sr" href="#view">Skip to content</a>
    <div class="capp"><div class="screen"><main class="scroll" id="view" tabindex="-1"></main>
      <nav class="ctabbar" aria-label="Main">${TABS.map(([k, href, ic, l]) => `<a href="${href}" data-tab="${k}">${icon(ic)}${l}</a>`).join('')}</nav>
    </div></div>`;
  await render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/client-sw.js', { scope: '/client' }).catch(() => {});
})();
