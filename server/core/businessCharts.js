// The "Your business" charts on Today and Payments (the same four the iPhone app shows):
// revenue by month, workout adherence by week, monthly revenue by package, and active clients.
// Everything comes from the coach's own tenant-scoped data. Amounts in cents.
import { monthlyCents } from './money.js';
import { DAY } from '../lib/time.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthStart = (d, offset = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
const ACTIVE = ['NEW', 'ACTIVE'];

export async function businessCharts(db, now = new Date()) {
  const from6 = monthStart(now, -5);
  const weekStart = new Date(now); weekStart.setUTCHours(0, 0, 0, 0); weekStart.setTime(weekStart.getTime() - ((weekStart.getUTCDay() + 6) % 7) * DAY);
  const from8w = new Date(weekStart.getTime() - 7 * 7 * DAY);
  const [paid, assignments, clients, plans, subs] = await Promise.all([
    db.payment.findMany({ where: { status: 'paid', paidAt: { gte: from6 } }, select: { amountCents: true, paidAt: true } }),
    db.workoutAssignment.findMany({ where: { scheduledFor: { gte: from8w, lt: now } }, select: { scheduledFor: true, status: true } }),
    db.client.findMany({ select: { status: true, startedAt: true, updatedAt: true, clientPlanId: true } }),
    db.clientPlan.findMany({ select: { id: true, name: true, priceCents: true, interval: true } }),
    db.subscription.findMany({ where: { status: { in: ['active', 'past_due'] } }, select: { clientPlanId: true, clientId: true } }),
  ]);

  // Revenue collected per month, last 6 months (this month so far last).
  const revenue = Array.from({ length: 6 }, (_, i) => { const s = monthStart(now, i - 5); return { key: `${s.getUTCFullYear()}-${s.getUTCMonth()}`, label: MONTHS[s.getUTCMonth()], cents: 0, current: i === 5 }; });
  for (const p of paid) { const d = new Date(p.paidAt); const r = revenue.find(x => x.key === `${d.getUTCFullYear()}-${d.getUTCMonth()}`); if (r) r.cents += p.amountCents; }

  // Share of scheduled workouts completed, per week, last 8 weeks.
  const adherence = Array.from({ length: 8 }, (_, i) => ({ start: new Date(from8w.getTime() + i * 7 * DAY), done: 0, scheduled: 0 }));
  for (const a of assignments) {
    const i = Math.floor((new Date(a.scheduledFor) - from8w) / (7 * DAY));
    if (i < 0 || i > 7) continue;
    adherence[i].scheduled++; if (a.status === 'completed') adherence[i].done++;
  }

  // Monthly recurring revenue by package (active memberships), biggest first.
  const byPlan = new Map(plans.map(p => [p.id, { name: p.name, cents: 0, clients: new Set() }]));
  for (const s of subs) { const plan = plans.find(p => p.id === s.clientPlanId); const b = byPlan.get(s.clientPlanId); if (!b) continue; b.cents += monthlyCents(plan); b.clients.add(s.clientId); }
  const packages = [...byPlan.values()].filter(b => b.cents > 0).map(b => ({ name: b.name, cents: b.cents, clients: b.clients.size })).sort((a, b) => b.cents - a.cents).slice(0, 6);

  // Active clients at the end of each month, last 6 months.
  const activeByMonth = Array.from({ length: 6 }, (_, i) => {
    const end = i === 5 ? now : monthStart(now, i - 4);
    const count = clients.filter(c => new Date(c.startedAt) <= end && (ACTIVE.includes(c.status) || (c.status !== 'NEW' && new Date(c.updatedAt) > end))).length;
    return { label: MONTHS[monthStart(now, i - 5).getUTCMonth()], count };
  });

  return {
    revenue: revenue.map(({ label, cents, current }) => ({ label, cents, current })),
    adherence: adherence.map(w => ({ weekOf: w.start.toISOString().slice(0, 10), pct: w.scheduled ? Math.round(w.done / w.scheduled * 100) : null, done: w.done, scheduled: w.scheduled })),
    packages,
    activeClients: activeByMonth,
  };
}
