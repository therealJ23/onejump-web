// Programs: multi-week templates of workouts, assigned to clients.
import { Router } from 'express';
import { body, z, name } from '../lib/validate.js';
import { must, conflict } from '../lib/errors.js';
import { countSets } from '../core/training.js';

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

