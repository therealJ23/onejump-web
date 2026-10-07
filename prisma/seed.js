// Seeds a development database with the prototype's sample data:
//  - OneJump's global exercise library (~150 exercises)
//  - Reyes Strength (Dani Reyes, Pro trial) with 18 clients and months of history
//  - Northside Barbell (Alex Kim), a second workspace that must stay invisible to Dani
//  - Mike Torres as a client login, and a OneJump platform admin
// Then runs the real nightly radar and automations so Today has live drafts.
//
//   npm run db:seed          (refuses to run twice)
//   npm run db:reset         (wipes the database, migrates and seeds)
import 'dotenv/config';
import { users, businesses, memberships, library } from '../server/db/system.js';
import { dbForBusiness } from '../server/db/tenant.js';
import { disconnectPrisma } from '../server/db/prisma.js';
import { hashPassword } from '../server/auth/password.js';
import { EXERCISES, HOWTO } from '../server/seed/exercises.js';
import { loadSampleWorkspace } from '../server/seed/sampleWorkspace.js';
import { ensureAutomations } from '../server/core/automationTemplates.js';
import { runRadar } from '../server/core/radar.js';
import { runAutomations } from '../server/core/automations.js';
import { sendMessage } from '../server/core/messaging.js';
import { assignProgram } from '../server/core/training.js';

export const DEMO_PASSWORD = 'onejump-demo-2026';

export async function seed({ log = console.log, now = new Date() } = {}) {
  if (await users.byEmail('dani@reyesstrength.com')) {
    log('[seed] already seeded (dani@reyesstrength.com exists). Use `npm run db:reset` to start over.');
    return null;
  }
  const n = await library.seedGlobal(EXERCISES, HOWTO);
  log(`[seed] exercise library: ${n} exercises`);
  const pw = await hashPassword(DEMO_PASSWORD);

  // Reyes Strength
  const dani = await users.create({ email: 'dani@reyesstrength.com', name: 'Dani Reyes', passwordHash: pw });
  const mike = await users.create({ email: 'mike.t@example.com', name: 'Mike Torres' });
  const b1 = await businesses.createWithOwner({ userId: dani.id, name: 'Reyes Strength', slug: 'dani' });
  const db1 = dbForBusiness(b1.id);
  await db1.business.update({ where: { id: b1.id }, data: {
    timezone: 'America/New_York', coachingType: 'Hybrid', clientBand: '16–30', specialties: ['Fat loss', 'Strength', 'Beginners'], writingStyle: 'Supportive',
    goals: ['Save time', 'Keep clients longer'], availability: { days: [1, 2, 3, 4, 5], from: 6, to: 19 }, onboardedAt: now,
    trialEndsAt: new Date(now.getTime() + 9 * 864e5), stripeAccountId: 'acct_mock_reyes', stripeAccountStatus: 'active',
  } });
  await db1.membership.updateMany({ where: { userId: dani.id }, data: { title: 'Strength coach · NSCA-CSCS', bio: 'I coach busy adults who want to get genuinely strong, lose the extra weight and actually enjoy training. Online from anywhere, or in person at the studio.' } });
  await memberships.addClient(mike.id, b1.id);
  const { clients } = await loadSampleWorkspace(db1, { now, coachUserId: dani.id, clientUsers: { c1: mike.id } });
  log(`[seed] Reyes Strength: ${Object.keys(clients).length} clients`);

  // Northside Barbell (another tenant)
  const alex = await users.create({ email: 'alex@northsidebarbell.com', name: 'Alex Kim', passwordHash: pw });
  const jordan = await users.create({ email: 'jordan.p@example.com', name: 'Jordan Pike' });
  const b2 = await businesses.createWithOwner({ userId: alex.id, name: 'Northside Barbell', slug: 'northside' });
  const db2 = dbForBusiness(b2.id);
  await db2.business.update({ where: { id: b2.id }, data: { plan: 'STUDIO', planStatus: 'active', brandColor: '#B9D9E8', coachingType: 'In person', onboardedAt: now, timezone: 'America/Chicago' } });
  await ensureAutomations(db2);
  await memberships.addClient(jordan.id, b2.id);
  const plan2 = await db2.clientPlan.create({ data: { name: 'Barbell Club', priceCents: 19900, interval: 'month', description: '3 coached sessions a week' } });
  const sq = await db2.exercise.findFirst({ where: { name: 'Back squat' } });
  const prog2 = await db2.program.create({ data: { name: 'Powerlifting Prep', weeks: 12, daysPerWeek: 3, level: 'Advanced' } });
  await db2.workout.create({ data: { programId: prog2.id, name: 'Heavy squat', day: 1, estMinutes: 70, blocks: [{ id: 'b1', kind: 'single', items: [{ id: 'i1', exerciseId: sq.id, tempo: '', notes: '', sets: [{ reps: '3', load: '315 lb', rpe: '8', rest: '240' }] }] }] } });
  const x = {};
  for (const [k, name, goal, pay, uid] of [['x1', 'Jordan Pike', 'Powerlifting total 1,200', 'paid', jordan.id], ['x2', 'Riley Chen', 'Lose 20 lb', 'paid', null], ['x3', 'Morgan Ruiz', 'First pull-up', 'failed', null]]) {
    x[k] = await db2.client.create({ data: { name, goal, payStatus: pay, userId: uid, email: `${k}@northside.example`, clientPlanId: plan2.id, mode: 'In person', startedAt: new Date(now.getTime() - 40 * 864e5) } });
    await assignProgram(db2, { clientId: x[k].id, programId: prog2.id, tz: 'America/Chicago', now });
    await db2.subscription.create({ data: { clientId: x[k].id, clientPlanId: plan2.id, status: pay === 'failed' ? 'past_due' : 'active' } });
    await db2.checkIn.create({ data: { clientId: x[k].id, weekOf: now, weight: 180, sleepHours: 7, energy: 7, text: `${name.split(' ')[0]}’s private check-in at Northside.`, status: 'submitted' } });
    await sendMessage(db2, { clientId: x[k].id, body: `Private message from ${name} to Northside Barbell.`, senderRole: 'CLIENT', senderUserId: uid });
    await db2.measurement.create({ data: { clientId: x[k].id, weight: 180 } });
  }
  await db2.payment.create({ data: { clientId: x.x3.id, amountCents: 19900, status: 'failed', failureReason: 'Card declined' } });
  await db2.lead.create({ data: { name: 'Northside lead', source: 'walk_in', goal: 'Get strong' } });
  await db2.note.create({ data: { clientId: x.x1.id, authorUserId: alex.id, body: 'Northside private note.' } });
  log('[seed] Northside Barbell: 3 clients');

  // Platform admin
  const ops = await users.create({ email: 'ops@onejumpfit.com', name: 'OneJump Ops', passwordHash: pw });
  await users.update(ops.id, { isPlatformAdmin: true });

  // Run the real nightly jobs so the radar and automations have produced drafts.
  const r1 = await runRadar(db1, { tz: 'America/New_York', now });
  const a1 = await runAutomations(db1, { tz: 'America/New_York', now, only: ['milestone', 'missed_workouts'] });
  await runRadar(db2, { tz: 'America/Chicago', now });
  log(`[seed] radar scored ${r1.scored} clients, drafted ${r1.created} outreach messages; automations drafted ${a1.runs}`);
  log(`[seed] done. Log in at /login as dani@reyesstrength.com / ${DEMO_PASSWORD} (dev only).`);
  return { b1, b2, dani, mike, alex, ops };
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seed().then(async () => { await disconnectPrisma(); process.exit(0); }, async e => { console.error('[seed] failed:', e); await disconnectPrisma(); process.exit(1); });
}
