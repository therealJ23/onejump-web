// Ask Assist (prototype V.assistant): questions about the business, answered from the coach's
// own data, with confirmation cards for anything Assist offers to do.
import { api } from '../../shared/api.js';
import { esc } from '../../shared/format.js';
import { icon, arc } from '../../shared/icons.js';
import { assistBadge } from '../../shared/components.js';
import { ui } from '../state.js';
import { hasPlan } from '../state.js';
import { SUGGESTED, chatHtml, chatForm, submitChat } from '../assist.js';

export default {
  nav: 'assist',
  title: () => 'Ask Assist',
  load: async () => (hasPlan('PRO') ? api.get('/api/assist/stats').catch(() => null) : null),
  render(stats) {
    const msgs = ui('chat-main', []);
    const head = `<div class="page-head"><div><h1 class="h1">Ask Assist</h1><p class="sub">Your business assistant · ask by typing or talk with ${icon('mic').replace('class="ico ', 'style="width:14px;height:14px;vertical-align:-2px" class="ico ')}</p></div>${msgs.length ? '<button class="btn" data-act="chatClear" data-key="main">New conversation</button>' : ''}</div>`;
    if (!hasPlan('PRO')) return `${head}<section class="card pad"><div class="upsell">${arc()}<div class="grow stack s4"><div class="h3">Ask Assist is part of Pro</div><div class="muted small">Ask who needs you, who’s drifting, what you made last month, and have Assist prepare messages and reminders for you to confirm. Typing and talking both work.</div></div><a class="btn primary" href="/app/billing">See plans</a></div></section>`;
    return `${head}
    <div class="split" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
      <section class="card pad-lg stack s24" style="min-height:60dvh">
        ${msgs.length ? '' : `<div class="stack s16" data-intro><div class="stack s8"><div class="row">${assistBadge('Ask Assist')}</div><h2 class="h2">What do you want to know about your business?</h2><p class="muted small">Answers come from your own clients, check-ins, workouts, nutrition logs, payments and leads.</p></div><div class="suggest">${SUGGESTED.map(s => `<button data-act="chatAsk" data-key="main" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`}
        <div class="chat" id="chat-main" aria-live="polite">${chatHtml('main')}</div>
        ${chatForm('main', 'Ask anything, e.g. who should I call first today?', true)}
      </section>
      <aside class="stack s16">
        <section class="card pad stack s8"><div class="h3">What Assist can see</div><ul class="config-list small">${[['Your clients, goals and programs', 1], ['Workouts, check-ins and messages', 1], ['Food logs and nutrition targets', 1], ['Payments and packages', 1], ['Leads', 1], ['Other coaches’ data', 0], ['Card numbers', 0]].map(([t, ok]) => `<li>${ok ? icon('check') : icon('x').replace('class="ico ', 'style="color:var(--crit)" class="ico ')}<span>${t}</span></li>`).join('')}</ul><p class="tiny faint">Read-only. Anything Assist offers to do (a message, a note, a lead, reminders) waits for your Confirm.</p></section>
        <section class="card pad stack s8"><div class="h3">What it won’t do</div><p class="small muted">Charges, refunds, plan or price changes, deleting anything, changing nutrition targets, or messaging everyone without review. Do those on their screens.</p></section>
        ${stats ? `<section class="card pad stack s8"><div class="h3">This month</div><div class="row between small"><span class="muted">Questions answered</span><span class="strong">${stats.asked}</span></div><div class="row between small"><span class="muted">Drafts approved</span><span class="strong">${stats.approved}</span></div><div class="row between small"><span class="muted">Approved without edits</span><span class="strong">${stats.asIs == null ? '—' : stats.asIs + '%'}</span></div></section>` : ''}
      </aside>
    </div>`;
  },
  mount(root) { root.querySelector('#chat-main-input')?.focus({ preventScroll: true }); },
  forms: { chat: form => submitChat(form) },
};
