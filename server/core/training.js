// Programs → scheduled workouts (assignments), and helpers for workout blocks.
import { randomUUID } from 'node:crypto';
import { todayKey, weekStart, addDays, trainingWeekdays } from '../lib/time.js';

/** Gives every block and item a stable id (the builder and logging rely on them). */
export function normalizeBlocks(blocks = []) {
  return (blocks || []).map(b => ({
    id: b.id || `b_${randomUUID().slice(0, 8)}`,
    kind: ['single', 'superset', 'circuit'].includes(b.kind) ? (b.items?.length > 1 ? b.kind : 'single') : 'single',
    items: (b.items || []).map(it => ({
      id: it.id || `i_${randomUUID().slice(0, 8)}`,
      exerciseId: it.exerciseId,
      tempo: it.tempo || '',
      notes: it.notes || '',
      sets: (it.sets || []).map(s => ({ reps: String(s.reps ?? ''), load: String(s.load ?? ''), rpe: String(s.rpe ?? ''), rest: String(s.rest ?? '') })),
    })).filter(it => it.exerciseId),
  })).filter(b => b.items.length);
}

export const countSets = blocks => (blocks || []).reduce((n, b) => n + b.items.reduce((m, it) => m + it.sets.length, 0), 0);
export const estimateMinutes = blocks => Math.max(10, Math.round((blocks || []).reduce((n, b) => n + b.items.reduce((m, it) => m + it.sets.reduce((k, s) => k + 0.9 + (Number(s.rest) || 60) / 60, 0), 0), 0) / (1) / 1.15));

/** Exercises visible to this workspace (global library + custom), as a Map by id. */
export async function exerciseMap(db) {
  const list = await db.exercise.findMany({ select: { id: true, name: true, muscle: true, equipment: true, level: true, pattern: true, kneeLoad: true, overhead: true, businessId: true, altIds: true, videoUrl: true, howTo: true } });
  return new Map(list.map(e => [e.id, e]));
}

/** Which workout of a program runs on a given program week/day. */
export function pickWorkout(workouts, week, day) {
  const exact = workouts.find(w => w.week === week && w.day === day);
  if (exact) return exact;
  const repeating = workouts.find(w => w.week == null && w.day === day);
  if (repeating) return repeating;
  const generic = workouts.filter(w => w.week == null).sort((a, b) => (a.day ?? 99) - (b.day ?? 99));
  const pool = generic.length ? generic : workouts;
  return pool.length ? pool[(day - 1) % pool.length] : null;
}

/**
 * Schedules a program for a client from a start date: one assignment per training day
 * for every week of the program. Replaces the client's future scheduled assignments.
 */
export async function assignProgram(db, { clientId, programId, start = null, tz = 'UTC', now = new Date() }) {
  const program = await db.program.findFirst({ where: { id: programId }, include: { workouts: true } });
  if (!program) return null;
  const today = todayKey(tz, now);
  const startKey = start ? new Date(start) : today;
  await db.workoutAssignment.deleteMany({ where: { clientId, status: 'scheduled', scheduledFor: { gte: startKey > today ? today : startKey } } });
  const workouts = program.workouts.filter(w => !w.clientId || w.clientId === clientId);
  const days = trainingWeekdays(program.daysPerWeek);
  const rows = [];
  const mon = weekStart(startKey);
  for (let w = 1; w <= program.weeks; w++) {
    days.forEach((wd, i) => {
      const date = addDays(mon, (w - 1) * 7 + wd);
      if (date < startKey) return;
      const wo = pickWorkout(workouts, w, i + 1);
      if (wo) rows.push({ clientId, workoutId: wo.id, scheduledFor: date, status: 'scheduled' });
    });
  }
  if (rows.length) await db.workoutAssignment.createMany({ data: rows });
  await db.client.update({ where: { id: clientId }, data: { programId, programStartedAt: startKey } });
  return { program, scheduled: rows.length };
}

/** Program week (1-based) for a client today. */
export function programWeek(client, now = new Date()) {
  if (!client.programStartedAt) return null;
  return Math.max(1, Math.floor((now.getTime() - new Date(client.programStartedAt).getTime()) / (7 * 864e5)) + 1);
}

/** Copies a program workout for one client (used when Assist's adjustment is applied to just them). */
export async function tailorWorkoutForClient(db, workout, clientId, transform) {
  const blocks = transform(JSON.parse(JSON.stringify(workout.blocks)));
  const copy = await db.workout.create({ data: { programId: workout.programId, clientId, name: workout.name, week: workout.week, day: workout.day, estMinutes: workout.estMinutes, blocks, source: 'assist' } });
  return copy;
}
