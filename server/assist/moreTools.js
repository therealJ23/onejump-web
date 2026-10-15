// More read-only tools for Ask Assist (Claude only). They give Assist the full picture of the
// coach's business so it can answer follow-ups and open questions, not just the fixed ones.
// Same rules as ./tools.js: everything runs through the coach's tenant-scoped client, nothing is
// written, and no emails, phone numbers or card details are returned. These have no fixed card on
// screen: Assist words the answer itself from the data.
import { clientByName } from './tools.js';
import { programWeek } from '../core/training.js';
import { weightSeries } from '../core/stats.js';
import { DAY } from '../lib/time.js';

const short = (s, n = 400) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
const day = d => (d ? new Date(d).toISOString().slice(0, 10) : null);
const dollars = c => (c == null ? null : Math.round(c) / 100);
const notFound = (matches) => ({ notFound: !matches.length, ambiguous: matches.map(m => ({ id: m.id, name: m.name })) });
const STATUS = { active: ['NEW', 'ACTIVE'], paused: ['PAUSED'], inactive: ['INACTIVE'] };

export const MORE_TOOLS = {
  list_clients: {
    description: 'Every client with their key facts: status, goal, program, adherence %, risk, payment status, last workout and last check-in. Use it to answer open questions about the roster (who is on which program, who is new, who trains in person, who has a goal like X, etc.).',
    input: {
      status: { type: 'string', enum: ['active', 'paused', 'inactive', 'all'], description: 'Default active (includes new clients)' },
      search: { type: 'string', description: 'Optional words to match in the name, goal or goal type' },
    },
    trace: ['Clients', 'Programs'],
    async run(db, a) {
      const st = STATUS[a.status] || (a.status === 'all' ? null : STATUS.active);
      const [clients, programs, plans] = await Promise.all([
        db.client.findMany({ where: st ? { status: { in: st } } : {}, orderBy: { name: 'asc' }, take: 200, select: { id: true, name: true, status: true, goal: true, goalType: true, mode: true, programId: true, programStartedAt: true, clientPlanId: true, payStatus: true, adherence: true, riskLevel: true, workoutsDone: true, startedAt: true, lastWorkoutAt: true, lastCheckinAt: true, pausedUntil: true } }),
        db.program.findMany({ select: { id: true, name: true, weeks: true } }),
        db.clientPlan.findMany({ select: { id: true, name: true } }),
      ]);
      const prog = new Map(programs.map(p => [p.id, p])), plan = new Map(plans.map(p => [p.id, p.name]));
      const q = String(a.search || '').toLowerCase().trim();
      const list = clients.filter(c => !q || [c.name, c.goal, c.goalType].some(v => String(v || '').toLowerCase().includes(q)));
      return {
        count: list.length,
        clients: list.map(c => ({
          id: c.id, name: c.name, status: c.status, goal: c.goal, goalType: c.goalType, coaching: c.mode,
          program: prog.get(c.programId)?.name || null, programWeek: programWeek(c), programWeeks: prog.get(c.programId)?.weeks || null,
          package: plan.get(c.clientPlanId) || null, payStatus: c.payStatus, adherencePct: c.adherence, risk: c.riskLevel, workoutsDone: c.workoutsDone,
          clientSince: day(c.startedAt), lastWorkout: day(c.lastWorkoutAt), lastCheckin: day(c.lastCheckinAt), pausedUntil: day(c.pausedUntil),
        })),
      };
    },
  },

  client_details: {
    description: 'Everything about one client: profile and goal (and their why), program and week, package and payments, adherence, recent workouts with effort and notes, weight trend, nutrition targets and food logging, latest check-in answers, the coach’s private notes and the latest messages. Use this before answering any detailed question about a client.',
    input: { name: { type: 'string', description: 'The client’s first or full name' } },
    trace: ['Profile', 'Workouts', 'Check-ins', 'Nutrition', 'Notes', 'Messages', 'Payments'],
    async run(db, a, c) {
      const { client, matches } = await clientByName(db, a.name);
      if (!client) return notFound(matches);
      const x = await db.client.findFirst({ where: { id: client.id } });
      const since14 = new Date(c.now.getTime() - 14 * DAY), since7 = new Date(c.now.getTime() - 7 * DAY);
      const [program, plan, sessions, assignments, checkins, weights, nutrition, foodDays, notes, messages, payments] = await Promise.all([
        x.programId ? db.program.findFirst({ where: { id: x.programId }, select: { name: true, weeks: true, daysPerWeek: true, level: true } }) : null,
        x.clientPlanId ? db.clientPlan.findFirst({ where: { id: x.clientPlanId }, select: { name: true, priceCents: true, interval: true, sessionsIncluded: true } }) : null,
        db.workoutSession.findMany({ where: { clientId: x.id, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, take: 6, select: { workoutId: true, completedAt: true, rpe: true, soreness: true, volume: true, note: true } }),
        db.workoutAssignment.findMany({ where: { clientId: x.id, scheduledFor: { gte: since14 } }, select: { status: true, scheduledFor: true } }),
        db.checkIn.findMany({ where: { clientId: x.id }, orderBy: { submittedAt: 'desc' }, take: 3 }),
        weightSeries(db, x.id, 10),
        db.nutritionPlan.findFirst({ where: { clientId: x.id }, select: { approach: true, calories: true, proteinG: true, carbsG: true, fatG: true, coachNote: true } }),
        db.foodEntry.findMany({ where: { clientId: x.id, loggedAt: { gte: since7 } }, select: { day: true } }),
        db.note.findMany({ where: { clientId: x.id }, orderBy: { createdAt: 'desc' }, take: 5, select: { body: true, createdAt: true } }),
        db.message.findMany({ where: { clientId: x.id }, orderBy: { createdAt: 'desc' }, take: 8, select: { senderRole: true, body: true, transcriptSummary: true, durationS: true, createdAt: true } }),
        db.payment.findMany({ where: { clientId: x.id }, orderBy: { createdAt: 'desc' }, take: 4, select: { amountCents: true, status: true, dueAt: true, paidAt: true, failureReason: true } }),
      ]);
      const wNames = new Map((await db.workout.findMany({ where: { id: { in: [...new Set(sessions.map(s => s.workoutId))] } }, select: { id: true, name: true } })).map(w => [w.id, w.name]));
      const past = assignments.filter(s => new Date(s.scheduledFor) < c.now);
      return {
        id: x.id, name: x.name, status: x.status, coaching: x.mode, goal: x.goal, goalType: x.goalType, why: short(x.why, 300), targetWeight: x.targetWeight,
        age: x.birthYear ? c.now.getUTCFullYear() - x.birthYear : null, clientSince: day(x.startedAt), pausedUntil: day(x.pausedUntil),
        program: program ? { ...program, week: programWeek(x) } : null,
        package: plan ? { name: plan.name, price: dollars(plan.priceCents), interval: plan.interval, sessionsIncluded: plan.sessionsIncluded } : null,
        payStatus: x.payStatus, recentPayments: payments.map(p => ({ amount: dollars(p.amountCents), status: p.status, due: day(p.dueAt), paid: day(p.paidAt), failureReason: p.failureReason })),
        adherencePct: x.adherence, workoutsDone: x.workoutsDone, risk: x.riskLevel ? { level: x.riskLevel, score: x.riskScore, reasons: (x.riskReasons || []).slice(0, 4) } : null,
        last14Days: { scheduled: past.length, completed: past.filter(s => s.status === 'completed').length, skipped: past.filter(s => s.status === 'skipped').length },
        recentWorkouts: sessions.map(s => ({ date: day(s.completedAt), workout: wNames.get(s.workoutId) || 'Workout', rpe: s.rpe, soreness: s.soreness, volume: s.volume, note: short(s.note, 200) || null })),
        weight: weights.length ? { first: weights[0].value, latest: weights.at(-1).value, from: day(weights[0].date), to: day(weights.at(-1).date), change: Math.round((weights.at(-1).value - weights[0].value) * 10) / 10 } : null,
        nutrition: nutrition ? { approach: nutrition.approach, calories: nutrition.calories, proteinG: nutrition.proteinG, carbsG: nutrition.carbsG, fatG: nutrition.fatG, coachNote: short(nutrition.coachNote, 200) || null, daysLoggedLast7: new Set(foodDays.map(f => day(f.day))).size } : { daysLoggedLast7: new Set(foodDays.map(f => day(f.day))).size },
        checkins: checkins.map(k => ({ submitted: day(k.submittedAt), status: k.status, flaggedForHealth: k.flagged, weight: k.weight, sleepHours: k.sleepHours, energy: k.energy, stress: k.stress, soreness: k.soreness, nutrition: k.nutrition, mood: k.mood, workouts: k.workoutsPlanned ? `${k.workoutsDone ?? 0}/${k.workoutsPlanned}` : null, text: short(k.text, 500) || null })),
        coachNotes: notes.map(n => ({ date: day(n.createdAt), note: short(n.body, 300) })),
        latestMessages: messages.reverse().map(m => ({ date: day(m.createdAt), from: m.senderRole === 'COACH' ? 'coach' : m.senderRole === 'CLIENT' ? 'client' : 'system', text: m.durationS ? `(voice note) ${short(m.transcriptSummary || m.body, 250)}` : short(m.body, 300) })),
      };
    },
  },

  client_messages: {
    description: 'The recent conversation between the coach and one client (newest last). Use it to answer what a client said, or to help write a reply.',
    input: { name: { type: 'string', description: 'The client’s first or full name' }, limit: { type: 'integer', description: 'How many messages (default 20, max 40)' } },
    trace: ['Messages'],
    async run(db, a) {
      const { client, matches } = await clientByName(db, a.name);
      if (!client) return notFound(matches);
      const take = Math.min(40, Math.max(1, Number(a.limit) || 20));
      const msgs = await db.message.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'desc' }, take, select: { senderRole: true, body: true, transcriptSummary: true, durationS: true, createdAt: true, readAt: true } });
      return { id: client.id, name: client.name, messages: msgs.reverse().map(m => ({ at: m.createdAt, from: m.senderRole === 'COACH' ? 'coach' : m.senderRole === 'CLIENT' ? 'client' : 'system', text: m.durationS ? `(voice note) ${short(m.transcriptSummary || m.body, 300)}` : short(m.body, 600), read: !!m.readAt })) };
    },
  },

  unread_messages: {
    description: 'Clients with messages the coach hasn’t read yet, with the latest thing each one said.',
    input: {},
    trace: ['Messages'],
    async run(db) {
      const threads = await db.thread.findMany({ where: { coachUnread: { gt: 0 } }, orderBy: { lastMessageAt: 'desc' }, take: 20, select: { clientId: true, coachUnread: true, lastMessageAt: true } });
      const ids = threads.map(t => t.clientId);
      const [clients, last] = await Promise.all([
        db.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
        Promise.all(ids.map(id => db.message.findFirst({ where: { clientId: id, senderRole: 'CLIENT' }, orderBy: { createdAt: 'desc' }, select: { body: true, transcriptSummary: true, durationS: true } }))),
      ]);
      const name = new Map(clients.map(c => [c.id, c.name]));
      return { count: threads.length, threads: threads.map((t, i) => ({ clientId: t.clientId, name: name.get(t.clientId) || 'Client', unread: t.coachUnread, at: t.lastMessageAt, latest: last[i] ? short(last[i].durationS ? last[i].transcriptSummary || last[i].body : last[i].body, 240) : null })) };
    },
  },

  checkins_to_review: {
    description: 'Check-ins clients have sent that the coach hasn’t reviewed yet, oldest first, with their scores.',
    input: {},
    trace: ['Check-ins'],
    async run(db) {
      const list = await db.checkIn.findMany({ where: { status: 'submitted' }, orderBy: { submittedAt: 'asc' }, take: 25, select: { id: true, clientId: true, submittedAt: true, flagged: true, energy: true, sleepHours: true, stress: true, nutrition: true, mood: true, weight: true, workoutsDone: true, workoutsPlanned: true } });
      const clients = await db.client.findMany({ where: { id: { in: list.map(k => k.clientId) } }, select: { id: true, name: true } });
      const name = new Map(clients.map(c => [c.id, c.name]));
      return { count: list.length, checkins: list.map(k => ({ id: k.id, clientId: k.clientId, name: name.get(k.clientId) || 'Client', submitted: day(k.submittedAt), flaggedForHealth: k.flagged, energy: k.energy, sleepHours: k.sleepHours, stress: k.stress, nutrition: k.nutrition, mood: k.mood, weight: k.weight, workouts: k.workoutsPlanned ? `${k.workoutsDone ?? 0}/${k.workoutsPlanned}` : null })) };
    },
  },

  training_week: {
    description: 'This week’s training across all clients: workouts scheduled, completed and skipped per client, so you can say who is on track.',
    input: {},
    trace: ['Workout schedule · this week'],
    async run(db, _a, c) {
      const from = new Date(c.now.getTime() - ((c.now.getUTCDay() + 6) % 7) * DAY); from.setUTCHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + 7 * DAY);
      const rows = await db.workoutAssignment.findMany({ where: { scheduledFor: { gte: from, lt: to } }, select: { clientId: true, status: true, scheduledFor: true } });
      const clients = await db.client.findMany({ where: { id: { in: [...new Set(rows.map(r => r.clientId))] } }, select: { id: true, name: true } });
      const by = new Map(clients.map(x => [x.id, { name: x.name, scheduled: 0, completed: 0, skipped: 0, upcoming: 0 }]));
      for (const r of rows) { const b = by.get(r.clientId); if (!b) continue; b.scheduled++; if (r.status === 'completed') b.completed++; else if (r.status === 'skipped') b.skipped++; else if (new Date(r.scheduledFor) >= c.now) b.upcoming++; }
      return { weekOf: day(from), clients: [...by.values()].sort((x, y) => (y.skipped - x.skipped) || x.name.localeCompare(y.name)) };
    },
  },

  programs: {
    description: 'The coach’s training programs: length, days per week, level and how many clients are on each.',
    input: {},
    trace: ['Programs'],
    async run(db) {
      const [programs, clients] = await Promise.all([
        db.program.findMany({ where: { archived: false }, select: { id: true, name: true, weeks: true, daysPerWeek: true, level: true, description: true, source: true } }),
        db.client.findMany({ where: { status: { in: ['NEW', 'ACTIVE'] }, programId: { not: null } }, select: { programId: true, name: true } }),
      ]);
      return { programs: programs.map(p => ({ id: p.id, name: p.name, weeks: p.weeks, daysPerWeek: p.daysPerWeek, level: p.level, description: short(p.description, 200) || null, madeByAssist: p.source === 'assist', clients: clients.filter(x => x.programId === p.id).map(x => x.name) })) };
    },
  },

  leads: {
    description: 'The coach’s leads (people interested in coaching): stage, where they came from, goal, value and when to follow up next.',
    input: { stage: { type: 'string', enum: ['new', 'contacted', 'consult', 'trial', 'active', 'retained', 'lost', 'open', 'all'], description: 'Default open (everything not won or lost)' } },
    trace: ['Leads'],
    async run(db, a, c) {
      const stage = a.stage || 'open';
      const where = stage === 'all' ? {} : stage === 'open' ? { stage: { in: ['new', 'contacted', 'consult', 'trial'] } } : { stage };
      const list = await db.lead.findMany({ where, orderBy: { createdAt: 'desc' }, take: 60, select: { name: true, source: true, goal: true, stage: true, valueCents: true, nextFollowUpAt: true, lastContactAt: true, createdAt: true, firstMessage: true } });
      return { count: list.length, leads: list.map(l => ({ name: l.name, stage: l.stage, source: l.source, goal: l.goal, value: dollars(l.valueCents), added: day(l.createdAt), lastContact: day(l.lastContactAt), nextFollowUp: day(l.nextFollowUpAt), followUpOverdue: !!(l.nextFollowUpAt && new Date(l.nextFollowUpAt) < c.now), firstMessage: short(l.firstMessage, 200) || null })) };
    },
  },

  payments_overview: {
    description: 'Money: the coach’s packages and prices, active subscriptions, and recent payments (paid, failed, upcoming), optionally for one client.',
    input: { name: { type: 'string', description: 'Optional client name to look at just their payments' } },
    trace: ['Payments', 'Packages'],
    async run(db, a) {
      let clientId = null, who = null;
      if (a.name) { const { client, matches } = await clientByName(db, a.name); if (!client) return notFound(matches); clientId = client.id; who = client.name; }
      const where = clientId ? { clientId } : {};
      const [plans, subs, pays] = await Promise.all([
        db.clientPlan.findMany({ where: { active: true }, select: { id: true, name: true, priceCents: true, interval: true, sessionsIncluded: true } }),
        db.subscription.findMany({ where: { ...where, status: { in: ['active', 'past_due', 'trialing'] } }, select: { clientId: true, clientPlanId: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true } }),
        db.payment.findMany({ where, orderBy: { createdAt: 'desc' }, take: 40, select: { clientId: true, amountCents: true, status: true, dueAt: true, paidAt: true, failureReason: true } }),
      ]);
      const ids = [...new Set([...subs, ...pays].map(x => x.clientId))];
      const names = new Map((await db.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map(x => [x.id, x.name]));
      const planName = new Map(plans.map(p => [p.id, p.name]));
      return {
        client: who,
        packages: plans.map(p => ({ name: p.name, price: dollars(p.priceCents), interval: p.interval, sessionsIncluded: p.sessionsIncluded })),
        subscriptions: subs.map(s => ({ client: names.get(s.clientId), package: planName.get(s.clientPlanId) || null, status: s.status, renews: day(s.currentPeriodEnd), cancelsAtEnd: s.cancelAtPeriodEnd })),
        payments: pays.map(p => ({ client: names.get(p.clientId), amount: dollars(p.amountCents), status: p.status, due: day(p.dueAt), paid: day(p.paidAt), failureReason: p.failureReason })),
      };
    },
  },
};

export function moreToolDefinitions() {
  return Object.entries(MORE_TOOLS).map(([name, t]) => ({ name, description: t.description, input_schema: { type: 'object', properties: t.input, required: name === 'client_details' || name === 'client_messages' ? ['name'] : [] } }));
}
