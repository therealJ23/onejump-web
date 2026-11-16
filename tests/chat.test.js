// Chat media (Nov 15): photos (metadata stripped), videos, GIFs (GIPHY hosts only), reactions,
// both sides, and clients only ever reach their own thread.
import { describe, it, expect, beforeAll } from 'vitest';
import jpeg from 'jpeg-js';
import { fixtures, loginCoach, loginClient } from './helpers.js';
import { config } from '../server/config.js';

let f, dani, mike;
beforeAll(async () => { f = await fixtures(); dani = await loginCoach(); mike = await loginClient(); });

function jpegWithGps() {
  const img = jpeg.encode({ data: Buffer.alloc(8 * 8 * 4, 120), width: 8, height: 8 }, 80).data;
  return Buffer.concat([img.subarray(0, 2), Buffer.from([0xff, 0xe1, 0x00, 0x10]), Buffer.from('Exif\0\0GPS-HERE'), img.subarray(2)]);
}
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(64, 7)]);
const GIF = { id: 'abc', url: 'https://media2.giphy.com/media/abc/giphy.gif', previewUrl: 'https://media2.giphy.com/media/abc/200w.gif', width: 480, height: 270, title: 'Lets go' };

describe('coach → client', () => {
  it('sends a photo with GPS stripped, a video and a GIF; the thread shows them with fresh links', async () => {
    const p = await dani.upload(`/api/threads/${f.mike.id}/media`, 'media', jpegWithGps(), 'form.jpg', { body: 'Check your depth here', width: '8', height: '8' });
    expect(p.status).toBe(201);
    expect(p.body.message.attachments[0]).toMatchObject({ kind: 'image', width: 8 });
    const file = await dani.agent.get(p.body.message.attachments[0].url);
    expect(file.status).toBe(200);
    expect(file.body.includes(Buffer.from('GPS-HERE'))).toBe(false);

    const v = await dani.upload(`/api/threads/${f.mike.id}/media`, 'media', MP4, 'set.mp4', { durationS: '24' });
    expect(v.body.message.attachments[0]).toMatchObject({ kind: 'video', durationS: 24 });
    const g = await dani.post(`/api/threads/${f.mike.id}/gif`, { gif: GIF });
    expect(g.body.message.attachments[0]).toMatchObject({ kind: 'gif', url: GIF.url });

    const t = await dani.get(`/api/threads/${f.mike.id}`);
    const withMedia = t.body.messages.filter(m => m.attachments.length);
    expect(withMedia.map(m => m.attachments[0].kind).slice(-3)).toEqual(['image', 'video', 'gif']);
    const inbox = (await dani.get('/api/threads')).body.threads.find(x => x.clientId === f.mike.id);
    expect(inbox.last.body).toBe('GIF');
  });

  it('refuses GIFs from anywhere but GIPHY, and files that aren’t photos or videos', async () => {
    expect((await dani.post(`/api/threads/${f.mike.id}/gif`, { gif: { ...GIF, url: 'https://evil.example.com/x.gif' } })).status).toBe(400);
    expect((await dani.upload(`/api/threads/${f.mike.id}/media`, 'media', Buffer.from('hello world, not media'), 'a.txt')).status).toBe(400);
  });
});

describe('client → coach, and reactions', () => {
  it('the client sends a photo and a GIF, the coach is told, and both react', async () => {
    const before = await f.dbA.notification.count();
    const p = await mike.upload('/api/me/messages/media', 'media', jpegWithGps(), 'lunch.jpg', { body: 'Lunch! Enough protein?' });
    expect(p.status).toBe(201);
    expect(await f.dbA.notification.count()).toBe(before + 1);
    expect((await f.dbA.notification.findFirst({ orderBy: { createdAt: 'desc' } })).title).toMatch(/sent a photo/);
    const g = await mike.post('/api/me/messages/gif', { gif: GIF });
    expect(g.status).toBe(201);

    const mid = p.body.message.id;
    expect((await dani.post(`/api/threads/${f.mike.id}/messages/${mid}/react`, { emoji: '🔥' })).body.emoji).toBe('🔥');
    expect((await mike.post(`/api/me/messages/${mid}/react`, { emoji: '💪' })).body.emoji).toBe('💪');
    await dani.post(`/api/threads/${f.mike.id}/messages/${mid}/react`, { emoji: '❤️' }); // replaces 🔥
    const coachView = (await dani.get(`/api/threads/${f.mike.id}`)).body.messages.find(m => m.id === mid);
    expect(coachView.reactions).toEqual(expect.arrayContaining([{ emoji: '❤️', count: 1, mine: true }, { emoji: '💪', count: 1, mine: false }]));
    const clientView = (await mike.get('/api/me/thread')).body.messages.find(m => m.id === mid);
    expect(clientView.reactions.find(r => r.emoji === '💪').mine).toBe(true);
    expect(clientView.attachments[0].kind).toBe('image');
    await mike.post(`/api/me/messages/${mid}/react`, { emoji: null });
    expect((await mike.get('/api/me/thread')).body.messages.find(m => m.id === mid).reactions.some(r => r.emoji === '💪')).toBe(false);
    expect((await mike.post(`/api/me/messages/${mid}/react`, { emoji: '🍕' })).status).toBe(400); // not one of the reactions
  });

  it('a client can’t react to a message in someone else’s thread', async () => {
    const other = await f.dbA.client.findFirst({ where: { NOT: { id: f.mike.id } } });
    const m = await f.dbA.message.create({ data: { threadId: (await f.dbA.thread.upsert({ where: { clientId: other.id }, create: { clientId: other.id }, update: {} })).id, clientId: other.id, senderRole: 'COACH', body: 'private' } });
    expect((await mike.post(`/api/me/messages/${m.id}/react`, { emoji: '👍' })).status).toBe(404);
  });

  it('the coach iPhone thread carries attachments and reactions', async () => {
    const t = await dani.get(`/api/mobile/coach/threads/${f.mike.id}`);
    expect(t.status).toBe(200);
    expect(t.body.messages.some(m => m.attachments?.length)).toBe(true);
  });
});

describe('GIF search', () => {
  it('without a GIPHY key the picker is told GIFs aren’t set up', async () => {
    const before = config.giphyKey; config.giphyKey = '';
    try {
      expect((await dani.get('/api/gifs?q=lets%20go')).body).toMatchObject({ available: false, items: [] });
      expect((await mike.get('/api/gifs')).body.available).toBe(false);
    } finally { config.giphyKey = before; }
  });
});
