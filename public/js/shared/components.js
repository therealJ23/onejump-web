// Small render helpers shared by the coach workspace, client app and admin (from the prototype).
import { esc } from './format.js';
import { icon, arc } from './icons.js';

const AV_TONES = ['#D6FF3D', '#C6D2C8', '#E9D8B4', '#B9D9E8', '#F2C7B8', '#D8CDEA', '#BFE3C8', '#F1E2A6'];
export function avatar(p, size = '') {
  const n = p?.name || '?';
  const ini = n.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  const tone = AV_TONES[(p.tone ?? n.length) % AV_TONES.length];
  const ring = p.risk && p.risk.level === 'HIGH' ? '<span class="ring"></span>' : '';
  return `<span class="av ${size}" style="background:${tone}" aria-hidden="true">${esc(ini)}${ring}</span>`;
}
export function riskPill(r, short = false) {
  if (!r) return '<span class="pill">New</span>';
  const map = { HIGH: ['crit', 'High risk'], MEDIUM: ['warn', 'Medium risk'], LOW: ['good', 'Low risk'] };
  const [c, t] = map[r.level] || ['', r.level];
  return `<span class="pill ${c}"><span class="dot"></span>${short ? t.replace(' risk', '') : t}</span>`;
}
export function statusPill(c) {
  if (c.status === 'PAUSED') return '<span class="pill">Paused</span>';
  if (c.status === 'INACTIVE') return '<span class="pill">Inactive</span>';
  if (c.status === 'NEW' && !c.risk) return `<span class="pill info">${c.invited ? 'Invited' : 'New'}</span>`;
  return riskPill(c.risk);
}
export function payPill(s) {
  const map = { paid: ['good', 'Paid'], failed: ['crit', 'Payment failed'], due: ['warn', 'Due soon'], upcoming: ['warn', 'Upcoming'], trial: ['info', 'Trial'], paused: ['', 'Paused'], cancelled: ['', 'Cancelled'], none: ['', 'No plan'], refunded: ['', 'Refunded'], pending: ['info', 'Pending'] };
  const [c, t] = map[s] || ['', s];
  return `<span class="pill ${c}">${t}</span>`;
}
export const assistBadge = (t = 'Assist') => `<span class="assist-badge">${arc()}${esc(t)}</span>`;
export const thinking = (t = 'Assist is drafting…') => `<div class="thinking" role="status">${arc()}<span>${esc(t)}</span></div>`;
export const skeleton = (lines = 3) => `<div class="stack s8" aria-hidden="true">${Array.from({ length: lines }, (_, i) => `<div class="skel" style="width:${[92, 78, 64, 84][i % 4]}%"></div>`).join('')}</div>`;
export function emptyState(ic, title, text = '', action = '') {
  return `<div class="empty">${ic === 'arc' ? arc() : icon(ic)}<div class="h3" style="color:var(--ink)">${esc(title)}</div>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}
export function errorState(msg = 'Something went wrong.') {
  return `<div class="card empty" role="alert">${icon('alert')}<div class="h3" style="color:var(--ink)">Couldn’t load this</div><p>${esc(msg)}</p><button class="btn" data-act="retry">${icon('refresh')} Try again</button></div>`;
}
export function loadingPage() {
  return `<div class="stack s24" aria-busy="true" aria-label="Loading"><div class="stack s8"><div class="skel" style="width:140px;height:12px"></div><div class="skel" style="width:280px;height:28px"></div></div><div class="card pad">${skeleton(4)}</div><div class="grid g2"><div class="card pad">${skeleton(3)}</div><div class="card pad">${skeleton(3)}</div></div></div>`;
}
export const stage = s => `<span class="stage ${s.toLowerCase()}" title="Build stage">${s}</span>`;
export const lock = (t = 'PRO') => `<span class="lock">${icon('lock').replace('class="ico ', 'style="width:11px;height:11px" class="ico ')}${t}</span>`;
export const small = (svg, px = 14) => svg.replace('class="ico ', `style="width:${px}px;height:${px}px;vertical-align:-2px" class="ico `).replace('class="arc ', `style="width:${px}px;height:${px}px;vertical-align:-2px" class="arc `);
