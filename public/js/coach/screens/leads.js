// Leads (Pro; prototype V.leads, MVP scope): pasted DMs and booking-page requests in a
// simple pipeline, follow-up drafts the coach copies back, one-tap convert to client.
import { api } from '../../shared/api.js';
import { micButton } from '../../shared/dictation.js';
import { esc, money, plural, daysAgo, fmtDate, first } from '../../shared/format.js';
import { icon, arc } from '../../shared/icons.js';
import { assistBadge, thinking, lock, emptyState } from '../../shared/components.js';
import { openModal, closeModal, modalHead, toast, toastError, busy, copyText } from '../../shared/ui.js';
import { hasPlan, biz } from '../state.js';
import { newLead } from '../modals.js';
import { refreshCounts } from '../shell.js';

const STAGES = [['new', 'New lead'], ['contacted', 'Contacted'], ['consult', 'Consultation'], ['trial', 'Trial'], ['active', 'Became a client']];
const SOURCE = { instagram_dm: 'Instagram DM', booking_page: 'Booking page', referral: 'Referral', walk_in: 'Walk-in', google: 'Google', other: 'Other' };
const OPEN = ['new', 'contacted', 'consult', 'trial'];

function nextStep(l) {
  if (l.stage === 'new') return ['Reply today', 'warn'];
  if (l.stage === 'contacted') return l.nextFollowUpAt && new Date(l.nextFollowUpAt) <= new Date() ? ['Follow up today', 'warn'] : [`Follow up ${l.nextFollowUpAt ? fmtDate(l.nextFollowUpAt) : 'later'}`, 'muted'];
  if (l.stage === 'consult') return ['Consultation requested', 'strong'];
  if (l.stage === 'trial') return ['On a trial', 'muted'];
  return ['', 'muted'];
}

function card(l) {
  const [next, tone] = nextStep(l), age = daysAgo(l.lastContactAt || l.createdAt);
  return `<div class="kcard" draggable="true" data-lead="${l.id}" tabindex="0" aria-label="${esc(l.name)}, ${esc(STAGES.find(s => s[0] === l.stage)?.[1] || l.stage)}">
    <div class="row between"><span class="strong small">${esc(l.name)}</span><span class="tiny faint">${age === 0 ? 'Today' : age + 'd'}</span></div>
    <div class="tiny muted">${esc(l.goal || 'Goal not given yet')}</div>
    <div class="row wrap" style="gap:4px"><span class="tag">${esc(SOURCE[l.source] || l.source)}</span>${l.valueCents ? `<span class="tag">${money(l.valueCents)}/mo</span>` : ''}</div>
    ${OPEN.includes(l.stage) ? `<div class="row between" style="margin-top:2px;gap:6px"><span class="tiny ${tone === 'strong' ? 'strong' : tone === 'warn' ? 'strong' : 'muted'}" style="${tone === 'warn' ? 'color:var(--warn)' : ''}">${esc(next)}</span><span class="row" style="gap:4px"><button class="btn xs assist" data-act="leadDraft" data-lead="${l.id}">${arc()} Draft</button><button class="btn xs" data-act="leadMenu" data-lead="${l.id}" aria-label="More for ${esc(l.name)}">${icon('more')}</button></span></div>` : l.convertedClientId ? `<a class="tiny" href="/app/clients/${l.convertedClientId}">Open client profile</a>` : ''}
  </div>`;
}

export default {
  nav: 'leads',
  title: () => 'Leads',
  load: () => (hasPlan('PRO') ? api.get('/api/leads') : Promise.resolve(null)),
  render(d) {
    const head = `<div class="page-head"><div><h1 class="h1">Leads</h1><p class="sub">From first message to client</p></div><div class="row wrap"><a class="btn" href="/coach/${esc(biz().slug)}" target="_blank" rel="noopener">${icon('globe')} Booking page</a><button class="btn primary" data-act="newLeadHere" ${hasPlan('PRO') ? '' : 'disabled'}>${icon('plus')} Add lead</button></div></div>`;
    if (!d) return `${head}<section class="card">${emptyState('funnel', 'Leads are part of Pro', 'Paste DMs and let Assist fill in the lead and draft your reply, share a booking page, and turn leads into clients in one tap.', `<div class="row" style="justify-content:center">${lock('PRO')}<a class="btn primary" href="/app/billing">See plans</a></div>`)}</section>`;
    const leads = d.leads.filter(l => l.stage !== 'lost' && l.stage !== 'retained');
    const s = d.stats;
    return `${head}
    <section class="kpis">
      <div class="kpi"><span class="eyebrow">Open leads</span><span class="big-num">${s.open}</span><span class="tiny muted">${plural(s.needReply, 'needs', 'need')} a first reply</span></div>
      <div class="kpi"><span class="eyebrow">Pipeline value</span><span class="big-num">${money(s.pipelineCents)}</span><span class="tiny muted">per month if all convert</span></div>
      <div class="kpi"><span class="eyebrow">Follow-ups due</span><span class="big-num">${s.followUps}</span><span class="tiny muted">no reply in 3 days</span></div>
      <div class="kpi"><span class="eyebrow">Became clients</span><span class="big-num">${d.leads.filter(l => l.convertedClientId).length}</span><span class="tiny muted">all time</span></div>
    </section>
    ${d.leads.length ? `<div class="kanban" id="kanban">${STAGES.map(([k, l]) => { const xs = leads.filter(x => x.stage === k); return `<div class="kcol" data-stage="${k}" aria-label="${l}"><div class="row between"><span class="strong small">${l}</span><span class="pill">${xs.length}</span></div>${xs.map(card).join('')}</div>`; }).join('')}</div>
    <p class="tiny faint">Drag cards between stages, or use the ⋯ menu. Leads come from your booking page and anything you paste in. Instagram DM sync comes in V2.</p>`
    : `<section class="card">${emptyState('funnel', 'No leads yet', 'Paste a DM from Instagram and Assist fills in the lead and drafts your reply. Put your booking page link in your Instagram bio to get consultation requests here.', `<button class="btn primary" data-act="newLeadHere">${icon('plus')} Add lead</button>`)}</section>`}`;
  },
  mount(root, d, _p, ctx) {
    if (!d) return;
    let drag = null;
    root.querySelectorAll('.kcard').forEach(c => c.addEventListener('dragstart', e => { drag = c.dataset.lead; e.dataTransfer.setData('text/plain', drag); }));
    root.querySelectorAll('.kcol').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', () => col.classList.remove('over'));
      col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('over'); if (drag) moveTo(ctx, drag, col.dataset.stage); drag = null; });
    });
  },
  actions: {
    newLeadHere() { newLead(); },
    async leadDraft(el, _e, ctx) {
      const l = ctx.data.leads.find(x => x.id === el.dataset.lead);
      const m = openModal(`${modalHead(`Follow up with ${esc(l.name)}`, `${esc(SOURCE[l.source] || l.source)} · goal: ${esc(l.goal || 'not given')}`)}<div class="modal-body" id="ld-body">${thinking()}</div><div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn" id="ld-copy">${icon('copy')} Copy</button>${l.stage === 'new' || l.stage === 'contacted' ? `<button class="btn primary" id="ld-mark">${icon('check')} Copy & mark contacted</button>` : ''}</div>`, { label: 'Follow up' });
      try {
        const r = await api.get(`/api/leads/${l.id}/draft`);
        m.querySelector('#ld-body').innerHTML = `${r.assist ? `<div class="row">${assistBadge('Drafted from their message')}</div>` : ''}<div class="field"><div class="row between"><label for="ld-text">Message</label>${micButton('ld-text', { cls: 'btn ghost icon sm' })}</div><textarea class="textarea" id="ld-text" rows="6">${esc(r.text)}</textarea></div><p class="tiny muted">Copy it into Instagram, text or email. OneJump doesn’t message leads directly.</p>`;
      } catch (e) { m.querySelector('#ld-body').innerHTML = `<p class="small">${esc(e.message)}</p>`; }
      m.querySelector('#ld-copy').addEventListener('click', () => copyText(m.querySelector('#ld-text')?.value || ''));
      m.querySelector('#ld-mark')?.addEventListener('click', async ev => {
        await copyText(m.querySelector('#ld-text')?.value || '');
        busy(ev.currentTarget, true);
        try { await api.patch(`/api/leads/${l.id}`, { stage: 'contacted' }); closeModal(); toast(`${first(l.name)} marked contacted. Follow-up reminder in 3 days.`); refreshCounts(); ctx.refresh(); } catch (e) { busy(ev.currentTarget, false); toastError(e); }
      });
    },
    leadMenu(el, _e, ctx) {
      const l = ctx.data.leads.find(x => x.id === el.dataset.lead);
      const m = openModal(`${modalHead(esc(l.name), esc(l.contact || SOURCE[l.source] || ''))}<div class="modal-body">
        ${l.firstMessage ? `<div class="stack s4"><div class="eyebrow">Their message</div><blockquote class="small" style="margin:0;padding:10px 14px;border-left:3px solid var(--line-strong);background:var(--surface-2);border-radius:0 10px 10px 0">${esc(l.firstMessage)}</blockquote></div>` : ''}
        <div class="field"><label for="lm-stage">Stage</label><select class="select" id="lm-stage">${[...STAGES.filter(s => s[0] !== 'active'), ['lost', 'Not interested']].map(([k, t]) => `<option value="${k}" ${l.stage === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="panel pad-sm stack s8"><div class="strong small">Became a client?</div><div class="field"><label for="lm-email">Their email (for the app invite)</label><input class="input" id="lm-email" type="email" value="${esc(/@/.test(l.contact || '') ? l.contact : '')}" placeholder="name@example.com"></div><div><button class="btn primary sm" id="lm-convert">${icon('user')} Convert to client</button></div></div>
        </div><div class="modal-foot"><button class="btn" data-act="closeModal">Close</button><button class="btn primary" id="lm-save">Save stage</button></div>`, { label: l.name });
      m.querySelector('#lm-save').addEventListener('click', async () => { closeModal(); await moveTo(ctx, l.id, m.querySelector('#lm-stage').value); });
      m.querySelector('#lm-convert').addEventListener('click', async ev => {
        busy(ev.currentTarget, true, 'Converting…');
        try {
          const r = await api.post(`/api/leads/${l.id}/convert`, { email: m.querySelector('#lm-email').value.trim() || undefined });
          closeModal();
          toast(r.emailed ? `${first(l.name)} is a client. App invite sent.` : `${first(l.name)} is a client. Copy their invite link from the profile.`);
          refreshCounts(); ctx.navigate(`/app/clients/${r.client.id}`);
        } catch (e) { busy(ev.currentTarget, false); toastError(e); }
      });
    },
  },
};

async function moveTo(ctx, id, stage) {
  const l = ctx.data.leads.find(x => x.id === id);
  if (!l || l.stage === stage) return;
  if (stage === 'active') { toast('Use “Convert to client” in the ⋯ menu so they get the app invite.'); return; }
  try { await api.patch(`/api/leads/${id}`, { stage }); toast(`${l.name} → ${stage === 'lost' ? 'Not interested' : STAGES.find(s => s[0] === stage)?.[1]}`); refreshCounts(); ctx.refresh(); }
  catch (e) { toastError(e); }
}
