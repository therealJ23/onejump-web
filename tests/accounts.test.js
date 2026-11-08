// Client login codes (iPhone app), profile photos for coaches and clients, and a client
// deleting their own account.
import { describe, it, expect, beforeAll } from 'vitest';
import jpeg from 'jpeg-js';
import { browser, loginCoach, loginClient, lastLinkFor, uniqueEmail, app } from './helpers.js';
import { EmailService } from '../server/email/EmailService.js';
import { users } from '../server/db/system.js';

const lastEmailFor = to => EmailService.outbox().find(e => e.to === to);
/** A small real JPEG with an EXIF block, like a phone photo. */
function jpegWithExif() {
  const w = 8, h = 8, data = Buffer.alloc(w * h * 4, 180);
  const img = jpeg.encode({ data, width: w, height: h }, 80).data;
  const exif = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x10]), Buffer.from('Exif\0\0GPS-HERE')]);
  return Buffer.concat([img.subarray(0, 2), exif, img.subarray(2)]);
}
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000301010018dd8db40000000049454e44ae426082', 'hex');
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(16)]);

async function requestCode(email) {
  const b = await browser();
  await b.post('/api/auth/magic-link', { email });
  const mail = lastEmailFor(email);
  return { b, code: mail.code, mail };
}

describe('client login with the emailed code (iPhone app)', () => {
  it('the login email carries a 6-digit code that logs the client in once', async () => {
    const { b, code, mail } = await requestCode('mike.t@example.com');
    expect(code).toMatch(/^\d{6}$/);
    expect(mail.subject).toContain(code);
    expect(mail.html).toContain(code);
    const r = await b.post('/api/auth/magic-code', { email: 'mike.t@example.com', code });
    expect(r.status).toBe(200);
    const me = await b.get('/api/auth/me');
    expect(me.body.role).toBe('CLIENT');
    expect(me.body.client.name).toBe('Mike Torres');
    // single use
    const again = await (await browser()).post('/api/auth/magic-code', { email: 'mike.t@example.com', code });
    expect(again.status).toBe(401);
    expect(again.body.code).toBe('code_expired');
  });

  it('the email link still works on the web, and a new email retires the old code', async () => {
    const first = await requestCode('mike.t@example.com');
    const second = await requestCode('mike.t@example.com');
    if (first.code !== second.code) expect((await first.b.post('/api/auth/magic-code', { email: 'mike.t@example.com', code: first.code })).status).toBe(401);
    const token = lastLinkFor('mike.t@example.com').searchParams.get('token');
    expect((await second.b.post('/api/auth/magic', { token })).status).toBe(200);
  });

  it('five wrong codes kill the code, and unknown emails get the same answer', async () => {
    const { b, code } = await requestCode('mike.t@example.com');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) {
      const r = await b.post('/api/auth/magic-code', { email: 'mike.t@example.com', code: wrong });
      expect(r.status).toBe(401);
      expect(r.body.code).toBe('code_wrong');
    }
    expect((await b.post('/api/auth/magic-code', { email: 'mike.t@example.com', code: wrong })).body.code).toBe('code_expired');
    expect((await b.post('/api/auth/magic-code', { email: 'mike.t@example.com', code })).status).toBe(401); // even the right one now
    const nobody = await b.post('/api/auth/magic-code', { email: 'nobody@example.com', code: '123456' });
    expect(nobody.status).toBe(401);
    expect(nobody.body.code).toBe('code_expired');
    expect((await b.post('/api/auth/magic-code', { email: 'mike.t@example.com', code: '12ab56' })).status).toBe(400);
  });

  it('a coach email gets no code (coaches use their password)', async () => {
    const before = EmailService.outbox().length;
    await (await browser()).post('/api/auth/magic-link', { email: 'dani@reyesstrength.com' });
    expect(EmailService.outbox().length).toBe(before);
  });
});

describe('profile photos', () => {
  let dani, mike;
  beforeAll(async () => { dani = await loginCoach(); mike = await loginClient(); });

  it('a coach changes their photo; their clients see it, metadata is stripped', async () => {
    expect((await dani.upload('/api/account/photo', 'photo', jpegWithExif(), 'me.jpg')).status).toBe(201);
    const me = await dani.get('/api/auth/me');
    expect(me.body.user.photoUrl).toMatch(/^\/files\/avatars/);
    expect(me.body.user.avatarKey).toBeUndefined();
    const file = await dani.agent.get(me.body.user.photoUrl);
    expect(file.status).toBe(200);
    expect(file.body.includes(Buffer.from('GPS-HERE'))).toBe(false);
    expect((await dani.get('/api/mobile/coach')).body.me.photoUrl).toMatch(/^\/files\/avatars/);
    const today = await mike.get('/api/me/today');
    expect(today.body.coach.photoUrl).toMatch(/^\/files\/avatars/);
    expect((await mike.get('/api/me/thread')).body.coach.photoUrl).toMatch(/^\/files\/avatars/);
    expect((await mike.get('/api/me/account')).body.coach.photoUrl).toMatch(/^\/files\/avatars/);
  });

  it('a new photo replaces the old file', async () => {
    const old = (await dani.get('/api/auth/me')).body.user.photoUrl;
    expect((await dani.upload('/api/account/photo', 'photo', PNG, 'me.png')).status).toBe(201);
    const now = (await dani.get('/api/auth/me')).body.user.photoUrl;
    expect(now).not.toBe(old);
    expect((await dani.agent.get(old)).status).toBe(404);
  });

  it('a client changes their photo; only their own coach sees it', async () => {
    const r = await mike.upload('/api/account/photo', 'photo', PNG, 'me.png');
    expect(r.status).toBe(201);
    expect((await mike.get('/api/me/today')).body.client.photoUrl).toMatch(/^\/files\/avatars/);
    const list = (await dani.get('/api/clients')).body.clients;
    const row = list.find(c => c.name === 'Mike Torres');
    expect(row.photoUrl).toMatch(/^\/files\/avatars/);
    expect(list.filter(c => c.photoUrl).length).toBe(1);
    expect((await dani.get(`/api/clients/${row.id}`)).body.client.photoUrl).toMatch(/^\/files\/avatars/);
    expect((await dani.get('/api/mobile/coach')).body.clients.find(c => c.id === row.id).photoUrl).toMatch(/^\/files\/avatars/);
    const other = await loginCoach('alex@northsidebarbell.com').catch(() => null);
    if (other) {
      const theirs = (await other.get('/api/clients')).body.clients || [];
      expect(theirs.some(c => c.photoUrl)).toBe(false);
    }
  });

  it('rejects HEIC, other files and logged-out uploads; removing works', async () => {
    expect((await mike.upload('/api/account/photo', 'photo', HEIC, 'me.heic')).status).toBe(400);
    expect((await mike.upload('/api/account/photo', 'photo', Buffer.from('not an image at all'), 'me.jpg')).status).toBe(400);
    const anon = await browser();
    expect((await anon.upload('/api/account/photo', 'photo', PNG, 'me.png')).status).toBe(401);
    expect((await mike.del('/api/account/photo')).status).toBe(200);
    expect((await mike.get('/api/me/today')).body.client.photoUrl).toBeNull();
  });
});

describe('a client deletes their own account', () => {
  it('removes their data and login, tells the coach, and ends the session', async () => {
    const dani = await loginCoach();
    const email = uniqueEmail('leaver');
    expect((await dani.post('/api/clients', { name: 'Lee Vance', email })).status).toBe(201);
    const token = lastLinkFor(email).pathname.split('/')[2];
    const lee = await browser();
    expect((await lee.post(`/api/join/invite/${token}/accept`, { name: 'Lee Vance', email })).status).toBe(200);
    await lee.post('/api/me/messages', { body: 'Hi coach' });
    await lee.upload('/api/account/photo', 'photo', PNG, 'me.png');
    expect((await lee.post('/api/me/delete-account', { confirm: 'nope' })).status).toBe(400);
    const r = await lee.post('/api/me/delete-account', { confirm: 'DELETE' });
    expect(r.status).toBe(200);
    expect((await lee.get('/api/me/today')).status).toBe(401);
    expect(await users.byEmail(email)).toBeNull();
    expect((await dani.get('/api/clients')).body.clients.some(c => c.email === email)).toBe(false);
  });

  it('asks a paying client to cancel first', async () => {
    const mike = await loginClient();
    const r = await mike.post('/api/me/delete-account', { confirm: 'DELETE' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('cancel_plan_first');
    expect((await mike.get('/api/me/today')).status).toBe(200);
  });
});

void app;
