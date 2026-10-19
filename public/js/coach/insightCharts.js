// Charts for the Business page. Hand-rolled SVG like ../shared/charts.js: one scale per chart,
// thin marks, values on hover (and on keyboard focus where a mark can take it), a legend for
// every chart with more than one series. Text inside SVG isn't seen by the page translator, so
// it goes through t().
import { esc, money } from '../shared/format.js';
import { niceStep } from '../shared/charts.js';
import { t } from '../shared/i18n.js';

/** $2.1k style, for axes. */
export const moneyShort = c => { const d = c / 100; return Math.abs(d) >= 1000 ? `$${(d / 1000).toFixed(d >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : `$${Math.round(d)}`; };

/** Legend: [{ label, kind: 'line'|'dash'|'band'|'box'|'hatch'|'ref', tone: 'c1'|'c3'|'neg'|'ref' }] */
export function legend(items) {
  return `<div class="lgd" aria-hidden="true">${items.map(i => `<span class="lgd-i"><i class="sw ${i.kind} ${i.tone || 'c1'}"></i>${esc(i.label)}</span>`).join('')}</div>`;
}

/** A tooltip drawn inside the SVG, shown on hover/focus of its group (see .tip in app.css). */
function tip(x, y, lines, W, H) {
  const w = Math.max(...lines.map(l => l.length)) * 6.6 + 20, h = lines.length * 16 + 12;
  const tx = x + 12 + w > W ? x - 12 - w : x + 12;
  const ty = Math.max(2, Math.min(H - h - 2, y - h / 2));
  return `<g class="tip"><rect x="${tx}" y="${ty}" width="${w}" height="${h}" rx="8"/>${lines.map((l, i) => `<text x="${tx + 10}" y="${ty + 20 + i * 16}" class="${i ? '' : 'tip-h'}">${esc(l)}</text>`).join('')}</g>`;
}

/**
 * This month, day by day: money collected so far (solid), the expected rest of the month (dashed)
 * with a likely range (shaded), and last month at the same point (grey, dashed) for comparison.
 */
export function forecastChart({ month, curve, lastMonth, W = 640, H = 260 }) {
  const n = month.daysInMonth, d = curve.startDay;
  const pl = 46, pr = 70, pt = 14, pb = 30;
  const top = Math.max(1, ...curve.high, ...curve.actual, ...lastMonth.slice(0, n));
  const step = niceStep(top / 4), hi = Math.ceil(top * 1.04 / step) * step;
  const x = i => pl + i * (W - pl - pr) / (n - 1);
  const y = v => pt + (1 - v / hi) * (H - pt - pb);
  const path = pts => pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  let g = '';
  for (let v = 0; v <= hi + 1e-9; v += step) g += `<line class="grid-l" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${moneyShort(v)}</text>`;
  for (const i of (W < 520 ? [0, 14, n - 1] : [0, 7, 14, 21, n - 1])) if (Math.abs(i - (d - 1)) > (W < 520 ? 4 : 2)) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(`${t(month.label)} ${i + 1}`)}</text>`;
  g += `<text x="${x(d - 1)}" y="${H - 8}" text-anchor="middle" class="strong-t">${esc(t('Today'))}</text>`;
  const fut = curve.base.map((v, k) => [d - 1 + k, v]);
  const band = `${path(curve.high.map((v, k) => [d - 1 + k, v]))}${curve.low.map((v, k) => [d - 1 + k, v]).reverse().map(([i, v]) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')}Z`;
  if (d < n) g += `<path class="fc-band" d="${band}"/>`;
  const lm = lastMonth.slice(0, n).map((v, i) => [i, v]);
  if (lm.some(([, v]) => v > 0)) g += `<path class="ref-line" d="${path(lm)}"/>`;
  g += `<path class="line" d="${path(curve.actual.map((v, i) => [i, v]))}"/>`;
  if (d < n) g += `<path class="fc-line" d="${path(fut)}"/>`;
  const endV = curve.base.at(-1), nowV = curve.actual.at(-1) ?? 0;
  g += `<line class="today-l" x1="${x(d - 1)}" x2="${x(d - 1)}" y1="${pt}" y2="${H - pb}"/>`;
  g += `<circle class="end" cx="${x(d - 1)}" cy="${y(nowV)}" r="5"/>`;
  if (d < n) g += `<circle class="fc-end" cx="${x(n - 1)}" cy="${y(endV)}" r="5"/><text class="end-label" x="${x(n - 1) + 9}" y="${y(endV) + 4}">${esc(moneyShort(endV))}</text><text class="end-sub" x="${x(n - 1) + 9}" y="${y(endV) + 18}">${esc(t('expected'))}</text>`;
  // Hover a day: what was collected by then, or what's expected, and last month on the same day.
  for (let i = 0; i < n; i++) {
    const lines = [`${t(month.label)} ${i + 1}`];
    let py;
    if (i < d) { lines.push(t('Collected: {v}', { v: money(curve.actual[i]) })); py = curve.actual[i]; }
    if (i >= d - 1 && d < n) { const k = i - (d - 1); lines.push(t('Expected: {v}', { v: money(curve.base[k]) }), t('Likely {lo}–{hi}', { lo: moneyShort(curve.low[k]), hi: moneyShort(curve.high[k]) })); py = curve.base[k]; }
    if (lastMonth[i] != null && lastMonth.some(v => v > 0)) lines.push(t('Last month: {v}', { v: money(lastMonth[i]) }));
    const w = (W - pl - pr) / (n - 1);
    g += `<g class="day-g"><rect class="hit" x="${x(i) - w / 2}" y="${pt}" width="${w}" height="${H - pt - pb}"/><line class="cross" x1="${x(i)}" x2="${x(i)}" y1="${pt}" y2="${H - pb}"/><circle class="pt" cx="${x(i)}" cy="${y(py)}" r="4"/>${tip(x(i), y(py), lines, W, H)}</g>`;
  }
  const label = t('Collected {now} so far this month; about {end} expected by the end of the month.', { now: money(nowV), end: money(endV) });
  return `<svg class="chart ins" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg>`;
}

/**
 * Revenue by month. Past months are collected money; this month shows what's collected (solid)
 * and the rest that's expected (hatched), so the two never get confused.
 */
export function revenueColumns({ months, expected, W = 640, H = 220, fmt = moneyShort, full = c => money(c) }) {
  const pl = 8, pr = 8, pt = 30, pb = 28;
  const vals = months.map(m => m.cents);
  const last = months.length - 1;
  const top = Math.max(1, ...vals, expected) * 1.06;
  const y = v => pt + (1 - v / top) * (H - pt - pb);
  const bw = (W - pl - pr) / months.length, w = Math.min(48, bw * .6);
  const col = (cx, from, to, cls) => {
    const h = Math.max(0, y(from) - y(to)); if (h <= 0) return '';
    const r = cls === 'col' || cls === 'col-fc' ? Math.min(4, h / 2) : 0;
    return `<path class="${cls}" d="M${cx - w / 2} ${y(from)}V${y(to) + r}Q${cx - w / 2} ${y(to)} ${cx - w / 2 + r} ${y(to)}H${cx + w / 2 - r}Q${cx + w / 2} ${y(to)} ${cx + w / 2} ${y(to) + r}V${y(from)}Z"/>`;
  };
  let g = `<defs><pattern id="hatch-fc" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" class="hatch-l"/></pattern></defs><line class="grid-l" x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}"/>`;
  months.forEach((m, i) => {
    const cx = pl + bw * i + bw / 2;
    const isNow = i === last;
    const extra = isNow ? Math.max(0, expected - m.cents) : 0;
    const label = isNow ? t('{m}: {v} collected, about {e} expected', { m: t(m.label), v: full(m.cents), e: full(expected) }) : `${t(m.label)} ${m.year}: ${full(m.cents)}`;
    g += `<g class="bar-g ${isNow ? 'sel' : ''}" tabindex="0" role="img" aria-label="${esc(label)}"><rect class="hit" x="${pl + bw * i}" y="${pt - 24}" width="${bw}" height="${H - pt - pb + 24}"/>`;
    g += col(cx, 0, m.cents, 'col');
    if (extra) g += `<path class="col-hatch" d="M${cx - w / 2} ${y(m.cents)}V${y(m.cents + extra) + 4}Q${cx - w / 2} ${y(m.cents + extra)} ${cx - w / 2 + 4} ${y(m.cents + extra)}H${cx + w / 2 - 4}Q${cx + w / 2} ${y(m.cents + extra)} ${cx + w / 2} ${y(m.cents + extra) + 4}V${y(m.cents)}Z"/>`;
    g += `<text class="bar-v" x="${cx}" y="${y(m.cents + extra) - 8}" text-anchor="middle">${esc(isNow && extra ? `${fmt(m.cents)} → ${fmt(expected)}` : fmt(m.cents))}</text>`;
    g += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(t(m.label))}</text></g>`;
  });
  return `<svg class="chart cols ins" viewBox="0 0 ${W} ${H}" role="group">${g}</svg>`;
}

/** Clients gained (up) and lost (down) each month; this month also outlines what's expected. */
export function flowChart({ flow, projGained, projLost, W = 640, H = 220 }) {
  const pl = 8, pr = 8, pt = 22, pb = 28;
  const last = flow.length - 1;
  const up = Math.max(1, ...flow.map(f => f.gained), projGained), down = Math.max(1, ...flow.map(f => f.lost), projLost);
  const span = (H - pt - pb - 18);
  const zero = pt + span * up / (up + down);
  const unit = span / (up + down);
  const bw = (W - pl - pr) / flow.length, w = Math.min(40, bw * .5);
  let g = `<line class="zero-l" x1="${pl}" x2="${W - pr}" y1="${zero}" y2="${zero}"/>`;
  flow.forEach((f, i) => {
    const cx = pl + bw * i + bw / 2, isNow = i === last;
    const gh = f.gained * unit, lh = f.lost * unit;
    const label = isNow ? t('{m} so far: {g} new, {l} left. Expected by month end: {pg} new, {pl} left.', { m: t(f.label), g: f.gained, l: f.lost, pg: projGained, pl: projLost }) : t('{m}: {g} new, {l} left', { m: t(f.label), g: f.gained, l: f.lost });
    g += `<g class="bar-g flow-g" tabindex="0" role="img" aria-label="${esc(label)}"><rect class="hit" x="${pl + bw * i}" y="${pt - 16}" width="${bw}" height="${H - pt - pb + 16}"/>`;
    if (isNow && projGained > f.gained) g += `<rect class="proj" x="${cx - w / 2}" y="${zero - projGained * unit}" width="${w}" height="${projGained * unit}" rx="3"/>`;
    if (isNow && projLost > f.lost) g += `<rect class="proj neg" x="${cx - w / 2}" y="${zero + 1}" width="${w}" height="${projLost * unit}" rx="3"/>`;
    if (gh) g += `<rect class="gain" x="${cx - w / 2}" y="${zero - gh}" width="${w}" height="${gh - 1}" rx="3"/>`;
    if (lh) g += `<rect class="loss" x="${cx - w / 2}" y="${zero + 1}" width="${w}" height="${lh}" rx="3"/>`;
    const topG = isNow ? Math.max(f.gained, projGained) : f.gained, botL = isNow ? Math.max(f.lost, projLost) : f.lost;
    g += `<text class="v-up" x="${cx}" y="${zero - topG * unit - 5}" text-anchor="middle">${f.gained ? `+${f.gained}` : ''}${isNow && projGained > f.gained ? ` (${projGained})` : ''}</text>`;
    if (f.lost || (isNow && projLost)) g += `<text class="v-down" x="${cx}" y="${zero + botL * unit + 13}" text-anchor="middle">${f.lost ? `−${f.lost}` : ''}${isNow && projLost > f.lost ? ` (${projLost})` : ''}</text>`;
    g += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${esc(t(f.label))}</text></g>`;
  });
  return `<svg class="chart ins" viewBox="0 0 ${W} ${H}" role="group">${g}</svg>`;
}

/** Two shares on one 0–100% scale, by week: check-ins sent and workouts done. */
export function engagementChart(weeks, { W = 640, H = 200 } = {}) {
  const pl = 40, pr = 48, pt = 14, pb = 28;
  const n = weeks.length;
  const x = i => pl + i * (W - pl - pr) / (n - 1);
  const y = v => pt + (1 - v / 100) * (H - pt - pb);
  let g = '';
  for (const v of [0, 25, 50, 75, 100]) g += `<line class="grid-l" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`;
  const lab = i => (i === n - 1 ? t('This week') : t('{n}w ago', { n: n - 1 - i }));
  weeks.forEach((_, i) => { if (i % 2 === 1 || i === n - 1) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(lab(i))}</text>`; });
  const series = [['checkinPct', 'line'], ['adherencePct', 'line3']];
  for (const [k, cls] of series) {
    const pts = weeks.map((w, i) => [i, w[k]]).filter(([, v]) => v != null);
    if (pts.length < 2) continue;
    // The current week is still filling up: draw its segment dashed.
    const full = pts.filter(([i]) => i < n - 1), lastSeg = pts.slice(-2);
    g += `<path class="${cls}" d="${full.map(([i, v], j) => `${j ? 'L' : 'M'}${x(i)} ${y(v)}`).join('')}"/>`;
    if (lastSeg[1][0] === n - 1) g += `<path class="${cls} so-far" d="M${x(lastSeg[0][0])} ${y(lastSeg[0][1])}L${x(lastSeg[1][0])} ${y(lastSeg[1][1])}"/>`;
    const [li, lv] = pts.at(-1);
    g += `<circle class="dot ${cls}" cx="${x(li)}" cy="${y(lv)}" r="4"/>`;
  }
  // Direct labels at the right end, nudged apart if they'd overlap.
  const ends = series.map(([k, cls]) => { const v = [...weeks].reverse().find(w => w[k] != null)?.[k]; return v == null ? null : { cls, v, ty: y(v) + 4 }; }).filter(Boolean);
  if (ends.length === 2 && Math.abs(ends[0].ty - ends[1].ty) < 14) { const [a, b] = ends[0].ty <= ends[1].ty ? ends : [ends[1], ends[0]]; a.ty -= 7; b.ty += 7; }
  for (const e of ends) g += `<text class="end-label ${e.cls}-t" x="${W - pr + 8}" y="${e.ty}">${e.v}%</text>`;
  weeks.forEach((w, i) => {
    const lines = [i === n - 1 ? t('This week (so far)') : t('Week of {d}', { d: w.weekOf.slice(5).replace('-', '/') }), t('Check-ins: {v}', { v: w.checkinPct == null ? '–' : `${w.checkinPct}%` }), t('Workouts done: {v}', { v: w.adherencePct == null ? '–' : `${w.adherencePct}%` })];
    const py = w.checkinPct ?? w.adherencePct ?? 50;
    g += `<g class="day-g" tabindex="0" role="img" aria-label="${esc(lines.join('. '))}"><rect class="hit" x="${x(i) - 20}" y="${pt}" width="40" height="${H - pt - pb}"/><line class="cross" x1="${x(i)}" x2="${x(i)}" y1="${pt}" y2="${H - pb}"/>${tip(x(i), y(py), lines, W, H)}</g>`;
  });
  return `<svg class="chart ins" viewBox="0 0 ${W} ${H}" role="group">${g}</svg>`;
}
