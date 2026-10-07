// Cached per-client numbers (adherence, workouts done, last activity) used by lists and risk.
import { todayKey, addDays } from '../lib/time.js';

/** Adherence = completed / scheduled workouts over the last 28 days (today counts once it's done). */
export async function refreshClientStats(db, clientId, { tz = 'UTC', now = new Date() } = {}) {
  const today = todayKey(tz, now);
  const assigns = await db.workoutAssignment.findMany({ where: { clientId, scheduledFor: { gte: addDays(today, -28), lte: today } }, select: { status: true, scheduledFor: true } });
  const counted = assigns.filter(a => a.scheduledFor < today || a.status === 'completed');
  const done = counted.filter(a => a.status === 'completed').length;
  const adherence = counted.length ? Math.round(done / counted.length * 100) : null;
  const [workoutsDone, lastW, lastC] = await Promise.all([
    db.workoutSession.count({ where: { clientId, completedAt: { not: null } } }),
    db.workoutSession.findFirst({ where: { clientId, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, select: { completedAt: true } }),
    db.checkIn.findFirst({ where: { clientId }, orderBy: { submittedAt: 'desc' }, select: { submittedAt: true } }),
  ]);
  return db.client.update({ where: { id: clientId }, data: { adherence, workoutsDone, lastWorkoutAt: lastW?.completedAt ?? null, lastCheckinAt: lastC?.submittedAt ?? null } });
}

/** Weekly weight series from measurements (and check-ins, which also write a measurement). */
export async function weightSeries(db, clientId, limit = 12) {
  const rows = await db.measurement.findMany({ where: { clientId, weight: { not: null } }, orderBy: { takenAt: 'desc' }, take: limit, select: { takenAt: true, weight: true } });
  return rows.reverse().map(r => ({ date: r.takenAt, value: r.weight }));
}

/** Best working weight per session for the client's most-logged lift. */
export async function keyLift(db, clientId, exMap) {
  const sessions = await db.workoutSession.findMany({ where: { clientId, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, take: 40, select: { completedAt: true, sets: true } });
  const by = new Map();
  for (const s of sessions.reverse()) {
    for (const ex of (Array.isArray(s.sets) ? s.sets : [])) {
      const best = Math.max(0, ...(ex.sets || []).filter(x => x.done !== false).map(x => Number(x.weight) || 0));
      if (best <= 0) continue;
      if (!by.has(ex.exerciseId)) by.set(ex.exerciseId, []);
      by.get(ex.exerciseId).push({ date: s.completedAt, value: best, reps: Math.max(0, ...(ex.sets || []).map(x => Number(x.reps) || 0)) });
    }
  }
  let pick = null;
  for (const [id, vals] of by) {
    const score = vals.length * 10 + (vals.at(-1).value - vals[0].value);
    if (!pick || score > pick.score) pick = { id, vals, score };
  }
  if (!pick) return null;
  const vals = pick.vals.slice(-8);
  return { exerciseId: pick.id, name: exMap?.get(pick.id)?.name || 'Main lift', values: vals.map(v => v.value), dates: vals.map(v => v.date) };
}

/** Heaviest set ever logged per exercise (for the client's "Personal bests"). */
export async function personalBests(db, clientId, exMap, limit = 5) {
  const sessions = await db.workoutSession.findMany({ where: { clientId, completedAt: { not: null } }, select: { sets: true } });
  const best = new Map();
  for (const s of sessions) for (const ex of (Array.isArray(s.sets) ? s.sets : [])) for (const x of ex.sets || []) {
    const w = Number(x.weight) || 0, r = Number(x.reps) || 0;
    if (x.done === false || w <= 0) continue;
    const cur = best.get(ex.exerciseId);
    if (!cur || w > cur.weight || (w === cur.weight && r > cur.reps)) best.set(ex.exerciseId, { weight: w, reps: r });
  }
  return [...best.entries()].sort((a, b) => b[1].weight - a[1].weight).slice(0, limit).map(([id, v]) => ({ exerciseId: id, name: exMap?.get(id)?.name || 'Exercise', ...v }));
}
