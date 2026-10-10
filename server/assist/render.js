// Turns tool results into the answer the coach sees (HTML, built here from data and escaped)
// and the short line Assist says out loud. Spoken text is at most two short sentences and
// never includes health details: those stay on screen.
import { checkText } from '../ai/safety.js';
import { checkNutritionLanguage } from '../nutrition/language.js';

/** Health or food-behaviour details that stay on screen and are never spoken. */
export const sensitive = t => checkText(t).flagged || checkNutritionLanguage(t).flagged;

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = c => '$' + Math.round((c || 0) / 100).toLocaleString('en-US');
const firstOf = n => String(n || '').split(' ')[0];
const plural = (n, w, p) => `${n} ${n === 1 ? w : (p || w + 's')}`;
const names = (list, max = 3) => { const f = list.map(firstOf); return f.length <= max ? joinAnd(f) : `${f.slice(0, max).join(', ')} and ${f.length - max} more`; };
export const joinAnd = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
export const clientLink = (id, name) => `<a class="client-link" href="/app/clients/${esc(id)}">${esc(name)}</a>`;
const relDays = d => { if (!d) return 'never'; const n = Math.floor((Date.now() - new Date(d)) / 864e5); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 14 ? `${n} days ago` : `${Math.round(n / 7)} weeks ago`; };
const levelPill = l => `<span class="pill ${l === 'HIGH' ? 'crit' : l === 'MEDIUM' ? 'warn' : 'good'}"><span class="dot"></span>${l === 'HIGH' ? 'High' : l === 'MEDIUM' ? 'Medium' : 'Low'}</span>`;

/** At most two short sentences, and nothing health-related read aloud. */
export function speakable(text, max = 220) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().replace(/(\d)\.(\d)/g, '$1\u2024$2');
  const parts = (t.match(/[^.!?]+[.!?]+/g) || [t]).map(p => p.replace(/\u2024/g, '.'));
  let out = '';
  for (const p of parts.slice(0, 2)) { if ((out + p).length > max && out) break; out += p; }
  out = (out || t.replace(/\u2024/g, '.').slice(0, max)).trim();
  return sensitive(out) ? 'I’ve put the details on screen.' : out;
}

function notFound(r, what = 'that client') {
  if (r.ambiguous?.length > 1) return { html: `<p>I found more than one match. Which one?</p><div class="stack s8">${r.ambiguous.map(c => `<div>${clientLink(c.id, c.name)}</div>`).join('')}</div>`, spoken: `I found ${r.ambiguous.length} clients with that name. Pick one on screen.` };
  return { html: `<p>I couldn’t find ${esc(what)} in your clients.</p>`, spoken: `I couldn’t find ${what} in your clients.` };
}

export const RENDER = {
  missing_checkins(r) {
    if (!r.count) return { html: '<p>Everyone has sent this week’s check-in. 🎉</p>', spoken: 'Everyone has checked in this week.' };
    return {
      html: `<p><b>${plural(r.count, 'client')}</b> ${r.count === 1 ? 'hasn’t' : 'haven’t'} sent this week’s check-in:</p><div class="stack s8">${r.clients.map(c => `<div class="row between">${clientLink(c.id, c.name)}<span class="tiny muted">last one ${esc(relDays(c.lastCheckinAt))}</span></div>`).join('')}</div>`,
      spoken: `${plural(r.count, 'client')} ${r.count === 1 ? 'hasn’t' : 'haven’t'} checked in this week: ${names(r.clients.map(c => c.name))}.`,
      followups: ['Remind everyone who hasn’t checked in.'],
    };
  },
  at_risk_clients(r) {
    if (!r.count) return { html: '<p>No one is on the retention radar right now.</p>', spoken: 'No one is at risk right now.' };
    const top = r.clients[0];
    return {
      html: `<p><b>${plural(r.count, 'client')}</b> ${r.count === 1 ? 'shows' : 'show'} warning signs. Highest first:</p><div class="stack s8">${r.clients.map(c => `<div class="panel pad-sm stack s4"><div class="row between">${clientLink(c.id, c.name)}${levelPill(c.level)}</div><div class="tiny muted">${esc(c.reasons.join(' · '))}</div></div>`).join('')}</div>`,
      spoken: `${plural(r.count, 'client')} ${r.count === 1 ? 'shows' : 'show'} warning signs. ${firstOf(top.name)} is highest, at ${top.level === 'HIGH' ? 'high' : 'medium'} risk.`,
      followups: [`Send ${firstOf(top.name)} the drafted message`, 'Who has missed the most workouts?'],
    };
  },
  missed_workouts(r) {
    if (!r.clients.length) return { html: '<p>No missed workouts in the last 14 days.</p>', spoken: 'No one has missed a workout in the last two weeks.' };
    const top = r.clients[0];
    return {
      html: `<p>Most missed workouts in the last 14 days:</p><table class="t"><tbody>${r.clients.map((c, i) => `<tr><td class="small faint" style="width:24px">${i + 1}</td><td>${clientLink(c.id, c.name)}</td><td class="r small strong">${c.missed} missed</td><td class="r small muted">${c.adherence == null ? '—' : c.adherence + '% adherence'}</td></tr>`).join('')}</tbody></table>`,
      spoken: `${firstOf(top.name)} has missed the most, with ${plural(top.missed, 'workout')} in two weeks.`,
    };
  },
  revenue(r) {
    const diff = r.cents - r.previousCents;
    const change = r.previousCents ? `${diff >= 0 ? 'up' : 'down'} ${money(Math.abs(diff))} (${Math.abs(r.changePct)}%) from ${r.previousMonth}` : `with nothing collected in ${r.previousMonth} to compare`;
    const head = r.soFar ? `${r.month} revenue so far is` : `${r.month} revenue was`;
    return { html: `<p>${esc(head)} <b>${esc(money(r.cents))}</b>, ${esc(change)}.</p><p class="small muted">Recurring revenue from active memberships: ${esc(money(r.mrrCents))} a month.</p>`, spoken: `${head} ${money(r.cents)}, ${change}.` };
  },
  unpaid(r) {
    if (!r.failed.length && !r.upcoming.length) return { html: '<p>Everyone is paid up.</p>', spoken: 'Everyone is paid up.' };
    const total = r.failed.reduce((n, p) => n + p.amountCents, 0);
    const due = d => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'soon');
    const rows = [...r.failed.map(p => `<div class="row between">${clientLink(p.clientId, p.name)}<span class="small">${esc(money(p.amountCents))} · <span style="color:var(--crit)">${esc(p.reason)}</span>${p.reminded ? ' · reminded' : ''}</span></div>`),
      ...r.upcoming.map(p => `<div class="row between">${clientLink(p.clientId, p.name)}<span class="small">${esc(money(p.amountCents))} · due ${esc(due(p.dueAt))}</span></div>`)];
    const soon = r.upcoming.length ? `${r.upcoming.length} ${r.upcoming.length === 1 ? 'is' : 'are'} due soon` : '';
    return {
      html: `<p>${r.failed.length ? `${plural(r.failed.length, 'payment')} failed${soon ? ` and ${soon}` : ''}` : `${plural(r.upcoming.length, 'payment')} due soon`}:</p><div class="stack s8">${rows.join('')}</div><div class="row"><a class="btn sm" href="/app/payments">Open payments</a></div>`,
      spoken: r.failed.length ? `${plural(r.failed.length, 'payment')} failed, totaling ${money(total)}.${soon ? ` ${soon.charAt(0).toUpperCase() + soon.slice(1)}.` : ''}` : `${plural(r.upcoming.length, 'payment')} ${r.upcoming.length === 1 ? 'is' : 'are'} due soon.`,
    };
  },
  business_summary(r) {
    const rev = r.revenue;
    const diff = rev.cents - rev.previousCents;
    return {
      html: `<p><b>${esc(rev.month)} so far:</b> ${esc(money(rev.cents))} collected${rev.previousCents ? ` (${esc(rev.previousMonth)}: ${esc(money(rev.previousCents))})` : ''}, ${esc(money(rev.mrrCents))} a month recurring. You have ${plural(r.activeClients, 'active client')}, ${r.newThisMonth} new this month${r.cancelledThisMonth ? ` and ${r.cancelledThisMonth} cancelled` : ' and no cancellations'}.</p>
        <ul class="small" style="margin:0;padding-left:18px">
          <li><b>Watch:</b> ${r.atRiskCount ? `${plural(r.atRiskCount, 'client')} on the radar, led by ${r.atRisk.map(c => clientLink(c.id, c.name)).slice(0, 2).join(' and ')}.` : 'no one on the radar.'} ${r.missingCheckins ? `${plural(r.missingCheckins, 'check-in')} missing this week.` : ''}</li>
          <li><b>Money:</b> ${r.failedCents ? `${esc(money(r.failedCents))} in failed payments (${esc(r.failedNames.map(firstOf).join(', '))}).` : 'no failed payments.'}</li>
          <li><b>Growth:</b> ${r.newLeads ? `${plural(r.newLeads, 'new lead')} to answer` : 'no new leads waiting'}${r.consults.length ? `; consults with ${esc(r.consults.join(', '))}` : ''}.</li>
        </ul>`,
      spoken: `So far this month you’ve collected ${money(rev.cents)}${rev.previousCents ? `, ${diff >= 0 ? 'ahead of' : 'behind'} last month` : ''}, with ${plural(r.activeClients, 'active client')}. ${r.atRiskCount ? `${plural(r.atRiskCount, 'client is', 'clients are')} at risk` : 'No one is at risk'}${r.failedCents ? ` and ${money(r.failedCents)} in payments failed` : ''}.`,
      followups: ['Which clients are at risk of leaving?', 'Which clients haven’t paid?'],
    };
  },
  client_summary(r) {
    if (!r.id) return notFound(r);
    const f = firstOf(r.name);
    const parts = [r.program ? `week ${r.week || 1}${r.weeks ? ` of ${r.weeks}` : ''} of ${r.program}` : 'no program assigned', r.adherence != null ? `${r.adherence}% adherence over 4 weeks` : null, `${plural(r.workoutsDone, 'workout')} done`].filter(Boolean);
    const k = r.checkin;
    return {
      html: `<p><b>${clientLink(r.id, r.name)}</b>: ${esc(parts.join(', '))}.${r.weightChange != null ? ` Weight ${r.weightChange <= 0 ? 'down' : 'up'} ${Math.abs(r.weightChange)} lb since they started logging.` : ''}${r.risk ? ` Risk is ${r.risk.level.toLowerCase()} (${r.risk.score}).` : ''}</p>
        ${r.risk?.reasons?.length ? `<div class="tiny muted">${esc(r.risk.reasons.join(' · '))}</div>` : ''}
        ${k ? `<div class="panel pad-sm stack s4"><div class="row between"><span class="strong small">Latest check-in · ${esc(relDays(k.submittedAt))}</span>${k.flagged ? '<span class="pill crit">Health flag</span>' : ''}</div>${k.summary ? `<div class="small">${esc(k.summary)}</div>` : ''}<a class="tiny" href="/app/checkins/${esc(k.id)}">Open check-in</a></div>` : '<p class="small muted">No check-ins yet.</p>'}`,
      spoken: `${f} is ${r.program ? `in week ${r.week || 1}` : 'without a program'}${r.adherence != null ? `, with ${r.adherence}% adherence` : ''}. ${k?.flagged ? 'Their latest check-in has a flag for you to read on screen.' : r.risk && r.risk.level !== 'LOW' ? `They’re at ${r.risk.level.toLowerCase()} risk.` : 'Details are on screen.'}`,
      followups: [`Read me ${f}’s check-in`, `Send ${f} the drafted message`],
    };
  },
  client_checkin(r) {
    if (!r.id) return notFound(r);
    const f = firstOf(r.name), k = r.checkin;
    if (!k) return { html: `<p>${clientLink(r.id, r.name)} hasn’t sent a check-in yet.</p>`, spoken: `${f} hasn’t sent a check-in yet.` };
    return {
      html: `<div class="panel pad-sm stack s8"><div class="row between"><span class="strong small">${clientLink(r.id, r.name)} · ${esc(relDays(k.submittedAt))}</span>${k.flagged ? '<span class="pill crit">Health flag · read first</span>' : k.status === 'submitted' ? '<span class="pill assist">Needs review</span>' : '<span class="pill good">Reviewed</span>'}</div>
        ${k.summary ? `<div class="small">${esc(k.summary)}</div>` : ''}
        <div class="row wrap tiny muted" style="gap:10px">${k.energy != null ? `<span>Energy ${k.energy}/10</span>` : ''}${k.soreness != null ? `<span>Soreness ${k.soreness}/10</span>` : ''}${k.sleepHours != null ? `<span>Sleep ${k.sleepHours} h</span>` : ''}${k.nutrition != null ? `<span>Nutrition ${k.nutrition}/10</span>` : ''}</div>
        <div><a class="btn sm" href="/app/checkins/${esc(k.id)}">Review check-in</a></div></div>`,
      spoken: k.flagged ? `${f}’s check-in has a health flag, so I’ve put it on screen instead of reading it out.` : speakable(k.summary || `${f} sent a check-in ${relDays(k.submittedAt)}.`),
    };
  },
  nutrition_struggles(r) {
    const lines = [];
    if (r.proteinMisses.length) lines.push(`<p><b>${plural(r.proteinMisses.length, 'client')}</b> missed their protein target most days this week:</p><div class="stack s8">${r.proteinMisses.map(c => `<div class="row between">${clientLink(c.id, c.name)}<span class="tiny muted">hit ${c.hitDays} of ${c.loggedDays} logged days</span></div>`).join('')}</div>`);
    if (r.lowTargets.length) lines.push(`<p class="small"><b>Targets below resting needs:</b> ${r.lowTargets.map(c => clientLink(c.id, c.name) + (c.confirmed ? ' (you reviewed it)' : ' (not reviewed yet)')).join(', ')}.</p>`);
    if (r.notLogging.length) lines.push(`<p class="small"><b>Stopped logging:</b> ${r.notLogging.map(c => clientLink(c.id, c.name)).join(', ')}.</p>`);
    if (r.openFlags) lines.push(`<p class="small"><b>${plural(r.openFlags, 'private flag')}</b> open. They’re on the Nutrition page; only you can see them.</p>`);
    if (!lines.length) return { html: '<p>No one is struggling with nutrition this week, based on what clients logged.</p>', spoken: 'No one stands out on nutrition this week.' };
    return {
      html: lines.join('') + '<div class="row"><a class="btn sm" href="/app/nutrition">Open Nutrition</a></div>',
      spoken: r.proteinMisses.length ? `${plural(r.proteinMisses.length, 'client')} missed protein most days: ${names(r.proteinMisses.map(c => c.name))}. The rest is on screen.` : 'A few things on nutrition need a look. They’re on screen.',
    };
  },
  today_queue(r) {
    if (!r.open) return { html: '<p>You’re all caught up today.</p>', spoken: 'You’re all caught up today.' };
    return { html: `<p><b>${plural(r.open, 'thing needs', 'things need')} you today</b>, ${r.drafted} drafted:</p><ol class="small" style="margin:0;padding-left:20px">${r.items.map(i => `<li>${esc(i.title)}</li>`).join('')}</ol><div class="row"><a class="btn sm" href="/app">Open Today</a></div>`, spoken: `${plural(r.open, 'thing needs', 'things need')} you today. First: ${r.items[0]?.title || 'your queue'}.` };
  },
  active_clients(r) {
    return {
      html: `<p>You have <b>${plural(r.active, 'active client')}</b>${r.newClients.length ? `, including ${r.newClients.length} new (${esc(r.newClients.join(', '))})` : ''}. ${r.paused} paused and ${r.inactive} inactive aren’t counted.</p><p class="small muted">By type: ${r.byMode.Online} online, ${r.byMode.Hybrid} hybrid, ${r.byMode['In person']} in person.</p>`,
      spoken: `You have ${plural(r.active, 'active client')}.`,
    };
  },
};

export const HELP_SUGGESTIONS = ['Who hasn’t checked in this week?', 'Which clients are at risk of leaving?', 'Who has missed the most workouts?', 'Who’s struggling with nutrition this week?', 'What was my revenue last month?', 'Which clients haven’t paid?', 'Give me a summary of my business this month.'];
