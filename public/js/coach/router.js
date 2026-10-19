// History-API router for /app/*. Each screen module exports
// { nav, title(data), load(params, ctx), render(data, params, ctx), mount?(root, data, params, ctx), actions?, inputs?, forms? }.
// The router shows the loading state, then the screen, or an error state with a retry button.
import { loadingPage, errorState } from '../shared/components.js';
import { closeModal, closeDrawer } from '../shared/ui.js';
import { updateShell } from './shell.js';
import { state } from './state.js';

const ROUTES = [
  ['/app', 'today'], ['/app/today', 'today'],
  ['/app/clients', 'clients'], ['/app/clients/:id', 'client'], ['/app/clients/:id/:tab', 'client'],
  ['/app/checkins', 'checkins'], ['/app/checkins/:id', 'checkins'],
  ['/app/inbox', 'inbox'], ['/app/inbox/:id', 'inbox'],
  ['/app/programs', 'programs'], ['/app/programs/:id', 'program'],
  ['/app/builder', 'builder'], ['/app/builder/:id', 'builder'],
  ['/app/library', 'library'],
  ['/app/payments', 'payments'],
  ['/app/business', 'business'],
  ['/app/automations', 'automations'],
  ['/app/leads', 'leads'],
  ['/app/settings', 'settings'], ['/app/settings/:tab', 'settings'],
  ['/app/billing', 'billing'],
  ['/app/assist', 'assist'],
  ['/app/nutrition', 'nutrition'],
];
const LOADERS = {
  today: () => import('./screens/today.js'), clients: () => import('./screens/clients.js'), client: () => import('./screens/client.js'),
  checkins: () => import('./screens/checkins.js'), inbox: () => import('./screens/inbox.js'), programs: () => import('./screens/programs.js'),
  program: () => import('./screens/program.js'), builder: () => import('./screens/builder.js'), library: () => import('./screens/library.js'),
  payments: () => import('./screens/payments.js'), business: () => import('./screens/business.js'), automations: () => import('./screens/automations.js'), leads: () => import('./screens/leads.js'),
  settings: () => import('./screens/settings.js'), billing: () => import('./screens/billing.js'),
  assist: () => import('./screens/assist.js'), nutrition: () => import('./screens/nutrition.js'),
};

function match(pathname) {
  const parts = pathname.replace(/\/+$/, '').split('/');
  for (const [pattern, name] of ROUTES) {
    const pp = pattern.split('/');
    if (pp.length !== parts.length) continue;
    const params = {};
    if (pp.every((p, i) => (p.startsWith(':') ? (params[p.slice(1)] = decodeURIComponent(parts[i]), true) : p === parts[i]))) return { name, params };
  }
  return { name: 'today', params: {} };
}

let current = { name: null, screen: null, params: {}, data: null };
let token = 0;
const view = () => document.getElementById('view');

function paint() {
  const root = view();
  root.innerHTML = current.screen.render(current.data, current.params, ctx);
  current.screen.mount?.(root, current.data, current.params, ctx);
}

export async function render({ keepScroll = false, silent = false } = {}) {
  const url = new URL(location.href);
  const { name, params } = match(url.pathname);
  params.query = Object.fromEntries(url.searchParams);
  const my = ++token;
  const screen = (await LOADERS[name]()).default;
  if (my !== token) return;
  const sameScreen = current.name === name;
  current = { name, screen, params, data: sameScreen && silent ? current.data : null };
  updateShell(screen.nav || name);
  document.body.classList.remove('rail-open');
  const y = window.scrollY;
  if (!silent) view().innerHTML = loadingPage();
  try {
    const data = screen.load ? await screen.load(params, ctx) : null;
    if (my !== token) return;
    current.data = data;
    paint();
    document.title = `${screen.title ? screen.title(data, params) : 'OneJump'} · OneJump`;
    window.scrollTo(0, keepScroll ? y : 0);
    if (!keepScroll) view().focus({ preventScroll: true });
  } catch (e) {
    if (my !== token) return;
    view().innerHTML = errorState(e.message);
  }
}

export function navigate(path, { replace = false, keepScroll = false } = {}) {
  closeModal(); closeDrawer();
  if (path !== location.pathname + location.search) history[replace ? 'replaceState' : 'pushState'](null, '', path);
  return render({ keepScroll });
}

export const ctx = {
  navigate,
  /** Reload this screen's data without the loading flash. */
  refresh: () => render({ keepScroll: true, silent: true }),
  /** Re-render this screen from its current data (UI-only changes). */
  rerender: () => { const y = window.scrollY; paint(); window.scrollTo(0, y); },
  get data() { return current.data; },
  set data(v) { current.data = v; },
  get params() { return current.params; },
  get screen() { return current.screen; },
  state,
};

window.addEventListener('popstate', () => render());
