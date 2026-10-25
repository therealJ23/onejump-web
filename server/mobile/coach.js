// Everything the coach iPhone app shows, shaped for its screens. Read-only and tenant-scoped
// (every query goes through the coach's `db`). Labels come as { en, es }.
//  - coachSnapshot: one call for Today, Clients, Inbox, Leads, Payments, Programs, Nutrition…
//  - clientDetail: one client's page (overview, program, food, progress, notes)
//  - threadFor: one conversation (and marks it read, like opening it on the web)
//  - checkInReport: one check-in with Assist's summary, drafted reply and suggested actions
// No emails, phone numbers or card details are sent; actions use the normal API routes.
import { buildToday } from '../core/queue.js';
import { businessCharts } from '../core/businessCharts.js';
import { clientList, clientProfile } from '../core/clientViews.js';
import { weightSeries, personalBests } from '../core/stats.js';
import { exerciseMap } from '../core/training.js';
import { revenueSummary, monthlyCents } from '../core/money.js';
import { missingCheckinClients } from '../core/checkinStatus.js';
import { draftText } from '../core/actions.js';
import { overview as nutritionOverview, clientNutrition } from '../nutrition/insights.js';
import { checkinSummary } from '../ai/drafts.js';
import { users, memberships } from '../db/system.js';
import { effectivePlan, isPro } from '../auth/middleware.js';
import { config } from '../config.js';
import { HOWTO } from '../seed/exercises.js';
import { hiddenExerciseIds } from '../routes/exercises.js';
import { todayKey, weekStart, addDays, startOfMonthUtc, DAY } from '../lib/time.js';
import { L, day, time, weekday, when, ago, since, money, plural, firstOf, initials, avatar, spark, signed } from './format.js';
import { voiceFields } from '../voice/voiceNotes.js';

const ACTIVE = ['ACTIVE', 'NEW'];
const PLAN_LABEL = { TRIAL: L('Pro trial', 'Prueba de Pro'), STARTER: L('Starter'), PRO: L('Pro'), STUDIO: L('Studio') };

// ---------------------------------------------------------------- clients

function kindOf(c) {
  if (c.status === 'PAUSED') return ['paused', 'muted'];
  if (c.status === 'INACTIVE') return ['paused', 'muted'];
  if (c.invited) return ['invited', 'info'];
  if (c.risk && c.risk.level !== 'LOW' && ACTIVE.includes(c.status)) return ['risk', c.risk.level === 'HIGH' ? 'crit' : 'warn'];
  if (c.checkin === 'review') return ['checkin', c.painFlag ? 'crit' : 'warn'];
  if (['failed', 'due'].includes(c.payStatus)) return ['overdue', 'warn'];
  if (c.status === 'NEW') return ['new', 'info'];
  return ['ok', 'good'];
}

function billingLine(c, plan) {
  const price = plan ? `${money(monthlyCents(plan))}/mo` : null;
  switch (c.payStatus) {
    case 'paid': return L(price ? `Paid · ${price}` : 'Paid', price ? `Pagado · ${price.replace('/mo', '/mes')}` : 'Pagado');
    case 'failed': return L('Last payment failed', 'El último pago falló');
    case 'due': return L('Payment due', 'Pago pendiente');
    case 'trial': return L('Trial', 'Prueba');
    case 'paused': return L('Billing paused', 'Cobro en pausa');
    case 'cancelled': return L('Cancelled', 'Cancelado');
    default: return L(plan ? `${plan.name} · ${price}` : 'No package', plan ? `${plan.name} · ${price.replace('/mo', '/mes')}` : 'Sin paquete');
  }
}

function insightFor(c, k, riskInsight) {
  const f = firstOf(c.name);
  if (k === 'risk') return [riskInsight ? L(riskInsight.summary || (c.risk.reasons || []).join(' · ')) : L((c.risk.reasons || []).join(' · ') || `${f} may be drifting.`), L('Open the drafted message', 'Abrir el mensaje redactado'), 'queue'];
  if (k === 'checkin') return [L(c.painFlag ? `${f} sent a check-in that mentions pain or a medical topic. Read it first.` : `${f} sent this week’s check-in. Assist drafted a summary and a reply.`, c.painFlag ? `${f} envió un check-in que menciona dolor o un tema médico. Léelo primero.` : `${f} envió el check-in de esta semana. Assist redactó un resumen y una respuesta.`), L('Open their check-in', 'Abrir su check-in'), 'checkin'];
  if (k === 'overdue') return [L(`${f}’s last payment didn’t go through. A friendly reminder usually fixes it within a day.`, `El último pago de ${f} no pasó. Un recordatorio amable suele resolverlo en un día.`), L('Open payments', 'Abrir pagos'), 'payments'];
  if (k === 'invited') return [L(`${f} hasn’t accepted the invite yet.`, `${f} aún no acepta la invitación.`), L('Message them', 'Escribirle'), 'thread'];
  if (k === 'new') return [L(`${f} is new. A quick hello in the first week helps a lot.`, `${f} es nuevo. Un saludo en la primera semana ayuda mucho.`), L('Say hi', 'Saludar'), 'thread'];
  if (k === 'paused') return [L(`${f} is paused.`, `${f} está en pausa.`), L('Message them', 'Escribirle'), 'thread'];
  const a = c.adherence;
  return [L(a != null ? `${f} is on track: ${a}% of planned workouts done lately.` : `${f} is on track.`, a != null ? `${f} va al día: ${a}% de los entrenamientos planeados.` : `${f} va al día.`), L('Message them', 'Escribirle'), 'thread'];
}

/** The list rows (and the parts of the profile header that come with them). */
async function clientRows(db, { tz, now }) {
  const list = await clientList(db, { tz, now });
  const ids = list.map(c => c.id);
  const today = todayKey(tz, now), mon = weekStart(today);
  const [plans, risks, upcoming, doneThisWeek, weights] = await Promise.all([
    db.clientPlan.findMany(),
    db.aIInsight.findMany({ where: { kind: 'risk', status: 'pending' }, orderBy: { createdAt: 'desc' }, select: { clientId: true, summary: true, id: true } }),
    db.workoutAssignment.findMany({ where: { clientId: { in: ids }, scheduledFor: { gte: today }, status: { not: 'completed' } }, orderBy: { scheduledFor: 'asc' }, select: { clientId: true, scheduledFor: true, workoutId: true } }),
    db.workoutAssignment.findMany({ where: { clientId: { in: ids }, scheduledFor: { gte: mon }, status: 'completed' }, select: { clientId: true } }),
    Promise.all(list.slice(0, 200).map(c => weightSeries(db, c.id, 8).then(w => [c.id, w]))),
  ]);
  const P = new Map(plans.map(p => [p.id, p]));
  const R = new Map(); for (const r of risks) if (!R.has(r.clientId)) R.set(r.clientId, r);
  const N = new Map(); for (const u of upcoming) if (!N.has(u.clientId)) N.set(u.clientId, u);
  const workoutNames = new Map((await db.workout.findMany({ where: { id: { in: [...new Set([...N.values()].map(u => u.workoutId))] } }, select: { id: true, name: true } })).map(w => [w.id, w.name]));
  const trained = new Set(doneThisWeek.map(d => d.clientId));
  const W = new Map(weights);
  return list.map(c => {
    const [kind, tone] = kindOf(c);
    const plan = P.get(c.plan?.id) || null;
    const w = (W.get(c.id) || []).map(x => x.value);
    const last = w.at(-1), prev = w.at(-2), first = w[0];
    const [insight, suggest, suggestTarget] = insightFor(c, kind, R.get(c.id));
    const next = N.get(c.id);
    const p = c.program;
    const filters = [kind === 'risk' || kind === 'checkin' || kind === 'overdue' ? 'attention' : null, kind === 'new' || kind === 'invited' ? 'new' : null, kind === 'paused' ? 'paused' : null].filter(Boolean);
    return {
      id: c.id, name: c.name, first: firstOf(c.name), initials: initials(c.name), avatar: avatar(c.id),
      programId: p?.id || '', programName: p?.name || '', week: p?.week || 0, weeks: p?.weeks || 0,
      kind, tone, adherence: c.adherence ?? null, trainedThisWeek: trained.has(c.id),
      programLabel: p ? L(`Week ${p.week} of ${p.weeks} · ${p.name}`, `Semana ${p.week} de ${p.weeks} · ${p.name}`) : c.invited ? L('Invited · no program yet', 'Invitado · sin programa aún') : L('No program yet', 'Sin programa aún'),
      goal: L(c.goal || c.goalType || '—'), package: L(plan ? `${c.mode} · ${money(monthlyCents(plan))}/mo` : c.mode, plan ? `${c.mode === 'Online' ? 'En línea' : c.mode === 'Hybrid' ? 'Híbrido' : c.mode === 'In person' ? 'Presencial' : c.mode} · ${money(monthlyCents(plan))}/mes` : undefined),
      since: since(c.startedAt, tz),
      weight: last != null ? (Math.round(last * 10) / 10).toFixed(1) : '—',
      weightChange: prev != null ? L(`${signed(last - prev, ' lb')} since last weigh-in`, `${signed(last - prev, ' lb')} desde el último pesaje`) : L('—'),
      weightTotal: w.length >= 2 ? L(`${signed(last - first, ' lb')} total`, `${signed(last - first, ' lb')} en total`) : L('No weigh-ins yet', 'Sin pesajes aún'),
      streak: String(c.workoutsDone || 0), spark: spark(w),
      insight, suggest, suggestTarget,
      next: next ? L(`${weekday(next.scheduledFor, 'UTC').en} · ${workoutNames.get(next.workoutId) || 'Workout'}`, `${weekday(next.scheduledFor, 'UTC').es} · ${workoutNames.get(next.workoutId) || 'Entrenamiento'}`) : L('Nothing scheduled', 'Nada programado'),
      billing: billingLine(c, plan),
      nutritionNote: L('—'), noLogs: false, lowProtein: false,
      filters, unread: c.unread || 0, checkInId: c.checkinId || null,
    };
  });
}

// ---------------------------------------------------------------- snapshot

export async function coachSnapshot(db, auth, { now = new Date() } = {}) {
  const b = await db.business.findFirst();
  const tz = b.timezone || 'UTC';
  const plan = effectivePlan(b), pro = isPro(plan);
  const [user, member, today, charts, clients] = await Promise.all([
    users.publicById(auth.userId), memberships.find(auth.userId, auth.businessId), buildToday(db, { tz, now }), businessCharts(db, now), clientRows(db, { tz, now }),
  ]);
  void member;
  const byId = new Map(clients.map(c => [c.id, c]));
  const [threads, checkIns, leads, payments, programs, nutrition, automations, assist, library, sessions] = await Promise.all([
    threadList(db, { tz, now }), checkInLists(db, { tz, now }), pro ? leadList(db, { tz, now }) : { stats: { open: 0, pipeline: '$0', followUps: 0 }, items: [], locked: true },
    paymentPage(db, { tz, now }), programList(db), nutritionPage(db, { tz, now }), automationPage(db, { tz, now }), assistStats(db, today.minutesSaved), libraryList(db), sessionsToday(db, { tz, now }),
  ]);

  // Needs-you queue: every draft waiting for an approval, one card each.
  const queue = [];
  for (const i of today.items) {
    if ((i.status || 'pending') !== 'pending') continue;
    if (i.insightId && i.client && byId.has(i.client.id)) {
      const risk = i.id.startsWith('insight:') && i.pill;
      queue.push({ id: i.insightId, clientId: i.client.id, kind: risk ? 'risk' : 'automation', reason: L(risk ? i.sub || i.title : i.title), tag: risk ? L(i.pill) : i.sev === 'good' ? L('Milestone', 'Logro') : L('Automation', 'Automatización'), tone: risk ? (i.sev === 'crit' ? 'crit' : 'warn') : i.sev === 'good' ? 'good' : 'ai', draft: i.draft || '' });
    }
    for (const d of i.drafts || []) if (byId.has(d.client.id)) queue.push({ id: d.insightId, clientId: d.client.id, kind: 'nutrition', reason: L(d.detail ? `Missed protein most days: ${d.detail}` : 'Missed protein most days', d.detail ? `No llegó a su proteína casi ningún día: ${d.detail.replace(/hit (\d+) of (\d+) logged days/, 'llegó $1 de $2 días registrados')}` : 'No llegó a su proteína casi ningún día'), tag: L('Nutrition', 'Nutrición'), tone: 'warn', draft: d.text || '' });
  }

  const k = today.kpis;
  const active = clients.filter(c => ['ok', 'risk', 'checkin', 'overdue', 'new'].includes(c.kind)).length;
  const h = Math.floor((today.minutesSaved || 0) / 60), m = (today.minutesSaved || 0) % 60;
  return {
    version: 1,
    me: {
      name: user?.name || b.name, first: firstOf(user?.name || b.name), initials: initials(user?.name || b.name), email: user?.email || '',
      business: b.name, slug: b.slug, bookingUrl: `${config.appUrl.replace(/^https?:\/\//, '')}/coach/${b.slug}`,
      plan, planLabel: PLAN_LABEL[plan] || L(plan), trialDaysLeft: b.plan === 'TRIAL' && b.trialEndsAt ? Math.max(0, Math.ceil((new Date(b.trialEndsAt) - now) / 864e5)) : null,
      pro, totpEnabled: !!user?.totpEnabled, writingStyle: b.writingStyle || 'Supportive',
    },
    today: {
      minutesSaved: today.minutesSaved || 0, savedLabel: `${h}h ${String(m).padStart(2, '0')}m`,
      counts: { checkIns: checkIns.toReview.length, unread: threads.filter(t => t.unread).length, newLeads: leads.items.filter(l => l.stage === 'new').length },
      queue, sessions,
      kpis: [
        { value: money(k.mrrCents), label: L('Monthly revenue', 'Ingresos mensuales'), note: L(`${money(today.payments.collectedCents)} collected this month`, `${money(today.payments.collectedCents)} cobrado este mes`), target: 'payments' },
        { value: String(k.activeClients), label: L('Active clients', 'Clientes activos'), note: L(k.newThisMonth ? `+${k.newThisMonth} this month` : 'No new ones this month', k.newThisMonth ? `+${k.newThisMonth} este mes` : 'Ninguno nuevo este mes'), target: 'clients' },
        { value: `${k.checkinsThisWeek}`, label: L('Check-ins this week', 'Check-ins esta semana'), note: L(k.missingCheckins ? `${k.missingCheckins} missing` : 'None missing', k.missingCheckins ? `faltan ${k.missingCheckins}` : 'No falta ninguno'), target: 'checkins' },
        { value: k.retention90 != null ? `${k.retention90}%` : '—', label: L('90-day retention', 'Retención a 90 días'), note: L(k.retention90 != null ? 'Clients still with you after 90 days' : 'Shows after your first 90 days', k.retention90 != null ? 'Clientes que siguen contigo tras 90 días' : 'Aparece tras tus primeros 90 días'), target: null },
      ],
      radar: (today.radar || []).filter(r => byId.has(r.id)).map(r => ({ clientId: r.id, score: r.score || 0, why: L(r.reason || '') })),
      activeClients: active,
    },
    charts: {
      revenue: charts.revenue.map(r => ({ label: L(r.label, monthEs(r.label)), cents: r.cents, current: r.current })),
      adherence: charts.adherence.map((a, i, all) => ({ label: i === all.length - 1 ? L('This week', 'Esta semana') : L(`${all.length - 1 - i}w ago`, `hace ${all.length - 1 - i} sem`), pct: a.pct })),
      packages: charts.packages.map(p => ({ name: p.name, cents: p.cents, clients: p.clients })),
      activeClients: charts.activeClients.map(a => ({ label: L(a.label, monthEs(a.label)), count: a.count })),
    },
    clients, threads, checkIns, leads, payments, programs, nutrition, automations, assist, library,
  };
}

const MON = { Jan: 'ene', Feb: 'feb', Mar: 'mar', Apr: 'abr', May: 'may', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'sep', Oct: 'oct', Nov: 'nov', Dec: 'dic' };
const monthEs = s => MON[s] || s;

async function sessionsToday(db, { tz, now }) {
  const today = todayKey(tz, now);
  const rows = await db.workoutAssignment.findMany({ where: { scheduledFor: today }, orderBy: { status: 'asc' }, take: 30 });
  if (!rows.length) return [];
  const [clients, workouts] = await Promise.all([
    db.client.findMany({ where: { id: { in: rows.map(r => r.clientId) } }, select: { id: true, name: true } }),
    db.workout.findMany({ where: { id: { in: rows.map(r => r.workoutId) } }, select: { id: true, name: true, estMinutes: true } }),
  ]);
  const C = new Map(clients.map(c => [c.id, c])), W = new Map(workouts.map(w => [w.id, w]));
  return rows.filter(r => C.has(r.clientId)).map(r => {
    const w = W.get(r.workoutId), done = r.status === 'completed';
    return { clientId: r.clientId, name: C.get(r.clientId).name, time: done ? L('Done', 'Hecho') : L('Today', 'Hoy'), type: L(`${w?.name || 'Workout'}${w?.estMinutes ? ` · ${w.estMinutes} min` : ''}`), icon: done ? 'checkmark.circle' : 'dumbbell' };
  });
}

async function threadList(db, { tz, now }) {
  const threads = await db.thread.findMany({ where: { lastMessageAt: { not: null } }, orderBy: { lastMessageAt: 'desc' }, take: 60 });
  const clients = new Map((await db.client.findMany({ select: { id: true, name: true } })).map(c => [c.id, c]));
  const out = [];
  for (const t of threads) {
    if (!clients.has(t.clientId)) continue;
    const m = await db.message.findFirst({ where: { threadId: t.id }, orderBy: { createdAt: 'desc' }, select: { body: true, senderRole: true, createdAt: true, audioKey: true } });
    out.push({ id: t.clientId, unread: (t.coachUnread || 0) > 0, last: m ? { fromMe: m.senderRole !== 'CLIENT', text: (m.body || '').slice(0, 160), time: when(m.createdAt, tz, now), isVoice: !!m.audioKey } : null });
  }
  return out;
}

const SCALE = [['energy', 'Energy', 'Energía'], ['sleepHours', 'Sleep', 'Sueño'], ['stress', 'Stress', 'Estrés'], ['soreness', 'Soreness', 'Dolor muscular'], ['nutrition', 'Nutrition', 'Nutrición'], ['mood', 'Mood', 'Ánimo']];
function answersOf(k) {
  const out = [];
  if (k.weight != null) out.push({ question: L('Weight', 'Peso'), answer: L(`${Math.round(k.weight * 10) / 10} lb`) });
  if (k.workoutsPlanned) out.push({ question: L('Workouts', 'Entrenamientos'), answer: L(`${k.workoutsDone ?? 0} of ${k.workoutsPlanned}`, `${k.workoutsDone ?? 0} de ${k.workoutsPlanned}`) });
  for (const [key, en, es] of SCALE) if (k[key] != null) out.push({ question: L(en, es), answer: L(key === 'sleepHours' ? `${k[key]} h` : `${k[key]} / 10`) });
  return out;
}
function reportFrom(k, client, insight, { tz, now, programWeek = null, food = null }) {
  const d = insight?.draft || null;
  const flag = k.flagged ? L((d?.flags || []).find(f => f.level === 'crit')?.text || 'Mentions pain or a medical topic.', undefined) : null;
  const applied = new Set(d?.applied || []), skipped = new Set(d?.skipped || []);
  return {
    id: k.id, clientId: k.clientId, name: client?.name || 'Client',
    week: programWeek ? L(`Week ${programWeek}`, `Semana ${programWeek}`) : L('Weekly check-in', 'Check-in semanal'), when: ago(k.submittedAt, tz, now),
    flag, answers: answersOf(k), note: L(k.text || '—'),
    summary: d ? L(insight.summary || d.summary || '') : null, draft: d ? (insight.finalText || d.reply || '') : null, insightId: insight?.id || null,
    food: food ? L(food.daysLogged != null ? `Logged food on ${food.daysLogged} of 7 days${food.proteinHitDays != null ? `, protein target on ${food.proteinHitDays}` : ''}.` : 'No food logged.', food.daysLogged != null ? `Registró comida ${food.daysLogged} de 7 días${food.proteinHitDays != null ? `, objetivo de proteína en ${food.proteinHitDays}` : ''}.` : 'No registró comida.') : L('No nutrition plan yet.', 'Aún sin plan de nutrición.'),
    actions: (d?.actions || []).map((a, i) => ({ id: String(i), title: L(a.label), detail: L(a.detail || ''), button: L(a.op && a.op.type !== 'none' ? 'Apply' : 'Done', a.op && a.op.type !== 'none' ? 'Aplicar' : 'Hecho'), done: applied.has(i) || skipped.has(i) })),
    status: k.status,
  };
}

async function checkInLists(db, { tz, now }) {
  const [toReview, reviewed, missing] = await Promise.all([
    db.checkIn.findMany({ where: { status: 'submitted' }, orderBy: [{ flagged: 'desc' }, { submittedAt: 'asc' }], take: 40 }),
    db.checkIn.findMany({ where: { status: 'reviewed', submittedAt: { gte: new Date(now - 7 * DAY) } }, orderBy: { reviewedAt: 'desc' }, take: 20 }),
    missingCheckinClients(db, now),
  ]);
  const clients = new Map((await db.client.findMany({ select: { id: true, name: true, programId: true, programStartedAt: true, startedAt: true } })).map(c => [c.id, c]));
  const insights = new Map((await db.aIInsight.findMany({ where: { kind: 'checkin_summary', sourceId: { in: toReview.map(k => k.id) } }, orderBy: { createdAt: 'asc' } })).map(i => [i.sourceId, i]));
  return {
    toReview: toReview.filter(k => clients.has(k.clientId)).map(k => reportFrom(k, clients.get(k.clientId), insights.get(k.id), { tz, now })),
    reviewed: reviewed.filter(k => clients.has(k.clientId)).map(k => ({ clientId: k.clientId, name: clients.get(k.clientId).name, when: L(`Replied ${ago(k.reviewedAt || k.submittedAt, tz, now).en.toLowerCase()}`, `Respondido ${ago(k.reviewedAt || k.submittedAt, tz, now).es.toLowerCase()}`) })),
    missing: missing.filter(c => clients.has(c.id)).map(c => ({ clientId: c.id, why: c.lastCheckinAt ? L(`Last check-in ${ago(c.lastCheckinAt, tz, now).en.toLowerCase()}`, `Último check-in ${ago(c.lastCheckinAt, tz, now).es.toLowerCase()}`) : L('No check-in yet', 'Aún sin check-in') })),
  };
}

const SOURCE = { instagram_dm: L('Instagram DM', 'DM de Instagram'), booking_page: L('Booking page', 'Página de reservas'), referral: L('Referral', 'Recomendación'), walk_in: L('Walk-in', 'En persona'), google: L('Google'), other: L('Other', 'Otro') };
async function leadList(db, { tz, now }) {
  const [leads, b] = await Promise.all([db.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }), db.business.findFirst({ select: { slug: true } })]);
  const drafts = new Map((await db.aIInsight.findMany({ where: { kind: 'lead_reply', sourceId: { in: leads.map(l => l.id) } } })).map(i => [i.sourceId, i]));
  const link = `${config.appUrl.replace(/^https?:\/\//, '')}/coach/${b.slug}`;
  const open = leads.filter(l => ['new', 'contacted', 'consult', 'trial'].includes(l.stage));
  return {
    stats: { open: open.length, pipeline: money(open.reduce((n, l) => n + (l.valueCents || 0), 0)), followUps: leads.filter(l => l.stage === 'contacted' && l.nextFollowUpAt && l.nextFollowUpAt <= now).length },
    items: open.map(l => {
      const f = firstOf(l.name), goal = (l.goal || 'your goals').toLowerCase();
      const d = drafts.get(l.id);
      return {
        id: l.id, name: l.name, initials: initials(l.name), avatar: avatar(l.id), source: SOURCE[l.source] || SOURCE.other, when: ago(l.createdAt, tz, now),
        interest: L(l.goal || l.firstMessage || '—'), stage: l.stage === 'new' ? 'new' : l.stage === 'consult' || l.stage === 'trial' ? 'booked' : 'replied',
        draft: (d && draftText(d)) || (d?.draft?.reply) || `Hi ${f}, thanks for reaching out about ${goal}! I’d love to hear more. Do you have 20 minutes this week for a free call? You can pick a time here: ${link}`,
      };
    }),
    bookingUrl: link,
  };
}

async function paymentPage(db, { tz, now }) {
  const [s, list, plans, subs] = await Promise.all([
    revenueSummary(db, now),
    db.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 40 }),
    db.clientPlan.findMany({ orderBy: { createdAt: 'asc' } }),
    db.subscription.findMany({ where: { status: { in: ['active', 'past_due', 'trialing'] } }, select: { clientPlanId: true, status: true } }),
  ]);
  const clients = new Map((await db.client.findMany({ select: { id: true, name: true } })).map(c => [c.id, c]));
  const paid = list.filter(p => p.status === 'paid'), late = list.filter(p => p.status === 'failed');
  const onTime = paid.length + late.length ? Math.round(paid.length / (paid.length + late.length) * 100) : null;
  const counts = new Map(); for (const sub of subs) counts.set(sub.clientPlanId, (counts.get(sub.clientPlanId) || 0) + 1);
  const pk = plans.filter(p => p.active !== false).map(p => ({ name: p.name, meta: L(`${plural(counts.get(p.id) || 0, 'client')} · ${money(p.priceCents)}/${p.interval === 'week' ? 'wk' : p.interval === 'month' ? 'mo' : 'once'}`, `${counts.get(p.id) || 0} ${(counts.get(p.id) || 0) === 1 ? 'cliente' : 'clientes'} · ${money(p.priceCents)}/${p.interval === 'week' ? 'sem' : p.interval === 'month' ? 'mes' : 'pago único'}`), total: money(monthlyCents(p) * (counts.get(p.id) || 0)), value: monthlyCents(p) * (counts.get(p.id) || 0) })).sort((a, b) => b.value - a.value);
  return {
    mrr: money(s.mrrCents), mrrNote: L(`From ${plural(s.payingClients, 'paying client')}`, `De ${s.payingClients} ${s.payingClients === 1 ? 'cliente que paga' : 'clientes que pagan'}`),
    collected: money(s.collectedCents), outstanding: money(s.failedCents + s.upcomingCents), avg: money(s.avgPerClientCents), failedCount: s.failedCount, onTime: onTime != null ? `${onTime}%` : '—',
    attention: late.filter(p => clients.has(p.clientId)).slice(0, 10).map(p => ({ id: p.id, clientId: p.clientId, name: clients.get(p.clientId).name, initials: initials(clients.get(p.clientId).name), avatar: avatar(p.clientId), sub: L(`${money(p.amountCents)} failed ${ago(p.createdAt, tz, now).en.toLowerCase()}${p.remindedAt ? ' · reminder sent' : ''}`, `${money(p.amountCents)} falló ${ago(p.createdAt, tz, now).es.toLowerCase()}${p.remindedAt ? ' · recordatorio enviado' : ''}`), reminded: !!p.remindedAt })),
    reminderDraft: 'Hi {first}, your last payment didn’t go through. You can update your card in the app under Me → Billing. Thanks!',
    packages: pk,
    recent: paid.filter(p => clients.has(p.clientId)).slice(0, 10).map(p => ({ clientId: p.clientId, name: clients.get(p.clientId).name, initials: initials(clients.get(p.clientId).name), avatar: avatar(p.clientId), when: day(p.paidAt || p.createdAt, tz), amount: money(p.amountCents) })),
  };
}

async function programList(db) {
  const [programs, counts] = await Promise.all([
    db.program.findMany({ where: { archived: false }, orderBy: { updatedAt: 'desc' }, include: { workouts: { where: { clientId: null }, select: { id: true } } } }),
    db.client.groupBy({ by: ['programId'], where: { status: { in: ACTIVE }, programId: { not: null } }, _count: { _all: true } }),
  ]);
  const C = Object.fromEntries(counts.map(c => [c.programId, c._count._all]));
  return programs.map(p => {
    const n = C[p.id] || 0, ai = p.source === 'assist';
    return { id: p.id, name: p.name, meta: L(`${p.weeks} weeks · ${p.daysPerWeek} days a week${p.level ? ` · ${p.level}` : ''}`, `${p.weeks} semanas · ${p.daysPerWeek} días por semana${p.level ? ` · ${p.level}` : ''}`), tag: ai ? L('Assist draft', 'Borrador de Assist') : n ? L(plural(n, 'client'), `${n} ${n === 1 ? 'cliente' : 'clientes'}`) : L('Template', 'Plantilla'), tone: ai ? 'ai' : n ? 'good' : 'muted', kind: ai ? 'assistDraft' : n ? 'active' : 'template', clients: n };
  });
}

async function nutritionPage(db, { tz, now }) {
  const o = await nutritionOverview(db, { tz, now });
  const k = o.kpis;
  return {
    stats: [
      { value: String(k.tracking), label: L('On a plan', 'Con plan') },
      { value: k.proteinHitPct != null ? `${k.proteinHitPct}%` : '—', label: L('Protein days hit', 'Días con proteína') },
      { value: String(k.logging5), label: L('Logging 5+ days', 'Registran 5+ días') },
    ],
    summary: L(k.tracking ? `${plural(k.tracking, 'client')} ${k.tracking === 1 ? 'has' : 'have'} a nutrition plan. ${plural(k.logging5, 'client')} logged food on 5 or more days this week, with ${k.photos} meal ${k.photos === 1 ? 'photo' : 'photos'}.` : 'No one has a nutrition plan yet. Open a client’s Food tab and let Assist build one.',
      k.tracking ? `${k.tracking} ${k.tracking === 1 ? 'cliente tiene' : 'clientes tienen'} plan de nutrición. ${k.logging5} registraron comida 5 o más días esta semana, con ${k.photos} ${k.photos === 1 ? 'foto' : 'fotos'} de comidas.` : 'Aún nadie tiene plan de nutrición. Abre la pestaña Comida de un cliente y deja que Assist cree uno.'),
    rows: o.rows.filter(r => r.approach && r.proteinG).map(r => {
      const pct = r.daysLogged ? Math.round(r.proteinHitDays / r.daysLogged * 100) : 0;
      return { clientId: r.id, percent: pct, label: L(r.daysLogged ? `${r.proteinHitDays} of ${r.daysLogged} days` : 'Nothing logged', r.daysLogged ? `${r.proteinHitDays} de ${r.daysLogged} días` : 'Nada registrado') };
    }),
    mealPlans: o.templates.map(t => ({ id: t.id, name: t.name, meta: L(`${t.days} ${t.days === 1 ? 'day' : 'days'}${t.calories ? ` · ${t.calories.toLocaleString('en-US')} kcal` : ''} · ${plural(t.assigned, 'client')}`, `${t.days} ${t.days === 1 ? 'día' : 'días'}${t.calories ? ` · ${t.calories.toLocaleString('en-US')} kcal` : ''} · ${t.assigned} ${t.assigned === 1 ? 'cliente' : 'clientes'}`) })),
  };
}

const AUTO = {
  missing_checkin: [L('Check-in reminder', 'Recordatorio de check-in'), L('Sunday evening, to anyone who hasn’t checked in', 'Domingo en la noche, a quien no haya hecho su check-in')],
  failed_payment: [L('Failed payment', 'Pago fallido'), L('Tells you and sends a card-update reminder', 'Te avisa y envía un recordatorio para actualizar la tarjeta')],
  missed_workouts: [L('Missed workouts', 'Entrenamientos perdidos'), L('Assist drafts a check-in message for you to approve', 'Assist redacta un mensaje para que lo apruebes')],
  milestone: [L('Milestones', 'Logros'), L('Assist drafts a congratulations at workout milestones', 'Assist redacta una felicitación en cada logro')],
  inactive_7d: [L('Gone quiet', 'Sin actividad'), L('Tells you when a client hasn’t opened the app in a while', 'Te avisa cuando un cliente lleva días sin abrir la app')],
};
async function automationPage(db, { tz, now }) {
  const [autos, recent] = await Promise.all([db.automation.findMany(), db.automationRun.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })]);
  return {
    items: autos.map(a => ({ id: a.id, name: (AUTO[a.key] || [L(a.key)])[0], detail: (AUTO[a.key] || [null, L('')])[1], enabled: !!a.enabled })),
    runs: recent.map(r => ({ date: day(r.createdAt, tz), text: L(r.summary || r.outcome) })),
  };
}

async function assistStats(db, minutesSaved) {
  const [count, decided] = await Promise.all([
    db.aIUsage.count({ where: { createdAt: { gte: startOfMonthUtc() } } }),
    db.aIInsight.groupBy({ by: ['status'], where: { decidedAt: { gte: startOfMonthUtc() } }, _count: { _all: true } }),
  ]);
  const d = Object.fromEntries(decided.map(x => [x.status, x._count._all]));
  const total = (d.approved || 0) + (d.edited || 0) + (d.dismissed || 0);
  return { requests: String(count), approvedAsIs: total ? `${Math.round((d.approved || 0) / total * 100)}%` : '—', timeSaved: `${Math.round((minutesSaved || 0) / 60)}h` };
}

const GROUP = { squat: 'legs', hinge: 'legs', lunge: 'legs', jump: 'legs', push: 'push', pull: 'pull', core: 'core', carry: 'core', cardio: 'core', iso: 'core' };
async function libraryList(db) {
  const [all, hidden] = await Promise.all([db.exercise.findMany({ orderBy: { name: 'asc' } }), hiddenExerciseIds(db)]);
  const byId = new Map(all.map(e => [e.id, e]));
  // The coach's own exercises first in mind: never cut them off by the 400 limit.
  const list = [...all.filter(e => e.businessId && !hidden.has(e.id)), ...all.filter(e => !e.businessId && !hidden.has(e.id))].slice(0, 600).sort((a, b) => a.name.localeCompare(b.name));
  return list.map(e => ({
    id: e.id, name: L(e.name), group: GROUP[e.pattern] || 'core', equipment: L(e.equipment || '—'),
    custom: !!e.businessId, mediaType: e.mediaKey ? e.mediaType : null, level: e.level || null, pattern: e.pattern,
    howTo: (Array.isArray(e.howTo) ? e.howTo : e.howTo ? String(e.howTo).split(/\n+/) : HOWTO[e.pattern] || HOWTO.iso || []).map(x => L(x)),
    alternatives: (Array.isArray(e.altIds) ? e.altIds : []).map(id => byId.get(id)).filter(Boolean).slice(0, 4).map(a => L(a.name)),
  }));
}

// ---------------------------------------------------------------- one client

export async function clientDetail(db, id, { now = new Date() } = {}) {
  const b = await db.business.findFirst({ select: { timezone: true } });
  const tz = b?.timezone || 'UTC';
  const p = await clientProfile(db, id, { tz, now });
  if (!p) return null;
  const c = p.client;
  const ex = await exerciseMap(db);
  const [weights, bests, measurements, checkins, notes, nutrition, risk, program] = await Promise.all([
    weightSeries(db, c.id, 8), personalBests(db, c.id, ex, 5),
    db.measurement.findMany({ where: { clientId: c.id }, orderBy: { takenAt: 'desc' }, take: 20 }),
    db.checkIn.findMany({ where: { clientId: c.id }, orderBy: { submittedAt: 'desc' }, take: 6 }),
    db.note.findMany({ where: { clientId: c.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    clientNutrition(db, await db.client.findFirst({ where: { id: c.id } }), { tz, now }),
    db.aIInsight.findFirst({ where: { clientId: c.id, kind: 'risk', status: 'pending' }, orderBy: { createdAt: 'desc' } }),
    programWeekRows(db, c.id, { tz, now }),
  ]);
  const w = weights.map(x => x.value);
  const plan = nutrition.plan, week = nutrition.week;
  const todayRow = week.days?.at(-1) || null;
  const m = measurements.find(x => x.waist || x.hips || x.chest || x.arm || x.thigh);
  const mPrev = m ? measurements.find(x => x.takenAt < m.takenAt && (x.waist || x.hips || x.chest || x.arm || x.thigh)) : null;
  const measures = m ? [['waist', 'Waist', 'Cintura'], ['hips', 'Hips', 'Cadera'], ['chest', 'Chest', 'Pecho'], ['arm', 'Arm', 'Brazo'], ['thigh', 'Thigh', 'Muslo']].filter(([k]) => m[k] != null).map(([k, en, es]) => ({ name: L(en, es), value: `${m[k]} in`, change: mPrev?.[k] != null ? L(signed(m[k] - mPrev[k], ' in')) : L('first measurement', 'primera medida') })) : [];
  const lowProtein = !!(plan.proteinG && week.daysLogged && week.proteinHitDays / week.daysLogged < 0.5);
  return {
    id: c.id,
    riskScore: c.risk?.score ?? null,
    riskWhy: risk ? L(risk.summary || (c.risk?.reasons || []).join(' · ')) : c.risk ? L((c.risk.reasons || []).join(' · ')) : null,
    stats: [
      { value: c.adherence != null ? `${c.adherence}%` : '—', label: L('Adherence', 'Cumplimiento'), note: L('last 2 weeks', 'últimas 2 semanas') },
      { value: w.length ? (Math.round(w.at(-1) * 10) / 10).toFixed(1) : '—', label: L('Weight', 'Peso'), note: w.length >= 2 ? L(`${signed(w.at(-1) - w.at(-2), ' lb')} last`, `${signed(w.at(-1) - w.at(-2), ' lb')} último`) : L('lb') },
      { value: String(c.workoutsDone || 0), label: L('Workouts', 'Entrenamientos'), note: L('done so far', 'hechos hasta hoy') },
    ],
    weightTotal: w.length >= 2 ? L(`${signed(w.at(-1) - w[0], ' lb')} total`, `${signed(w.at(-1) - w[0], ' lb')} en total`) : L('No weigh-ins yet', 'Sin pesajes aún'),
    spark: spark(w),
    habits: nutrition.habits.map(h => ({ title: L(h.title), value: L(`${h.daysThisWeek} of 7 days`, `${h.daysThisWeek} de 7 días`), on: h.daysThisWeek >= 4 })),
    activity: p.activity.slice(0, 6).map(a => ({ date: day(a.at, tz), text: L(a.text) })),
    next: program.nextLabel, billing: billingLine({ payStatus: c.payStatus }, p.plan), lifetimeValue: money(p.stats.lifetimeCents),
    program: program.summary,
    food: {
      logged: L(todayRow?.calories ? 'Logged today' : 'Nothing logged today', todayRow?.calories ? 'Registró hoy' : 'Nada registrado hoy'),
      macros: plan.approach === 'habits' && !plan.calories ? [] : [
        { label: L('Calories', 'Calorías'), now: Math.round(todayRow?.calories || 0), target: plan.calories || 0, unit: 'kcal', warn: false },
        { label: L('Protein', 'Proteína'), now: Math.round(todayRow?.proteinG || 0), target: plan.proteinG || 0, unit: 'g', warn: lowProtein },
        { label: L('Carbs', 'Carbohidratos'), now: Math.round(todayRow?.carbsG || 0), target: plan.carbsG || 0, unit: 'g', warn: false },
        { label: L('Fat', 'Grasa'), now: Math.round(todayRow?.fatG || 0), target: plan.fatG || 0, unit: 'g', warn: false },
      ].filter(x => x.target > 0),
      note: plan.id ? L(week.daysLogged ? `Logged food on ${week.daysLogged} of 7 days${plan.proteinG ? `, protein target reached on ${week.proteinHitDays}` : ''}.` : 'No food logged this week.', week.daysLogged ? `Registró comida ${week.daysLogged} de 7 días${plan.proteinG ? `, objetivo de proteína en ${week.proteinHitDays}` : ''}.` : 'No registró comida esta semana.') : L('No nutrition plan yet. Ask Assist to build one below.', 'Aún sin plan de nutrición. Pídele a Assist que cree uno abajo.'),
      plan: { approach: plan.approach, calories: plan.calories, proteinG: plan.proteinG, carbsG: plan.carbsG, fatG: plan.fatG, coachNote: plan.coachNote, saved: !!plan.id },
      lowProtein,
    },
    bests: bests.map(x => ({ name: L(x.name), value: `${x.weight} lb${x.reps ? ` × ${x.reps}` : ''}`, date: L('') })),
    measures,
    photos: (await db.progressPhoto.findMany({ where: { clientId: c.id }, orderBy: { takenAt: 'desc' }, take: 3, select: { takenAt: true } })).map(x => day(x.takenAt, tz)),
    checkInHistory: checkins.map((k, i) => ({ week: L(`Check-in ${checkins.length - i}`, `Check-in ${checkins.length - i}`), date: day(k.submittedAt, tz), label: k.status === 'reviewed' ? L('Replied', 'Respondido') : L('To review', 'Por revisar'), tone: k.status === 'reviewed' ? 'good' : k.flagged ? 'crit' : 'info', id: k.id })),
    notes: notes.map(n => ({ date: day(n.createdAt, tz), text: L(n.body) })),
  };
}

async function programWeekRows(db, clientId, { tz, now }) {
  const c = await db.client.findFirst({ where: { id: clientId }, select: { programId: true, programStartedAt: true, startedAt: true } });
  const today = todayKey(tz, now), mon = weekStart(today);
  const rows = await db.workoutAssignment.findMany({ where: { clientId, scheduledFor: { gte: mon, lt: addDays(mon, 7) } }, orderBy: { scheduledFor: 'asc' } });
  const next = await db.workoutAssignment.findFirst({ where: { clientId, scheduledFor: { gte: today }, status: { not: 'completed' } }, orderBy: { scheduledFor: 'asc' } });
  const W = new Map((await db.workout.findMany({ where: { id: { in: [...rows.map(r => r.workoutId), next?.workoutId].filter(Boolean) } }, select: { id: true, name: true, estMinutes: true, blocks: true } })).map(w => [w.id, w]));
  const program = c?.programId ? await db.program.findFirst({ where: { id: c.programId }, select: { id: true, name: true, weeks: true } }) : null;
  const items = w => (Array.isArray(w?.blocks) ? w.blocks.reduce((n, b) => n + (b.items?.length || 0), 0) : 0);
  return {
    nextLabel: next ? L(`${weekday(next.scheduledFor, 'UTC').en} · ${W.get(next.workoutId)?.name || 'Workout'}`, `${weekday(next.scheduledFor, 'UTC').es} · ${W.get(next.workoutId)?.name || 'Entrenamiento'}`) : L('Nothing scheduled', 'Nada programado'),
    summary: {
      name: program?.name || null,
      rows: rows.map(r => {
        const w = W.get(r.workoutId), done = r.status === 'completed', missed = !done && r.scheduledFor < today, isToday = +r.scheduledFor === +today;
        return { day: weekday(r.scheduledFor, 'UTC'), name: L(w?.name || 'Workout'), meta: L(`${items(w)} exercises${w?.estMinutes ? ` · ${w.estMinutes} min` : ''}`, `${items(w)} ejercicios${w?.estMinutes ? ` · ${w.estMinutes} min` : ''}`), label: done ? L('Done', 'Hecho') : missed ? L('Missed', 'Perdido') : isToday ? L('Today', 'Hoy') : L('Upcoming', 'Próximo'), tone: done ? 'good' : missed ? 'crit' : isToday ? 'info' : 'muted' };
      }),
    },
  };
}

// ---------------------------------------------------------------- one thread, one check-in

export async function threadFor(db, clientId, { now = new Date() } = {}) {
  const tz = (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';
  const c = await db.client.findFirst({ where: { id: clientId }, select: { id: true } });
  if (!c) return null;
  const t = await db.thread.findFirst({ where: { clientId } });
  const messages = t ? await db.message.findMany({ where: { threadId: t.id }, orderBy: { createdAt: 'desc' }, take: 120 }) : [];
  if (t?.coachUnread) {
    await db.thread.update({ where: { id: t.id }, data: { coachUnread: 0 } });
    await db.message.updateMany({ where: { threadId: t.id, senderRole: 'CLIENT', readAt: null }, data: { readAt: new Date() } });
  }
  return {
    id: clientId,
    messages: messages.reverse().map(m => {
      const v = voiceFields(m, { coach: true });
      return { id: m.id, fromMe: m.senderRole !== 'CLIENT', text: m.body || '', time: when(m.createdAt, tz, now), isVoice: !!v.voice, ...(v.voice ? { durationS: v.voice.durationS, summary: v.voice.summary || null, flag: v.voice.flag || null } : {}) };
    }),
  };
}

export async function checkInReport(db, id, { now = new Date(), generate = true } = {}) {
  const tz = (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';
  const k = await db.checkIn.findFirst({ where: { id } });
  if (!k) return null;
  const client = await db.client.findFirst({ where: { id: k.clientId } });
  const insight = generate ? await checkinSummary(db, k) : await db.aIInsight.findFirst({ where: { kind: 'checkin_summary', sourceId: k.id } });
  const { checkinNutrition } = await import('../nutrition/insights.js');
  const food = client ? await checkinNutrition(db, client, k, tz) : null;
  const { programWeek } = await import('../core/training.js');
  return reportFrom(k, client, insight, { tz, now, programWeek: client?.programId ? programWeek(client, now) : null, food });
}
