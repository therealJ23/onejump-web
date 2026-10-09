// Read-only tools Assist can use to answer a coach's question (typed or spoken). Each one is a
// plain server function that runs through the coach's tenant-scoped client (dbFor), so Assist
// can only ever see this business's data, and never writes SQL. Results carry first names and
// numbers only: no emails, phone numbers or payment details go to a model.
import { missingCheckinClients } from '../core/checkinStatus.js';
import { revenueSummary } from '../core/money.js';
import { buildToday } from '../core/queue.js';
import { programWeek } from '../core/training.js';
import { weightSeries } from '../core/stats.js';
import { todayKey, addDays, DAY } from '../lib/time.js';

const firstOf = n => String(n || '').split(' ')[0];
const ACTIVE = { status: { in: ['NEW', 'ACTIVE'] } };
const monthStart = (d, offset = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Clients whose first or full name appears in `text` (longest names first). */
export async function findClientsIn(db, text) {
  const s = ` ${String(text || '').toLowerCase().replace(/[’']s\b/g, '').replace(/[^a-z0-9\s-]/g, ' ')} `;
  const clients = await db.client.findMany({ where: { status: { not: 'INACTIVE' } }, select: { id: true, name: true } });
  const full = clients.filter(c => s.includes(` ${c.name.toLowerCase()} `));
  if (full.length) return full;
  return clients.filter(c => s.includes(` ${firstOf(c.name).toLowerCase()} `));
}

export async function clientByName(db, name) {
  const hits = await findClientsIn(db, name);
  return { client: hits.length === 1 ? hits[0] : null, matches: hits };
}

async function lastCheckinFor(db, clientId) {
  return db.checkIn.findFirst({ where: { clientId }, orderBy: { submittedAt: 'desc' } });
}

export const TOOLS = {
  missing_checkins: {
    description: 'Clients who haven’t sent this week’s check-in (active or new clients, 7+ days in, nothing in the last 7 days).',
    input: {},
    trace: ['Check-ins · last 7 days'],
    async run(db, _a, c) {
      const list = await missingCheckinClients(db, c.now);
      return { count: list.length, clients: list.map(x => ({ id: x.id, name: x.name, lastCheckinAt: x.lastCheckinAt })) };
    },
  },
  at_risk_clients: {
    description: 'Clients the retention radar scores medium or high risk, highest first, with their top reasons.',
    input: {},
    trace: ['Risk scores · nightly', 'Workouts · 14 days', 'Messages', 'Payments'],
    async run(db) {
      const list = await db.client.findMany({ where: { ...ACTIVE, riskLevel: { in: ['MEDIUM', 'HIGH'] } }, orderBy: { riskScore: 'desc' }, select: { id: true, name: true, riskScore: true, riskLevel: true, riskReasons: true, startedAt: true } });
      return { count: list.length, clients: list.map(x => ({ id: x.id, name: x.name, score: x.riskScore, level: x.riskLevel, reasons: (x.riskReasons || []).slice(0, 3), daysIn: Math.floor((Date.now() - new Date(x.startedAt)) / DAY) })) };
    },
  },
  missed_workouts: {
    description: 'Clients ranked by missed workouts over the last 14 days.',
    input: {},
    trace: ['Workout logs · 14 days'],
    async run(db, _a, c) {
      const today = todayKey(c.tz, c.now);
      const [clients, rows] = await Promise.all([
        db.client.findMany({ where: ACTIVE, select: { id: true, name: true, adherence: true } }),
        db.workoutAssignment.findMany({ where: { scheduledFor: { gte: addDays(today, -14), lt: today }, status: { not: 'completed' } }, select: { clientId: true } }),
      ]);
      const n = new Map();
      for (const r of rows) n.set(r.clientId, (n.get(r.clientId) || 0) + 1);
      const ranked = clients.map(x => ({ id: x.id, name: x.name, missed: n.get(x.id) || 0, adherence: x.adherence })).filter(x => x.missed).sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name)).slice(0, 5);
      return { clients: ranked };
    },
  },
  revenue: {
    description: 'Revenue collected in a month (this or last) and the change versus the month before.',
    input: { month: { type: 'string', enum: ['this', 'last'], description: 'this = the current month so far, last = the previous calendar month' } },
    trace: ['Payments'],
    async run(db, a, c) {
      const off = a.month === 'this' ? 0 : -1;
      const from = monthStart(c.now, off), to = monthStart(c.now, off + 1), prevFrom = monthStart(c.now, off - 1);
      const sum = async (gte, lt) => (await db.payment.aggregate({ where: { status: 'paid', paidAt: { gte, lt } }, _sum: { amountCents: true } }))._sum.amountCents || 0;
      const [cur, prev, mrr] = await Promise.all([sum(from, to), sum(prevFrom, from), revenueSummary(db, c.now)]);
      return { month: MONTHS[from.getUTCMonth()], previousMonth: MONTHS[prevFrom.getUTCMonth()], cents: cur, previousCents: prev, changePct: prev ? Math.round((cur / prev - 1) * 1000) / 10 : null, mrrCents: mrr.mrrCents, soFar: a.month === 'this' };
    },
  },
  unpaid: {
    description: 'Failed payments and payments coming up soon.',
    input: {},
    trace: ['Payments'],
    async run(db) {
      const rows = await db.payment.findMany({ where: { status: { in: ['failed', 'upcoming'] } }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] });
      const names = new Map((await db.client.findMany({ where: { id: { in: rows.map(r => r.clientId) } }, select: { id: true, name: true } })).map(x => [x.id, x.name]));
      return { failed: rows.filter(r => r.status === 'failed').map(r => ({ clientId: r.clientId, name: names.get(r.clientId) || 'Client', amountCents: r.amountCents, reason: (r.failureReason || 'Declined').split(':')[0], reminded: !!r.remindedAt })), upcoming: rows.filter(r => r.status === 'upcoming').map(r => ({ clientId: r.clientId, name: names.get(r.clientId) || 'Client', amountCents: r.amountCents, dueAt: r.dueAt })) };
    },
  },
  business_summary: {
    description: 'A summary of the business this month: revenue, clients, risks, money and leads.',
    input: {},
    trace: ['Payments', 'Clients', 'Check-ins', 'Risk scores', 'Leads'],
    async run(db, _a, c) {
      const from = monthStart(c.now);
      const [rev, clients, risk, unpaid, newLeads, consults, missing] = await Promise.all([
        TOOLS.revenue.run(db, { month: 'this' }, c),
        db.client.findMany({ select: { status: true, startedAt: true, updatedAt: true } }),
        TOOLS.at_risk_clients.run(db, {}, c),
        TOOLS.unpaid.run(db, {}, c),
        db.lead.count({ where: { stage: 'new' } }),
        db.lead.findMany({ where: { stage: 'consult' }, select: { name: true } }),
        missingCheckinClients(db, c.now),
      ]);
      const active = clients.filter(x => ['NEW', 'ACTIVE'].includes(x.status));
      return {
        revenue: rev, activeClients: active.length, newThisMonth: clients.filter(x => new Date(x.startedAt) >= from).length,
        cancelledThisMonth: clients.filter(x => x.status === 'INACTIVE' && new Date(x.updatedAt) >= from).length,
        atRisk: risk.clients.slice(0, 3), atRiskCount: risk.count,
        failedCents: unpaid.failed.reduce((n, p) => n + p.amountCents, 0), failedNames: unpaid.failed.map(p => p.name),
        newLeads, consults: consults.map(l => l.name), missingCheckins: missing.length,
      };
    },
  },
  client_summary: {
    description: 'How one client is doing: program week, adherence, workouts, weight change, risk and their latest check-in.',
    input: { name: { type: 'string', description: 'The client’s first or full name' } },
    trace: ['Profile', 'Workout logs', 'Check-ins', 'Risk score'],
    async run(db, a) {
      const { client, matches } = await clientByName(db, a.name);
      if (!client) return { notFound: !matches.length, ambiguous: matches.map(m => ({ id: m.id, name: m.name })) };
      const c = await db.client.findFirst({ where: { id: client.id } });
      const [program, k, w] = await Promise.all([
        c.programId ? db.program.findFirst({ where: { id: c.programId }, select: { name: true, weeks: true } }) : null,
        lastCheckinFor(db, c.id), weightSeries(db, c.id, 10),
      ]);
      const summary = k ? await db.aIInsight.findFirst({ where: { kind: 'checkin_summary', sourceId: k.id }, orderBy: { createdAt: 'desc' }, select: { summary: true } }) : null;
      return {
        id: c.id, name: c.name, status: c.status, goal: c.goal, program: program?.name || null, week: programWeek(c), weeks: program?.weeks || null,
        adherence: c.adherence, workoutsDone: c.workoutsDone, risk: c.riskLevel ? { level: c.riskLevel, score: c.riskScore, reasons: (c.riskReasons || []).slice(0, 3) } : null,
        weightChange: w.length >= 2 ? Math.round((w.at(-1).value - w[0].value) * 10) / 10 : null,
        checkin: k ? { id: k.id, submittedAt: k.submittedAt, flagged: k.flagged, status: k.status, summary: summary?.summary || null } : null,
      };
    },
  },
  client_checkin: {
    description: 'One client’s latest weekly check-in and Assist’s summary of it.',
    input: { name: { type: 'string', description: 'The client’s first or full name' } },
    trace: ['Check-ins'],
    async run(db, a) {
      const { client, matches } = await clientByName(db, a.name);
      if (!client) return { notFound: !matches.length, ambiguous: matches.map(m => ({ id: m.id, name: m.name })) };
      const k = await lastCheckinFor(db, client.id);
      if (!k) return { id: client.id, name: client.name, checkin: null };
      let ins = await db.aIInsight.findFirst({ where: { kind: 'checkin_summary', sourceId: k.id }, orderBy: { createdAt: 'desc' } });
      if (!ins) { const { checkinSummary } = await import('../ai/drafts.js'); ins = await checkinSummary(db, k); }
      return { id: client.id, name: client.name, checkin: { id: k.id, submittedAt: k.submittedAt, flagged: k.flagged, status: k.status, energy: k.energy, soreness: k.soreness, sleepHours: k.sleepHours, nutrition: k.nutrition, summary: ins?.summary || null } };
    },
  },
  nutrition_struggles: {
    description: 'Clients struggling with nutrition this week: missing protein targets most days, targets below resting needs, and how many private flags are open.',
    input: {},
    trace: ['Food logs · 7 days', 'Nutrition targets', 'Private flags'],
    async run(db, _a, c) {
      const { nutritionStruggles } = await import('../nutrition/insights.js');
      return nutritionStruggles(db, c);
    },
  },
  today_queue: {
    description: 'What needs the coach today (the Today queue), most urgent first.',
    input: {},
    trace: ['Today queue'],
    async run(db, _a, c) {
      const t = await buildToday(db, { tz: c.tz, now: c.now });
      return { open: t.open, drafted: t.drafted, items: t.items.filter(i => (i.status || 'pending') === 'pending').slice(0, 6).map(i => ({ title: i.title })) };
    },
  },
  active_clients: {
    description: 'How many active clients the coach has, by status and coaching type.',
    input: {},
    trace: ['Clients'],
    async run(db) {
      const list = await db.client.findMany({ select: { name: true, status: true, mode: true } });
      const act = list.filter(x => ['NEW', 'ACTIVE'].includes(x.status));
      return { active: act.length, newClients: act.filter(x => x.status === 'NEW').map(x => firstOf(x.name)), paused: list.filter(x => x.status === 'PAUSED').length, inactive: list.filter(x => x.status === 'INACTIVE').length, byMode: Object.fromEntries(['Online', 'Hybrid', 'In person'].map(m => [m, act.filter(x => x.mode === m).length])) };
    },
  },
};

/** Tool definitions in the shape the Anthropic Messages API expects. */
export function toolDefinitions() {
  return Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, input_schema: { type: 'object', properties: t.input, required: Object.keys(t.input).filter(k => k === 'name') } }));
}
