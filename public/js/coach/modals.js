// Modals used from several screens: CSV import, new package, new program, add lead, edit a draft.
import { api } from '../shared/api.js';
import { micButton } from '../shared/dictation.js';
import { esc, plural } from '../shared/format.js';
import { icon, arc } from '../shared/icons.js';
import { assistBadge, thinking } from '../shared/components.js';
import { openModal, closeModal, modalHead, toast, toastError, busy, showFieldErrors, copyText } from '../shared/ui.js';
import { editorBlock } from '../shared/editor.js';
import { navigate, ctx } from './router.js';
import { refreshCounts } from './shell.js';

/** Edit an Assist draft before sending. onSend(text) must return a promise. */
export function editDraft({ title = 'Edit before sending', sub = '', text = '', clientId = null, onSend, hint = '' }) {
  const m = openModal(`${modalHead(esc(title), sub)}
    <div class="modal-body">${editorBlock('ed', text, clientId)}${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="ed-send">${icon('send')} Send</button></div>`, { label: title });
  m.querySelector('#ed-send').addEventListener('click', async ev => {
    const btn = ev.currentTarget, v = m.querySelector('#ed-text').value.trim();
    if (!v) { m.querySelector('#ed-text').focus(); return; }
    busy(btn, true, 'Sending…');
    try { await onSend(v); closeModal(); } catch (e) { busy(btn, false); toastError(e); }
  });
}

export function importCsv() {
  const m = openModal(`${modalHead('Import clients', 'From Trainerize, TrueCoach, Everfit or any spreadsheet')}
    <div class="modal-body">
      <label class="dropzone" for="csv-file" style="cursor:pointer">${icon('upload')}<span class="grow"><span class="strong" style="display:block">Choose a CSV file</span><span class="small muted">Columns we look for: name, email, phone, goal, start date, package</span></span><span class="btn sm">Choose file</span></label>
      <input type="file" id="csv-file" accept=".csv,text/csv" class="sr">
      <div id="csv-result"></div>
      <div class="panel pad-sm small row wrap"><span class="grow">Moving programs too? Send us your programs, even as PDFs or screenshots, and we’ll rebuild them in OneJump for free.</span><button class="btn sm" id="csv-migrate">Request free migration</button></div>
    </div>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Close</button><button class="btn primary" id="csv-go" disabled>Import</button></div>`, { wide: true, label: 'Import clients' });
  let rows = [];
  m.querySelector('#csv-file').addEventListener('change', async e => {
    const f = e.target.files?.[0]; if (!f) return;
    const out = m.querySelector('#csv-result');
    if (f.size > 2_000_000) { out.innerHTML = '<div class="pill crit">That file is over 2 MB. Split it into smaller files.</div>'; return; }
    out.innerHTML = thinking('Reading the file…');
    try {
      const r = await api.post('/api/clients/import/preview', { csv: await f.text() });
      rows = r.rows.filter(x => !x.issues.length);
      out.innerHTML = `${r.problems.map(p => `<div class="pill crit" style="height:auto;padding:6px 10px">${esc(p)}</div>`).join('')}
        <div class="row wrap small"><span class="pill good">${plural(r.ready, 'client')} ready</span>${r.rows.length - r.ready ? `<span class="pill warn">${r.rows.length - r.ready} skipped</span>` : ''}<span class="muted tiny">Matched: ${esc(Object.entries(r.columns).map(([k, v]) => `${k} ← “${v}”`).join(', ') || 'none')}</span></div>
        <div class="card table-wrap" style="max-height:280px;overflow:auto"><table class="t"><thead><tr><th>Line</th><th>Name</th><th>Email</th><th>Goal</th><th></th></tr></thead><tbody>
        ${r.rows.slice(0, 200).map(x => `<tr><td class="tiny muted">${x.line}</td><td class="small strong">${esc(x.name || '—')}</td><td class="small">${esc(x.email || '—')}</td><td class="small muted">${esc(x.goal || '')}</td><td>${x.issues.length ? `<span class="pill warn">${esc(x.issues.join(', '))}</span>` : '<span class="pill good">Ready</span>'}</td></tr>`).join('')}</tbody></table></div>
        <label class="row small"><input type="checkbox" id="csv-invite"> Email each client an invite to the app now</label>`;
      m.querySelector('#csv-go').disabled = !rows.length;
      m.querySelector('#csv-go').textContent = rows.length ? `Import ${plural(rows.length, 'client')}` : 'Import';
    } catch (err) { out.innerHTML = `<div class="pill crit">${esc(err.message)}</div>`; }
  });
  m.querySelector('#csv-go').addEventListener('click', async ev => {
    busy(ev.currentTarget, true, 'Importing…');
    try {
      const r = await api.post('/api/clients/import', { rows: rows.map(({ name, email, phone, goal, startDate }) => ({ name, email, phone, goal, startDate })), sendInvites: m.querySelector('#csv-invite')?.checked || false });
      closeModal(); toast(`Imported ${plural(r.created, 'client')}${r.skipped ? ` · ${r.skipped} already here` : ''}${r.invited ? ` · ${r.invited} invited` : ''}`);
      refreshCounts(); navigate('/app/clients');
    } catch (e) { busy(ev.currentTarget, false); toastError(e); }
  });
  m.querySelector('#csv-migrate').addEventListener('click', () => { closeModal(); migration(); });
}

export function migration() {
  const m = openModal(`${modalHead('Free concierge migration', 'We move your clients and programs for you')}
    <form class="modal-body" id="mig-form">
      <div class="grid g2"><div class="field"><label for="mig-from">Moving from</label><select class="select" id="mig-from" name="from">${['Everfit', 'Trainerize', 'TrueCoach', 'Spreadsheet', 'Other'].map(x => `<option>${x}</option>`).join('')}</select></div>
      <div class="field"><label for="mig-n">How many clients?</label><input class="input" id="mig-n" name="clients" type="number" min="0" value="20"></div></div>
      <div class="field"><label for="mig-notes">Anything we should know?</label><textarea class="textarea" id="mig-notes" name="notes" rows="3" placeholder="e.g. 6 programs as PDFs, clients pay monthly"></textarea></div>
      <p class="small muted">We reply within one business day with a time for your 48-hour migration.</p>
    </form>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="mig-send">Request migration</button></div>`, { label: 'Migration' });
  m.querySelector('#mig-send').addEventListener('click', async ev => {
    const f = Object.fromEntries(new FormData(m.querySelector('#mig-form')));
    busy(ev.currentTarget, true, 'Sending…');
    try { await api.post('/api/settings/migration', { from: f.from, clients: Number(f.clients) || 0, notes: f.notes }); closeModal(); toast('Request sent. We’ll be in touch within a day.'); }
    catch (e) { busy(ev.currentTarget, false); toastError(e); }
  });
}

export function newPackage() {
  const m = openModal(`${modalHead('New package', 'Sold through your Stripe account')}
    <form class="modal-body" id="pk-form" novalidate>
      <div class="field"><label for="pk-name">Name</label><input class="input" id="pk-name" name="name" placeholder="e.g. Summer Shred 6-week" required></div>
      <div class="grid g3"><div class="field"><label for="pk-price">Price (USD)</label><input class="input" id="pk-price" name="price" type="number" min="0" step="1" value="199"></div>
      <div class="field"><label for="pk-int">Billing</label><select class="select" id="pk-int" name="interval"><option value="month">Monthly</option><option value="week">Weekly</option><option value="once">One-time</option></select></div>
      <div class="field"><label for="pk-sess">Sessions included</label><input class="input" id="pk-sess" name="sessionsIncluded" type="number" min="0" value="0"></div></div>
      <div class="field"><label for="pk-desc">What’s included</label><input class="input" id="pk-desc" name="description" placeholder="Program, weekly check-in, messaging"></div>
    </form>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="pk-save">Create package</button></div>`, { label: 'New package' });
  m.querySelector('#pk-save').addEventListener('click', async ev => {
    const form = m.querySelector('#pk-form'), f = Object.fromEntries(new FormData(form));
    busy(ev.currentTarget, true, 'Creating…');
    try {
      await api.post('/api/payments/plans', { name: f.name, price: Number(f.price), interval: f.interval, description: f.description || undefined, sessionsIncluded: Number(f.sessionsIncluded) || undefined });
      closeModal(); toast(`${f.name} is ready to sell`);
      if (ctx.screen?.nav === 'payments') ctx.refresh();
    } catch (e) { busy(ev.currentTarget, false); showFieldErrors(form, e.data?.fields); toastError(e); }
  });
}

export function newProgram() {
  const m = openModal(`${modalHead('New program', 'A multi-week plan you can assign to clients')}
    <form class="modal-body" id="np-form" novalidate>
      <div class="field"><label for="np-name">Program name</label><input class="input" id="np-name" name="name" placeholder="e.g. Strength Base" required></div>
      <div class="grid g3"><div class="field"><label for="np-weeks">Weeks</label><input class="input" id="np-weeks" name="weeks" type="number" min="1" max="52" value="8"></div>
      <div class="field"><label for="np-days">Days per week</label><select class="select" id="np-days" name="daysPerWeek">${[2, 3, 4, 5, 6].map(d => `<option ${d === 4 ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="field"><label for="np-level">Level</label><select class="select" id="np-level" name="level"><option>Beginner</option><option selected>Intermediate</option><option>Advanced</option></select></div></div>
      <div class="field"><label for="np-desc">Description</label><textarea class="textarea" id="np-desc" name="description" rows="2" placeholder="Who it’s for and what it builds"></textarea></div>
    </form>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="np-save">Create program</button></div>`, { label: 'New program' });
  m.querySelector('#np-save').addEventListener('click', async ev => {
    const form = m.querySelector('#np-form'), f = Object.fromEntries(new FormData(form));
    busy(ev.currentTarget, true, 'Creating…');
    try { const r = await api.post('/api/programs', { ...f, weeks: Number(f.weeks), daysPerWeek: Number(f.daysPerWeek) }); closeModal(); toast('Program created. Add workouts to each day.'); navigate(`/app/programs/${r.program.id}`); }
    catch (e) { busy(ev.currentTarget, false); showFieldErrors(form, e.data?.fields); toastError(e); }
  });
}

export function newLead() {
  const m = openModal(`${modalHead('Add lead', 'Paste a DM and Assist fills in the rest')}
    <form class="modal-body" id="nl-form" novalidate>
      <div class="field"><label for="nl-dm">Paste the message (from Instagram, text, email)</label><div class="row top"><textarea class="textarea grow" id="nl-dm" name="firstMessage" rows="3" placeholder="e.g. Hey! How much is your online coaching? I want to get stronger for climbing."></textarea>${micButton('nl-dm')}</div></div>
      <div><button type="button" class="btn assist sm" id="nl-parse">${arc()} Fill in with Assist</button></div>
      <div class="grid g2"><div class="field"><label for="nl-n">Name</label><input class="input" id="nl-n" name="name" placeholder="Name or @handle" required></div>
      <div class="field"><label for="nl-s">Source</label><select class="select" id="nl-s" name="source"><option value="instagram_dm">Instagram DM</option><option value="referral">Referral</option><option value="walk_in">Walk-in</option><option value="google">Google</option><option value="other">Other</option></select></div></div>
      <div class="grid g2"><div class="field"><label for="nl-g">Goal</label><input class="input" id="nl-g" name="goal"></div><div class="field"><label for="nl-c">Email or phone</label><input class="input" id="nl-c" name="contact" placeholder="Optional"></div></div>
      <div id="nl-reply"></div>
    </form>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="nl-save">Save lead</button></div>`, { label: 'Add lead' });
  let insightId = null;
  m.querySelector('#nl-parse').addEventListener('click', async () => {
    const dm = m.querySelector('#nl-dm').value.trim(); if (!dm) { m.querySelector('#nl-dm').focus(); return; }
    const out = m.querySelector('#nl-reply'); out.innerHTML = thinking('Assist is reading the message…');
    try {
      const r = await api.post('/api/leads/parse', { dm });
      insightId = r.insightId;
      if (r.name) m.querySelector('#nl-n').value = r.name;
      if (r.goal) m.querySelector('#nl-g').value = r.goal;
      out.innerHTML = `<div class="assist-card pad-sm stack s8"><div class="row">${assistBadge('Suggested reply')}<span class="tiny faint">copy it back into Instagram</span></div><div class="small">${esc(r.reply)}</div><div><button type="button" class="btn xs" id="nl-copy">${icon('copy')} Copy reply</button></div></div>`;
      out.querySelector('#nl-copy').addEventListener('click', () => copyText(r.reply));
    } catch (e) { out.innerHTML = `<div class="pill crit">${esc(e.message)}</div>`; }
  });
  m.querySelector('#nl-save').addEventListener('click', async ev => {
    const form = m.querySelector('#nl-form'), f = Object.fromEntries(new FormData(form));
    if (!f.name.trim()) { showFieldErrors(form, { name: 'Add a name or @handle' }); return; }
    busy(ev.currentTarget, true, 'Saving…');
    try {
      await api.post('/api/leads', { ...f, firstMessage: f.firstMessage || undefined, goal: f.goal || undefined, contact: f.contact || undefined, insightId: insightId || undefined });
      closeModal(); toast('Lead added. You’ll get a follow-up reminder in 3 days.');
      if (ctx.screen?.nav === 'leads') ctx.refresh();
      refreshCounts();
    } catch (e) { busy(ev.currentTarget, false); if (e.status === 402) toast(e.message, { error: true }); else { showFieldErrors(form, e.data?.fields); toastError(e); } }
  });
}

