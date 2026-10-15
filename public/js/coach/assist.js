// Ask Assist chat (page, copilot drawer and Talk to Assist share it) plus the confirmation
// cards for anything Assist proposes. Proposals never run until the coach taps Confirm.
import { api } from '../shared/api.js';
import { esc, first } from '../shared/format.js';
import { icon, arc } from '../shared/icons.js';
import { avatar, thinking } from '../shared/components.js';
import { toast, toastError, busy, openDrawer } from '../shared/ui.js';
import { ui } from './state.js';
import { refreshCounts } from './shell.js';
import { micButton } from '../shared/dictation.js';
import { getLang } from '../shared/i18n.js';

export const SUGGESTED = ['Who hasn’t checked in this week?', 'Which clients are at risk of leaving?', 'Who has missed the most workouts?', 'Who’s struggling with nutrition this week?', 'What was my revenue last month?', 'Which clients haven’t paid?', 'Remind everyone who hasn’t checked in', 'Give me a summary of my business this month.'];
const SOURCES = { instagram_dm: 'Instagram DM', booking_page: 'Booking page', referral: 'Referral', walk_in: 'Walk-in', google: 'Google', other: 'Other' };

/** Listeners (Talk to Assist) that want to know when a proposal was confirmed or cancelled. */
export const proposalEvents = new EventTarget();
/** Proposals already confirmed or cancelled in this tab (so re-drawing the chat keeps them done). */
const decided = new Map();

// ---------------------------------------------------------------- proposal cards
const doneHtml = done => (done.confirmed ? `<div class="row small">${icon('check')}<span>${esc(done.message || 'Done.')}</span><span class="muted">${done.via === 'voice' ? 'You said yes.' : 'You confirmed it.'}</span></div>` : `<div class="small muted">${esc(done.message || 'Cancelled. Nothing was done.')}</div>`);
/** A proposal answered by voice (or a typed yes/no): remember it and update its card if it's on screen. */
export function markDecided(id, confirmed, message, via = 'voice') {
  const done = { confirmed, message: confirmed ? message : (message || 'Cancelled. Nothing was done.'), via };
  decided.set(id, done);
  document.querySelectorAll(`[data-proposal="${CSS.escape(id)}"]`).forEach(card => { card.innerHTML = doneHtml(done); });
  if (confirmed) refreshCounts();
}
const MEAL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];
function nutritionPlanBody(d) {
  const x = d.draft || {}, nums = x.calories != null;
  return `<div class="row">${avatar({ name: d.clientName }, 'sm')}<span class="strong small grow">Nutrition plan for ${esc(d.clientName)}</span><span class="tiny faint">Assist draft</span></div>
    <div class="small" data-no-translate>${esc(x.summary || d.line || '')}</div>
    ${x.needsProfessional ? `<div class="target-warn small">${icon('alert')} <span>${esc(x.professionalReason || '')}</span> <span>A registered dietitian or doctor should guide it.</span></div>` : ''}
    ${nums ? `<div class="grid g4 small" style="grid-template-columns:repeat(4,minmax(0,1fr))">${[['Calories', x.calories.toLocaleString('en-US')], ['Protein', `${x.proteinG} g`], ['Carbs', `${x.carbsG} g`], ['Fat', `${x.fatG} g`]].map(([l, v]) => `<div><div class="tiny faint">${l}</div><div class="strong">${v}</div></div>`).join('')}</div>` : ''}
    ${(d.notes || []).map(n => `<div class="tiny muted">• ${esc(n)}</div>`).join('')}
    ${x.habits?.length ? `<div class="small"><span class="tiny faint">Daily habits</span><div data-no-translate>${x.habits.map(h => `<span class="tag">${esc(h)}</span>`).join(' ')}</div></div>` : ''}
    ${x.mealPlan ? `<details class="small"><summary style="cursor:pointer">${esc(x.mealPlan.name)} · ${x.mealPlan.days.length}-day meal plan</summary><div class="stack s8" style="margin-top:6px">${x.mealPlan.days.map(day => `<div><div class="strong tiny">${esc(day.label)}</div>${[...day.meals].sort((a, b) => ORDER.indexOf(a.meal) - ORDER.indexOf(b.meal)).map(m => `<div class="tiny"><span class="muted">${MEAL[m.meal]}:</span> <span data-no-translate>${m.items.map(esc).join('; ')}</span></div>`).join('')}</div>`).join('')}</div></details>` : ''}
    ${d.scopeReminder ? `<div class="tiny muted">${icon('alert')} ${esc(d.scopeReminder)}</div>` : ''}
    ${x.coachNote ? `<div class="tiny"><span class="faint">Note for ${esc(first(d.clientName))}:</span> <span data-no-translate>“${esc(x.coachNote)}”</span></div>` : ''}`;
}

export function proposalCard(p) {
  const done = decided.get(p.id);
  if (done) return `<div class="proposal" data-proposal="${esc(p.id)}">${doneHtml(done)}</div>`;
  const d = p.payload || {};
  const id = esc(p.id);
  const foot = (confirm, extra = '') => `<div class="row wrap"><button class="btn primary sm" data-act="proposalConfirm" data-id="${id}">${confirm}</button>${extra}<button class="btn sm" data-act="proposalCancel" data-id="${id}">Cancel</button></div>`;
  let body = '';
  if (p.type === 'send_message') {
    body = `<div class="row">${avatar({ name: d.clientName }, 'sm')}<span class="strong small grow">Message to ${esc(d.clientName)}</span>${d.fromDraft ? '<span class="tiny faint">Assist draft</span>' : '<span class="tiny faint">your words</span>'}</div>
      <div class="q-draft" id="pt-${id}" data-no-translate>${esc(d.text)}</div>
      ${foot(`${icon('send')} Confirm and send`, `<button class="btn sm" data-act="proposalEdit" data-id="${id}">${icon('edit')} Edit</button>`)}`;
  } else if (p.type === 'create_lead') {
    body = `<div class="strong small">New lead</div>
      <div class="grid g3 small"><div><div class="tiny faint">Name</div>${esc(d.name)}</div><div><div class="tiny faint">Goal</div>${esc(d.goal || 'Not given')}</div><div><div class="tiny faint">Source</div>${esc(SOURCES[d.source] || 'Other')}</div></div>
      ${foot('Save lead')}`;
  } else if (p.type === 'send_reminders') {
    body = `<div class="strong small">Check-in reminder to ${d.recipients.length} client${d.recipients.length === 1 ? '' : 's'}</div>
      <div class="row wrap" style="gap:6px">${d.recipients.map(n => `<span class="tag">${esc(n)}</span>`).join('')}</div>
      <div class="q-draft" id="pt-${id}" data-no-translate>${esc(d.template)}</div><div class="tiny faint">Your fixed reminder. {first} becomes each client’s first name; each client gets it individually.</div>
      ${foot(`${icon('send')} Send all ${d.recipients.length}`, `<button class="btn sm" data-act="proposalEdit" data-id="${id}">${icon('edit')} Edit</button>`)}`;
  } else if (p.type === 'add_note') {
    body = `<div class="row">${avatar({ name: d.clientName }, 'sm')}<span class="strong small">Private note on ${esc(d.clientName)}’s profile</span></div>
      <div class="q-draft" id="pt-${id}" data-no-translate>${esc(d.text)}</div>
      ${foot('Save note', `<button class="btn sm" data-act="proposalEdit" data-id="${id}">${icon('edit')} Edit</button>`)}`;
  }
  else if (p.type === 'reply_checkin') {
    body = `<div class="row">${avatar({ name: d.clientName }, 'sm')}<span class="strong small grow">Reply to ${esc(d.clientName)}’s check-in</span><span class="tiny faint">marks it reviewed</span></div>
      <div class="q-draft" id="pt-${id}" data-no-translate>${esc(d.text)}</div>
      ${foot(`${icon('send')} Confirm and send`, `<button class="btn sm" data-act="proposalEdit" data-id="${id}">${icon('edit')} Edit</button><a class="btn ghost sm" href="/app/checkins/${esc(d.checkinId)}">Open check-in</a>`)}`;
  } else if (p.type === 'assign_program') {
    body = `<div class="row">${avatar({ name: d.clientName }, 'sm')}<span class="strong small">Start ${esc(d.clientName)} on ${esc(d.programName)}</span></div>
      <div class="tiny muted"><span>${d.weeks ? `${d.weeks} weeks` : ''}${d.daysPerWeek ? ` · ${d.daysPerWeek} days a week` : ''}</span> · <span>${d.startDate ? `Starts ${esc(d.startDate)}` : 'Starts next Monday'}</span></div>
      ${foot('Start program')}`;
  } else if (p.type === 'nutrition_plan') {
    body = `${nutritionPlanBody(d)}${foot(`${icon('check')} Use this plan`, `<a class="btn ghost sm" href="/app/clients/${esc(d.clientId)}/nutrition">Open Nutrition tab</a>`)}`;
  }
  return `<div class="proposal" data-proposal="${id}" role="group" aria-label="${esc(p.summary)}">${body}<div class="tiny faint">${d.voiceOk === false ? 'Has health details, so it’s on screen only: tap to confirm. Expires in 10 minutes.' : 'Nothing happens until you confirm or say yes. Expires in 10 minutes.'}</div></div>`;
}

export const proposalActions = {
  proposalEdit(el) {
    const box = document.getElementById(`pt-${el.dataset.id}`); if (!box || box.tagName === 'TEXTAREA') return;
    const ta = document.createElement('textarea');
    ta.className = 'textarea'; ta.id = box.id; ta.rows = 4; ta.value = box.textContent; ta.setAttribute('aria-label', 'Edit before confirming');
    box.replaceWith(ta); ta.focus();
    el.remove();
  },
  async proposalConfirm(el) {
    const id = el.dataset.id, card = el.closest('.proposal');
    const ta = card.querySelector('textarea');
    busy(el, true, 'Working…');
    try {
      const r = await api.post(`/api/assist/proposals/${id}/confirm`, ta ? { text: ta.value.trim() } : {});
      decided.set(id, { confirmed: true, message: r.message, via: 'tap' });
      card.innerHTML = doneHtml(decided.get(id));
      proposalEvents.dispatchEvent(new CustomEvent('done', { detail: { id, confirmed: true, message: r.message } }));
      refreshCounts();
    } catch (e) {
      busy(el, false);
      // Already done, expired, or failed partway (never repeated): the card is finished either way.
      if (e.status === 409 || e.data?.code === 'proposal_failed') { decided.set(id, { confirmed: false, message: e.message }); card.innerHTML = `<div class="small ${e.data?.code === 'proposal_failed' ? 'form-error' : 'muted'}" role="alert">${esc(e.message)}</div>`; proposalEvents.dispatchEvent(new CustomEvent('done', { detail: { id, confirmed: false, message: e.message } })); }
      else toastError(e);
    }
  },
  async proposalCancel(el) {
    const id = el.dataset.id, card = el.closest('.proposal');
    let msg = 'Cancelled. Nothing was done.', spoken = 'Okay, I won’t do that.';
    try { await api.post(`/api/assist/proposals/${id}/cancel`); }
    catch (e) { if (e.status !== 409) { toastError(e); return; } msg = spoken = e.message; } // e.g. it was already done in another tab
    decided.set(id, { confirmed: false, message: msg });
    card.innerHTML = `<div class="small muted" role="status">${esc(msg)}</div>`;
    proposalEvents.dispatchEvent(new CustomEvent('done', { detail: { id, confirmed: false, message: spoken } }));
  },
};

// ---------------------------------------------------------------- chat
export function answerBlock(r) {
  return `${r.answerHtml || ''}${(r.proposals || []).map(proposalCard).join('')}${r.trace?.length ? `<div class="trace">${r.trace.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}`;
}
export function chatHtml(key) {
  return ui(`chat-${key}`, []).map(m => m.role === 'q' ? `<div class="q">${esc(m.text)}</div>`
    : `<div class="a"><span class="who">${arc()}</span><div class="body">${m.pending ? thinking('Looking at your data…') : m.error ? `<p class="small" style="color:var(--crit)">${esc(m.error)}</p>` : answerBlock(m.r)}${m.r?.followups?.length ? `<div class="suggest">${m.r.followups.map(f => `<button data-act="chatAsk" data-key="${esc(key)}" data-q="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : ''}</div></div>`).join('');
}
function refreshChat(key) {
  const el = document.getElementById(`chat-${key}`); if (!el) return;
  el.innerHTML = chatHtml(key);
  const drawer = el.closest('.drawer-body');
  if (drawer) drawer.scrollTop = drawer.scrollHeight; else el.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
export async function chatAsk(key, q) {
  const msgs = ui(`chat-${key}`, []);
  msgs.push({ role: 'q', text: q });
  const a = { role: 'a', pending: true }; msgs.push(a);
  refreshChat(key);
  const history = msgs.slice(0, -2).filter(m => m.role === 'q' ? m.text : m.r).slice(-12).map(m => ({ role: m.role === 'q' ? 'user' : 'assistant', text: m.role === 'q' ? m.text : (m.r.answerText || m.r.spokenText || '') })).filter(m => m.text);
  try { a.r = await api.post('/api/assist/ask', { question: q, history, lang: getLang() }); if (a.r.action === 'briefing') import('./voice.js').then(m => m.openBriefing()); }
  catch (e) { a.error = e.message; }
  a.pending = false;
  refreshChat(key);
}

export function chatForm(key, placeholder = 'Ask Assist…', big = false) {
  return `<form class="row" data-form="chat" data-key="${esc(key)}" style="${big ? 'margin-top:auto' : ''}"><label class="grow"><span class="sr">Ask Assist</span><input class="input" id="chat-${esc(key)}-input" name="q" placeholder="${esc(placeholder)}" autocomplete="off" maxlength="600" style="border-radius:999px;${big ? 'min-height:48px;padding-left:18px' : ''}"></label>${micButton(`chat-${key}-input`, { style: big ? 'height:48px;width:48px' : '' })}<button class="btn icon" type="button" data-act="talk" aria-label="Talk to Assist" title="Talk to Assist (spoken answers)"${big ? ' style="height:48px;width:48px"' : ''}>${icon('speaker')}</button><button class="btn assist ${big ? '' : 'icon'}" type="submit" aria-label="Ask"${big ? ' style="height:48px"' : ''}>${big ? `${arc()} Ask` : icon('send')}</button></form>`;
}

export const chatActions = {
  chatAsk(el) {
    const key = el.dataset.key;
    if (key === 'main') document.querySelector('#view [data-intro]')?.remove();
    chatAsk(key, el.dataset.q);
  },
  chatClear(el, _e, ctx) { ui(`chat-${el.dataset.key}`, []).length = 0; ctx?.rerender?.(); },
  copilot(el) { return import('./voice.js').then(m => m.openTalk(el?.dataset?.q)); }, // the green Ask Assist button
};
export function submitChat(form) {
  const key = form.dataset.key, input = form.q, v = input.value.trim();
  if (!v) { input.focus(); return; }
  input.value = '';
  if (key === 'main') document.querySelector('#view [data-intro]')?.remove();
  chatAsk(key, v);
}

export function openCopilot(q) {
  const key = 'drawer';
  const sugg = ['Give me a summary of my business this month.', 'Which clients are at risk of leaving?', 'Who hasn’t checked in this week?'];
  const d = openDrawer(`<div class="drawer-head"><span class="assist-badge">${arc()}Assist</span><div class="grow small muted">Ask about your business</div><a class="btn ghost sm" href="/app/assist">Full page</a><button class="btn ghost icon sm" data-act="closeDrawer" aria-label="Close">${icon('x')}</button></div>
    <div class="drawer-body"><div class="suggest">${sugg.map(s => `<button data-act="chatAsk" data-key="${key}" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div><div class="chat" id="chat-${key}">${chatHtml(key)}</div></div>
    <div class="drawer-foot">${chatForm(key)}<div class="tiny faint" style="margin-top:8px">Assist answers from your own data and drafts for you to confirm. It doesn’t give medical advice.</div></div>`, 'Ask Assist');
  setTimeout(() => d.querySelector('input[name="q"]')?.focus(), 50);
  if (q) chatAsk(key, q);
}

export const firstName = first;
