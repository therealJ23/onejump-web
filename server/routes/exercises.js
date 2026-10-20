// Exercise library: OneJump's shared library plus the coach's custom exercises.
// Coaches can add their own exercises (with a photo or a video), delete their own, and remove
// shared ones from their library (hidden for their business only; workouts that use them keep working).
import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { body, z, name } from '../lib/validate.js';
import { must, badRequest } from '../lib/errors.js';
import { HOWTO } from '../seed/exercises.js';
import { StorageService, sniffImage, sniffVideo, stripJpegMetadata } from '../storage/StorageService.js';

export const router = Router();

/** Up to 50 MB: the iPhone app compresses videos before sending them. */
export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MEDIA_MAX_BYTES, files: 1, fields: 4, fieldSize: 1024 } });

/** Exercises this business removed from its library (shared ones are hidden, not deleted). */
export async function hiddenExerciseIds(db) {
  const b = await db.business.findFirst({ select: { settings: true } });
  const list = b?.settings?.hiddenExercises;
  return new Set(Array.isArray(list) ? list.map(String) : []);
}
async function setHidden(db, ids) {
  const b = await db.business.findFirst({ select: { id: true, settings: true } });
  const settings = { ...(b.settings || {}), hiddenExercises: [...ids].slice(-2000) };
  await db.business.update({ where: { id: b.id }, data: { settings } });
}

/** Is this exercise used in any of the business's workouts? (then a delete only hides it) */
async function usedInWorkouts(db, id) {
  const workouts = await db.workout.findMany({ select: { blocks: true } });
  return workouts.some(w => (w.blocks || []).some(b => (b.items || []).some(i => i.exerciseId === id)));
}

export async function shapeExercise(e, byId, { withMedia = false } = {}) {
  return {
    id: e.id, name: e.name, muscle: e.muscle, equipment: e.equipment, level: e.level, pattern: e.pattern, kneeLoad: e.kneeLoad, overhead: e.overhead,
    custom: !!e.businessId, videoUrl: e.videoUrl, howTo: e.howTo || HOWTO[e.pattern] || HOWTO.iso,
    mediaType: e.mediaKey ? e.mediaType : null,
    mediaUrl: withMedia && e.mediaKey ? await StorageService.signedUrl(e.mediaKey) : null,
    alternatives: (Array.isArray(e.altIds) ? e.altIds : []).map(id => byId.get(id)).filter(Boolean).map(a => ({ id: a.id, name: a.name, equipment: a.equipment, level: a.level, kneeLoad: a.kneeLoad })),
  };
}

router.get('/', async (req, res) => {
  const [list, hidden] = await Promise.all([req.db.exercise.findMany({ orderBy: { name: 'asc' } }), hiddenExerciseIds(req.db)]);
  const byId = new Map(list.map(e => [e.id, e]));
  const visible = req.query.hidden === '1' ? list.filter(e => hidden.has(e.id)) : list.filter(e => !hidden.has(e.id));
  res.json({ exercises: await Promise.all(visible.map(e => shapeExercise(e, byId))) });
});

router.get('/:id', async (req, res) => {
  const e = must(await req.db.exercise.findFirst({ where: { id: req.params.id } }), 'That exercise');
  const alts = await req.db.exercise.findMany({ where: { id: { in: Array.isArray(e.altIds) ? e.altIds : [] } } });
  res.json({ exercise: await shapeExercise(e, new Map(alts.map(a => [a.id, a])), { withMedia: true }) });
});

export const PATTERNS = ['squat', 'hinge', 'lunge', 'push', 'pull', 'core', 'carry', 'jump', 'cardio', 'iso'];
const schema = z.object({
  name, muscle: z.string().trim().min(1).max(60).default('Full body'), equipment: z.string().trim().min(1).max(40).default('Bodyweight'), level: z.enum(['Beginner', 'Intermediate', 'Advanced']).default('Beginner'),
  pattern: z.enum(PATTERNS).default('iso'),
  instructions: z.string().max(2000).optional(), videoUrl: z.string().trim().max(190).optional().or(z.literal('')),
  kneeLoad: z.boolean().optional(), overhead: z.boolean().optional(),
});

/** Creates a custom exercise (used by the route and by Assist). */
export async function createExercise(db, d) {
  if (d.videoUrl && !/^https:\/\//i.test(d.videoUrl)) d.videoUrl = '';
  return db.exercise.create({ data: {
    name: d.name, muscle: d.muscle || 'Full body', equipment: d.equipment || 'Bodyweight', level: d.level || 'Beginner', pattern: d.pattern || 'iso', kneeLoad: !!d.kneeLoad, overhead: !!d.overhead,
    videoUrl: d.videoUrl || null, howTo: d.instructions ? d.instructions.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 10) : null,
  } });
}

router.post('/', body(schema), async (req, res) => {
  const e = await createExercise(req.db, req.body);
  res.status(201).json({ exercise: await shapeExercise(e, new Map()) });
});

router.patch('/:id', body(schema.partial()), async (req, res) => {
  const e = must(await req.db.exercise.findFirst({ where: { id: req.params.id, businessId: req.auth.businessId } }), 'That custom exercise');
  const { instructions, ...d } = req.body;
  if (d.videoUrl && !/^https:\/\//i.test(d.videoUrl)) d.videoUrl = null;
  const updated = await req.db.exercise.update({ where: { id: e.id }, data: { ...d, ...(instructions != null ? { howTo: instructions.split('\n').map(s => s.trim()).filter(Boolean) } : {}) } });
  res.json({ exercise: await shapeExercise(updated, new Map(), { withMedia: true }) });
});

/**
 * Removes an exercise from this coach's library. Their own exercise is deleted (with its photo or
 * video) unless a workout still uses it; then it's hidden, like a shared one, so workouts keep working.
 */
export async function removeExercise(db, auth, id) {
  const e = must(await db.exercise.findFirst({ where: { id } }), 'That exercise');
  const mine = e.businessId === auth.businessId;
  if (mine && !(await usedInWorkouts(db, e.id))) {
    await db.exercise.delete({ where: { id: e.id } });
    if (e.mediaKey) await StorageService.remove(e.mediaKey).catch(() => null);
    const hidden = await hiddenExerciseIds(db);
    if (hidden.delete(e.id)) await setHidden(db, hidden);
    return { deleted: true, hidden: false, name: e.name };
  }
  const hidden = await hiddenExerciseIds(db);
  hidden.add(e.id);
  await setHidden(db, hidden);
  return { deleted: false, hidden: true, name: e.name };
}

router.delete('/:id', async (req, res) => {
  const r = await removeExercise(req.db, req.auth, req.params.id);
  res.json({ ok: true, ...r, message: r.deleted ? `${r.name} is deleted.` : `${r.name} is out of your library.` });
});

/** Puts a removed exercise back in the library. */
router.post('/:id/restore', async (req, res) => {
  const e = must(await req.db.exercise.findFirst({ where: { id: req.params.id } }), 'That exercise');
  const hidden = await hiddenExerciseIds(req.db);
  if (hidden.delete(e.id)) await setHidden(req.db, hidden);
  res.json({ ok: true, message: `${e.name} is back in your library.` });
});

/** A photo or video for one of the coach's own exercises (replaces the old one). */
router.post('/:id/media', upload.single('media'), async (req, res) => {
  const e = must(await req.db.exercise.findFirst({ where: { id: req.params.id, businessId: req.auth.businessId } }), 'That custom exercise');
  if (!req.file) throw badRequest('Choose a photo or a video.');
  let buf = req.file.buffer;
  const image = sniffImage(buf);
  const video = image ? null : sniffVideo(buf);
  if (!image && !video) throw badRequest('Upload a photo (JPG, PNG, WebP, HEIC) or a video (MP4 or MOV).');
  if (image === 'image/jpeg') buf = stripJpegMetadata(buf) || buf;
  const key = `exercises/${req.auth.businessId}/${e.id}/${randomUUID()}`;
  await StorageService.put(key, buf, image || video);
  const updated = await req.db.exercise.update({ where: { id: e.id }, data: { mediaKey: key, mediaType: image ? 'image' : 'video' } });
  if (e.mediaKey) await StorageService.remove(e.mediaKey).catch(() => null);
  res.status(201).json({ exercise: await shapeExercise(updated, new Map(), { withMedia: true }) });
});

router.delete('/:id/media', async (req, res) => {
  const e = must(await req.db.exercise.findFirst({ where: { id: req.params.id, businessId: req.auth.businessId } }), 'That custom exercise');
  if (e.mediaKey) await StorageService.remove(e.mediaKey).catch(() => null);
  await req.db.exercise.update({ where: { id: e.id }, data: { mediaKey: null, mediaType: null } });
  res.json({ ok: true });
});
