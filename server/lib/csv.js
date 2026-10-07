// Minimal RFC 4180 CSV parser (quotes, escaped quotes, commas and newlines inside quotes).
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', i = 0, inQuotes = false;
  const s = String(text).replace(/^﻿/, '');
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',' || c === ';' && !s.includes(',')) { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

const ALIASES = {
  name: ['name', 'full name', 'client', 'client name', 'fullname'],
  first: ['first name', 'firstname', 'first'],
  last: ['last name', 'lastname', 'last', 'surname'],
  email: ['email', 'e-mail', 'email address'],
  phone: ['phone', 'phone number', 'mobile', 'cell'],
  goal: ['goal', 'goals', 'main goal'],
  startDate: ['start date', 'start', 'joined', 'start_date', 'created'],
  package: ['package', 'plan', 'membership', 'program'],
};

/** Maps a coaching-app export to OneJump client rows. Returns { rows, columns, problems }. */
export function clientsFromCsv(text) {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], columns: {}, problems: ['The file is empty.'] };
  const header = table[0].map(h => h.trim().toLowerCase());
  const col = {};
  for (const [k, names] of Object.entries(ALIASES)) {
    const idx = header.findIndex(h => names.includes(h));
    if (idx >= 0) col[k] = idx;
  }
  const problems = [];
  if (col.name == null && col.first == null) problems.push('No name column found. Add a column called “name”.');
  const rows = table.slice(1).map((r, n) => {
    const get = k => (col[k] != null ? (r[col[k]] || '').trim() : '');
    const name = get('name') || [get('first'), get('last')].filter(Boolean).join(' ');
    const email = get('email').toLowerCase();
    const issues = [];
    if (!name) issues.push('missing name');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) issues.push('email looks wrong');
    const sd = get('startDate');
    const parsed = sd ? new Date(sd) : null;
    return { line: n + 2, name, email: email || null, phone: get('phone') || null, goal: get('goal') || null, startDate: parsed && !isNaN(parsed) ? parsed.toISOString() : null, package: get('package') || null, issues };
  });
  return { rows, columns: Object.fromEntries(Object.entries(col).map(([k, v]) => [k, table[0][v]])), problems };
}
