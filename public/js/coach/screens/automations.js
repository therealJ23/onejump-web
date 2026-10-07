// Automations (prototype V.automations): drafts waiting for approval, the 5 templates
// (on/off, wording, approval), recent runs. Custom automations are V2.
import { api } from '../../shared/api.js';
import { esc, plural, fmtSaved, rel, first } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { avatar, assistBadge, stage, lock } from '../../shared/components.js';
import { openModal, closeModal, modalHead, toast, toastError, busy } from '../../shared/ui.js';
import { editorBlock } from '../../shared/editor.js';
import { refreshCounts } from '../shell.js';

const MINUTES = { missed_workouts: 6, missing_checkin: 2, inactive_7d: 1, milestone: 3, failed_payment: 3 };

export default {
  nav: 'automations',
  title: () => 'Automations',
  load: () => api.get('/api/automations'),
  render(d) {
    const on = d.automations.filter(a => a.enabled).length;
    const saved = d.automations.reduce((n, a) => n + a.runsThisMonth * (MINUTES[a.key] || 2), 0);
    return `
    <div class="page-head"><div><h1 class="h1">Automations</h1><p class="sub">${on} running · ${plural(d.totalRunsThisMonth, 'run')} this month · about ${fmtSaved(saved)} of follow-ups you didn’t have to do</p></div><button class="btn" data-act="newRule">${icon('plus')} New automation ${stage('V2')}</button></div>
    <section class="assist-card pad stack s16"><div class="row between wrap"><div class="row">${assistBadge('Waiting for your OK')}<span class="small muted">Drafted by your automations</span></div></div>
      ${d.pending.length ? d.pending.map(p => `<div class="row top" style="gap:14px" data-pending="${p.id}">${avatar(p.client || { name: '?' }, 'md')}<div class="grow stack s8"><div class="small"><b>${esc(p.client?.name || 'Client')}</b> · ${esc(p.title || '')} ${p.rule ? `<span class="tag">Rule: ${esc(p.rule)}</span>` : ''}</div><div class="q-draft">${esc(p.text)}</div>
        <div class="row wrap"><button class="btn primary sm" data-act="autoApprove" data-id="${p.id}">${icon('check')} Approve & send</button><button class="btn sm" data-act="autoEdit" data-id="${p.id}">${icon('edit')} Edit</button><button class="btn ghost sm" data-act="autoSkip" data-id="${p.id}">Skip</button></div></div></div>`).join('<hr style="border:0;border-top:1px solid var(--line);margin:0">')
      : `<div class="row small">${icon('check')} Nothing waiting. Drafts from your automations show up here and on Today.</div>`}
    </section>
    <section class="stack s8">${d.automations.map(a => `<article class="card pad row top" style="gap:16px;flex-wrap:wrap" aria-label="Automation: ${esc(a.trigger)}">
      <span class="q-icon ${a.enabled ? 'assist' : ''}">${icon('zap')}</span>
      <div class="grow stack s8" style="min-width:240px">
        <div class="row wrap" style="gap:8px"><span class="eyebrow" style="color:var(--assist-ink)">When</span><span class="strong">${esc(a.trigger)}</span></div>
        <div class="row wrap" style="gap:8px"><span class="eyebrow">Then</span><span>${esc(a.action)}</span></div>
        ${a.fixedText ? `<div class="small muted" style="font-style:italic">“${esc(a.template)}”</div>` : ''}
        <div class="row wrap" style="gap:6px"><span class="tag">${plural(a.runsThisMonth, 'run')} this month</span>${a.fixedText ? (a.needsApproval ? '<span class="tag">You approve each one</span>' : '<span class="tag">Sends your fixed message</span>') : a.needsApproval ? '<span class="tag">You approve each message</span>' : '<span class="tag">Notification only</span>'}<span class="tag">Template</span></div>
      </div>
      <div class="row"><button class="btn ghost sm" data-act="editRule" data-id="${a.id}">Edit</button><button class="toggle ${a.enabled ? 'on' : ''}" data-act="ruleToggle" data-id="${a.id}" aria-label="${a.enabled ? 'Turn off' : 'Turn on'}: ${esc(a.trigger)}" aria-pressed="${a.enabled}"></button></div>
    </article>`).join('')}</section>
    <section class="card"><div class="card-head"><div class="h3">Recent runs</div></div><div class="list">
      ${d.recent.map(r => `<div class="li"><span class="tiny faint" style="width:110px;flex:none">${rel(r.at)}</span><div class="grow small">${esc(r.summary || r.outcome)}</div>${r.outcome === 'held' ? '<span class="pill warn">Held for you</span>' : r.outcome === 'drafted' ? '<span class="pill assist">Drafted</span>' : r.outcome === 'sent' ? '<span class="pill good">Sent</span>' : ''}</div>`).join('') || '<div class="pad-sm small muted">No runs yet. They run every hour in the background.</div>'}
    </div></section>`;
  },
  actions: {
    async ruleToggle(el, _e, ctx) {
      const a = ctx.data.automations.find(x => x.id === el.dataset.id);
      try { await api.patch(`/api/automations/${a.id}`, { enabled: !a.enabled }); a.enabled = !a.enabled; ctx.rerender(); toast(a.enabled ? 'Automation on' : 'Automation paused'); }
      catch (e) { toastError(e); }
    },
    editRule(el, _e, ctx) {
      const a = ctx.data.automations.find(x => x.id === el.dataset.id);
      const m = openModal(`${modalHead('Edit automation', esc(a.trigger))}<div class="modal-body">
        <div class="field"><span class="label">Then</span><div class="small">${esc(a.action)}</div></div>
        ${a.fixedText ? `${editorBlock('rl', a.template, null, { label: 'Your message', rows: 4 })}<span class="hint">Use {first} for the client’s first name. This is your own text; Assist doesn’t rewrite it.</span>
        <label class="row small"><input type="checkbox" id="rl-appr" ${a.needsApproval ? 'checked' : ''}> Ask me before each one is sent</label>`
        : a.needsApproval ? `<p class="small muted">Assist writes each message from the client’s context, so every one waits for your OK. That can’t be turned off.</p>` : '<p class="small muted">This one only notifies you. Nothing is sent to the client.</p>'}
        <p class="tiny faint">Custom triggers and actions come with the automation builder in V2.</p>
        </div><div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button>${a.fixedText ? '<button class="btn primary" id="rl-go">Save</button>' : ''}</div>`, { label: 'Edit automation' });
      m.querySelector('#rl-go')?.addEventListener('click', async ev => {
        busy(ev.currentTarget, true);
        try { await api.patch(`/api/automations/${a.id}`, { template: m.querySelector('#rl-text').value, needsApproval: m.querySelector('#rl-appr').checked }); closeModal(); toast('Automation saved'); ctx.refresh(); }
        catch (e) { busy(ev.currentTarget, false); toastError(e); }
      });
    },
    newRule() {
      openModal(`${modalHead('Custom automations')}<div class="modal-body"><div class="row">${stage('V2')} ${lock('PRO')}</div><p class="small">Build your own “when this happens, do that” rules. Coming after launch. For now, the 5 templates on this page cover the follow-ups coaches do most.</p></div><div class="modal-foot"><button class="btn primary" data-act="closeModal">OK</button></div>`, { label: 'Custom automations' });
    },
    async autoApprove(el, _e, ctx) {
      busy(el, true, 'Sending…');
      try {
        await api.post(`/api/insights/${el.dataset.id}/approve`);
        const p = ctx.data.pending.find(x => x.id === el.dataset.id);
        toast(`Sent to ${first(p?.client?.name)}`, { assist: true, undo: async () => { await api.post(`/api/insights/${el.dataset.id}/undo`); ctx.refresh(); } });
        refreshCounts(); ctx.refresh();
      } catch (e) { busy(el, false); toastError(e); }
    },
    async autoSkip(el, _e, ctx) { await api.post(`/api/insights/${el.dataset.id}/dismiss`); refreshCounts(); ctx.refresh(); },
    autoEdit(el, _e, ctx) {
      const p = ctx.data.pending.find(x => x.id === el.dataset.id);
      const m = openModal(`${modalHead('Edit message', `To ${esc(p.client?.name || 'client')}`)}<div class="modal-body">${editorBlock('au', p.text, p.client?.id || null)}</div><div class="modal-foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="au-go">${icon('send')} Send</button></div>`, { label: 'Edit message' });
      m.querySelector('#au-go').addEventListener('click', async ev => {
        busy(ev.currentTarget, true, 'Sending…');
        try { await api.post(`/api/insights/${p.id}/approve`, { text: m.querySelector('#au-text').value }); closeModal(); toast('Sent', { assist: true }); refreshCounts(); ctx.refresh(); }
        catch (e) { busy(ev.currentTarget, false); toastError(e); }
      });
    },
  },
};
