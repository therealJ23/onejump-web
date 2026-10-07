// Messages: thread list + conversation with Assist draft chips (prototype V.inbox).
// Drafts are only ever put in the composer; the coach presses Send.
import { api } from '../../shared/api.js';
import { esc, first, fmtTime, fmtDate, daysAgo, plural } from '../../shared/format.js';
import { icon, arc } from '../../shared/icons.js';
import { avatar, riskPill, emptyState, small } from '../../shared/components.js';
import { toast, toastError, busy, openModal, closeModal, modalHead } from '../../shared/ui.js';
import { editorBlock } from '../../shared/editor.js';
import { refreshCounts } from '../shell.js';

const CHIPS = [['reply-last', 'Reply to last message'], ['motivate', 'Motivational'], ['professional', 'Professional'], ['consistency', 'Why consistency matters'], ['recovery', 'Recovery recommendation'], ['shorter', 'Make it shorter']];
const dayLabel = v => { const n = daysAgo(v); return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : fmtDate(v); };
const when = v => (daysAgo(v) === 0 ? fmtTime(v) : dayLabel(v));

function threadList(threads, selId) {
  if (!threads.length) return `<div class="pad small muted">No conversations yet. Messages from clients show up here.</div>`;
  return threads.map(t => `<a class="thread ${selId === t.clientId ? 'on' : ''}" href="/app/inbox/${t.clientId}" ${selId === t.clientId ? 'aria-current="true"' : ''}>${avatar(t, 'sm')}<div class="grow" style="min-width:0"><div class="row between"><span class="strong small">${esc(t.name)}</span><span class="tiny faint">${t.last ? when(t.last.at) : ''}</span></div><div class="tiny muted clamp2">${t.last ? `${t.last.fromCoach ? 'You: ' : ''}${esc(t.last.body)}` : ''}</div></div>${t.unread ? '<span class="unread" aria-label="Unread"></span>' : ''}</a>`).join('');
}

function convo(conv) {
  const c = conv.client;
  let lastDay = '';
  const msgs = conv.messages.map(m => {
    const d = dayLabel(m.at), sep = d !== lastDay ? `<div class="day-sep">${d}</div>` : ''; lastDay = d;
    return sep + `<div class="bubble ${m.from}">${esc(m.body)}<span class="time">${fmtTime(m.at)}${m.assist ? (m.edited ? ' · edited from an Assist draft' : ' · Assist draft') : ''}${m.system ? ' · automation' : ''}</span></div>`;
  }).join('') || `<div class="empty" style="margin:auto">${icon('message')}<div class="h3" style="color:var(--ink)">Start the conversation</div><p>Say hi to ${esc(first(c.name))}, or let Assist draft something.</p></div>`;
  const meta = [c.program && `${esc(c.program)} · week ${c.week || 1}`, c.adherence != null && `adherence ${c.adherence}%`, c.checkin && `check-in ${c.checkin.status === 'submitted' ? 'needs review' : 'reviewed'}`].filter(Boolean).join(' · ');
  return `<div class="convo">
    <div class="card-head"><a class="btn ghost icon sm show-sm" href="/app/inbox" aria-label="Back to conversations">${icon('chevL')}</a>${avatar(c, 'sm')}<div class="grow" style="min-width:0"><div class="strong">${esc(c.name)}</div><div class="tiny muted">${meta || esc(c.status.toLowerCase())}</div></div>${c.risk ? riskPill(c.risk) : ''}<a class="btn ghost sm hide-sm" href="/app/clients/${c.id}">Profile</a></div>
    <div class="msgs" aria-live="polite">${msgs}</div>
    <form class="composer" data-form="send">
      <div class="assist-bar" role="toolbar" aria-label="Assist drafts">${arc()}
        ${CHIPS.map(([k, l]) => `<button type="button" class="chip" data-act="msgDraft" data-intent="${k}">${l}</button>`).join('')}
      </div>
      <div id="draft-label" class="tiny assist-text" hidden>${small(arc(), 13)} Assist draft. Edit anything before you send.</div>
      <div class="row top"><label class="grow"><span class="sr">Message to ${esc(c.name)}</span><textarea class="textarea" id="msg-text" name="body" rows="2" style="min-height:52px" placeholder="Write to ${esc(first(c.name))}…" data-input="typed"></textarea></label><button class="btn primary" type="submit" style="height:52px">${icon('send')}<span class="hide-sm">Send</span></button></div>
      <div class="tiny faint">Enter to send · Shift+Enter for a new line</div>
    </form></div>`;
}

export default {
  nav: 'inbox',
  title: () => 'Messages',
  async load(params) {
    const list = await api.get('/api/threads');
    const conv = params.id ? await api.get(`/api/threads/${params.id}`) : null;
    if (conv) { const t = list.threads.find(x => x.clientId === params.id); if (t) t.unread = 0; }
    return { ...list, conv };
  },
  render(d, params) {
    const sel = params.id && d.conv;
    const unread = d.threads.filter(t => t.unread).length;
    return `
    <div class="page-head"><div><h1 class="h1">Messages</h1><p class="sub">${unread} unread · Assist drafts replies in your voice</p></div><div class="row wrap"><button class="btn" data-act="newConvo">${icon('plus')} New message</button><button class="btn" data-act="broadcast">${icon('send')} Message a group</button></div></div>
    ${!d.threads.length && !sel ? `<section class="card">${emptyState('message', 'No messages yet', 'When clients write to you from their app, it lands here. You can start a conversation any time.', '<button class="btn primary" data-act="newConvo">New message</button>')}</section>` : `
    <section class="card inbox ${sel ? 'has-thread' : ''}">
      <div class="threads">${threadList(d.threads, params.id)}</div>
      ${sel ? convo(d.conv) : `<div class="convo"><div class="empty" style="margin:auto">${icon('message')}<div class="h3" style="color:var(--ink)">Pick a conversation</div><p>Assist can draft a reply that knows the client’s goal, program and last check-in.</p></div></div>`}
    </section>`}`;
  },
  mount(root, d) {
    const m = root.querySelector('.msgs'); if (m) m.scrollTop = m.scrollHeight;
    const ta = root.querySelector('#msg-text');
    ta?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ta.form.requestSubmit(); } });
    if (d.conv) refreshCounts();
  },
  actions: {
    async msgDraft(el, _e, ctx) {
      const ta = document.getElementById('msg-text'); const old = ta.value;
      ta.value = ''; ta.placeholder = 'Assist is drafting…'; ta.disabled = true;
      document.querySelectorAll('[data-act="msgDraft"]').forEach(b => { b.disabled = true; });
      try {
        const r = await api.post(`/api/threads/${ctx.data.conv.client.id}/draft`, { intent: el.dataset.intent, current: old });
        ta.value = r.text; ta.dataset.insight = r.insightId;
        document.getElementById('draft-label').hidden = false;
        if (r.safety?.flagged) toast('Medical topic detected. The draft refers them to a professional; please read it before sending.', { assist: true, ms: 7000 });
      } catch (e) { ta.value = old; toastError(e); }
      ta.disabled = false; ta.placeholder = `Write to ${first(ctx.data.conv.client.name)}…`; ta.focus();
      document.querySelectorAll('[data-act="msgDraft"]').forEach(b => { b.disabled = false; });
    },
    newConvo(_el, _e, ctx) { pickClient(ctx); },
    broadcast(_el, _e, ctx) { broadcast(ctx); },
  },
  inputs: {
    typed(el) { if (!el.value.trim()) { delete el.dataset.insight; document.getElementById('draft-label').hidden = true; } },
  },
  forms: {
    async send(form, _e, ctx) {
      const ta = form.querySelector('#msg-text'), body = ta.value.trim();
      if (!body) { ta.focus(); return; }
      const btn = form.querySelector('[type="submit"]'); busy(btn, true, '…');
      try {
        await api.post(`/api/threads/${ctx.data.conv.client.id}/messages`, { body, insightId: ta.dataset.insight || undefined });
        toast('Sent', { assist: !!ta.dataset.insight });
        await ctx.refresh({ keepScroll: true, silent: true });
      } catch (e) { busy(btn, false); toastError(e); }
    },
  },
};

async function pickClient(ctx) {
  const { clients } = await api.get('/api/clients');
  const m = openModal(`${modalHead('New message', 'Pick a client')}<div class="modal-body"><div class="field"><label for="nc-q">Search</label><input class="input" id="nc-q" placeholder="Name" autocomplete="off"></div><div class="list card" id="nc-list" style="max-height:340px;overflow:auto"></div></div>`, { label: 'New message' });
  const draw = q => { m.querySelector('#nc-list').innerHTML = clients.filter(c => c.name.toLowerCase().includes(q.toLowerCase())).map(c => `<a class="li click" href="/app/inbox/${c.id}">${avatar(c, 'sm')}<span class="grow strong small">${esc(c.name)}</span>${icon('chevR')}</a>`).join('') || '<div class="pad-sm small muted">No match.</div>'; };
  draw('');
  m.querySelector('#nc-q').addEventListener('input', e => draw(e.target.value));
  m.querySelector('#nc-q').focus();
  void ctx;
}

async function broadcast(ctx) {
  const counts = await api.get('/api/threads/segments/counts');
  const opts = [['missing_checkin', `Clients who haven’t checked in (${counts.missing_checkin})`], ['active', `All active clients (${counts.active})`], ['online', `Online clients (${counts.online})`], ...counts.programs.map(p => [`program:${p.id}`, `${p.name} (${p.count})`])];
  const m = openModal(`${modalHead('Message a group', 'Each client gets it individually, with their first name')}
    <div class="modal-body"><div class="field"><label for="bc-to">Send to</label><select class="select" id="bc-to">${opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>${editorBlock('bc', 'Hey {first}! Quick reminder to send your weekly check-in. It takes 2 minutes and it’s how I adjust your next week.', null, { rows: 4 })}<p class="tiny muted">{first} becomes each client’s first name. Sent as you; no AI involved.</p></div>
    <div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="bc-go">${icon('send')} Send</button></div>`, { label: 'Message a group' });
  m.querySelector('#bc-go').addEventListener('click', async ev => {
    const to = m.querySelector('#bc-to').value, text = m.querySelector('#bc-text').value.trim();
    if (!text) return m.querySelector('#bc-text').focus();
    const [segment, programId] = to.split(':');
    busy(ev.currentTarget, true, 'Sending…');
    try { const r = await api.post('/api/threads/broadcast', { segment, programId, body: text }); closeModal(); toast(`Sent to ${plural(r.sent, 'client')}`); ctx.refresh({ keepScroll: true, silent: true }); }
    catch (e) { busy(ev.currentTarget, false); toastError(e); }
  });
}
