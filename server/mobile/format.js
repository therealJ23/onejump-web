// Small formatters for the iPhone app: every label comes as { en, es } so the app's language
// switch works without another request. Dates are in the business's time zone.
import { L } from '../lib/es.js';

export { L };

const fmt = (locale, tz, opts) => new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts });
const ymd = (d, tz) => fmt('en-CA', tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/** "Oct 14" / "14 oct" */
export function day(d, tz = 'UTC') {
  if (!d) return L('—');
  return L(fmt('en-US', tz, { month: 'short', day: 'numeric' }).format(new Date(d)), fmt('es-ES', tz, { month: 'short', day: 'numeric' }).format(new Date(d)).replace('.', ''));
}
/** "2:30 PM" / "2:30 p. m." */
export function time(d, tz = 'UTC') {
  return L(fmt('en-US', tz, { hour: 'numeric', minute: '2-digit' }).format(new Date(d)), fmt('es-MX', tz, { hour: 'numeric', minute: '2-digit' }).format(new Date(d)));
}
/** "Mon" / "Lun" */
export function weekday(d, tz = 'UTC') {
  return L(fmt('en-US', tz, { weekday: 'short' }).format(new Date(d)), cap(fmt('es-ES', tz, { weekday: 'short' }).format(new Date(d)).replace('.', '')));
}
const daysBetween = (a, b, tz) => Math.round((Date.parse(ymd(b, tz)) - Date.parse(ymd(a, tz))) / 864e5);

/** Today → the time; yesterday → "Yesterday"; this week → weekday; older → date. */
export function when(d, tz = 'UTC', now = new Date()) {
  if (!d) return L('—');
  const n = daysBetween(d, now, tz);
  if (n <= 0) return time(d, tz);
  if (n === 1) return L('Yesterday', 'Ayer');
  if (n < 7) return weekday(d, tz);
  return day(d, tz);
}
/** "Today", "Yesterday", "3 days ago", or the date. */
export function ago(d, tz = 'UTC', now = new Date()) {
  if (!d) return L('—');
  const n = daysBetween(d, now, tz);
  if (n <= 0) return L('Today', 'Hoy');
  if (n === 1) return L('Yesterday', 'Ayer');
  if (n < 7) return L(`${n} days ago`, `hace ${n} días`);
  return day(d, tz);
}
/** "since May 2026" */
export function since(d, tz = 'UTC') {
  if (!d) return L('—');
  const en = fmt('en-US', tz, { month: 'short', year: 'numeric' }).format(new Date(d));
  const es = fmt('es-ES', tz, { month: 'long', year: 'numeric' }).format(new Date(d));
  return L(`client since ${en}`, `cliente desde ${es}`);
}

export const money = cents => `$${Math.round((cents || 0) / 100).toLocaleString('en-US')}`;
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const firstOf = n => String(n || '').split(' ')[0];
export const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

const AVATARS = [0xE7C9BE, 0xCFE0C3, 0xC6D6E6, 0xDCC9DF, 0xE3D2B5, 0xC3DCD3, 0xC9D6E2, 0xD8E3C3];
/** The same soft color for a person every time. */
export function avatar(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

/** Weight trend for the app's sparkline (0 = top, 32 = bottom). */
export function spark(values) {
  if (values.length < 2) return [16, 16];
  const max = Math.max(...values), min = Math.min(...values), range = max - min || 1;
  return values.map(v => Math.round((2 + (max - v) / range * 28) * 10) / 10);
}
export const signed = (n, unit = '') => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n * 10) / 10)}${unit}`);
