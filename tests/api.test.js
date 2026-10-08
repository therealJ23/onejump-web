// Tenant isolation over HTTP (what a real browser can reach), client data scoping,
// input validation and private photo links.
import { describe, it, expect, beforeAll } from 'vitest';
import { fixtures, loginCoach, loginClient } from './helpers.js';

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

let f, dani, alex, mike;
beforeAll(async () => {
  f = await fixtures();
  dani = await loginCoach();
  alex = await loginCoach('alex@northsidebarbell.com');
  mike = await loginClient();
});

describe('one business can never reach another business’s data through the API', () => {
  it('lists only its own clients', async () => {
    const a = (await dani.get('/api/clients')).body.clients.map(c => c.id);
    const b = (await alex.get('/api/clients')).body.clients.map(c => c.id);
    expect(a.length).toBeGreaterThan(10);
    expect(b.length).toBe(3);
    expect(a.filter(id => b.includes(id))).toEqual([]);
  });

  it('gets 404 (not 403) for another business’s client, thread, program and insight', async () => {
    const bClient = (await f.dbB.client.findFirst()).id;
    for (const url of [`/api/clients/${bClient}`, `/api/clients/${bClient}/messages`, `/api/clients/${bClient}/photos`, `/api/clients/${bClient}/payments`, `/api/threads/${bClient}`, `/api/clients/${bClient}/export`]) {
      expect((await dani.get(url)).status, url).toBe(404);
    }
    expect((await dani.patch(`/api/clients/${bClient}`, { name: 'Hacked' })).status).toBe(404);
    expect((await dani.post(`/api/threads/${bClient}/messages`, { body: 'hi' })).status).toBe(404);
    expect((await dani.post(`/api/clients/${bClient}/notes`, { body: 'x' })).status).toBe(404);
    const bProgram = (await f.dbB.program.findFirst()).id;
    expect((await dani.get(`/api/programs/${bProgram}`)).status).toBe(404);
    const aInsight = await f.dbA.aIInsight.findFirst({ where: { status: 'pending' } });
    if (aInsight) expect((await alex.post(`/api/insights/${aInsight.id}/approve`)).status).toBe(404);
    expect((await f.dbB.client.findFirst({ where: { id: bClient } })).name).not.toBe('Hacked');
  });

  it('keeps search, Today and the inbox inside the business', async () => {
    const s = await dani.get('/api/search?q=Jordan');
    expect(s.body.clients.map(c => c.name)).not.toContain('Jordan Pike');
    const t = JSON.stringify((await alex.get('/api/today')).body);
    expect(t).not.toMatch(/Marcus|Mike Torres|Reyes/);
    const threads = (await alex.get('/api/threads')).body.threads.map(x => x.name);
    expect(threads).not.toContain('Mike Torres');
  });

  it('won’t let a coach assign another business’s workout or use its exercises', async () => {
    const bWorkout = await f.dbB.workout.findFirst();
    expect((await dani.post(`/api/workouts/${bWorkout.id}/assign`, { clientIds: [f.mike.id], date: '2026-10-20' })).status).toBe(404);
    const custom = await f.dbB.exercise.create({ data: { name: 'Northside secret move', muscle: 'Core', equipment: 'Band', level: 'Beginner', pattern: 'core' } });
    const lib = (await dani.get('/api/exercises')).body.exercises.map(e => e.id);
    expect(lib).not.toContain(custom.id);
    const own = (await dani.get('/api/workouts')).body.workouts[0];
    const r = await dani.put(`/api/workouts/${own.id}`, { name: 'Sneaky', blocks: [{ kind: 'single', items: [{ exerciseId: custom.id, sets: [{ reps: '10' }] }] }] });
    expect(r.status).toBe(400);
  });
});

describe('a client only ever sees their own data', () => {
  it('can’t open another client’s workout, even in the same business', async () => {
    const other = await f.dbA.workoutAssignment.findFirst({ where: { NOT: { clientId: f.mike.id } } });
    expect((await mike.get(`/api/me/workouts/${other.id}`)).status).toBe(404);
    expect((await mike.post(`/api/me/workouts/${other.id}/complete`, { sets: [], rpe: 5 })).status).toBe(404);
  });

  it('exports only their own records, without the coach’s private notes or Assist insights', async () => {
    const r = await mike.get('/api/me/export');
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.body);
    expect(text).not.toMatch(/Marcus|Sarah Kim|Northside/);
    expect(r.body).not.toHaveProperty('note');
    expect(r.body).not.toHaveProperty('aIInsight');
  });

  it('sees only their own thread and messages', async () => {
    const msgs = (await mike.get('/api/me/thread')).body.messages;
    const own = await f.dbA.message.count({ where: { clientId: f.mike.id } });
    expect(msgs.length).toBe(Math.min(own, 200));
  });
});

describe('progress photos stay private', () => {
  it('serves a photo only through a short-lived signed link, and only to the right business', async () => {
    const up = await mike.upload('/api/me/photos', 'photo', PNG, 'front.png', { pose: 'front' });
    expect(up.status).toBe(201);
    const url = new URL(up.body.photo.url, 'http://x');
    expect(url.searchParams.get('sig')).toBeTruthy();
    expect((await mike.agent.get(url.pathname + url.search)).status).toBe(200);
    expect((await mike.agent.get(url.pathname)).status).toBe(403);
    url.searchParams.set('sig', 'f'.repeat(64));
    expect((await mike.agent.get(url.pathname + url.search)).status).toBe(403);
    expect((await alex.get(`/api/clients/${f.mike.id}/photos`)).status).toBe(404);
    const seen = (await dani.get(`/api/clients/${f.mike.id}/photos`)).body.photos.map(p => p.id);
    expect(seen).toContain(up.body.photo.id);
    expect((await mike.del(`/api/me/photos/${up.body.photo.id}`)).status).toBe(200);
  });

  it('rejects files that aren’t images', async () => {
    const r = await mike.upload('/api/me/photos', 'photo', Buffer.from('<script>alert(1)</script>'), 'x.png');
    expect(r.status).toBe(400);
  });
});

describe('input validation', () => {
  it('returns field errors for bad bodies and ignores unknown fields', async () => {
    const r = await dani.post('/api/clients', { name: '', email: 'nope' });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.fields)).toEqual(expect.arrayContaining(['name', 'email']));
    const p = await dani.patch(`/api/clients/${f.mike.id}`, { businessId: f.B.id, goal: 'Lose 15 lb and keep his strength' });
    expect(p.status).toBe(200);
    expect((await f.dbA.client.findFirst({ where: { id: f.mike.id } })).businessId).toBe(f.A.id);
  });

  it('caps oversized text', async () => {
    const r = await mike.post('/api/me/messages', { body: 'x'.repeat(5000) });
    expect(r.status).toBe(400);
  });
});
