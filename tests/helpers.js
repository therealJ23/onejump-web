// Shared fixtures for the API tests: the two seeded workspaces and logged-in test browsers.
import request from 'supertest';
import { createApp } from '../server/app.js';
import { EmailService } from '../server/email/EmailService.js';
import { businesses, users } from '../server/db/system.js';
import { dbFor } from '../server/db/tenant.js';

export async function fixtures() {
  const A = await businesses.publicBySlug('dani');
  const B = await businesses.publicBySlug('northside');
  const dani = await users.byEmail('dani@reyesstrength.com');
  const mikeUser = await users.byEmail('mike.t@example.com');
  const dbA = dbFor({ businessId: A.id, role: 'OWNER', userId: dani.id });
  const dbB = dbFor({ businessId: B.id, role: 'OWNER' });
  const mike = await dbA.client.findFirst({ where: { userId: mikeUser.id } });
  const dbMike = dbFor({ businessId: A.id, role: 'CLIENT', clientId: mike.id, userId: mikeUser.id });
  return { A, B, dani, mikeUser, mike, dbA, dbB, dbMike };
}
export const DEMO_PASSWORD = 'onejump-demo-2026';

// ---------------------------------------------------------------- HTTP helpers (Supertest)

let _app;
export const app = () => (_app ||= createApp());

/** A cookie-keeping test browser that sends the CSRF header on every write. */
export async function browser() {
  const a = request.agent(app());
  let csrf = (await a.get('/api/auth/csrf')).body.csrfToken;
  const keep = res => { if (res.body?.csrfToken) csrf = res.body.csrfToken; return res; };
  const send = (m, url, body) => { let r = a[m](url).set('Accept', 'application/json'); if (csrf) r = r.set('X-CSRF-Token', csrf); if (body !== undefined) r = r.send(body); return r.then(keep); };
  return {
    agent: a,
    get csrf() { return csrf; },
    get: url => a.get(url).set('Accept', 'application/json').then(keep),
    post: (url, body = {}) => send('post', url, body),
    put: (url, body = {}) => send('put', url, body),
    patch: (url, body = {}) => send('patch', url, body),
    del: (url, body) => send('delete', url, body),
    upload: (url, field, buf, name, extra = {}) => { let r = a.post(url).set('X-CSRF-Token', csrf); for (const [k, v] of Object.entries(extra)) r = r.field(k, v); return r.attach(field, buf, name).then(keep); },
  };
}
export async function loginCoach(email = 'dani@reyesstrength.com', password = DEMO_PASSWORD) {
  const b = await browser();
  const r = await b.post('/api/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`login failed ${r.status} ${JSON.stringify(r.body)}`);
  return b;
}
export function lastLinkFor(email) {
  const m = EmailService.outbox().find(e => e.to === email && e.link);
  return m ? new URL(m.link) : null;
}
export async function loginClient(email = 'mike.t@example.com') {
  const b = await browser();
  await b.post('/api/auth/magic-link', { email });
  const token = lastLinkFor(email)?.searchParams.get('token');
  const r = await b.post('/api/auth/magic', { token });
  if (r.status !== 200) throw new Error(`client login failed ${r.status} ${JSON.stringify(r.body)}`);
  return b;
}
export const uniqueEmail = (p = 'coach') => `${p}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
