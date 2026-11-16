// Programs: multi-week templates of workouts, assigned to clients.
import { Router } from 'express';
import { body, z, name } from '../lib/validate.js';
import { must, conflict, badRequest } from '../lib/errors.js';
import { countSets, exerciseMap, patternImage } from '../core/training.js';

export const router = Router();

router.get('/', async (req, res) => {
  const [programs, clients] = await Promise.all([
    req.db.program.findMany({ where: { archived: false }, orderBy: { updatedAt: 'desc' }, include: { workouts: { where: { clientId: null }, select: { id: true } } } }),
    req.db.client.groupBy({ by: ['programId'], where: { status: { in: ['NEW', 'ACTIVE'] }, programId: { not: null } }, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(clients.map(c => [c.programId, c._count._all]));
  res.json({ programs: programs.map(p => ({ id: p.id, name: p.name, weeks: p.weeks, daysPerWeek: p.daysPerWeek, level: p.level, source: p.source, description: p.description, updatedAt: p.updatedAt, workouts: p.workouts.length, clients: counts[p.id] || 0 })) });
});

const schema = z.object({ name, weeks: z.coerce.number().int().min(1).max(52), daysPerWeek: z.coerce.number().int().min(1).max(7), level: z.string().trim().max(40).optional(), description: z.string().trim().max(2000).optional() });
router.post('/', body(schema), async (req, res) => {
  const d = req.body;
  const p = await req.db.program.create({ data: { name: d.name, weeks: d.weeks, daysPerWeek: d.daysPerWeek, level: d.level || null, description: d.description || null } });
  await req.db.workout.createMany({ data: Array.from({ length: d.daysPerWeek }, (_, i) => ({ programId: p.id, name: `Day ${i + 1}`, day: i + 1, blocks: [], estMinutes: 45 })) });
  res.status(201).json({ program: p });
});

router.get('/:id', async (req, res) => {
  const p = must(await req.db.program.findFirst({ where: { id: req.params.id }, include: { workouts: { where: { clientId: null }, orderBy: [{ week: 'asc' }, { day: 'asc' }] } } }), 'That program');
  const clients = await req.db.client.findMany({ where: { programId: p.id, status: { in: ['NEW', 'ACTIVE'] } }, select: { id: true, name: true } });
  res.json({ program: { ...p, workouts: p.workouts.map(w => ({ id: w.id, name: w.name, day: w.day, week: w.week, estMinutes: w.estMinutes, exercises: w.blocks.reduce((n, b) => n + b.items.length, 0), sets: countSets(w.blocks) })) }, clients });
});

router.patch('/:id', body(schema.partial().extend({ archived: z.boolean().optional() })), async (req, res) => {
  const p = must(await req.db.program.findFirst({ where: { id: req.params.id } }), 'That program');
  res.json({ program: await req.db.program.update({ where: { id: p.id }, data: req.body }) });
});

router.delete('/:id', async (req, res) => {
  const p = must(await req.db.program.findFirst({ where: { id: req.params.id } }), 'That program');
  const n = await req.db.client.count({ where: { programId: p.id, status: { in: ['NEW', 'ACTIVE'] } } });
  if (n) throw conflict(`${n} active client${n === 1 ? ' is' : 's are'} on this program. Move them to another program first.`);
  await req.db.program.update({ where: { id: p.id }, data: { archived: true } });
  res.json({ ok: true });
});

router.post('/:id/workouts', body(z.object({ name: name.optional(), day: z.coerce.number().int().min(1).max(7).optional() })), async (req, res) => {
  const p = must(await req.db.program.findFirst({ where: { id: req.params.id }, include: { workouts: { where: { clientId: null }, select: { day: true } } } }), 'That program');
  const day = req.body.day || Math.min(7, Math.max(0, ...p.workouts.map(w => w.day || 0)) + 1);
  const w = await req.db.workout.create({ data: { programId: p.id, name: req.body.name || `Day ${day}`, day, blocks: [], estMinutes: 45 } });
  await req.db.program.update({ where: { id: p.id }, data: { updatedAt: new Date() } });
  res.status(201).json({ workout: w });
});

router.post('/:id/duplicate', async (req, res) => {
  const p = must(await req.db.program.findFirst({ where: { id: req.params.id }, include: { workouts: { where: { clientId: null } } } }), 'That program');
  const copy = await req.db.program.create({ data: { name: `${p.name} (copy)`, weeks: p.weeks, daysPerWeek: p.daysPerWeek, level: p.level, description: p.description, source: p.source } });
  if (p.workouts.length) await req.db.workout.createMany({ data: p.workouts.map(w => ({ programId: copy.id, name: w.name, week: w.week, day: w.day, estMinutes: w.estMinutes, blocks: w.blocks, source: w.source })) });
  res.status(201).json({ program: copy });
});


// Week planner: the 7 days of one program week, with the workout that runs each day.
router.get('/:id/plan', async (req, res) => {
  const p = must(await req.db.program.findFirst({ where: { id: req.params.id } }), 'That program');
  const week = Math.max(1, Math.min(p.weeks || 1, Number(req.query.week) || 1));
  const [workouts, ex] = await Promise.all([req.db.workout.findMany({ where: { programId: p.id } }), exerciseMap(req.db)]);
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = i + 1;
    const w = workouts.find(x => x.week === week && x.day === day) || workouts.find(x => x.week == null && x.day === day) || null;
    if (!w) return { day, workout: null };
    const first = w.blocks?.find(b => b.section !== 'warmup')?.items?.[0] || w.blocks?.[0]?.items?.[0];
    const e = first ? ex.get(first.exerciseId) : null;
    return { day, workout: { id: w.id, name: w.name, week: w.week, everyWeek: w.week == null, exercises: (w.blocks || []).reduce((n, b) => n + b.items.length, 0), estMinutes: w.estMinutes, pattern: e?.pattern || null, imageUrl: e ? patternImage(e.pattern) : null } };
  });
  res.json({ program: { id: p.id, name: p.name, weeks: p.weeks, daysPerWeek: p.daysPerWeek }, week, days });
});

// Copy one week's workouts onto other weeks (each target week gets its own copies).
router.post('/:id/copy-week', body(z.object({ from: z.coerce.number().int().min(1).max(52), to: z.array(z.coerce.number().int().min(1).max(52)).min(1).max(51) })), async (req, res) => {
  const p = must(await req.db.program.findFirst({ where: { id: req.params.id } }), 'That program');
  const all = await req.db.workout.findMany({ where: { programId: p.id } });
  const source = [1, 2, 3, 4, 5, 6, 7].map(day => all.find(x => x.week === req.body.from && x.day === day) || all.find(x => x.week == null && x.day === day)).filter(Boolean);
  if (!source.length) throw badRequest(`Week ${req.body.from} has no workouts to copy.`);
  let created = 0;
  for (const week of [...new Set(req.body.to)].filter(w => w !== req.body.from && w <= Math.max(p.weeks, 52))) {
    // Same day already has its own workout: overwrite it in place (clients scheduled on it keep
    // their link); otherwise add a copy. Nothing is deleted.
    for (const w of source) {
      const there = all.find(x => x.week === week && x.day === w.day);
      if (there) await req.db.workout.update({ where: { id: there.id }, data: { name: w.name, blocks: w.blocks, estMinutes: w.estMinutes } });
      else await req.db.workout.create({ data: { programId: p.id, name: w.name, week, day: w.day, blocks: w.blocks, estMinutes: w.estMinutes, source: w.source } });
      created++;
    }
  }
  if (Math.max(...req.body.to) > p.weeks) await req.db.program.update({ where: { id: p.id }, data: { weeks: Math.max(...req.body.to) } });
  res.json({ ok: true, created });
});
