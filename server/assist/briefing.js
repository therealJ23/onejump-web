// The morning briefing (Pro): a spoken summary of the coach's day, about 40 seconds.
// Facts come from real data (the Today queue); Assist only words them. Health details are never
// spoken: a flagged check-in is "flagged for you", never "mentioned knee pain".
//   - 6:30 AM in the coach's time zone: build it (one per coach per day)
//   - 7:00 AM: in-app notification (+ optional email), then the Today banner until it's played
import { buildToday } from '../core/queue.js';
import { checkText } from '../ai/safety.js';
import { AI } from '../ai/AIService.js';
import { notify } from '../core/messaging.js';
import { EmailService } from '../email/EmailService.js';
import { config } from '../config.js';
import { todayKey, localYMD, localParts } from '../lib/time.js';
import { isPro, effectivePlan } from '../auth/middleware.js';

export const MAX_WORDS = 120;
const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ORD = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const money = cents => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
const words = s => String(s).split(/\s+/).filter(Boolean).length;
/** Risk reasons that are fine to say out loud (no quotes, food or health). */
const speakableReason = r => !/^Said |food|protein/i.test(r) && !checkText(r).flagged;
const lowerFirst = s => s.charAt(0).toLowerCase() + s.slice(1);

function dayPhrase(tz, now) {
  const fmt = o => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...o }).format(now);
  return `${fmt({ weekday: 'long' })}, ${fmt({ month: 'long' })} ${ORD(Number(fmt({ day: 'numeric' })))}`;
}

/**
 * The facts for one coach's briefing, in speaking order, built from the Today queue.
 * @returns {Promise<{ lines: string[], counts: object }>}
 */
export async function briefingFacts(db, { tz = 'UTC', now = new Date(), coachName = '' } = {}) {
  const t = await buildToday(db, { tz, now });
  const open = t.items.filter(i => (i.status || 'pending') === 'pending');
  const lines = [`Good morning${coachName ? `, ${first(coachName)}` : ''}. It’s ${dayPhrase(tz, now)}.`];

  if (!open.length) lines.push('Nothing needs you right now. You’re all caught up.');
  else {
    const most = t.drafted >= open.length ? 'all of them' : t.drafted * 2 >= open.length ? 'most of them' : t.drafted ? `${t.drafted} of them` : '';
    lines.push(`${plural(open.length, 'thing needs', 'things need')} you today${most ? `, and I’ve drafted ${most}` : ''}.`);
  }

  // The most urgent client (retention radar), with up to two reasons that are fine to say aloud.
  const urgent = open.find(i => i.sev === 'crit' && i.client) || open.find(i => i.sev === 'warn' && i.client);
  if (urgent) {
    const reasons = String(urgent.sub || '').split(' · ').filter(speakableReason).slice(0, 2);
    const why = reasons.length ? ` ${reasons.map((r, i) => (i ? lowerFirst(r).replace(/^latest/, 'the latest') : r)).join(', and ')}.` : '';
    lines.push(`Most urgent: ${urgent.title}.${why} A message is ready for you to approve.`);
  }

  // Check-ins: flagged first, never the details.
  const checkins = open.find(i => i.id === 'checkins');
  if (checkins) {
    const n = Number(checkins.title.match(/^\d+/)?.[0]) || 1;
    const k = await db.checkIn.findMany({ where: { status: 'submitted', flagged: true }, select: { clientId: true }, take: 3 });
    const names = k.length ? (await db.client.findMany({ where: { id: { in: k.map(x => x.clientId) } }, select: { name: true } })).map(c => first(c.name)) : [];
    lines.push(`${plural(n, 'check-in is', 'check-ins are')} ready.${names.length ? ` ${names.length === 1 ? `${names[0]}’s is` : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}’s are`} flagged for you, so read ${names.length === 1 ? 'it' : 'those'} first.` : ''}`);
  }

  // Money
  const pay = open.find(i => i.id === 'payments');
  if (pay) lines.push(`${plural(t.payments.failedCount, 'payment')} failed, totaling ${money(t.payments.failedCents)}. Card-update reminders are ready to send.`);
  const missing = open.find(i => i.id === 'missing');
  if (missing) lines.push(`${plural(t.kpis.missingCheckins, 'client hasn’t', 'clients haven’t')} checked in yet. Friendly reminders are drafted.`);

  // Today's plan (OneJump has no calendar yet, so this is today's scheduled workouts).
  if (t.workoutsToday.scheduled) lines.push(`On the plan today: ${plural(t.workoutsToday.scheduled, 'client workout')}.`);

  // One piece of good news.
  const win = t.items.find(i => i.sev === 'good' && i.title);
  if (win) lines.push(`Good news: ${win.title}. Have a great day.`);
  else if (t.minutesSaved >= 15) lines.push(`Good news: Assist saved you about ${t.minutesSaved >= 90 ? `${Math.round(t.minutesSaved / 60)} hours` : `${t.minutesSaved} minutes`} this week. Have a great day.`);
  else lines.push('Have a great day.');

  return { lines, counts: { open: open.length, drafted: t.drafted, checkins: checkins ? 1 : 0, failedPayments: pay ? t.payments.failedCount : 0, workouts: t.workoutsToday.scheduled } };
}

/** Keeps the worded lines safe to speak and under about 120 words. */
export function tidyLines(lines, fallback) {
  let out = (lines || []).map(l => String(l).replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!out.length || out.some(l => checkText(l).flagged)) out = fallback.filter(l => !checkText(l).flagged); // never read health details aloud
  while (out.length > 2 && words(out.join(' ')) > MAX_WORDS) out.splice(out.length - 2, 1); // drop the least important middle line
  return out.slice(0, 8);
}

/**
 * Builds (or rebuilds) today's briefing for one coach and stores it.
 * @param {*} db coach-level tenant client
 */
export async function buildBriefing(db, { userId, coachName = '', style = 'Supportive', tz = 'UTC', now = new Date(), force = false }) {
  const date = todayKey(tz, now);
  const existing = await db.briefing.findFirst({ where: { userId, date } });
  if (existing && !force) return existing;
  const facts = await briefingFacts(db, { tz, now, coachName });
  let worded = facts.lines;
  try { worded = (await AI.wordBriefing({ coach: { name: coachName, style }, facts }, { db })).data.lines; } catch { /* use the facts as written */ }
  const lines = tidyLines(worded, facts.lines);
  const data = { script: lines.join(' '), lines };
  if (existing) return db.briefing.update({ where: { id: existing.id }, data });
  try { return await db.briefing.create({ data: { userId, date, ...data } }); }
  catch { return db.briefing.findFirst({ where: { userId, date } }); } // built at the same moment elsewhere
}

export const shapeBriefing = b => ({ id: b.id, date: b.date.toISOString().slice(0, 10), lines: Array.isArray(b.lines) ? b.lines : [b.script], words: words(b.script), seconds: Math.round(words(b.script) / 2.6), createdAt: b.createdAt, notifiedAt: b.notifiedAt, playedAt: b.playedAt || null });

/**
 * Every 15 minutes: for each Pro workspace, build each coach's briefing from 6:30 AM local time,
 * and send the 7 AM notification (plus email when the coach turned it on).
 * @param {{ businesses: {id:string,timezone:string}[], dbForBusiness: Function, coachesFor: Function }} deps
 */
export async function briefingTick(now, { list, dbForBusiness, coachesFor }) {
  const out = { built: 0, notified: 0 };
  for (const b of list) {
    const { hour } = localParts(b.timezone, now);
    const minute = Number(new Intl.DateTimeFormat('en-US', { timeZone: b.timezone, minute: 'numeric' }).format(now));
    const mins = hour * 60 + minute;
    if (mins < 6 * 60 + 30 || hour >= 12) continue; // mornings only
    const db = dbForBusiness(b.id);
    try {
      const biz = await db.business.findFirst({ select: { plan: true, planStatus: true, trialEndsAt: true, settings: true, writingStyle: true } });
      if (!isPro(effectivePlan(biz))) continue;
      for (const coach of await coachesFor(b.id)) {
        const br = await buildBriefing(db, { userId: coach.userId, coachName: coach.name, style: biz.writingStyle || 'Supportive', tz: b.timezone, now });
        if (+br.createdAt >= +now - 60e3) out.built++;
        if (mins >= 7 * 60 && !br.notifiedAt) {
          const claimed = await db.briefing.updateMany({ where: { id: br.id, notifiedAt: null }, data: { notifiedAt: now } });
          if (!claimed.count) continue;
          await notify(db, { kind: 'assist', title: `Your morning briefing is ready${coach.name ? `, ${first(coach.name)}` : ''}`, body: `${(br.lines?.length || 1)} short lines · about ${Math.max(20, Math.round(words(br.script) / 2.6))} seconds`, link: '/app?briefing=1' });
          if (biz.settings?.notifications?.briefingEmail && coach.email) {
            await EmailService.sendCoachAlert({ to: coach.email, subject: `Your morning briefing · ${localYMD(b.timezone, now)}`, text: br.lines.join('\n'), link: `${config.appUrl}/app?briefing=1`, linkLabel: 'Play it in OneJump' }).catch(e => console.error('[briefing] email failed:', e.message));
          }
          out.notified++;
        }
      }
    } catch (e) { console.error(`[briefing] business ${b.id}:`, e.message); }
  }
  return out;
}
