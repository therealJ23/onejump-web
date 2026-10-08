// Workout builder: blocks, sets, supersets; assigning; and the Assist workout generator.
import { Router } from 'express';
import { body, z, id as idRule } from '../lib/validate.js';
import { must, badRequest, conflict } from '../lib/errors.js';
import { normalizeBlocks, exerciseMap, countSets, estimateMinutes } from '../core/training.js';
import { workoutDraft } from '../ai/drafts.js';
import { ymdToDate } from '../lib/time.js';

export const router = Router();

const setSchema = z.object({ reps: z.coerce.string().max(20).default(''), load: z.coerce.string().max(20).default(''), rpe: z.coerce.string().max(10).default(''), rest: z.coerce.string().max(10).default('') });
const itemSchema = z.object({ id: z.string().max(40).optional(), exerciseId: idRule, tempo: z.string().max(20).optional().default(''), notes: z.string().max(200).optional().default(''), sets: z.array(setSchema).min(1).max(12) });
const blockSchema = z.object({ id: z.string().max(40).optional(), kind: z.enum(['single', 'superset', 'circuit']), items: z.array(itemSchema).min(1).max(6) });
const blocksSchema = z.array(blockSchema).max(30);

async function checkExercises(db, blocks) {
  const ex = await exerciseMap(db);
  for (const b of blocks) for (const it of b.items) if (!ex.has(it.exerciseId)) throw badRequest('One of the exercises isn’t in your library.');
  return ex;
}
async function shapeWorkout(db, w) {
  const ex = await exerciseMap(db);
  const program = w.programId ? await db.program.findFirst({ where: { id: w.programId }, select: { id: true, name: true, weeks: true } }) : null;
  const client = w.clientId ? await db.client.findFirst({ where: { id: w.clientId }, select: { id: true, name: true } }) : null;
  const used = [...new Set(w.blocks.flatMap(b => b.items.map(i => i.exerciseId)))];
  return {
    workout: { ...w, sets: countSets(w.blocks) },
    program, client,
    exercises: Object.fromEntries(used.map(id => [id, ex.get(id)]).filter(([, e]) => e).map(([id, e]) => [id, { id, name: e.name, muscle: e.muscle, equipment: e.equipment, kneeLoad: e.kneeLoad, pattern: e.pattern, altIds: e.altIds || [] }])),
  };
}

router.get('/', async (req, res) => {
  const list = await req.db.workout.findMany({ where: { clientId: null }, orderBy: { updatedAt: 'desc' }, take: 100, select: { id: true, name: true, programId: true, day: true, estMinutes: true, updatedAt: true } });
  res.json({ workouts: list });
});

router.get('/:id', async (req, res) => {
  const w = must(await req.db.workout.findFirst({ where: { id: req.params.id } }), 'That workout');
  res.json(await shapeWorkout(req.db, w));
});

router.post('/', body(z.object({ name: z.string().trim().min(1).max(80).default('New workout'), programId: idRule.optional(), day: z.coerce.number().int().min(1).max(7).optional(), blocks: blocksSchema.default([]), estMinutes: z.coerce.number().int().min(5).max(240).optional() })), async (req, res) => {
  const d = req.body;
  if (d.programId) must(await req.db.program.findFirst({ where: { id: d.programId } }), 'That program');
  const blocks = normalizeBlocks(d.blocks);
  await checkExercises(req.db, blocks);
  const w = await req.db.workout.create({ data: { name: d.name, programId: d.programId || null, day: d.day || null, blocks, estMinutes: d.estMinutes || estimateMinutes(blocks) } });
  res.status(201).json(await shapeWorkout(req.db, w));
});

router.put('/:id', body(z.object({ name: z.string().trim().min(1).max(80), blocks: blocksSchema, estMinutes: z.coerce.number().int().min(5).max(240).optional() })), async (req, res) => {
  const w = must(await req.db.workout.findFirst({ where: { id: req.params.id } }), 'That workout');
  const blocks = normalizeBlocks(req.body.blocks);
  await checkExercises(req.db, blocks);
  const updated = await req.db.workout.update({ where: { id: w.id }, data: { name: req.body.name, blocks, estMinutes: req.body.estMinutes || estimateMinutes(blocks) } });
  if (w.programId) await req.db.program.update({ where: { id: w.programId }, data: { updatedAt: new Date() } });
  res.json(await shapeWorkout(req.db, updated));
});

router.delete('/:id', async (req, res) => {
  const w = must(await req.db.workout.findFirst({ where: { id: req.params.id } }), 'That workout');
  const future = await req.db.workoutAssignment.count({ where: { workoutId: w.id, status: 'scheduled' } });
  if (future) throw conflict('Clients have this workout scheduled. Remove it from their schedule first.');
  await req.db.workout.delete({ where: { id: w.id } });
  res.json({ ok: true });
});

router.post('/:id/assign', body(z.object({ clientIds: z.array(idRule).min(1).max(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().trim().max(500).optional() })), async (req, res) => {
  const w = must(await req.db.workout.findFirst({ where: { id: req.params.id } }), 'That workout');
  const clients = await req.db.client.findMany({ where: { id: { in: req.body.clientIds } }, select: { id: true, name: true } });
  if (clients.length !== new Set(req.body.clientIds).size) throw badRequest('Some of those clients aren’t in your workspace.');
  const day = ymdToDate(req.body.date);
  await req.db.workoutAssignment.createMany({ data: clients.map(c => ({ clientId: c.id, workoutId: w.id, scheduledFor: day, status: 'scheduled', coachNote: req.body.note || null })) });
  res.json({ ok: true, assigned: clients.length, date: req.body.date });
});

// ---------------------------------------------------------------- Assist workout generator
const brief = z.object({
  goal: z.enum(['Fat loss', 'Strength', 'Muscle gain', 'Athletic performance', 'General fitness']),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced']),
  daysPerWeek: z.coerce.number().int().min(1).max(7).default(3),
  minutes: z.coerce.number().int().min(15).max(120),
  equipment: z.array(z.string().max(30)).max(20).default([]),
  injuries: z.string().trim().max(200).optional().default(''),
  prefs: z.string().trim().max(200).optional().default(''),
  seed: z.coerce.number().int().min(1).max(10000).default(1),
  clientId: idRule.optional(),
});
router.post('/generate', body(brief), async (req, res) => {
  const { clientId, ...b } = req.body;
  const client = clientId ? must(await req.db.client.findFirst({ where: { id: clientId } }), 'That client') : null;
  const ins = await workoutDraft(req.db, b, client);
  const ex = await exerciseMap(req.db);
  const blocks = normalizeBlocks(ins.draft.blocks);
  res.json({ insightId: ins.id, draft: { ...ins.draft, blocks }, exercises: Object.fromEntries([...new Set(blocks.flatMap(x => x.items.map(i => i.exerciseId)))].map(id => [id, { id, name: ex.get(id)?.name, equipment: ex.get(id)?.equipment, altIds: ex.get(id)?.altIds || [], kneeLoad: ex.get(id)?.kneeLoad }])), model: ins.model });
});

router.post('/generate/:insightId/accept', body(z.object({ workoutId: idRule.optional(), blocks: blocksSchema.optional(), name: z.string().trim().max(80).optional() })), async (req, res) => {
  const ins = must(await req.db.aIInsight.findFirst({ where: { id: req.params.insightId, kind: 'workout' } }), 'That draft');
  if (ins.status !== 'pending') throw conflict('That draft was already used.');
  const blocks = normalizeBlocks(req.body.blocks || ins.draft.blocks);
  await checkExercises(req.db, blocks);
  const edited = !!req.body.blocks && JSON.stringify(req.body.blocks.map(b => b.items.map(i => [i.exerciseId, i.sets.length]))) !== JSON.stringify(ins.draft.blocks.map(b => b.items.map(i => [i.exerciseId, i.sets.length])));
  let w;
  if (req.body.workoutId) {
    const target = must(await req.db.workout.findFirst({ where: { id: req.body.workoutId } }), 'That workout');
    w = await req.db.workout.update({ where: { id: target.id }, data: { blocks, name: req.body.name || target.name, estMinutes: ins.draft.estMinutes || estimateMinutes(blocks), source: 'assist' } });
  } else {
    w = await req.db.workout.create({ data: { name: req.body.name || ins.draft.name, blocks, estMinutes: ins.draft.estMinutes || estimateMinutes(blocks), source: 'assist' } });
  }
  await req.db.aIInsight.update({ where: { id: ins.id }, data: { status: edited ? 'edited' : 'approved', decidedAt: new Date(), decidedBy: req.auth.userId, minutesSaved: edited ? Math.round(ins.minutesSaved * 0.7) : ins.minutesSaved } });
  res.json(await shapeWorkout(req.db, w));
});

router.post('/generate/:insightId/dismiss', async (req, res) => {
  const ins = must(await req.db.aIInsight.findFirst({ where: { id: req.params.insightId, kind: 'workout' } }), 'That draft');
  if (ins.status === 'pending') await req.db.aIInsight.update({ where: { id: ins.id }, data: { status: 'dismissed', decidedAt: new Date(), decidedBy: req.auth.userId } });
  res.json({ ok: true });
});

