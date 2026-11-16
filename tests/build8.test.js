// Build 8 (Nov 16): sample programs to start from, time saved counted from the work itself, and
// free demo videos for the exercise library.
import { describe, it, expect, beforeAll } from 'vitest';
import { fixtures, loginCoach } from './helpers.js';
import { savedMinutes } from '../server/core/timeSaved.js';
import { SAMPLE_PROGRAMS } from '../server/seed/samplePrograms.js';
import { EXERCISES } from '../server/seed/exercises.js';
import { wgerIndex, matchExercise } from '../server/library/wgerPhotos.js';

let f, dani;
beforeAll(async () => { f = await fixtures(); dani = await loginCoach(); });

describe('sample programs', () => {
  it('only use exercises that are in the OneJump library', () => {
    const names = new Set(EXERCISES.map(e => e[0].toLowerCase()));
    const missing = SAMPLE_PROGRAMS.flatMap(p => p.workouts.flatMap(w => w.items.map(i => i[0]))).filter(n => !names.has(n.toLowerCase()));
    expect(missing).toEqual([]);
  });

  it('lists the samples with a picture for each exercise, without adding anything', async () => {
    const before = await f.dbA.program.count();
    const r = await dani.get('/api/programs/samples');
    expect(r.status).toBe(200);
    expect(r.body.samples.length).toBe(SAMPLE_PROGRAMS.length);
    const s = r.body.samples[0];
    expect(s).toMatchObject({ key: 'full-body-beginner', weeks: 6, daysPerWeek: 3 });
    expect(s.workouts[0].preview[0].imageUrl).toMatch(/\/img\/exercises\/|\/files\//);
    expect(await f.dbA.program.count()).toBe(before);
  });

  it('copies a sample into the coach’s programs with every workout filled in', async () => {
    const r = await dani.post('/api/programs/samples/upper-lower', {});
    expect(r.status).toBe(201);
    const ws = await f.dbA.workout.findMany({ where: { programId: r.body.program.id }, orderBy: { day: 'asc' } });
    expect(ws.map(w => w.day)).toEqual([1, 2, 4, 5]);
    expect(ws[0].blocks.length).toBeGreaterThan(4);
    expect(ws[0].blocks.some(b => b.kind === 'superset')).toBe(true);
    expect(ws[0].blocks[0].section).toBe('warmup');
    expect(await f.dbB.program.count({ where: { id: r.body.program.id } })).toBe(0); // tenant isolation
  });

  it('refuses a sample that doesn’t exist', async () => {
    expect((await dani.post('/api/programs/samples/nope', {})).status).toBe(400);
  });
});

describe('time saved from the work itself', () => {
  it('counts words at typing speed plus a lookup', () => {
    expect(savedMinutes('send_message', { text: 'Great week!' })).toBe(1);
    expect(savedMinutes('send_message', { text: 'word '.repeat(90) })).toBe(4); // 1 + 90/30
    expect(savedMinutes('reply_checkin', { text: 'word '.repeat(60) })).toBe(5); // 3 + 2
  });
  it('counts programs by workouts and exercises', () => {
    const w = { blocks: [{ items: [1, 2] }, { items: [3] }, { items: [4] }, { items: [5] }] }; // 5 exercises
    expect(savedMinutes('create_program', { workouts: [w, w, w] })).toBe(Math.round(5 + 3 * (2 + 6)));
    expect(savedMinutes('create_program', { workouts: [] })).toBe(5);
    expect(savedMinutes('save_workout', { blocks: w.blocks })).toBe(8);
  });
  it('a group message adds a little per extra person', () => {
    expect(savedMinutes('message_clients', { text: 'word '.repeat(30), clientIds: Array(9) })).toBe(4); // 1 + 1 + 2
  });
});

describe('free demo videos (wger)', () => {
  it('picks up an open-licensed video with its credit', async () => {
    const page = { results: [{ id: 7, translations: [{ language: 2, name: 'Goblet Squat', aliases: [] }], images: [],
      videos: [{ video: 'https://wger.de/media/exercise-video/7/a.mp4', is_main: true, license: 2, license_author: 'Jo', size: 1000 }] }], next: null };
    const index = await wgerIndex(async () => ({ ok: true, json: async () => page }), { maxPages: 1 });
    const m = matchExercise(index, { name: 'Goblet squat', equipment: 'Dumbbell' });
    expect(m.url).toBeNull();
    expect(m.video).toMatchObject({ url: 'https://wger.de/media/exercise-video/7/a.mp4', author: 'Jo', license: 'CC BY-SA 4.0' });
  });
});
