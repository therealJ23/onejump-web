// Light / dark / system theme (remembered per browser when storage is available).
const KEY = 'oj-theme';
export function getTheme() { try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; } }
export function applyTheme(t = getTheme()) {
  if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}
export function toggleTheme() {
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const t = dark ? 'light' : 'dark';
  try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
  applyTheme(t);
}
applyTheme();
