// Exercise library: OneJump's shared library plus the coach's custom exercises.
import { Router } from 'express';
import { body, z, name } from '../lib/validate.js';
import { must } from '../lib/errors.js';
import { HOWTO } from '../seed/exercises.js';

export const router = Router();
const shape = (e, byId) => ({
  id: e.id, name: e.name, muscle: e.muscle, equipment: e.equipment, level: e.level, pattern: e.pattern, kneeLoad: e.kneeLoad, overhead: e.overhead,
  custom: !!e.businessId, videoUrl: e.videoUrl, howTo: e.howTo || HOWTO[e.pattern] || HOWTO.iso,
  alternatives: (Array.isArray(e.altIds) ? e.altIds : []).map(id => byId.get(id)).filter(Boolean).map(a => ({ id: a.id, name: a.name, equipment: a.equipment, level: a.level, kneeLoad: a.kneeLoad })),
});

router.get('/', async (req, res) => {
  const list = await req.db.exercise.findMany({ orderBy: { name: 'asc' } });
  const byId = new Map(list.map(e => [e.id, e]));
  res.json({ exercises: list.map(e => shape(e, byId)) });
});

router.get('/:id', async (req, res) => {
  const e = must(await req.db.exercise.findFirst({ where: { id: req.params.id } }), 'That exercise');
  const alts = await req.db.exercise.findMany({ where: { id: { in: Array.isArray(e.altIds) ? e.altIds : [] } } });
  res.json({ exercise: shape(e, new Map(alts.map(a => [a.id, a]))) });
});

const schema = z.object({
  name, muscle: z.string().trim().min(1).max(60).default('Full body'), equipment: z.string().trim().min(1).max(40), level: z.enum(['Beginner', 'Intermediate', 'Advanced']),
  pattern: z.enum(['squat', 'hinge', 'lunge', 'push', 'pull', 'core', 'carry', 'jump', 'cardio', 'iso']).default('iso'),
  instructions: z.string().max(2000).optional(), videoUrl: z.string().trim().max(190).optional().or(z.literal('')),
  kneeLoad: z.boolean().optional(), overhead: z.boolean().optional(),
});
router.post('/', body(schema), async (req, res) => {
  const d = req.body;
  if (d.videoUrl && !/^https:\/\//i.test(d.videoUrl)) d.videoUrl = '';
  const e = await req.db.exercise.create({ data: {
    name: d.name, muscle: d.muscle, equipment: d.equipment, level: d.level, pattern: d.pattern, kneeLoad: !!d.kneeLoad, overhead: !!d.overhead,
    videoUrl: d.videoUrl || null, howTo: d.instructions ? d.instructions.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 10) : null,
  } });
  res.status(201).json({ exercise: shape(e, new Map()) });
});

router.patch('/:id', body(schema.partial()), async (req, res) => {
  const e = must(await req.db.exercise.findFirst({ where: { id: req.params.id, businessId: req.auth.businessId } }), 'That custom exercise');
  const { instructions, ...d } = req.body;
  if (d.videoUrl && !/^https:\/\//i.test(d.videoUrl)) d.videoUrl = null;
  const updated = await req.db.exercise.update({ where: { id: e.id }, data: { ...d, ...(instructions != null ? { howTo: instructions.split('\n').map(s => s.trim()).filter(Boolean) } : {}) } });
  res.json({ exercise: shape(updated, new Map()) });
});

router.delete('/:id', async (req, res) => {
  const e = must(await req.db.exercise.findFirst({ where: { id: req.params.id, businessId: req.auth.businessId } }), 'That custom exercise');
  await req.db.exercise.delete({ where: { id: e.id } });
  res.json({ ok: true });
});
