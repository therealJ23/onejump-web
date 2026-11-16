import fs from 'fs';
const BONE = '#F4F6F1', VOLT = '#D6FF3D';
const L = (pts, w = 30, c = BONE) => `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const head = (x, y, r = 36) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${BONE}"/>`;
const plate = (x, y, r = 58) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${VOLT}" stroke-width="18"/><circle cx="${x}" cy="${y}" r="9" fill="${VOLT}"/>`;
const db = (x, y, a = 0) => `<g transform="translate(${x} ${y}) rotate(${a})"><rect x="-34" y="-7" width="68" height="14" rx="7" fill="${VOLT}"/><rect x="-44" y="-22" width="20" height="44" rx="6" fill="${VOLT}"/><rect x="24" y="-22" width="20" height="44" rx="6" fill="${VOLT}"/></g>`;
const kb = (x, y) => `<circle cx="${x}" cy="${y + 18}" r="30" fill="${VOLT}"/><path d="M${x - 18} ${y - 4} q18 -34 36 0" fill="none" stroke="${VOLT}" stroke-width="10" stroke-linecap="round"/>`;
const ground = (y = 492, x1 = 90, x2 = 510) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="rgba(244,246,241,.18)" stroke-width="8" stroke-linecap="round"/>`;
const P = {
  squat: [ground(), L([[386, 476], [328, 476], [356, 372], [246, 356]]), L([[246, 356], [292, 236]]), `<line x1="196" y1="230" x2="404" y2="230" stroke="${VOLT}" stroke-width="14" stroke-linecap="round"/>`, plate(196, 230, 46), plate(404, 230, 46), L([[292, 240], [258, 270], [286, 232]], 26), head(318, 186)],
  hinge: [ground(), L([[300, 476], [318, 400], [236, 318]]), L([[236, 318], [362, 262]]), L([[362, 266], [366, 396]], 26), plate(366, 420, 62), head(400, 232)],
  lunge: [ground(), L([[452, 476], [428, 382], [318, 336]]), L([[318, 336], [240, 452], [168, 476]]), L([[318, 336], [318, 200]]), L([[318, 206], [322, 270], [326, 330]], 26), db(326, 352, 90), head(320, 152)],
  push: [ground(), L([[130, 476], [282, 412], [424, 362]]), L([[424, 364], [430, 420], [432, 476]], 26), head(470, 334)],
  pull: [`<line x1="150" y1="104" x2="450" y2="104" stroke="${VOLT}" stroke-width="16" stroke-linecap="round"/>`, L([[228, 108], [196, 172], [244, 238], [356, 238], [404, 172], [372, 108]], 26), L([[300, 238], [300, 368]]), L([[300, 368], [272, 448], [292, 500]]), L([[300, 368], [328, 448], [308, 500]]), head(300, 186)],
  core: [ground(), L([[124, 476], [292, 418], [430, 380]]), L([[430, 380], [432, 474], [508, 474]], 26), head(472, 352)],
  carry: [ground(), L([[300, 208], [300, 340]]), L([[300, 340], [266, 410], [262, 476]]), L([[300, 340], [334, 410], [338, 476]]), L([[244, 214], [356, 214]], 26), L([[244, 214], [232, 330]], 26), L([[356, 214], [368, 330]], 26), kb(232, 344), kb(368, 344), head(300, 154)],
  jump: [`<ellipse cx="300" cy="490" rx="96" ry="14" fill="rgba(244,246,241,.14)"/>`, L([[300, 182], [300, 300]]), L([[226, 86], [252, 140], [300, 182], [348, 140], [374, 86]], 26), L([[300, 300], [246, 346], [272, 404]]), L([[300, 300], [354, 346], [328, 404]]), head(300, 130)],
  cardio: [ground(), L([[318, 190], [292, 320]]), L([[292, 320], [364, 372], [344, 466]]), L([[292, 320], [238, 392], [176, 430]]), L([[316, 200], [364, 244], [386, 200]], 26), L([[316, 200], [262, 254], [236, 296]], 26), head(332, 138)],
  iso: [ground(), L([[300, 330], [304, 404], [296, 476]]), L([[300, 330], [318, 404], [334, 476]]), L([[300, 330], [300, 202]]), L([[300, 208], [298, 286], [362, 238]], 26), db(370, 226, 0), head(304, 154)],
};
fs.mkdirSync('ex/svg', { recursive: true });
for (const [k, parts] of Object.entries(P)) {
  fs.writeFileSync(`ex/svg/${k}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F5D4E"/><stop offset="1" stop-color="#12281F"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><path d="M60 560 C220 300 380 300 540 560" fill="none" stroke="rgba(214,255,61,.07)" stroke-width="22"/>${parts.join('')}</svg>`);
}
fs.writeFileSync('ex/sheet.html', `<html><body style="margin:0;display:grid;grid-template-columns:repeat(5,240px);gap:10px;padding:10px;background:#ddd">${Object.keys(P).map(k => `<div><img src="svg/${k}.svg" width="240" height="240" style="border-radius:24px;display:block"><div style="font:600 14px sans-serif;text-align:center">${k}</div></div>`).join('')}</body></html>`);
