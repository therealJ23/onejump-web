// Workout building (Nov 15): week planner (move, swap, copy week), sections and supersets from
// Assist, a picture for every exercise, and wger photos with credit.
import { describe, it, expect, beforeAll } from 'vitest';
import { fixtures, loginCoach } from './helpers.js';
import { normalizeBlocks, patternImage } from '../server/core/training.js';
import { PROPOSE, confirmProposal } from '../server/assist/proposals.js';
import { wgerIndex, matchExercise, importWgerPhotos } from '../server/library/wgerPhotos.js';

let f, dani, auth, program;
beforeAll(async () => {
  f = await fixtures(); dani = await loginCoach(); auth = { userId: f.dani.id, businessId: f.A.id, role: 'OWNER' };
  const r = await dani.post('/api/programs', { name: `Planner Test ${Date.now()}`, weeks: 4, daysPerWeek: 3 });
  program = r.body.program || r.body;
  await f.dbA.workout.deleteMany({ where: { programId: program.id } }); // start from an empty week
});

describe('week planner', () => {
  it('shows the 7 days of a week with a picture for each workout', async () => {
    const lib = (await dani.get('/api/exercises')).body.exercises;
    const squat = lib.find(e => e.pattern === 'squat');
    await dani.post('/api/workouts', { name: 'Lower', programId: program.id, day: 1, blocks: [{ kind: 'single', items: [{ exerciseId: squat.id, sets: [{ reps: '8' }] }] }] });
    await dani.post('/api/workouts', { name: 'Upper', programId: program.id, day: 3, blocks: [] });
    const r = await dani.get(`/api/programs/${program.id}/plan?week=2`);
    expect(r.status).toBe(200);
    expect(r.body.days).toHaveLength(7);
    expect(r.body.days[0].workout).toMatchObject({ name: 'Lower', everyWeek: true, exercises: 1, imageUrl: '/img/exercises/squat.jpg' });
    expect(r.body.days[1].workout).toBeNull();
    expect(r.body.days[2].workout.name).toBe('Upper');
  });

  it('moves a workout to another day, swapping with what was there', async () => {
    const plan = (await dani.get(`/api/programs/${program.id}/plan`)).body;
    const lower = plan.days[0].workout, upper = plan.days[2].workout;
    const r = await dani.patch(`/api/workouts/${lower.id}/schedule`, { day: 3 });
    expect(r.body).toMatchObject({ workout: { day: 3 }, swapped: { id: upper.id, day: 1 }, everyWeek: true });
    const after = (await dani.get(`/api/programs/${program.id}/plan`)).body;
    expect(after.days[0].workout.name).toBe('Upper');
    expect(after.days[2].workout.name).toBe('Lower');
  });

  it('copies a week onto other weeks without deleting anything', async () => {
    const r = await dani.post(`/api/programs/${program.id}/copy-week`, { from: 1, to: [2, 3] });
    expect(r.body).toMatchObject({ ok: true, created: 4 });
    const w2 = (await dani.get(`/api/programs/${program.id}/plan?week=2`)).body;
    expect(w2.days[0].workout).toMatchObject({ name: 'Upper', everyWeek: false });
    // Copy again: the week-2 workouts are updated in place, not duplicated.
    await dani.post(`/api/programs/${program.id}/copy-week`, { from: 1, to: [2] });
    expect(await f.dbA.workout.count({ where: { programId: program.id, week: 2 } })).toBe(2);
    expect((await dani.post(`/api/programs/${program.id}/copy-week`, { from: 4, to: [1] })).status).toBe(200); // week 4 = repeating ones
  });
});

describe('sections and supersets', () => {
  it('keeps warm-up / main / cool-down, defaulting to main', () => {
    const b = normalizeBlocks([{ kind: 'single', section: 'warmup', items: [{ exerciseId: 'x', sets: [{ reps: 5 }] }] }, { kind: 'superset', items: [{ exerciseId: 'y', sets: [] }] }]);
    expect(b[0].section).toBe('warmup');
    expect(b[1]).toMatchObject({ section: 'main', kind: 'single' });
  });

  it('Assist groups exercises with the same letter into a superset, and marks the warm-up', async () => {
    const r = await PROPOSE.save_workout(f.dbA, auth, { program_name: program.name, name: 'Legs A', day: 5, exercises: [
      { exercise: 'Bike', sets: 1, reps: '5 min', section: 'warmup' },
      { exercise: 'Back squat', sets: 4, reps: '6-8', load: '185 lb', group: 'A' },
      { exercise: 'Walking lunge', sets: 4, reps: '10', group: 'a' },
      { exercise: 'Plank', sets: 3, reps: '45s', section: 'cooldown' },
    ] }, { source: 'typed', lang: 'en' });
    expect(r.error).toBeUndefined();
    const done = await confirmProposal(f.dbA, auth, r.proposal.id);
    expect(done.status).toBe('confirmed');
    const w = await f.dbA.workout.findFirst({ where: { programId: program.id, name: 'Legs A' } });
    expect(w.blocks.map(b => [b.section, b.kind, b.items.length])).toEqual([['warmup', 'single', 1], ['main', 'superset', 2], ['cooldown', 'single', 1]]);
    expect(w.blocks[1].items[0].sets[0].load).toBe('185 lb');
  });
});

describe('exercise pictures', () => {
  it('every exercise has a picture in the library and the iPhone app', async () => {
    const lib = (await dani.get('/api/exercises')).body.exercises;
    expect(lib.every(e => typeof e.imageUrl === 'string' && e.imageUrl.length)).toBe(true);
    expect(patternImage('nope')).toBe('/img/exercises/iso.jpg');
    const m = (await dani.get('/api/mobile/coach')).body;
    const list = m.library || m.exercises || [];
    if (list.length) expect(list.every(e => e.imageUrl)).toBe(true);
    const img = await dani.agent.get('/img/exercises/squat.jpg');
    expect(img.status).toBe(200);
  });

  it('wger photos: only open licenses, matched by name, stored with credit', async () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
    const pages = { results: [
      { id: 1, images: [{ image: 'https://wger.de/media/a.jpg', is_main: true, license: 2, license_author: 'Everkinetic' }], translations: [{ language: 2, name: 'Squats', aliases: [{ alias: 'Barbell Squat' }] }] },
      { id: 2, images: [{ image: 'https://wger.de/media/b.jpg', is_main: true, license: 9, license_title: 'CC BY-NC 4.0', license_author: 'X' }], translations: [{ language: 2, name: 'Goblet Squat' }] },
      { id: 3, images: [], translations: [{ language: 2, name: 'Plank' }] },
    ], next: null };
    const fetchImpl = async url => (String(url).includes('/api/v2/') ? { ok: true, json: async () => pages } : { ok: true, arrayBuffer: async () => jpeg });
    const index = await wgerIndex(fetchImpl);
    expect(index.has('squat')).toBe(true);
    expect(index.has('goblet squat')).toBe(false); // non-commercial license skipped
    expect(matchExercise(index, { name: 'Back squat', equipment: 'Barbell' })?.author).toBe('Everkinetic');
    const r = await importWgerPhotos({ fetchImpl, log: () => {} });
    expect(r.stored).toBeGreaterThan(0);
    const back = await f.dbA.exercise.findFirst({ where: { businessId: null, name: 'Back squat' } });
    expect(back.photoKey).toMatch(/^exercise-photos\//);
    expect(back.photoCredit).toMatchObject({ author: 'Everkinetic' });
    const shaped = (await dani.get(`/api/exercises/${back.id}`)).body.exercise;
    expect(shaped.imageUrl).toMatch(/^\/files\//);
    expect(shaped.imageCredit.author).toBe('Everkinetic');
  });
});
