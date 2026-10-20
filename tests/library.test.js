// The exercise library from the iPhone app (add with a photo or video, delete, remove shared ones),
// and everything Assist can now do inside OneJump: programs, workouts, exercises, clients, group
// messages, automations, opening screens, switching to voice, and who founded OneJump.
import { describe, it, expect, beforeAll } from 'vitest';
import { fixtures, loginCoach, browser } from './helpers.js';
import { PROPOSE } from '../server/assist/proposals.js';
import { bestMatch } from '../server/assist/actions.js';

let f, dani;
beforeAll(async () => { f = await fixtures(); dani = await loginCoach(); });

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2'), Buffer.alloc(4000, 7)]);
const ask = (question, extra = {}) => dani.post('/api/assist/ask', { question, ...extra });
const confirm = id => dani.post(`/api/assist/proposals/${id}/confirm`, {});

describe('exercise library', () => {
  it('adds a coach’s own exercise with a photo, then swaps it for a video that streams in ranges', async () => {
    const created = await dani.post('/api/exercises', { name: 'Band pull-apart (Dani)', muscle: 'Back', equipment: 'Band', level: 'Beginner', pattern: 'pull', instructions: 'Arms straight\nSqueeze shoulder blades' });
    expect(created.status).toBe(201);
    const id = created.body.exercise.id;
    expect(created.body.exercise.custom).toBe(true);

    const photo = await dani.upload(`/api/exercises/${id}/media`, 'media', PNG, 'pull.png');
    expect(photo.status).toBe(201);
    expect(photo.body.exercise.mediaType).toBe('image');
    expect(photo.body.exercise.mediaUrl).toMatch(/^\/files\//);

    const video = await dani.upload(`/api/exercises/${id}/media`, 'media', MP4, 'pull.mp4');
    expect(video.status).toBe(201);
    expect(video.body.exercise.mediaType).toBe('video');
    const detail = await dani.get(`/api/exercises/${id}`);
    const url = detail.body.exercise.mediaUrl;
    const anon = await browser();
    const part = await anon.agent.get(url).set('Range', 'bytes=0-15');
    expect(part.status).toBe(206);
    expect(part.headers['content-type']).toMatch(/video\/mp4/);
    expect(Number(part.headers['content-length'])).toBe(16);

    // The snapshot the iPhone app loads shows it as the coach's own, with a video.
    const snap = await dani.get('/api/mobile/coach');
    const row = snap.body.library.find(e => e.id === id);
    expect(row.custom).toBe(true);
    expect(row.mediaType).toBe('video');
  });

  it('refuses files that aren’t photos or videos', async () => {
    const created = await dani.post('/api/exercises', { name: 'Wall sit (Dani)', equipment: 'Bodyweight', level: 'Beginner', pattern: 'squat' });
    const r = await dani.upload(`/api/exercises/${created.body.exercise.id}/media`, 'media', Buffer.from('not a picture at all, just text'), 'x.txt');
    expect(r.status).toBe(400);
  });

  it('removes a shared exercise from this coach’s library only, and can bring it back', async () => {
    const shared = (await dani.get('/api/exercises')).body.exercises.find(e => !e.custom);
    const del = await dani.del(`/api/exercises/${shared.id}`);
    expect(del.body).toMatchObject({ ok: true, hidden: true, deleted: false });
    expect((await dani.get('/api/exercises')).body.exercises.some(e => e.id === shared.id)).toBe(false);
    expect((await dani.get('/api/mobile/coach')).body.library.some(e => e.id === shared.id)).toBe(false);
    // Still in the shared library for everyone else.
    expect(await f.dbB.exercise.findFirst({ where: { id: shared.id } })).toBeTruthy();
    const restored = await dani.post(`/api/exercises/${shared.id}/restore`, {});
    expect(restored.status).toBe(200);
    expect((await dani.get('/api/exercises')).body.exercises.some(e => e.id === shared.id)).toBe(true);
  });

  it('deletes the coach’s own exercise, but only hides it while a workout still uses it', async () => {
    const lone = (await dani.post('/api/exercises', { name: 'Lonely lift (Dani)', equipment: 'Dumbbell', level: 'Beginner', pattern: 'push' })).body.exercise;
    expect((await dani.del(`/api/exercises/${lone.id}`)).body.deleted).toBe(true);
    expect((await dani.get(`/api/exercises/${lone.id}`)).status).toBe(404);

    const used = (await dani.post('/api/exercises', { name: 'Used lift (Dani)', equipment: 'Dumbbell', level: 'Beginner', pattern: 'push' })).body.exercise;
    const w = await dani.post('/api/workouts', { name: 'Uses it', blocks: [{ kind: 'single', items: [{ exerciseId: used.id, sets: [{ reps: '10' }] }] }] });
    expect(w.status).toBe(201);
    expect((await dani.del(`/api/exercises/${used.id}`)).body.hidden).toBe(true);
    expect((await dani.get(`/api/workouts/${w.body.workout.id}`)).body.exercises[used.id].name).toBe('Used lift (Dani)');
  });

  it('keeps one business’s removals away from another', async () => {
    const shared = (await dani.get('/api/exercises')).body.exercises.find(e => !e.custom);
    await dani.del(`/api/exercises/${shared.id}`);
    const b = await f.dbB.business.findFirst({ select: { settings: true } });
    expect(b.settings?.hiddenExercises || []).not.toContain(shared.id);
    await dani.post(`/api/exercises/${shared.id}/restore`, {});
  });
});

describe('programs from the app', () => {
  it('creates a program with its days, and deletes it', async () => {
    const r = await dani.post('/api/programs', { name: 'App-made Program', weeks: 6, daysPerWeek: 3, level: 'Beginner' });
    expect(r.status).toBe(201);
    const p = (await dani.get(`/api/programs/${r.body.program.id}`)).body.program;
    expect(p.workouts.length).toBe(3);
    expect((await dani.del(`/api/programs/${p.id}`)).status).toBe(200);
    expect((await dani.get('/api/mobile/coach')).body.programs.some(x => x.id === p.id)).toBe(false);
  });
});

describe('Assist can do things inside OneJump', () => {
  it('matches names forgivingly', () => {
    const list = [{ name: 'Goblet Squat' }, { name: 'Back Squat' }, { name: 'Romanian Deadlift' }];
    expect(bestMatch(list, 'goblet squats').hits.map(x => x.name)).toEqual(['Goblet Squat']);
    expect(bestMatch(list, 'romanian deadlift').hits.map(x => x.name)).toEqual(['Romanian Deadlift']);
    expect(bestMatch(list, 'squat').hits.length).toBe(2);
  });

  it('builds a whole program with workouts from the library, after the coach confirms', async () => {
    const lib = (await dani.get('/api/exercises')).body.exercises.slice(0, 3).map(e => e.name);
    const r = await PROPOSE.create_program(f.dbA, { userId: f.dani.id, businessId: f.A.id, role: 'OWNER' }, {
      name: 'Assist Strength Block', weeks: 4, days_per_week: 2, level: 'Intermediate',
      workouts: [{ name: 'Upper', day: 1, exercises: [{ exercise: lib[0], sets: 3, reps: '8-10' }, { exercise: lib[1], sets: 4, reps: '6' }] }, { name: 'Lower', day: 2, exercises: [{ exercise: lib[2], sets: 3, reps: '12' }] }],
    }, { source: 'typed', lang: 'en' });
    expect(r.proposal).toBeTruthy();
    expect(r.proposal.payload.say).toMatch(/Should I create it\?/);
    expect(await f.dbA.program.count({ where: { name: 'Assist Strength Block' } })).toBe(0); // nothing yet
    const c = await confirm(r.proposal.id);
    expect(c.status).toBe(200);
    expect(c.body.navigate).toEqual({ screen: 'program', id: c.body.programId });
    const p = (await dani.get(`/api/programs/${c.body.programId}`)).body.program;
    expect(p.workouts.map(w => [w.name, w.sets])).toEqual([['Upper', 7], ['Lower', 3]]);
  });

  it('says which exercises aren’t in the library instead of guessing', async () => {
    const r = await PROPOSE.save_workout(f.dbA, { userId: f.dani.id, businessId: f.A.id }, { program_name: 'Assist Strength Block', exercises: [{ exercise: 'Underwater basket weaving', sets: 3 }] }, { source: 'typed', lang: 'en' });
    expect(r.error).toMatch(/Underwater basket weaving/);
  });

  it('adds a workout, deletes it, and deletes the program', async () => {
    const auth = { userId: f.dani.id, businessId: f.A.id, role: 'OWNER' };
    const lib = (await dani.get('/api/exercises')).body.exercises.slice(3, 5).map(e => e.name);
    const add = await PROPOSE.save_workout(f.dbA, auth, { program_name: 'assist strength block', name: 'Conditioning', exercises: lib.map(x => ({ exercise: x, sets: 2, reps: '15' })) }, { source: 'voice', lang: 'en' });
    expect((await confirm(add.proposal.id)).status).toBe(200);
    const del = await PROPOSE.delete_workout(f.dbA, auth, { program_name: 'Assist Strength Block', workout_name: 'Conditioning' }, { source: 'voice', lang: 'en' });
    expect(del.proposal.payload.destructive).toBe(true);
    expect((await confirm(del.proposal.id)).status).toBe(200);
    const gone = await PROPOSE.delete_program(f.dbA, auth, { program_name: 'Assist Strength Block' }, { source: 'voice', lang: 'es' });
    expect(gone.proposal.payload.say).toMatch(/¿Lo borro\?/);
    expect((await confirm(gone.proposal.id)).body.message).toMatch(/deleted/);
    expect(await f.dbA.program.count({ where: { name: 'Assist Strength Block', archived: false } })).toBe(0);
  });

  it('won’t delete a program clients are on', async () => {
    const p = await f.dbA.program.findFirst({ where: { id: f.mike.programId } });
    const r = await PROPOSE.delete_program(f.dbA, { userId: f.dani.id, businessId: f.A.id }, { program_name: p.name }, { source: 'typed', lang: 'en' });
    expect(r.error).toMatch(/active client/);
  });

  it('adds and deletes exercises, and a spoken yes confirms', async () => {
    const auth = { userId: f.dani.id, businessId: f.A.id };
    const add = await PROPOSE.create_exercise(f.dbA, auth, { name: 'Assist Hip Airplane', muscle_group: 'glutes', equipment: 'Bodyweight', instructions: 'Hinge on one leg\nRotate open' }, { source: 'voice', lang: 'en' });
    const yes = await ask('yes', { voice: true, pendingProposalId: add.proposal.id });
    expect(yes.body.decided.confirmed).toBe(true);
    expect(yes.body.navigate.screen).toBe('exercise');
    const e = await f.dbA.exercise.findFirst({ where: { name: 'Assist Hip Airplane' } });
    expect(e.pattern).toBe('hinge');
    const del = await PROPOSE.delete_exercise(f.dbA, auth, { exercise_name: 'assist hip airplane' }, { source: 'voice', lang: 'en' });
    expect((await confirm(del.proposal.id)).status).toBe(200);
    expect(await f.dbA.exercise.findFirst({ where: { id: e.id } })).toBeNull();
  });

  it('messages a group, pauses a client and switches an automation, each only after a confirm', async () => {
    const auth = { userId: f.dani.id, businessId: f.A.id };
    const before = await f.dbA.message.count({ where: { clientId: f.mike.id } });
    const msg = await PROPOSE.message_clients(f.dbA, auth, { group: 'named', client_names: [f.mike.name], text: 'Hey {first}, gym closes early Friday!' }, { source: 'typed', lang: 'en' });
    expect(await f.dbA.message.count({ where: { clientId: f.mike.id } })).toBe(before);
    expect((await confirm(msg.proposal.id)).body.sent).toBe(1);
    const last = await f.dbA.message.findFirst({ where: { clientId: f.mike.id }, orderBy: { createdAt: 'desc' } });
    expect(last.body).toBe(`Hey ${f.mike.name.split(' ')[0]}, gym closes early Friday!`);

    const pause = await PROPOSE.update_client(f.dbA, auth, { client_name: f.mike.name, status: 'paused' }, { source: 'typed', lang: 'en' });
    await confirm(pause.proposal.id);
    expect((await f.dbA.client.findFirst({ where: { id: f.mike.id } })).status).toBe('PAUSED');
    await f.dbA.client.update({ where: { id: f.mike.id }, data: { status: 'ACTIVE' } });

    const auto = await PROPOSE.set_automation(f.dbA, auth, { automation: 'milestones', enabled: false }, { source: 'typed', lang: 'en' });
    await confirm(auto.proposal.id);
    expect((await f.dbA.automation.findFirst({ where: { key: 'milestone' } })).enabled).toBe(false);
    await f.dbA.automation.updateMany({ where: { key: 'milestone' }, data: { enabled: true } });
  });

  it('opens screens, switches to voice, and names the founder by first name only', async () => {
    const open = await ask('open my programs');
    expect(open.body.navigate).toEqual({ screen: 'programs', id: null });
    const voice = await ask('switch to voice mode');
    expect(voice.body.mode).toBe('voice');
    const text = await ask('go back to typing');
    expect(text.body.mode).toBe('text');
    const who = await ask('Who founded OneJump?');
    expect(who.body.answerText).toMatch(/Jansell/);
    expect(JSON.stringify(who.body)).not.toMatch(/Hiraldo|Zapata/);
  });
});
