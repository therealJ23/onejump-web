// Accounts and sessions over HTTP: sign-up, CSRF, password login, two-step login for coaches,
// email login links for clients, and role checks on every API area.
import { describe, it, expect } from 'vitest';
import { browser, loginCoach, loginClient, lastLinkFor, uniqueEmail, DEMO_PASSWORD } from './helpers.js';
import { currentCode } from '../server/auth/totp.js';

describe('sign up and log in', () => {
  it('creates a workspace on a 14-day Pro trial and sends the coach to onboarding', async () => {
    const b = await browser();
    const email = uniqueEmail();
    const r = await b.post('/api/auth/signup', { name: 'Test Coach', email, password: 'a-long-password-1', businessName: 'Test Strength' });
    expect(r.status).toBe(201);
    expect(r.body.redirect).toBe('/onboarding');
    const me = await b.get('/api/auth/me');
    expect(me.body.role).toBe('OWNER');
    expect(me.body.business.name).toBe('Test Strength');
    expect(me.body.business.plan).toBe('TRIAL');
    expect(me.body.business.trialDaysLeft).toBeGreaterThanOrEqual(13);
    const autos = await b.get('/api/automations');
    expect(autos.body.automations).toHaveLength(5);
  });

  it('rejects a duplicate email, a short password and a bad email', async () => {
    const b = await browser();
    expect((await b.post('/api/auth/signup', { name: 'X', email: 'dani@reyesstrength.com', password: 'a-long-password-1' })).status).toBe(409);
    const short = await b.post('/api/auth/signup', { name: 'X', email: uniqueEmail(), password: 'short' });
    expect(short.status).toBe(400);
    expect(short.body.fields).toHaveProperty('password');
    expect((await b.post('/api/auth/signup', { name: 'X', email: 'not-an-email', password: 'a-long-password-1' })).status).toBe(400);
  });

  it('refuses writes without the CSRF token', async () => {
    const b = await browser();
    const r = await b.agent.post('/api/auth/login').set('Accept', 'application/json').send({ email: 'dani@reyesstrength.com', password: DEMO_PASSWORD });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('csrf');
  });

  it('logs a coach in with the right password only, and never says which part was wrong', async () => {
    const b = await browser();
    const bad = await b.post('/api/auth/login', { email: 'dani@reyesstrength.com', password: 'wrong-password' });
    const unknown = await b.post('/api/auth/login', { email: 'nobody@example.com', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error).toBe(unknown.body.error);
    const ok = await b.post('/api/auth/login', { email: 'dani@reyesstrength.com', password: DEMO_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.redirect).toBe('/app');
    expect((await b.get('/api/clients')).status).toBe(200);
    expect((await b.post('/api/auth/logout')).status).toBe(200);
    expect((await b.get('/api/clients')).status).toBe(401);
  });
});

describe('two-step login for coaches', () => {
  it('turns on with a valid code and is then required at login', async () => {
    const b = await browser();
    const email = uniqueEmail('totp');
    await b.post('/api/auth/signup', { name: 'Two Step', email, password: 'a-long-password-1' });
    const setup = await b.post('/api/auth/2fa/setup');
    expect(setup.status).toBe(200);
    expect(setup.body.qr).toMatch(/^data:image\/png;base64,/);
    expect((await b.post('/api/auth/2fa/enable', { code: '000000' })).status).toBe(400);
    expect((await b.post('/api/auth/2fa/enable', { code: currentCode(setup.body.secret) })).status).toBe(200);
    await b.post('/api/auth/logout');

    const c = await browser();
    const step1 = await c.post('/api/auth/login', { email, password: 'a-long-password-1' });
    expect(step1.body.twoFactor).toBe(true);
    expect((await c.get('/api/clients')).status).toBe(401); // not logged in yet
    expect((await c.post('/api/auth/login/2fa', { code: '123456' })).status).toBe(401);
    const step2 = await c.post('/api/auth/login/2fa', { code: currentCode(setup.body.secret) });
    expect(step2.status).toBe(200);
    expect((await c.get('/api/clients')).status).toBe(200);
  });
});

describe('client login links', () => {
  it('logs a client in once per link and answers the same for unknown emails', async () => {
    const b = await browser();
    const unknown = await b.post('/api/auth/magic-link', { email: 'stranger@example.com' });
    const known = await b.post('/api/auth/magic-link', { email: 'mike.t@example.com' });
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
    expect(lastLinkFor('stranger@example.com')).toBeNull();

    const token = lastLinkFor('mike.t@example.com').searchParams.get('token');
    const ok = await b.post('/api/auth/magic', { token });
    expect(ok.status).toBe(200);
    expect(ok.body.redirect).toBe('/client');
    expect((await b.get('/api/me/today')).status).toBe(200);

    const again = await (await browser()).post('/api/auth/magic', { token });
    expect(again.status).toBe(401);
  });

  it('tells clients to use a login link instead of a password', async () => {
    const r = await (await browser()).post('/api/auth/login', { email: 'mike.t@example.com', password: 'anything-at-all' });
    expect([400, 401]).toContain(r.status);
  });
});

describe('role checks', () => {
  it('keeps clients out of the coach API and coaches out of the client API', async () => {
    const client = await loginClient();
    for (const url of ['/api/clients', '/api/today', '/api/payments', '/api/leads', '/api/settings', '/api/automations', '/api/admin/overview']) {
      expect((await client.get(url)).status, url).toBe(403);
    }
    const coach = await loginCoach();
    expect((await coach.get('/api/me/today')).status).toBe(403);
    expect((await coach.get('/api/admin/overview')).status).toBe(403);
  });

  it('only lets the platform admin see the admin overview, and it holds no client details', async () => {
    const admin = await loginCoach('ops@onejumpfit.com');
    const r = await admin.get('/api/admin/overview');
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.body);
    expect(text).not.toMatch(/Marcus|Mike Torres|mike\.t@example\.com/);
    expect(r.body.coaches.length).toBeGreaterThanOrEqual(2);
  });

  it('returns 401 for every protected area when logged out', async () => {
    const b = await browser();
    for (const url of ['/api/clients', '/api/me/today', '/api/admin/overview', '/api/billing']) expect((await b.get(url)).status, url).toBe(401);
  });
});
