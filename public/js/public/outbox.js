// Dev-only viewer for emails sent with EMAIL_PROVIDER=console.
import { api, $ } from './common.js';
import { esc, rel } from '../shared/format.js';

async function load() {
  const list = $('#ob-list');
  try {
    const { emails } = await api.get('/api/dev/outbox');
    list.innerHTML = emails.length ? emails.map(m => `<article class="card pad stack s8"><div class="row between wrap"><div class="strong">${esc(m.subject)}</div><span class="tiny faint">${rel(m.at)}</span></div><div class="small muted">To ${esc(m.to)}</div>${m.link ? `<div><a class="btn primary sm" href="${esc(m.link)}">Open link</a> <span class="tiny muted" style="word-break:break-all">${esc(m.link)}</span></div>` : ''}<pre class="panel pad-sm tiny" style="white-space:pre-wrap;margin:0">${esc(m.text || '')}</pre></article>`).join('')
      : '<div class="card empty">No emails yet. Invite a client or request a login link.</div>';
  } catch (e) { list.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}
$('#ob-refresh').addEventListener('click', load);
load();
