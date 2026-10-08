// End-to-end API flows with the sample data: inviting and joining, logging a workout,
// onboarding, booking requests, plan limits, and the background jobs.
import { describe, it, expect, beforeAll } from 'vitest';
import { fixtures, browser, loginCoach, loginClient, lastLinkFor, uniqueEmail } from './helpers.js';
import { dbForBusiness } from '../server/db/tenant.js';
import { runAutomations } from '../server/core/automations.js';
import { runRadar } from '../server/core/radar.js';

let f, dani;
beforeAll(async () => { f = await fixtures(); dani = await loginCoach(); });

describe('invite → join → train', () => {
  it('a coach invites a client by email and the client opens the app from the link', async () => {
    const email = uniqueEmail('client');
    const program = (await dani.get('/api/programs')).body.programs[0];
    const r = await dani.post('/api/clients', { name: 'Nina Park', email, goal: 'Get stronger', programId: program.id });
    expect(r.status).toBe(201);
    const link = lastLinkFor(email);
    expect(link.pathname).toMatch(/^\/invite\//);
    const token = link.pathname.split('/')[2];

    const nina = await browser();
    const info = await nina.get(`/api/join/invite/${token}`);
    expect(info.body.business.name).toBe('Reyes Strength');
    expect(info.body.client.name).toBe('Nina Park');
    const ok = await nina.post(`/api/join/invite/${token}/accept`, { name: 'Nina Park', email });
    expect(ok.status).toBe(200);
    const today = await nina.get('/api/me/today');
    expect(today.status).toBe(200);
    expect(today.body.program.name).toBe(program.name);
    expect((await (await browser()).get(`/api/join/invite/${token}`)).status).toBe(404); // single use
    const notif = await f.dbA.notification.findFirst({ where: { title: 'Nina Park joined your app' } });
    expect(notif).toBeTruthy();
  });

  it('the open join link always confirms the email before logging anyone in', async () => {
    const email = uniqueEmail('joiner');
    const b = await browser();
    const r = await b.post('/api/join/link/dani', { name: 'Leo Grant', email, goal: 'First 5K' });
    expect(r.status).toBe(200);
    expect((await b.get('/api/me/today')).status).toBe(401);
    const token = lastLinkFor(email).searchParams.get('token');
    expect((await b.post('/api/auth/magic', { token })).status).toBe(200);
    expect((await b.get('/api/me/today')).status).toBe(200);
  });

  it('a client logs a workout once; the coach’s numbers update', async () => {
    const mike = await loginClient();
    const a = await f.dbA.workoutAssignment.findFirst({ where: { clientId: f.mike.id, status: 'scheduled' }, orderBy: { scheduledFor: 'asc' } });
    const w = (await mike.get(`/api/me/workouts/${a.id}`)).body.workout;
    const before = (await f.dbA.client.findFirst({ where: { id: f.mike.id } })).workoutsDone;
    const sets = w.exercises.map(e => ({ exerciseId: e.exerciseId, sets: e.sets.map(s => ({ weight: s.weight || 0, reps: s.reps || 8, done: true })) }));
    const r = await mike.post(`/api/me/workouts/${a.id}/complete`, { sets, rpe: 7, soreness: 4, note: 'Felt strong' });
    expect(r.status).toBe(200);
    expect(r.body.workoutNumber).toBe(before + 1);
    expect(r.body.volume).toBeGreaterThan(0);
    expect((await mike.post(`/api/me/workouts/${a.id}/complete`, { sets, rpe: 7 })).status).toBe(409);
    const profile = (await dani.get(`/api/clients/${f.mike.id}`)).body;
    expect(profile.client.workoutsDone).toBe(before + 1);
  });

  it('a workout note that mentions pain alerts the coach', async () => {
    const mike = await loginClient();
    const a = await f.dbA.workoutAssignment.findFirst({ where: { clientId: f.mike.id, status: 'scheduled' }, orderBy: { scheduledFor: 'asc' } });
    await mike.post(`/api/me/workouts/${a.id}/complete`, { sets: [], rpe: 6, note: 'My lower back hurts after deadlifts' });
    expect(await f.dbA.notification.findFirst({ where: { title: { contains: 'mentioned hurts after a workout' } } })).toBeTruthy();
  });

  it('messages go both ways and unread counts clear when read', async () => {
    const mike = await loginClient();
    await mike.post('/api/me/messages', { body: 'Quick question about Thursday' });
    const threads = (await dani.get('/api/threads')).body.threads;
    expect(threads.find(t => t.clientId === f.mike.id).unread).toBeGreaterThan(0);
    await dani.get(`/api/threads/${f.mike.id}`);
    expect((await dani.get('/api/threads')).body.threads.find(t => t.clientId === f.mike.id).unread).toBe(0);
  });
});

describe('coach onboarding', () => {
  it('saves each step and finishes with a summary', async () => {
    const b = await browser();
    await b.post('/api/auth/signup', { name: 'Ana Coach', email: uniqueEmail(), password: 'a-long-password-1' });
    const steps = [{ name: 'Ana Ruiz', timezone: 'America/Chicago' }, { biz: 'Ruiz Performance' }, { type: 'Online' }, { count: '6–15' }, { spec: ['Strength', 'Athletes'] }, { style: 'Direct' }, { pkgName: 'Online Coaching', price: 129, interval: 'month' }, { days: [1, 3, 5], from: 7, to: 18 }];
    for (const s of steps) expect((await b.put('/api/onboarding', s)).status).toBe(200);
    expect((await b.put('/api/onboarding', { from: 18, to: 7 })).status).toBe(400);
    const done = await b.put('/api/onboarding', { goals: ['Save time'], finish: true });
    expect(done.body.summary.join(' ')).toMatch(/Direct style/);
    expect(done.body.summary.join(' ')).toMatch(/Suggested plan: Starter/);
    const me = (await b.get('/api/auth/me')).body;
    expect(me.business.onboarded).toBe(true);
    expect(me.business.timezone).toBe('America/Chicago');
    expect(me.business.slug).toBe('ruiz');
    expect((await b.post('/api/onboarding/sample-data')).status).toBe(200);
    expect((await b.get('/api/clients')).body.clients.length).toBe(18);
    expect((await b.post('/api/onboarding/sample-data')).status).toBe(409);
    expect((await b.del('/api/onboarding/sample-data')).body.removed).toBe(18);
    expect((await b.get('/api/clients')).body.clients.length).toBe(0);
  });
});

describe('booking page and leads', () => {
  it('a booking request becomes a consultation lead for the coach', async () => {
    const pub = await browser();
    const page = await pub.get('/api/join/coach/dani');
    expect(page.body.enabled).toBe(true);
    expect(page.body.packages.length).toBeGreaterThan(0);
    expect(JSON.stringify(page.body)).not.toMatch(/Mike Torres|stripe/i);
    const r = await pub.post('/api/join/coach/dani/book', { name: 'Tess Reed', email: 'tess@example.com', goal: 'Lose 10 lb', when: 'Mon, Wed, morning' });
    expect(r.status).toBe(200);
    const lead = await f.dbA.lead.findFirst({ where: { name: 'Tess Reed' } });
    expect(lead).toMatchObject({ stage: 'consult', source: 'booking_page' });
    expect((await pub.post('/api/join/coach/dani/book', { name: 'Bot', email: 'bot@example.com', website: 'spam' })).status).toBe(400);
  });

  it('pasting a DM creates a lead with a drafted reply, and converting it invites the client', async () => {
    const parsed = await dani.post('/api/leads/parse', { dm: 'Hey! How much is your online coaching? I want to get stronger for climbing.' });
    expect(parsed.body.reply).toMatch(/\/coach\/dani/);
    const lead = (await dani.post('/api/leads', { name: parsed.body.name || 'Climber', goal: parsed.body.goal, firstMessage: 'Hey!', insightId: parsed.body.insightId })).body.lead;
    expect(lead.stage).toBe('new');
    const email = uniqueEmail('lead');
    const conv = await dani.post(`/api/leads/${lead.id}/convert`, { email });
    expect(conv.status).toBe(200);
    expect(conv.body.emailed).toBe(true);
    expect((await dani.post(`/api/leads/${lead.id}/convert`, { email })).status).toBe(409);
  });
});

describe('plans and limits', () => {
  async function starterCoach() {
    const b = await browser();
    await b.post('/api/auth/signup', { name: 'Starter Coach', email: uniqueEmail(), password: 'a-long-password-1', businessName: `Starter ${Date.now()}` });
    const me = (await b.get('/api/auth/me')).body;
    const db = dbForBusiness(me.business.id);
    await db.business.update({ where: { id: me.business.id }, data: { plan: 'STARTER', planStatus: 'active' } });
    return { b, db, me };
  }
  it('Starter can’t use Pro features and its booking page is off', async () => {
    const { b, me } = await starterCoach();
    expect((await b.get('/api/leads')).status).toBe(402);
    const page = await (await browser()).get(`/api/join/coach/${me.business.slug}`);
    expect(page.body.enabled).toBe(false);
    expect((await (await browser()).post(`/api/join/coach/${me.business.slug}/book`, { name: 'A', email: 'a@example.com' })).status).toBe(404);
  });
  it('Starter stops new clients at 15 but existing ones keep working', async () => {
    const { b, db } = await starterCoach();
    await db.client.createMany({ data: Array.from({ length: 15 }, (_, i) => ({ name: `Client ${i}`, status: 'ACTIVE' })) });
    const r = await b.post('/api/clients', { name: 'One Too Many', sendInvite: false });
    expect(r.status).toBe(402);
    expect(r.body.error).toMatch(/15 active clients/);
    expect((await b.get('/api/clients')).body.clients).toHaveLength(15);
  });
  it('an expired trial falls back to Starter limits', async () => {
    const b = await browser();
    await b.post('/api/auth/signup', { name: 'Late Coach', email: uniqueEmail(), password: 'a-long-password-1' });
    const me = (await b.get('/api/auth/me')).body;
    await dbForBusiness(me.business.id).business.update({ where: { id: me.business.id }, data: { trialEndsAt: new Date(Date.now() - 864e5) } });
    expect((await b.get('/api/auth/me')).body.business.effectivePlan).toBe('STARTER');
    expect((await b.get('/api/leads')).status).toBe(402);
  });
});

describe('background jobs', () => {
  it('automations don’t repeat themselves on the same day', async () => {
    const tz = 'America/New_York';
    await runAutomations(f.dbA, { tz });
    const n1 = await f.dbA.automationRun.count();
    await runAutomations(f.dbA, { tz });
    expect(await f.dbA.automationRun.count()).toBe(n1);
  });
  it('the radar scores clients and only drafts outreach on plans that include it', async () => {
    const r = await runRadar(f.dbA, { tz: 'America/New_York' });
    expect(r.scored).toBeGreaterThan(5);
    const marcus = await f.dbA.client.findFirst({ where: { name: 'Marcus Johnson' } });
    expect(marcus.riskLevel).toBe('HIGH');
    const paused = await f.dbA.client.findFirst({ where: { status: 'PAUSED' } });
    expect(paused.riskScore).toBeNull();
  });
  it('a disabled automation doesn’t run', async () => {
    const auto = await f.dbB.automation.findFirst({ where: { key: 'milestone' } });
    await f.dbB.automation.update({ where: { id: auto.id }, data: { enabled: false } });
    const before = await f.dbB.automationRun.count({ where: { automationId: auto.id } });
    await runAutomations(f.dbB, { tz: 'America/Chicago', only: ['milestone'] });
    expect(await f.dbB.automationRun.count({ where: { automationId: auto.id } })).toBe(before);
    await f.dbB.automation.update({ where: { id: auto.id }, data: { enabled: true } });
  });
});
