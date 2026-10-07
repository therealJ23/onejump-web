// Hand-rolled SVG charts (one scale per chart), from the prototype.
import { esc } from './format.js';

/* ---------- charts (hand-rolled SVG, one scale per chart) ---------- */
export function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
export function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
export function lineChart({ labels, series, height = 220, fmt = v => v, min = null, endLabel = true, compare = null }) {
  series = (series || []).map(Number).filter(v => !isNaN(v));
  if (!series.length) return '<div class="empty small" style="padding:24px">No data yet</div>';
  if (series.length === 1) { series = [series[0], series[0]]; labels = [labels[0] ?? '', labels[0] ?? '']; }
  const W = 640, H = height, pl = 48, pr = 56, pt = 16, pb = 28;
  const all = series.concat(compare || []);
  let lo = min ?? Math.min(...all), hi = Math.max(...all);
  if (min == null) { const pad = Math.max((hi - lo) * .15, Math.abs(hi) * .01, .5); lo -= pad; hi += pad; }
  else hi *= 1.06;
  if (!(hi > lo)) hi = lo + 1;
  const step = niceStep((hi - lo) / 4); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const ticks = Math.round((hi - lo) / step);
  const x = i => pl + i * (W - pl - pr) / (labels.length - 1);
  const y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  let g = '';
  for (let i = 0; i <= ticks; i++) { const v = lo + step * i; g += `<line class="grid-l" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(Math.round(v * 100) / 100)}</text>`; }
  const every = Math.ceil(labels.length / 7);
  labels.forEach((l, i) => { if (i % every === 0 || i === labels.length - 1) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
  const d = series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const area = `${d}L${x(series.length - 1)} ${y(lo)}L${x(0)} ${y(lo)}Z`;
  const cmp = compare ? `<path class="line2" d="${compare.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join('')}"/>` : '';
  const li = series.length - 1;
  const end = endLabel ? `<circle class="end" cx="${x(li)}" cy="${y(series[li])}" r="5"/><text class="end-label" x="${x(li) + 9}" y="${y(series[li]) + 4}">${fmt(series[li])}</text>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}<path class="area" d="${area}"/>${cmp}<path class="line" d="${d}"/>${end}</svg>`;
}
export function barChart({ labels, a, b = null, neg = null, height = 200, fmt = v => v }) {
  const W = 640, H = height, pl = 40, pr = 12, pt = 12, pb = 28;
  a = a.map(v => Number(v) || 0);
  const mx = Math.max(1, ...a, ...(b || [0])), step = Math.max(1, niceStep(mx / 4));
  const hi = Math.ceil(mx * 1.05 / step) * step;
  const lo = neg ? -niceMax(Math.max(...neg) * 1.4) : 0;
  const nT = Math.round((hi - lo) / step);
  const y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const bw = (W - pl - pr) / labels.length;
  let g = '';
  for (let i = 0; i <= nT; i++) { const v = lo + step * i; g += `<line class="grid-l" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(Math.round(v))}</text>`; }
  labels.forEach((l, i) => {
    const cx = pl + bw * i + bw / 2, w = b ? bw * .32 : bw * .56;
    if (b) {
      g += `<rect class="bar-a" x="${cx - w - 1}" y="${y(a[i])}" width="${w}" height="${y(0) - y(a[i])}" rx="3"/>`;
      g += `<rect class="bar-b" x="${cx + 1}" y="${y(b[i])}" width="${w}" height="${y(0) - y(b[i])}" rx="3"/>`;
    } else g += `<rect class="bar-a" x="${cx - w / 2}" y="${y(a[i])}" width="${w}" height="${y(0) - y(a[i])}" rx="3"/>`;
    if (neg && neg[i]) g += `<rect class="bar-neg" x="${cx - w / 2}" y="${y(0)}" width="${w}" height="${y(-neg[i]) - y(0)}" rx="3"/>`;
    g += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}
export function sparkline(vals, w = 120, h = 36) {
  const lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || 1;
  const x = i => i * (w / (vals.length - 1)), y = v => 3 + (1 - (v - lo) / r) * (h - 6);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path class="a" d="${d}L${w} ${h}L0 ${h}Z"/><path class="l" d="${d}"/></svg>`;
}
export function silhouette() {
  return `<svg viewBox="0 0 120 160" fill="currentColor" aria-hidden="true"><circle cx="60" cy="40" r="17"/><path d="M28 160c0-36 10-88 32-88s32 52 32 88z"/></svg>`;
}
