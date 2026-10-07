// The Today screen: one queue instead of ten tabs, most urgent first, plus the numbers.
import { todayKey, weekStart, addDays, localYMD } from '../lib/time.js';
import { draftText } from './actions.js';
import { revenueSummary } from './money.js';
import { fillTemplate } from './automationTemplates.js';
import { effectivePlan } from '../auth/middleware.js';

const plural = (n, w, p) => `${n} ${n === 1 ? w : (p || w + 's')}`;
const firstOf = n => String(n || '').split(' ')[0];
const listNames = names => names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;

/** Minutes Assist saved this week (approved/edited drafts, applied suggestions, automation sends). */
export async function minutesSavedThisWeek(db, tz = 'UTC', now = new Date()) {
  const since = weekStart(todayKey(tz, now));
  const decided = await db.aIInsight.findMany({ where: { status: { in: ['approved', 'edited'] }, decidedAt: { gte: since } }, select: { minutesSaved: true } });
  const applied = await db.aIInsight.findMany({ where: { createdAt: { gte: addDays(since, -7) }, kind: { in: ['checkin_summary', 'adjustment'] } }, select: { draft: true } });
  const sent = await db.automationRun.count({ where: { outcome: { in: ['sent', 'notified'] }, createdAt: { gte: since } } });
  return decided.reduce((n, i) => n + (i.minutesSaved || 0), 0) + applied.reduce((n, i) => n + (i.draft?.appliedMinutes || 0), 0) + sent * 2;
}

export async function buildToday(db, { tz = 'UTC', now = new Date() } = {}) {
  const business = await db.business.findFirst();
  const plan = effectivePlan(business);
  const pro = ['TRIAL', 'PRO', 'STUDIO'].includes(plan);
  const today = todayKey(tz, now);
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const clients = await db.client.findMany({ orderBy: { name: 'asc' } });
  const byId = new Map(clients.map(c => [c.id, c]));
  const active = clients.filter(c => c.status === 'ACTIVE' || c.status === 'NEW');
  const items = [];

  // 1. Check-ins ready for review (pain mentioned → read first)
  const toReview = await db.checkIn.findMany({ where: { status: 'submitted' }, orderBy: [{ flagged: 'desc' }, { submittedAt: 'asc' }] });
  if (toReview.length) {
    const flagged = toReview.filter(k => k.flagged).map(k => firstOf(byId.get(k.clientId)?.name));
    items.push({
      id: 'checkins', cat: 'clients', sev: 'assist', icon: 'clipboard',
      title: `${plural(toReview.length, 'check-in')} ready for review`,
      sub: `${listNames(toReview.map(k => firstOf(byId.get(k.clientId)?.name)))}. Summaries and replies are drafted.${flagged.length ? ` ${flagged.join(' and ')} mention${flagged.length === 1 ? 's' : ''} pain or a medical topic, so read ${flagged.length === 1 ? 'that one' : 'those'} first.` : ''}`,
      actions: [{ label: 'Review check-ins', go: `/app/checkins/${toReview[0].id}`, primary: true }],
    });
  }

  // 2. Retention radar drafts (Pro)
  const insights = await db.aIInsight.findMany({ where: { OR: [{ status: 'pending' }, { decidedAt: { gte: dayStart } }], kind: { in: ['risk', 'automation'] } }, orderBy: { createdAt: 'desc' } });
  for (const i of insights.filter(i => i.kind === 'risk' && pro)) {
    const c = byId.get(i.clientId); if (!c || !['ACTIVE', 'NEW'].includes(c.status)) continue;
    const high = (i.draft?.level || c.riskLevel) === 'HIGH';
    items.push({
      id: `insight:${i.id}`, insightId: i.id, cat: 'clients', sev: high ? 'crit' : 'warn', icon: 'alert', client: { id: c.id, name: c.name },
      title: high ? `${c.name} may cancel` : `${c.name} is drifting`, pill: high ? 'High risk' : 'Medium risk',
      sub: (i.draft?.reasons || c.riskReasons || []).slice(0, 3).join(' · '), draft: i.finalText || draftText(i), status: i.status, decidedAt: i.decidedAt, mins: i.minutesSaved,
      actions: [{ label: 'Approve & send', act: 'approve', primary: true }, { label: 'Edit', act: 'edit' }, high ? { label: 'Open profile', go: `/app/clients/${c.id}` } : { label: 'Dismiss', act: 'dismiss' }],
    });
  }

  // 3. Failed payments → card-update reminders
  const failed = await db.payment.findMany({ where: { status: 'failed' }, orderBy: { createdAt: 'desc' } });
  const unreminded = failed.filter(p => !p.remindedAt);
  if (failed.length) {
    const done = !unreminded.length && failed.some(p => p.remindedAt && p.remindedAt >= dayStart);
    if (unreminded.length || done) {
      const list = unreminded.length ? unreminded : failed;
      items.push({
        id: 'payments', cat: 'money', sev: 'warn', icon: 'card',
        title: `${plural(list.length, 'payment')} failed · $${Math.round(list.reduce((n, p) => n + p.amountCents, 0) / 100).toLocaleString('en-US')}`,
        sub: `${list.map(p => `${firstOf(byId.get(p.clientId)?.name)} (${(p.failureReason || 'declined').split(':')[0].toLowerCase()})`).join(', ')}. Card-update reminders are ready.`,
        status: done ? 'approved' : 'pending', mins: 3 * list.length,
        actions: [{ label: unreminded.length > 1 ? 'Send reminders' : 'Send reminder', act: 'remindPayments', primary: true }, { label: 'Open payments', go: '/app/payments' }],
      });
    }
  }

  // 4. Missing check-ins → friendly reminders
  const auto = await db.automation.findFirst({ where: { key: 'missing_checkin' } });
  const remindedToday = new Set((await db.automationRun.findMany({ where: { createdAt: { gte: dayStart }, dedupeKey: { contains: ':checkin:' } }, select: { clientId: true } })).map(r => r.clientId));
  const recentCheckins = new Set((await db.checkIn.findMany({ where: { submittedAt: { gte: addDays(now, -7) } }, select: { clientId: true } })).map(k => k.clientId));
  const missing = active.filter(c => (now - new Date(c.startedAt)) / 864e5 >= 7 && !recentCheckins.has(c.id));
  const notReminded = missing.filter(c => !remindedToday.has(c.id));
  if (missing.length && (notReminded.length || missing.length)) {
    const template = auto?.template || 'Hey {first}! Quick reminder to send your weekly check-in. Takes 2 minutes and it’s how I adjust next week.';
    items.push({
      id: 'missing', cat: 'clients', sev: 'assist', icon: 'clock',
      title: `${plural(missing.length, 'client')} ${missing.length === 1 ? 'hasn’t' : 'haven’t'} checked in`,
      sub: `${listNames(missing.map(c => firstOf(c.name)))}. Due Sunday. A friendly reminder is drafted for each.`,
      draft: template.replace('{first}', '{first name}'), template, clientIds: notReminded.map(c => c.id),
      status: notReminded.length ? 'pending' : 'approved', mins: 2 * missing.length,
      actions: [{ label: `Send ${plural(notReminded.length || missing.length, 'reminder')}`, act: 'remindMissing', primary: true }, { label: 'Edit', act: 'edit' }],
    });
  }

  // 5. Automation drafts waiting for approval (milestones, missed workouts…)
  for (const i of insights.filter(i => i.kind === 'automation')) {
    const c = byId.get(i.clientId); if (!c) continue;
    const milestone = i.sourceId === 'milestone';
    items.push({
      id: `insight:${i.id}`, insightId: i.id, cat: 'clients', sev: milestone ? 'good' : 'assist', icon: milestone ? 'trophy' : 'zap', client: { id: c.id, name: c.name },
      title: i.draft?.title || i.summary || `Automation for ${c.name}`, sub: `From your “${(i.draft?.rule || 'automation').toLowerCase()}” automation.`,
      draft: i.finalText || draftText(i), status: i.status, decidedAt: i.decidedAt, mins: i.minutesSaved,
      actions: [{ label: 'Approve & send', act: 'approve', primary: true }, { label: 'Edit', act: 'edit' }, { label: 'Dismiss', act: 'dismiss' }],
    });
  }

  // 6. Leads waiting for a first reply (Pro)
  if (pro) {
    const newLeads = await db.lead.findMany({ where: { stage: 'new' }, orderBy: { createdAt: 'desc' } });
    const followUps = await db.lead.findMany({ where: { stage: 'contacted', nextFollowUpAt: { lte: now } } });
    if (newLeads.length || followUps.length) {
      items.push({
        id: 'leads', cat: 'growth', sev: 'info', icon: 'funnel',
        title: newLeads.length ? `${plural(newLeads.length, 'new lead')} to answer` : `${plural(followUps.length, 'lead')} to follow up`,
        sub: `${listNames([...newLeads, ...followUps].map(l => l.name))}. Replies are a tap away.`,
        actions: [{ label: 'Open leads', go: '/app/leads', primary: true }],
      });
    }
  }

  // 7. Unread messages
  const threads = await db.thread.findMany({ where: { coachUnread: { gt: 0 } }, orderBy: { lastMessageAt: 'desc' } });
  const order = { crit: 0, warn: 1, assist: 2, good: 3, info: 4 };
  const open = items.filter(i => (i.status || 'pending') === 'pending');
  const doneItems = items.filter(i => (i.status || 'pending') !== 'pending');
  open.sort((a, b) => order[a.sev] - order[b.sev]);

  // numbers
  const revenue = await revenueSummary(db, now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const weekStartDate = weekStart(today);
  const checkinsThisWeek = await db.checkIn.count({ where: { submittedAt: { gte: weekStartDate } } });
  const old = clients.filter(c => now - new Date(c.startedAt) >= 90 * 864e5);
  const retention = old.length ? Math.round(old.filter(c => c.status !== 'INACTIVE').length / old.length * 100) : null;
  const radar = pro ? clients.filter(c => c.riskLevel && c.riskLevel !== 'LOW' && ['ACTIVE', 'NEW'].includes(c.status)).sort((a, b) => b.riskScore - a.riskScore).slice(0, 5).map(c => ({ id: c.id, name: c.name, score: c.riskScore, level: c.riskLevel, reason: (c.riskReasons || [])[0] || '' })) : null;
  const unread = [];
  for (const t of threads.slice(0, 5)) {
    const m = await db.message.findFirst({ where: { threadId: t.id }, orderBy: { createdAt: 'desc' }, select: { body: true, createdAt: true } });
    const c = byId.get(t.clientId);
    if (c) unread.push({ clientId: c.id, name: c.name, preview: m?.body?.slice(0, 140) || '', at: m?.createdAt });
  }
  const upcoming = await db.workoutAssignment.count({ where: { scheduledFor: today } });
  const doneToday = await db.workoutAssignment.count({ where: { scheduledFor: today, status: 'completed' } });

  return {
    date: localYMD(tz, now),
    plan, pro,
    open: open.length,
    drafted: open.filter(i => i.draft || i.insightId).length,
    items: [...open, ...doneItems],
    kpis: {
      activeClients: active.length,
      newThisMonth: clients.filter(c => new Date(c.startedAt) >= monthStart).length,
      newClients: clients.filter(c => c.status === 'NEW').length,
      mrrCents: revenue.mrrCents,
      retention90: retention,
      checkinsThisWeek,
      missingCheckins: missing.length,
    },
    radar,
    unread,
    unreadCount: threads.length,
    workoutsToday: { scheduled: upcoming, done: doneToday },
    payments: { collectedCents: revenue.collectedCents, expectedCents: revenue.mrrCents, failedCount: revenue.failedCount, failedCents: revenue.failedCents },
    minutesSaved: await minutesSavedThisWeek(db, tz, now),
  };
}

export { fillTemplate };
