// Formatting helpers (from the prototype), adapted to real dates and money in cents.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Cents → "$1,234" */
export const money = (cents, d = 0) => '$' + (Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = n => Math.round(n) + '%';
export const plural = (n, w, p) => `${n} ${n === 1 ? w : (p || w + 's')}`;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = a => a.reduce((s, x) => s + x, 0);
export const avg = a => (a.length ? sum(a) / a.length : 0);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const first = name => String(name || '').split(' ')[0];
export const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const D = v => (v instanceof Date ? v : new Date(v));
export const fmtDate = v => { const d = D(v); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
export const fmtDay = v => { const d = D(v); return `${WD[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
export const fmtLongDay = v => D(v).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
export const fmtFullDate = v => D(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
/** Training days are stored as UTC midnight of the local date: format them in UTC. */
export const fmtKey = v => { const d = D(v); return `${WD[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
export const keyToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function fmtTime(v) {
  const d = D(v); const h = d.getHours(), m = d.getMinutes();
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'PM' : 'AM'}`;
}
export function fmtHour(h) { return `${((h + 11) % 12) + 1} ${h >= 12 ? 'PM' : 'AM'}`; }
export function daysAgo(v) {
  if (!v) return null;
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = D(v); const bb = new Date(b); bb.setHours(0, 0, 0, 0);
  return Math.round((a - bb) / 864e5);
}
export function rel(v) {
  const days = daysAgo(v);
  if (days == null) return 'Never';
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  return `${Math.round(days / 7)} weeks ago`;
}
/** Message timestamps: "7:02 AM" today, otherwise "Oct 2". */
export const stamp = v => (daysAgo(v) === 0 ? fmtTime(v) : fmtDate(v));
export const fmtSaved = m => `${Math.floor((m || 0) / 60)}h ${String((m || 0) % 60).padStart(2, '0')}m`;
export const titleCase = s => String(s || '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
export const planName = p => ({ TRIAL: 'Pro trial', STARTER: 'Starter', PRO: 'Pro', STUDIO: 'Studio' })[p] || p;
export const interval = (plan) => (plan?.interval === 'month' ? '/mo' : plan?.interval === 'week' ? '/wk' : plan?.priceCents ? ' once' : '');
