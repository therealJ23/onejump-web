// Fixes from the independent review of voice + nutrition (each test names the defect it guards).
import { describe, it, expect, beforeAll } from 'vitest';
import { fixtures, loginCoach, loginClient } from './helpers.js';
import { platePhoto } from '../server/seed/sampleNutrition.js';
import { AIService } from '../server/ai/AIService.js';
import { speakable } from '../server/assist/render.js';
import { tidyLines } from '../server/assist/briefing.js';
import { stripJpegMetadata } from '../server/storage/StorageService.js';
import { deleteClientData } from '../server/core/clientData.js';
import { ensureNudges } from '../server/nutrition/attention.js';
import { clientRows, missedProteinMostDays } from '../server/nutrition/insights.js';

const webm = size => { const b = Buffer.alloc(size, 7); b[0] = 0x1a; b[1] = 0x45; b[2] = 0xdf; b[3] = 0xa3; return b; };
let f, dani, mike;
beforeAll(async () => { f = await fixtures(); dani = await loginCoach(); mike = await loginClient(); });

describe('voice minutes are measured on the server', () => {
  it('a big recording sent with durationMs=0 still counts its length', async () => {
    const r = await dani.upload('/api/voice/ask', 'audio', webm(400 * 1024), 'a.webm', { hint: 'Which clients haven’t paid?', durationMs: '0' });
    expect(r.status).toBe(200);
    const v = await f.dbA.voiceInteraction.findFirst({ where: { kind: 'ask' }, orderBy: { createdAt: 'desc' } });
    expect(v.durationMs).toBeGreaterThanOrEqual(25000);
  });
  it('a recording far over the limit is refused', async () => {
    const r = await dani.upload('/api/voice/ask', 'audio', webm(1536 * 1024), 'a.webm', { hint: 'hi', durationMs: '1000' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('too_long');
  });
  it('multipart fields are validated and limited', async () => {
    expect((await dani.upload('/api/voice/ask', 'audio', webm(2000), 'a.webm', { hint: 'x'.repeat(2100) })).status).toBe(400);
    expect((await mike.upload('/api/me/voice/transcribe', 'audio', webm(2000), 'a.webm', { kind: 'drop_tables' })).status).toBe(400);
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i}`, 'x']));
    expect((await dani.upload('/api/voice/ask', 'audio', webm(2000), 'a.webm', many)).status).toBe(400);
  });
});

describe('meal photos never get a made-up answer', () => {
  it('when the AI provider fails, photo analysis says so instead of inventing a meal; drafts still fall back', async () => {
    const down = new AIService({ name: 'anthropic', model: 'claude-test', complete: async () => { throw new Error('provider down'); } });
    await expect(down.analyzeMealPhoto(platePhoto([[236, 230, 214], [218, 174, 120]], 3))).rejects.toMatchObject({ status: 503, extra: { code: 'ai_unavailable' } });
    const s = await down.summarizeVoiceNote('Can we move Friday to 7?');
    expect(s.data.summary).toMatch(/move Friday/);
  });
});

describe('nothing sensitive is read aloud', () => {
  it('speakable and the briefing drop food-behaviour and at-risk language', () => {
    expect(speakable('She skipped dinner to make up for the weekend.')).toBe('I’ve put the details on screen.');
    expect(speakable('He said he doesn’t want to be here anymore.')).toBe('I’ve put the details on screen.');
    const facts = ['Good morning, Dani.', 'Have a great day.'];
    expect(tidyLines(['Good morning!', 'Olivia earned her dinner with a long run.'], facts)).toEqual(facts);
  });
  it('a check-in with a private nutrition flag is flagged in Ask Assist (shown, not spoken)', async () => {
    const olivia = await f.dbA.client.findFirst({ where: { name: { startsWith: 'Olivia' } } });
    const k = await f.dbA.checkIn.create({ data: { clientId: olivia.id, weekOf: new Date(), submittedAt: new Date(), text: 'Skipped dinner to make up for the weekend. Energy fine otherwise.', energy: 6, soreness: 3, sleepHours: 7, nutrition: 4, status: 'submitted' } });
    const r = await dani.post('/api/assist/ask', { question: 'Read me Olivia’s check-in', voice: true });
    expect(r.body.answerHtml).toMatch(/Health flag/);
    expect(r.body.spokenText).not.toMatch(/dinner|make up/i);
    await f.dbA.checkIn.delete({ where: { id: k.id } });
  });
});

describe('the client API keeps coach-only data and hidden numbers out', () => {
  it('the export has no Assist voice-note summary and honours Hide numbers', async () => {
    await mike.upload('/api/me/voice-notes', 'audio', webm(3000), 'n.webm', { hint: 'Can we move Friday’s session to 7?', durationMs: '3000' });
    const ex = (await mike.get('/api/me/export')).body;
    expect(JSON.stringify(ex.messages)).not.toMatch(/transcriptSummary/);
    expect(ex.voiceTranscripts.some(v => /Friday/.test(v.transcript))).toBe(true);
    await dani.put(`/api/clients/${f.mike.id}/nutrition-plan`, { hideNumbers: true });
    try {
      const p = (await mike.get('/api/me/export')).body;
      expect(p.nutritionPlan[0].hideNumbers).toBe(true);
      expect(JSON.stringify([p.nutritionPlan, p.foodEntry, p.foodEntryItem, p.foodFavorite])).not.toMatch(/"(calories|proteinG|carbsG|fatG)":/);
    } finally { await dani.put(`/api/clients/${f.mike.id}/nutrition-plan`, { hideNumbers: false }); }
  });
  it('Hide numbers also scrubs numbers from the coach note, meal plan and habit text', async () => {
    const plan = await f.dbA.nutritionPlan.findFirst({ where: { clientId: f.mike.id } });
    await f.dbA.nutritionPlan.update({ where: { id: plan.id }, data: { hideNumbers: true, coachNote: 'Aim for 180 g protein and 2,400 calories, and drink water.' } });
    try {
      const r = await mike.get('/api/me/nutrition/today');
      expect(r.body.coachNote).not.toMatch(/180|2,400|calorie/);
      expect(r.body.coachNote).toMatch(/drink water/);
    } finally { await f.dbA.nutritionPlan.update({ where: { id: plan.id }, data: { hideNumbers: plan.hideNumbers, coachNote: plan.coachNote } }); }
  });
});

describe('races', () => {
  it('a double tap on Add saves a photo once', async () => {
    const r = await mike.upload('/api/me/food-photo', 'photo', platePhoto([[236, 230, 214], [218, 174, 120], [72, 140, 72]], 11), 'meal.jpg');
    const items = r.body.items.map(i => ({ name: i.name, grams: i.grams, foodRef: i.foodRef }));
    const body = { meal: 'dinner', source: 'photo', photoToken: r.body.photoToken, items };
    const [a, b] = await Promise.all([mike.post('/api/me/food-entries', body), mike.post('/api/me/food-entries', body)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await f.dbA.foodEntry.count({ where: { aiInsightId: r.body.photoToken } })).toBe(1);
  });

  it('two Nutrition page loads at once draft one nudge per client', async () => {
    const rows = (await clientRows(f.dbA, { tz: 'America/New_York' })).filter(r => missedProteinMostDays(r.plan, r.week));
    expect(rows.length).toBeGreaterThan(0);
    await f.dbA.aIInsight.deleteMany({ where: { kind: 'nutrition_nudge', clientId: rows[0].client.id } });
    await Promise.all([ensureNudges(f.dbA, rows, { tz: 'America/New_York' }), ensureNudges(f.dbA, rows, { tz: 'America/New_York' })]);
    expect(await f.dbA.aIInsight.count({ where: { kind: 'nutrition_nudge', clientId: rows[0].client.id } })).toBe(1);
  });

  it('a proposal that fails partway is never re-armed, and cancel can’t overwrite a confirmed one', async () => {
    const tmp = await f.dbA.client.create({ data: { name: 'Temp Person', email: `tmp.${Date.now()}@example.com`, status: 'ACTIVE' } });
    const p = await dani.post('/api/assist/ask', { question: 'Add a note to Temp: call on Monday' });
    const id = p.body.proposals[0].id;
    await f.dbA.client.delete({ where: { id: tmp.id } });
    const c1 = await dani.post(`/api/assist/proposals/${id}/confirm`);
    expect(c1.body.code).toBe('proposal_failed');
    expect((await f.dbA.assistProposal.findFirst({ where: { id } })).status).toBe('failed');
    expect((await dani.post(`/api/assist/proposals/${id}/confirm`)).status).toBe(409);

    const q = await dani.post('/api/assist/ask', { question: 'Add a note to Chris: bring the foam roller' });
    const qid = q.body.proposals[0].id;
    expect((await dani.post(`/api/assist/proposals/${qid}/confirm`)).status).toBe(200);
    expect((await dani.post(`/api/assist/proposals/${qid}/cancel`)).status).toBe(409);
    expect((await f.dbA.assistProposal.findFirst({ where: { id: qid } })).status).toBe('confirmed');
  });
});

describe('privacy', () => {
  it('deleting a client also deletes their voice transcripts', async () => {
    const c = await f.dbA.client.create({ data: { name: 'Gone Soon', email: `gone.${Date.now()}@example.com`, status: 'ACTIVE' } });
    await f.dbA.voiceInteraction.create({ data: { userId: f.dani.id, clientId: c.id, kind: 'set_log', transcript: '10 reps at 55', durationMs: 2000, provider: 'mock' } });
    await deleteClientData(f.dbA, c.id);
    expect(await f.dbA.voiceInteraction.count({ where: { clientId: c.id } })).toBe(0);
  });
  it('EXIF stripping drops data appended after the end of the image', () => {
    const jpeg = platePhoto([[200, 200, 200]], 1);
    const gps = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x10]), Buffer.from('Exif\0\0GPS-data')]);
    const out = stripJpegMetadata(Buffer.concat([jpeg, gps]));
    expect(out.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
    expect(out.includes(Buffer.from('GPS-data'))).toBe(false);
  });
});
