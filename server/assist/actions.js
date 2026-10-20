// Everything else Assist can do inside OneJump when the coach asks: programs and workouts, the
// exercise library, clients, group messages, check-ins, payment reminders, leads, automations and
// settings, plus moving around the app (open a screen, switch to voice) and a guide to OneJump.
//
// Same rules as ./proposals.js: a propose_* tool only saves a proposal. Nothing changes until the
// coach confirms it (a tap, or a spoken yes right after Assist reads it back). Deleting is allowed
// this way, because the coach approves it; money (charges, refunds, prices) stays on its screen.
import { must, conflict, badRequest, paymentRequired } from '../lib/errors.js';
import { audit } from '../db/system.js';
import { clientByName } from './tools.js';
import { sendMessage, ensureThread } from '../core/messaging.js';
import { fillTemplate } from '../core/automationTemplates.js';
import { missingCheckinClients } from '../core/checkinStatus.js';
import { normalizeBlocks, estimateMinutes } from '../core/training.js';
import { createInvite, CLIENT_CAPS } from '../core/invites.js';
import { effectivePlan } from '../auth/middleware.js';
import { checkText } from '../ai/safety.js';
import { checkNutritionLanguage } from '../nutrition/language.js';
import { hiddenExerciseIds, createExercise, removeExercise, PATTERNS } from '../routes/exercises.js';

const TTL_MS = 10 * 60e3;
const firstOf = n => String(n || '').split(' ')[0];
const T = (lang, en, es) => (lang === 'es' ? es : en);
const speakableText = t => !checkText(t).flagged && !checkNutritionLanguage(t).flagged;
const clean = s => String(s ?? '').trim();
const norm = s => clean(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

async function save(db, auth, { type, summary, payload, source }) {
  return db.assistProposal.create({ data: { userId: auth.userId, type, summary: String(summary).slice(0, 2000), payload, source, expiresAt: new Date(Date.now() + TTL_MS) } });
}

/** Best match by name: exact, then "contains", then the most shared words. */
export function bestMatch(list, want, key = x => x.name) {
  const w = norm(want);
  if (!w) return { hits: [] };
  const exact = list.filter(x => norm(key(x)) === w);
  if (exact.length) return { hits: exact };
  const contains = list.filter(x => norm(key(x)).includes(w) || (w.length > 3 && w.includes(norm(key(x)))));
  if (contains.length) return { hits: contains };
  const words = new Set(w.split(' ').filter(t => t.length > 2));
  const scored = list.map(x => ({ x, n: norm(key(x)).split(' ').filter(t => words.has(t)).length })).filter(s => s.n > 0).sort((a, b) => b.n - a.n);
  if (scored.length && (scored.length === 1 || scored[0].n > scored[1].n)) return { hits: [scored[0].x] };
  return { hits: scored.slice(0, 4).map(s => s.x), loose: true };
}

async function findProgram(db, name, lang) {
  const programs = await db.program.findMany({ where: { archived: false }, select: { id: true, name: true, weeks: true, daysPerWeek: true, level: true, description: true } });
  const { hits } = bestMatch(programs, name);
  if (hits.length === 1) return { program: hits[0] };
  return { error: hits.length > 1 ? T(lang, `More than one program matches “${name}”: ${hits.map(p => p.name).join(', ')}. Which one?`, `Hay más de un programa que coincide con “${name}”: ${hits.map(p => p.name).join(', ')}. ¿Cuál?`)
    : T(lang, `I couldn’t find a program called “${name}”. Your programs: ${programs.map(p => p.name).join(', ') || 'none yet'}.`, `No encontré un programa llamado “${name}”. Tus programas: ${programs.map(p => p.name).join(', ') || 'ninguno todavía'}.`) };
}

async function libraryFor(db, { includeHidden = false } = {}) {
  const [all, hidden] = await Promise.all([db.exercise.findMany({ select: { id: true, name: true, muscle: true, equipment: true, level: true, pattern: true, businessId: true, mediaKey: true, mediaType: true, videoUrl: true } }), hiddenExerciseIds(db)]);
  return all.map(e => ({ ...e, hidden: hidden.has(e.id) })).filter(e => includeHidden || !e.hidden);
}

async function findExercise(db, name, lang, { includeHidden = false } = {}) {
  const list = await libraryFor(db, { includeHidden });
  const { hits } = bestMatch(list, name);
  if (hits.length === 1) return { exercise: hits[0] };
  return { error: hits.length > 1 ? T(lang, `More than one exercise matches “${name}”: ${hits.map(e => e.name).join(', ')}. Which one?`, `Hay más de un ejercicio que coincide con “${name}”: ${hits.map(e => e.name).join(', ')}. ¿Cuál?`)
    : T(lang, `I couldn’t find “${name}” in your exercise library.`, `No encontré “${name}” en tu biblioteca de ejercicios.`) };
}

async function findClient(db, name, lang) {
  const { client, matches } = await clientByName(db, name);
  if (client) return { client };
  return { error: matches.length > 1 ? T(lang, `I found ${matches.length} clients called ${firstOf(name)}. Which one?`, `Encontré ${matches.length} clientes llamados ${firstOf(name)}. ¿Cuál?`) : T(lang, `I couldn’t find ${name} in your clients.`, `No encontré a ${name} en tus clientes.`) };
}

async function findLead(db, name, lang) {
  const leads = await db.lead.findMany({ select: { id: true, name: true, stage: true, contact: true, goal: true, source: true, convertedClientId: true } });
  const { hits } = bestMatch(leads, name);
  if (hits.length === 1) return { lead: hits[0] };
  return { error: hits.length > 1 ? T(lang, `More than one lead matches “${name}”. Which one?`, `Hay más de un prospecto que coincide con “${name}”. ¿Cuál?`) : T(lang, `I couldn’t find a lead called ${name}.`, `No encontré un prospecto llamado ${name}.`) };
}

const AUTOMATION_NAMES = {
  missing_checkin: ['check-in reminder', 'checkin reminder', 'missing check-in', 'recordatorio de check-in'],
  failed_payment: ['failed payment', 'payment reminder', 'pago fallido'],
  missed_workouts: ['missed workouts', 'missed workout', 'entrenamientos perdidos'],
  milestone: ['milestones', 'milestone', 'congratulations', 'logros'],
  inactive_7d: ['gone quiet', 'inactive', 'sin actividad'],
};
const AUTOMATION_LABEL = { missing_checkin: ['Check-in reminder', 'Recordatorio de check-in'], failed_payment: ['Failed payment', 'Pago fallido'], missed_workouts: ['Missed workouts', 'Entrenamientos perdidos'], milestone: ['Milestones', 'Logros'], inactive_7d: ['Gone quiet', 'Sin actividad'] };

/**
 * Turns [{ exercise, sets, reps, rest }] into workout blocks using the coach's library.
 * Returns { blocks, lines } or { error } naming the exercises it couldn't find.
 */
async function blocksFrom(db, items, lang) {
  if (!Array.isArray(items) || !items.length) return { blocks: [], lines: [] };
  const list = await libraryFor(db);
  const blocks = [], lines = [], missing = [];
  for (const it of items.slice(0, 20)) {
    const want = clean(it.exercise || it.name);
    const { hits } = bestMatch(list, want);
    // Several close names ("Squat" → Back Squat, Goblet Squat): the shortest, most basic one.
    const e = hits.length === 1 ? hits[0] : hits.find(h => norm(h.name) === norm(want)) || [...hits].sort((x, y) => x.name.length - y.name.length)[0] || null;
    if (!e) { missing.push(want); continue; }
    const sets = Math.max(1, Math.min(10, Math.round(Number(it.sets) || 3)));
    const reps = clean(it.reps || '10').slice(0, 20);
    const rest = clean(it.rest_seconds ?? it.rest ?? '60').replace(/[^0-9]/g, '').slice(0, 4) || '60';
    blocks.push({ kind: 'single', items: [{ exerciseId: e.id, notes: clean(it.notes).slice(0, 200), sets: Array.from({ length: sets }, () => ({ reps, load: '', rpe: '', rest })) }] });
    lines.push(`${e.name}: ${sets} × ${reps}`);
  }
  if (missing.length) return { error: T(lang, `These aren’t in your exercise library: ${missing.join(', ')}. Check the names with exercise_library, or add them with propose_create_exercise first.`, `Estos no están en tu biblioteca de ejercicios: ${missing.join(', ')}. Revisa los nombres con exercise_library o agrégalos primero con propose_create_exercise.`) };
  return { blocks: normalizeBlocks(blocks), lines };
}

const GROUP_PATTERN = { legs: 'squat', lower: 'squat', glutes: 'hinge', push: 'push', chest: 'push', shoulders: 'push', pull: 'pull', back: 'pull', core: 'core', abs: 'core', cardio: 'cardio', full: 'iso' };
const STATUS = { active: 'ACTIVE', paused: 'PAUSED', pause: 'PAUSED', inactive: 'INACTIVE', archived: 'INACTIVE', new: 'NEW' };

// ---------------------------------------------------------------- proposals

export const ACTION_PROPOSE = {
  async create_program(db, auth, a, { source, lang }) {
    const name = clean(a.name).slice(0, 80);
    if (!name) return { error: T(lang, 'What should the program be called?', '¿Cómo se llama el programa?') };
    const weeks = Math.max(1, Math.min(52, Math.round(Number(a.weeks) || 4)));
    const days = Math.max(1, Math.min(7, Math.round(Number(a.days_per_week) || (Array.isArray(a.workouts) ? a.workouts.length : 3) || 3)));
    const workouts = [];
    const lines = [T(lang, `${weeks} weeks · ${days} days a week${a.level ? ` · ${a.level}` : ''}`, `${weeks} semanas · ${days} días por semana${a.level ? ` · ${a.level}` : ''}`)];
    for (const [i, w] of (Array.isArray(a.workouts) ? a.workouts : []).slice(0, 7).entries()) {
      const r = await blocksFrom(db, w.exercises, lang);
      if (r.error) return { error: r.error };
      const day = Math.max(1, Math.min(7, Math.round(Number(w.day) || i + 1)));
      workouts.push({ name: clean(w.name).slice(0, 80) || T(lang, `Day ${day}`, `Día ${day}`), day, blocks: r.blocks });
      lines.push(`${workouts.at(-1).name}: ${r.lines.length ? r.lines.join(', ') : T(lang, 'empty for now', 'vacío por ahora')}`);
    }
    const payload = { name, weeks, daysPerWeek: days, level: clean(a.level).slice(0, 40) || null, description: clean(a.description).slice(0, 2000) || null, workouts, lines, button: T(lang, 'Create program', 'Crear programa'), voiceOk: true,
      say: T(lang, `I’ll create ${name}: ${weeks} weeks, ${days} days a week${workouts.length ? `, with ${workouts.length} workout${workouts.length === 1 ? '' : 's'} built in` : ''}. Should I create it?`, `Voy a crear ${name}: ${weeks} semanas, ${days} días por semana${workouts.length ? `, con ${workouts.length} entrenamiento${workouts.length === 1 ? '' : 's'}` : ''}. ¿Lo creo?`) };
    return { proposal: await save(db, auth, { type: 'create_program', summary: T(lang, `New program: ${name}`, `Programa nuevo: ${name}`), payload, source }) };
  },

  async update_program(db, auth, a, { source, lang }) {
    const f = await findProgram(db, a.program_name, lang);
    if (f.error) return { error: f.error };
    const changes = {};
    if (clean(a.new_name)) changes.name = clean(a.new_name).slice(0, 80);
    if (a.weeks != null) changes.weeks = Math.max(1, Math.min(52, Math.round(Number(a.weeks))));
    if (a.days_per_week != null) changes.daysPerWeek = Math.max(1, Math.min(7, Math.round(Number(a.days_per_week))));
    if (a.level != null) changes.level = clean(a.level).slice(0, 40) || null;
    if (a.description != null) changes.description = clean(a.description).slice(0, 2000) || null;
    if (!Object.keys(changes).length) return { error: T(lang, 'What should I change about it?', '¿Qué le cambio?') };
    const lines = Object.entries(changes).map(([k, v]) => `${{ name: T(lang, 'Name', 'Nombre'), weeks: T(lang, 'Weeks', 'Semanas'), daysPerWeek: T(lang, 'Days a week', 'Días por semana'), level: T(lang, 'Level', 'Nivel'), description: T(lang, 'Description', 'Descripción') }[k]}: ${v ?? '—'}`);
    return { proposal: await save(db, auth, { type: 'update_program', summary: T(lang, `Update ${f.program.name}`, `Actualizar ${f.program.name}`), payload: { programId: f.program.id, programName: f.program.name, changes, lines, button: T(lang, 'Save changes', 'Guardar cambios'), voiceOk: true, say: T(lang, `I’ll update ${f.program.name}: ${lines.join(', ')}. Should I save it?`, `Voy a actualizar ${f.program.name}: ${lines.join(', ')}. ¿Lo guardo?`) }, source }) };
  },

  async delete_program(db, auth, a, { source, lang }) {
    const f = await findProgram(db, a.program_name, lang);
    if (f.error) return { error: f.error };
    const n = await db.client.count({ where: { programId: f.program.id, status: { in: ['NEW', 'ACTIVE'] } } });
    if (n) return { error: T(lang, `${n} active client${n === 1 ? ' is' : 's are'} on ${f.program.name}. Move ${n === 1 ? 'them' : 'them'} to another program first, then I can delete it.`, `${n} cliente${n === 1 ? '' : 's'} activo${n === 1 ? '' : 's'} está${n === 1 ? '' : 'n'} en ${f.program.name}. Muévelo${n === 1 ? '' : 's'} a otro programa primero y luego lo borro.`) };
    return { proposal: await save(db, auth, { type: 'delete_program', summary: T(lang, `Delete ${f.program.name}`, `Borrar ${f.program.name}`), payload: { programId: f.program.id, programName: f.program.name, destructive: true, lines: [T(lang, 'It disappears from your programs. Past workouts clients logged stay in their history.', 'Desaparece de tus programas. Los entrenamientos que tus clientes ya registraron se quedan en su historial.')], button: T(lang, 'Delete program', 'Borrar programa'), voiceOk: true, say: T(lang, `I’ll delete ${f.program.name}. Should I delete it?`, `Voy a borrar ${f.program.name}. ¿Lo borro?`) }, source }) };
  },

  async duplicate_program(db, auth, a, { source, lang }) {
    const f = await findProgram(db, a.program_name, lang);
    if (f.error) return { error: f.error };
    const name = clean(a.new_name).slice(0, 80) || `${f.program.name} (${T(lang, 'copy', 'copia')})`;
    return { proposal: await save(db, auth, { type: 'duplicate_program', summary: T(lang, `Copy ${f.program.name}`, `Copiar ${f.program.name}`), payload: { programId: f.program.id, programName: f.program.name, name, lines: [T(lang, `New name: ${name}`, `Nombre nuevo: ${name}`)], button: T(lang, 'Make a copy', 'Hacer una copia'), voiceOk: true, say: T(lang, `I’ll make a copy of ${f.program.name} called ${name}. Should I do it?`, `Voy a hacer una copia de ${f.program.name} llamada ${name}. ¿La hago?`) }, source }) };
  },

  /** Adds a workout to a program, or replaces the exercises of one it already has. */
  async save_workout(db, auth, a, { source, lang }) {
    const f = await findProgram(db, a.program_name, lang);
    if (f.error) return { error: f.error };
    const r = await blocksFrom(db, a.exercises, lang);
    if (r.error) return { error: r.error };
    const existing = await db.workout.findMany({ where: { programId: f.program.id, clientId: null }, select: { id: true, name: true, day: true, week: true } });
    let target = null;
    if (clean(a.replace_workout)) {
      const m = bestMatch(existing, a.replace_workout).hits;
      if (m.length !== 1) return { error: T(lang, `I couldn’t tell which workout in ${f.program.name} to change. It has: ${existing.map(w => w.name).join(', ') || 'none'}.`, `No supe qué entrenamiento de ${f.program.name} cambiar. Tiene: ${existing.map(w => w.name).join(', ') || 'ninguno'}.`) };
      target = m[0];
    } else if (a.day && !clean(a.name)) {
      target = existing.find(w => w.day === Number(a.day) && w.week == null) || null;
    }
    const day = target?.day || Math.max(1, Math.min(7, Math.round(Number(a.day) || (Math.max(0, ...existing.map(w => w.day || 0)) + 1))));
    const name = clean(a.name).slice(0, 80) || target?.name || T(lang, `Day ${day}`, `Día ${day}`);
    const lines = r.lines.length ? r.lines : [T(lang, 'No exercises yet', 'Sin ejercicios todavía')];
    return { proposal: await save(db, auth, { type: 'save_workout', summary: target ? T(lang, `Update ${target.name} in ${f.program.name}`, `Actualizar ${target.name} en ${f.program.name}`) : T(lang, `Add ${name} to ${f.program.name}`, `Agregar ${name} a ${f.program.name}`), payload: { programId: f.program.id, programName: f.program.name, workoutId: target?.id || null, name, day, blocks: r.blocks, lines, button: T(lang, 'Save workout', 'Guardar entrenamiento'), voiceOk: true, say: T(lang, `${target ? `I’ll update ${target.name}` : `I’ll add ${name} to ${f.program.name}`} with ${r.lines.length} exercise${r.lines.length === 1 ? '' : 's'}. Should I save it?`, `${target ? `Voy a actualizar ${target.name}` : `Voy a agregar ${name} a ${f.program.name}`} con ${r.lines.length} ejercicio${r.lines.length === 1 ? '' : 's'}. ¿Lo guardo?`) }, source }) };
  },

  async delete_workout(db, auth, a, { source, lang }) {
    const f = await findProgram(db, a.program_name, lang);
    if (f.error) return { error: f.error };
    const existing = await db.workout.findMany({ where: { programId: f.program.id, clientId: null }, select: { id: true, name: true } });
    const m = bestMatch(existing, a.workout_name).hits;
    if (m.length !== 1) return { error: T(lang, `Which workout? ${f.program.name} has: ${existing.map(w => w.name).join(', ') || 'none'}.`, `¿Cuál entrenamiento? ${f.program.name} tiene: ${existing.map(w => w.name).join(', ') || 'ninguno'}.`) };
    return { proposal: await save(db, auth, { type: 'delete_workout', summary: T(lang, `Delete ${m[0].name} from ${f.program.name}`, `Borrar ${m[0].name} de ${f.program.name}`), payload: { programId: f.program.id, programName: f.program.name, workoutId: m[0].id, name: m[0].name, destructive: true, lines: [], button: T(lang, 'Delete workout', 'Borrar entrenamiento'), voiceOk: true, say: T(lang, `I’ll delete ${m[0].name} from ${f.program.name}. Should I delete it?`, `Voy a borrar ${m[0].name} de ${f.program.name}. ¿Lo borro?`) }, source }) };
  },

  async create_exercise(db, auth, a, { source, lang }) {
    const name = clean(a.name).slice(0, 80);
    if (!name) return { error: T(lang, 'What’s the exercise called?', '¿Cómo se llama el ejercicio?') };
    const dupe = (await libraryFor(db)).find(e => norm(e.name) === norm(name));
    if (dupe) return { error: T(lang, `${dupe.name} is already in your library.`, `${dupe.name} ya está en tu biblioteca.`) };
    const pattern = PATTERNS.includes(a.pattern) ? a.pattern : GROUP_PATTERN[norm(a.muscle_group).split(' ')[0]] || 'iso';
    const level = ['Beginner', 'Intermediate', 'Advanced'].includes(a.level) ? a.level : 'Beginner';
    const d = { name, pattern, level, muscle: clean(a.muscle_group).slice(0, 60) || 'Full body', equipment: clean(a.equipment).slice(0, 40) || 'Bodyweight', instructions: clean(a.instructions).slice(0, 2000), videoUrl: /^https:\/\//i.test(clean(a.video_url)) ? clean(a.video_url).slice(0, 190) : '' };
    const lines = [`${d.muscle} · ${d.equipment} · ${level}`, ...(d.instructions ? d.instructions.split('\n').filter(Boolean).slice(0, 4) : []), ...(d.videoUrl ? [d.videoUrl] : [])];
    return { proposal: await save(db, auth, { type: 'create_exercise', summary: T(lang, `New exercise: ${name}`, `Ejercicio nuevo: ${name}`), payload: { ...d, lines, button: T(lang, 'Add exercise', 'Agregar ejercicio'), voiceOk: true, say: T(lang, `I’ll add ${name} to your exercise library. Should I add it? You can add a photo or video on its page after.`, `Voy a agregar ${name} a tu biblioteca de ejercicios. ¿Lo agrego? Después puedes ponerle foto o video en su página.`) }, source }) };
  },

  async delete_exercise(db, auth, a, { source, lang }) {
    const f = await findExercise(db, a.exercise_name, lang);
    if (f.error) return { error: f.error };
    const e = f.exercise, mine = !!e.businessId;
    return { proposal: await save(db, auth, { type: 'delete_exercise', summary: T(lang, `Delete ${e.name}`, `Borrar ${e.name}`), payload: { exerciseId: e.id, name: e.name, destructive: true, lines: [mine ? T(lang, 'Your own exercise: it’s deleted (if a workout still uses it, it’s just hidden).', 'Tu propio ejercicio: se borra (si un entrenamiento todavía lo usa, solo se oculta).') : T(lang, 'From the OneJump library: it’s removed from your library. Workouts that use it keep working.', 'De la biblioteca de OneJump: se quita de tu biblioteca. Los entrenamientos que lo usan siguen funcionando.')], button: T(lang, 'Delete exercise', 'Borrar ejercicio'), voiceOk: true, say: T(lang, `I’ll delete ${e.name} from your library. Should I delete it?`, `Voy a borrar ${e.name} de tu biblioteca. ¿Lo borro?`) }, source }) };
  },

  async restore_exercise(db, auth, a, { source, lang }) {
    const hidden = (await libraryFor(db, { includeHidden: true })).filter(e => e.hidden);
    const m = bestMatch(hidden, a.exercise_name).hits;
    if (m.length !== 1) return { error: T(lang, `I couldn’t find “${a.exercise_name}” among the exercises you removed.`, `No encontré “${a.exercise_name}” entre los ejercicios que quitaste.`) };
    return { proposal: await save(db, auth, { type: 'restore_exercise', summary: T(lang, `Bring back ${m[0].name}`, `Recuperar ${m[0].name}`), payload: { exerciseId: m[0].id, name: m[0].name, lines: [], button: T(lang, 'Bring it back', 'Recuperarlo'), voiceOk: true, say: T(lang, `I’ll put ${m[0].name} back in your library. Should I do it?`, `Voy a regresar ${m[0].name} a tu biblioteca. ¿Lo hago?`) }, source }) };
  },

  async add_client(db, auth, a, { source, lang }) {
    const name = clean(a.name).slice(0, 80);
    if (!name) return { error: T(lang, 'What’s their name?', '¿Cómo se llama?') };
    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean(a.email)) ? clean(a.email).toLowerCase() : null;
    const mode = ['Online', 'Hybrid', 'In person'].find(m => norm(m) === norm(a.mode)) || 'Online';
    let program = null;
    if (clean(a.program_name)) { const f = await findProgram(db, a.program_name, lang); if (f.error) return { error: f.error }; program = f.program; }
    const invite = email && a.send_invite !== false;
    const lines = [email || T(lang, 'No email yet: you’ll get an invite link to send yourself', 'Sin correo: te doy un enlace de invitación para que lo envíes tú'), `${T(lang, 'Coaching', 'Modalidad')}: ${mode}`];
    if (clean(a.goal)) lines.push(`${T(lang, 'Goal', 'Meta')}: ${clean(a.goal)}`);
    if (program) lines.push(`${T(lang, 'Program', 'Programa')}: ${program.name}`);
    if (invite) lines.push(T(lang, 'An invite email goes out when you confirm.', 'Se envía un correo de invitación al confirmar.'));
    return { proposal: await save(db, auth, { type: 'add_client', summary: T(lang, `New client: ${name}`, `Cliente nuevo: ${name}`), payload: { name, email, mode, goal: clean(a.goal).slice(0, 160) || null, programId: program?.id || null, programName: program?.name || null, sendInvite: !!invite, lines, button: T(lang, 'Add client', 'Agregar cliente'), voiceOk: true, say: T(lang, `I’ll add ${name} as a client${program ? ` on ${program.name}` : ''}${invite ? ' and email their invite' : ''}. Should I add them?`, `Voy a agregar a ${name} como cliente${program ? ` en ${program.name}` : ''}${invite ? ' y enviarle la invitación' : ''}. ¿Lo agrego?`) }, source }) };
  },

  async update_client(db, auth, a, { source, lang }) {
    const f = await findClient(db, a.client_name, lang);
    if (f.error) return { error: f.error };
    const changes = {};
    if (a.status && STATUS[norm(a.status)]) changes.status = STATUS[norm(a.status)];
    if (clean(a.goal)) changes.goal = clean(a.goal).slice(0, 160);
    if (a.mode) { const m = ['Online', 'Hybrid', 'In person'].find(x => norm(x) === norm(a.mode)); if (m) changes.mode = m; }
    if (clean(a.phone)) changes.phone = clean(a.phone).slice(0, 40);
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean(a.email))) changes.email = clean(a.email).toLowerCase();
    if (clean(a.why)) changes.why = clean(a.why).slice(0, 1000);
    if (a.target_weight != null && Number(a.target_weight) >= 50 && Number(a.target_weight) <= 800) changes.targetWeight = Number(a.target_weight);
    if (!Object.keys(changes).length) return { error: T(lang, 'What should I change for them?', '¿Qué le cambio?') };
    const label = { status: T(lang, 'Status', 'Estado'), goal: T(lang, 'Goal', 'Meta'), mode: T(lang, 'Coaching', 'Modalidad'), phone: T(lang, 'Phone', 'Teléfono'), email: 'Email', why: T(lang, 'Their why', 'Su porqué'), targetWeight: T(lang, 'Target weight', 'Peso meta') };
    const show = v => ({ ACTIVE: T(lang, 'active', 'activo'), PAUSED: T(lang, 'paused', 'en pausa'), INACTIVE: T(lang, 'inactive', 'inactivo'), NEW: T(lang, 'new', 'nuevo') }[v] || v);
    const lines = Object.entries(changes).map(([k, v]) => `${label[k]}: ${show(v)}`);
    return { proposal: await save(db, auth, { type: 'update_client', summary: T(lang, `Update ${f.client.name}`, `Actualizar a ${f.client.name}`), payload: { clientId: f.client.id, clientName: f.client.name, changes, lines, button: T(lang, 'Save changes', 'Guardar cambios'), voiceOk: true, say: T(lang, `I’ll update ${firstOf(f.client.name)}: ${lines.join(', ')}. Should I save it?`, `Voy a actualizar a ${firstOf(f.client.name)}: ${lines.join(', ')}. ¿Lo guardo?`) }, source }) };
  },

  /** One message to a group: everyone active, online clients, a program, people who haven't checked in, or named clients. */
  async message_clients(db, auth, a, { source, lang }) {
    const text = clean(a.text).slice(0, 3000);
    if (!text) return { error: T(lang, 'What should the message say?', '¿Qué debe decir el mensaje?') };
    let list = [];
    const seg = a.group || (Array.isArray(a.client_names) && a.client_names.length ? 'named' : 'active');
    if (seg === 'missing_checkin') list = await missingCheckinClients(db);
    else if (seg === 'named') {
      for (const n of (a.client_names || []).slice(0, 50)) { const f = await findClient(db, n, lang); if (f.error) return { error: f.error }; list.push(f.client); }
    } else {
      const where = { status: { in: ['NEW', 'ACTIVE'] } };
      if (seg === 'online') where.mode = 'Online';
      if (seg === 'in_person') where.mode = 'In person';
      if (seg === 'program') { const f = await findProgram(db, a.program_name, lang); if (f.error) return { error: f.error }; where.programId = f.program.id; }
      list = await db.client.findMany({ where, select: { id: true, name: true } });
    }
    list = [...new Map(list.map(c => [c.id, c])).values()];
    if (!list.length) return { error: T(lang, 'Nobody is in that group right now.', 'No hay nadie en ese grupo ahora.') };
    const names = list.map(c => c.name);
    return { proposal: await save(db, auth, { type: 'message_clients', summary: T(lang, `Message to ${list.length} client${list.length === 1 ? '' : 's'}`, `Mensaje a ${list.length} cliente${list.length === 1 ? '' : 's'}`), payload: { clientIds: list.map(c => c.id), recipients: names, text, lines: [names.join(', ')], button: T(lang, `Send to ${list.length}`, `Enviar a ${list.length}`), voiceOk: speakableText(text), say: speakableText(text) ? T(lang, `Here’s the message for ${list.length} client${list.length === 1 ? '' : 's'}: ${text.slice(0, 300)} Should I send it?`, `Este es el mensaje para ${list.length} cliente${list.length === 1 ? '' : 's'}: ${text.slice(0, 300)} ¿Lo envío?`) : null }, source }) };
  },

  async review_checkin(db, auth, a, { source, lang }) {
    const f = await findClient(db, a.client_name, lang);
    if (f.error) return { error: f.error };
    const k = await db.checkIn.findFirst({ where: { clientId: f.client.id, status: 'submitted' }, orderBy: { submittedAt: 'desc' }, select: { id: true } });
    if (!k) return { error: T(lang, `${firstOf(f.client.name)} has no check-in waiting.`, `${firstOf(f.client.name)} no tiene check-in pendiente.`) };
    return { proposal: await save(db, auth, { type: 'review_checkin', summary: T(lang, `Mark ${f.client.name}’s check-in reviewed`, `Marcar revisado el check-in de ${f.client.name}`), payload: { clientId: f.client.id, clientName: f.client.name, checkinId: k.id, lines: [T(lang, 'No reply is sent.', 'No se envía respuesta.')], button: T(lang, 'Mark reviewed', 'Marcar revisado'), voiceOk: true, say: T(lang, `I’ll mark ${firstOf(f.client.name)}’s check-in as reviewed, without a reply. Should I do it?`, `Voy a marcar el check-in de ${firstOf(f.client.name)} como revisado, sin respuesta. ¿Lo hago?`) }, source }) };
  },

  async payment_reminder(db, auth, a, { source, lang }) {
    const f = await findClient(db, a.client_name, lang);
    if (f.error) return { error: f.error };
    const p = await db.payment.findFirst({ where: { clientId: f.client.id, status: 'failed' }, orderBy: { createdAt: 'desc' } });
    if (!p) return { error: T(lang, `${firstOf(f.client.name)} has no failed payment right now.`, `${firstOf(f.client.name)} no tiene pagos fallidos ahora.`) };
    const auto = await db.automation.findFirst({ where: { key: 'failed_payment' } });
    const c = await db.client.findFirst({ where: { id: f.client.id } });
    const text = fillTemplate(auto?.template || 'Hi {first}, your last payment didn’t go through. You can update your card in the app under Me → Billing. Thanks!', c);
    return { proposal: await save(db, auth, { type: 'payment_reminder', summary: T(lang, `Payment reminder to ${f.client.name}`, `Recordatorio de pago a ${f.client.name}`), payload: { clientId: f.client.id, clientName: f.client.name, paymentId: p.id, text, lines: [text], button: T(lang, 'Send reminder', 'Enviar recordatorio'), voiceOk: true, say: T(lang, `I’ll send ${firstOf(f.client.name)} your card-update reminder. Should I send it?`, `Le voy a enviar a ${firstOf(f.client.name)} tu recordatorio para actualizar la tarjeta. ¿Lo envío?`) }, source }) };
  },

  async update_lead(db, auth, a, { source, lang }) {
    const f = await findLead(db, a.lead_name, lang);
    if (f.error) return { error: f.error };
    const STAGES = ['new', 'contacted', 'consult', 'trial', 'active', 'retained', 'lost'];
    const changes = {};
    if (a.stage && STAGES.includes(norm(a.stage))) changes.stage = norm(a.stage);
    if (clean(a.goal)) changes.goal = clean(a.goal).slice(0, 160);
    if (clean(a.contact)) changes.contact = clean(a.contact).slice(0, 120);
    if (!Object.keys(changes).length) return { error: T(lang, 'What should I change for that lead?', '¿Qué le cambio a ese prospecto?') };
    const lines = Object.entries(changes).map(([k, v]) => `${{ stage: T(lang, 'Stage', 'Etapa'), goal: T(lang, 'Goal', 'Meta'), contact: T(lang, 'Contact', 'Contacto') }[k]}: ${v}`);
    return { proposal: await save(db, auth, { type: 'update_lead', summary: T(lang, `Update lead ${f.lead.name}`, `Actualizar prospecto ${f.lead.name}`), payload: { leadId: f.lead.id, name: f.lead.name, changes, lines, button: T(lang, 'Save', 'Guardar'), voiceOk: true, say: T(lang, `I’ll update ${f.lead.name}: ${lines.join(', ')}. Should I save it?`, `Voy a actualizar a ${f.lead.name}: ${lines.join(', ')}. ¿Lo guardo?`) }, source }) };
  },

  async convert_lead(db, auth, a, { source, lang }) {
    const f = await findLead(db, a.lead_name, lang);
    if (f.error) return { error: f.error };
    if (f.lead.convertedClientId) return { error: T(lang, `${f.lead.name} is already a client.`, `${f.lead.name} ya es cliente.`) };
    const email = (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean(a.email)) ? clean(a.email) : (/@/.test(f.lead.contact || '') ? f.lead.contact : '')).toLowerCase() || null;
    return { proposal: await save(db, auth, { type: 'convert_lead', summary: T(lang, `Make ${f.lead.name} a client`, `Convertir a ${f.lead.name} en cliente`), payload: { leadId: f.lead.id, name: f.lead.name, email, lines: [email ? T(lang, `Invite goes to ${email}`, `La invitación va a ${email}`) : T(lang, 'No email: you’ll get an invite link to send yourself', 'Sin correo: te doy un enlace de invitación para enviar tú')], button: T(lang, 'Make client', 'Convertir en cliente'), voiceOk: true, say: T(lang, `I’ll turn ${f.lead.name} into a client${email ? ' and email their invite' : ''}. Should I do it?`, `Voy a convertir a ${f.lead.name} en cliente${email ? ' y enviarle la invitación' : ''}. ¿Lo hago?`) }, source }) };
  },

  async set_automation(db, auth, a, { source, lang }) {
    const autos = await db.automation.findMany({ select: { id: true, key: true, enabled: true, template: true } });
    const want = norm(a.automation);
    const hit = autos.find(x => x.key === a.automation || norm(x.key) === want || (AUTOMATION_NAMES[x.key] || []).some(n => want.includes(norm(n)) || norm(n).includes(want)));
    if (!hit) return { error: T(lang, `Which automation? You have: ${autos.map(x => AUTOMATION_LABEL[x.key]?.[0] || x.key).join(', ')}.`, `¿Cuál automatización? Tienes: ${autos.map(x => AUTOMATION_LABEL[x.key]?.[1] || x.key).join(', ')}.`) };
    const changes = {};
    if (typeof a.enabled === 'boolean') changes.enabled = a.enabled;
    if (clean(a.message)) changes.template = clean(a.message).slice(0, 1000);
    if (!Object.keys(changes).length) return { error: T(lang, 'Should I turn it on, off, or change its message?', '¿La enciendo, la apago o le cambio el mensaje?') };
    const label = AUTOMATION_LABEL[hit.key]?.[lang === 'es' ? 1 : 0] || hit.key;
    const lines = [...(changes.enabled != null ? [changes.enabled ? T(lang, 'Turn on', 'Encender') : T(lang, 'Turn off', 'Apagar')] : []), ...(changes.template ? [changes.template] : [])];
    return { proposal: await save(db, auth, { type: 'set_automation', summary: T(lang, `Automation: ${label}`, `Automatización: ${label}`), payload: { automationId: hit.id, key: hit.key, name: label, changes, lines, button: T(lang, 'Save', 'Guardar'), voiceOk: true, say: T(lang, `I’ll ${changes.enabled === false ? 'turn off' : changes.enabled ? 'turn on' : 'update'} ${label}. Should I do it?`, `Voy a ${changes.enabled === false ? 'apagar' : changes.enabled ? 'encender' : 'actualizar'} ${label}. ¿Lo hago?`) }, source }) };
  },

  async update_settings(db, auth, a, { source, lang }) {
    if (auth.role !== 'OWNER') return { error: T(lang, 'Only the workspace owner can change business settings.', 'Solo el dueño del espacio puede cambiar la configuración del negocio.') };
    const changes = {};
    if (clean(a.business_name)) changes.name = clean(a.business_name).slice(0, 80);
    const style = ['Supportive', 'Direct', 'Data-driven', 'Playful'].find(s => norm(s) === norm(a.writing_style));
    if (style) changes.writingStyle = style;
    if (clean(a.timezone)) { try { new Intl.DateTimeFormat('en-US', { timeZone: clean(a.timezone) }); changes.timezone = clean(a.timezone); } catch { return { error: T(lang, `“${a.timezone}” isn’t a time zone I know. Try one like America/New_York.`, `“${a.timezone}” no es una zona horaria que conozca. Prueba algo como America/New_York.`) }; } }
    if (!Object.keys(changes).length) return { error: T(lang, 'What should I change?', '¿Qué cambio?') };
    const lines = Object.entries(changes).map(([k, v]) => `${{ name: T(lang, 'Business name', 'Nombre del negocio'), writingStyle: T(lang, 'Writing style', 'Estilo de escritura'), timezone: T(lang, 'Time zone', 'Zona horaria') }[k]}: ${v}`);
    return { proposal: await save(db, auth, { type: 'update_settings', summary: T(lang, 'Business settings', 'Configuración del negocio'), payload: { changes, lines, button: T(lang, 'Save settings', 'Guardar configuración'), voiceOk: true, say: T(lang, `I’ll change ${lines.join(', ')}. Should I save it?`, `Voy a cambiar ${lines.join(', ')}. ¿Lo guardo?`) }, source }) };
  },
};

// ---------------------------------------------------------------- running them after the coach confirms

export const ACTION_EXECUTE = {
  async create_program(db, _auth, p) {
    const prog = await db.program.create({ data: { name: p.name, weeks: p.weeks, daysPerWeek: p.daysPerWeek, level: p.level, description: p.description, source: 'assist' } });
    const given = (p.workouts || []).map(w => ({ programId: prog.id, name: w.name, day: w.day, blocks: w.blocks, estMinutes: w.blocks.length ? estimateMinutes(w.blocks) : 45, source: 'assist' }));
    const taken = new Set(given.map(w => w.day));
    const empty = Array.from({ length: p.daysPerWeek }, (_, i) => i + 1).filter(d => !taken.has(d)).map(d => ({ programId: prog.id, name: `Day ${d}`, day: d, blocks: [], estMinutes: 45 }));
    const rows = [...given, ...empty].slice(0, 7);
    if (rows.length) await db.workout.createMany({ data: rows });
    return { programId: prog.id, navigate: { screen: 'program', id: prog.id }, message: `${p.name} is ready in your programs.` };
  },
  async update_program(db, _auth, p) {
    must(await db.program.findFirst({ where: { id: p.programId } }), 'That program');
    await db.program.update({ where: { id: p.programId }, data: p.changes });
    return { programId: p.programId, message: `${p.changes.name || p.programName} is updated.` };
  },
  async delete_program(db, _auth, p) {
    must(await db.program.findFirst({ where: { id: p.programId } }), 'That program');
    const n = await db.client.count({ where: { programId: p.programId, status: { in: ['NEW', 'ACTIVE'] } } });
    if (n) throw conflict(`${n} active client${n === 1 ? ' is' : 's are'} on this program now. Move them first.`);
    await db.program.update({ where: { id: p.programId }, data: { archived: true } });
    return { message: `${p.programName} is deleted.` };
  },
  async duplicate_program(db, _auth, p) {
    const src = must(await db.program.findFirst({ where: { id: p.programId }, include: { workouts: { where: { clientId: null } } } }), 'That program');
    const copy = await db.program.create({ data: { name: p.name, weeks: src.weeks, daysPerWeek: src.daysPerWeek, level: src.level, description: src.description, source: src.source } });
    if (src.workouts.length) await db.workout.createMany({ data: src.workouts.map(w => ({ programId: copy.id, name: w.name, week: w.week, day: w.day, estMinutes: w.estMinutes, blocks: w.blocks, source: w.source })) });
    return { programId: copy.id, navigate: { screen: 'program', id: copy.id }, message: `${p.name} is in your programs.` };
  },
  async save_workout(db, _auth, p) {
    must(await db.program.findFirst({ where: { id: p.programId } }), 'That program');
    const blocks = normalizeBlocks(p.blocks);
    const ids = [...new Set(blocks.flatMap(b => b.items.map(i => i.exerciseId)))];
    if (ids.length && (await db.exercise.count({ where: { id: { in: ids } } })) !== ids.length) throw badRequest('One of the exercises isn’t in your library anymore.');
    const est = blocks.length ? estimateMinutes(blocks) : 45;
    let w;
    if (p.workoutId) {
      must(await db.workout.findFirst({ where: { id: p.workoutId } }), 'That workout');
      w = await db.workout.update({ where: { id: p.workoutId }, data: { name: p.name, blocks, estMinutes: est, source: 'assist' } });
    } else {
      w = await db.workout.create({ data: { programId: p.programId, name: p.name, day: p.day, blocks, estMinutes: est, source: 'assist' } });
    }
    await db.program.update({ where: { id: p.programId }, data: { updatedAt: new Date() } });
    return { workoutId: w.id, navigate: { screen: 'program', id: p.programId }, message: `${p.name} is saved in ${p.programName}.` };
  },
  async delete_workout(db, _auth, p) {
    const w = must(await db.workout.findFirst({ where: { id: p.workoutId } }), 'That workout');
    const future = await db.workoutAssignment.count({ where: { workoutId: w.id, status: 'scheduled' } });
    if (future) throw conflict('Clients have this workout scheduled. Remove it from their schedule first.');
    await db.workout.delete({ where: { id: w.id } });
    return { message: `${p.name} is deleted from ${p.programName}.` };
  },
  async create_exercise(db, _auth, p) {
    const e = await createExercise(db, p);
    return { exerciseId: e.id, navigate: { screen: 'exercise', id: e.id }, message: `${p.name} is in your library.` };
  },
  async delete_exercise(db, auth, p) {
    const r = await removeExercise(db, auth, p.exerciseId);
    return { message: r.deleted ? `${p.name} is deleted.` : `${p.name} is out of your library.` };
  },
  async restore_exercise(db, _auth, p) {
    const hidden = await hiddenExerciseIds(db);
    if (hidden.delete(p.exerciseId)) {
      const b = await db.business.findFirst({ select: { id: true, settings: true } });
      await db.business.update({ where: { id: b.id }, data: { settings: { ...(b.settings || {}), hiddenExercises: [...hidden] } } });
    }
    return { message: `${p.name} is back in your library.` };
  },
  async add_client(db, auth, p) {
    const b = await db.business.findFirst({ select: { plan: true, trialEndsAt: true, timezone: true } });
    const plan = effectivePlan(b);
    const count = await db.client.count({ where: { status: { in: ['NEW', 'ACTIVE', 'PAUSED'] } } });
    if (count + 1 > CLIENT_CAPS[plan]) throw paymentRequired(`Your plan covers ${CLIENT_CAPS[plan]} active clients. Upgrade to add more.`);
    if (p.email && await db.client.findFirst({ where: { email: p.email } })) throw conflict('A client with that email is already in your workspace.');
    const client = await db.client.create({ data: { name: p.name, email: p.email, goal: p.goal, mode: p.mode, status: 'NEW', coachUserId: auth.userId, payStatus: 'none' } });
    await ensureThread(db, client.id);
    if (p.programId) {
      const { assignProgram } = await import('../core/training.js');
      await assignProgram(db, { clientId: client.id, programId: p.programId, tz: b.timezone || 'UTC' });
    }
    const inv = await createInvite(db, client, { send: !!p.sendInvite });
    audit({ businessId: auth.businessId, actorUserId: auth.userId, action: 'client_invited', target: client.id });
    return { clientId: client.id, inviteLink: inv.link, emailed: inv.emailed, navigate: { screen: 'client', id: client.id }, message: inv.emailed ? `${firstOf(p.name)} is added and their invite is on its way.` : `${firstOf(p.name)} is added. Send them the invite link from their profile.` };
  },
  async update_client(db, auth, p) {
    const c = must(await db.client.findFirst({ where: { id: p.clientId } }), 'That client');
    const d = { ...p.changes };
    if (d.email && d.email !== c.email && await db.client.findFirst({ where: { email: d.email } })) throw conflict('Another client already uses that email.');
    if (d.status === 'PAUSED' || d.status === 'INACTIVE') Object.assign(d, { riskScore: null, riskLevel: null, riskReasons: null });
    await db.client.update({ where: { id: c.id }, data: d });
    if (d.status && d.status !== c.status) audit({ businessId: auth.businessId, actorUserId: auth.userId, action: 'client_status', target: `${c.id}:${d.status}` });
    return { message: `${firstOf(c.name)} is updated.` };
  },
  async message_clients(db, auth, p, { text }) {
    const body = (text ?? p.text ?? '').trim();
    if (!body) throw badRequest('The message is empty.');
    const clients = await db.client.findMany({ where: { id: { in: p.clientIds } } });
    for (const c of clients) await sendMessage(db, { clientId: c.id, body: fillTemplate(body, c), senderUserId: auth.userId, senderRole: 'COACH' });
    return { sent: clients.length, message: `Sent to ${clients.length} client${clients.length === 1 ? '' : 's'}.` };
  },
  async review_checkin(db, auth, p) {
    const k = must(await db.checkIn.findFirst({ where: { id: p.checkinId } }), 'That check-in');
    await db.checkIn.update({ where: { id: k.id }, data: { status: 'reviewed', reviewedAt: new Date() } });
    const ins = await db.aIInsight.findFirst({ where: { sourceId: k.id, kind: 'checkin_summary', status: 'pending' } });
    if (ins) await db.aIInsight.update({ where: { id: ins.id }, data: { status: 'dismissed', decidedAt: new Date(), decidedBy: auth.userId } });
    return { message: `${firstOf(p.clientName)}’s check-in is marked reviewed.` };
  },
  async payment_reminder(db, auth, p) {
    const pay = must(await db.payment.findFirst({ where: { id: p.paymentId } }), 'That payment');
    await sendMessage(db, { clientId: p.clientId, body: p.text, senderUserId: auth.userId, senderRole: 'COACH' });
    await db.payment.update({ where: { id: pay.id }, data: { remindedAt: new Date() } });
    return { message: `Reminder sent to ${firstOf(p.clientName)}.` };
  },
  async update_lead(db, _auth, p) {
    const l = must(await db.lead.findFirst({ where: { id: p.leadId } }), 'That lead');
    const data = { ...p.changes };
    if (data.stage === 'contacted' && l.stage !== 'contacted') Object.assign(data, { lastContactAt: new Date(), nextFollowUpAt: new Date(Date.now() + 3 * 864e5) });
    if (data.stage && data.stage !== 'contacted') data.nextFollowUpAt = null;
    await db.lead.update({ where: { id: l.id }, data });
    return { message: `${p.name} is updated.` };
  },
  async convert_lead(db, auth, p) {
    const l = must(await db.lead.findFirst({ where: { id: p.leadId } }), 'That lead');
    if (l.convertedClientId) throw conflict(`${l.name} is already a client.`);
    if (p.email && await db.client.findFirst({ where: { email: p.email } })) throw conflict('A client with that email already exists.');
    const c = await db.client.create({ data: { name: l.name, email: p.email, goal: l.goal, status: 'NEW', coachUserId: auth.userId, tags: [`From ${l.source.replace('_', ' ')}`] } });
    await ensureThread(db, c.id);
    const inv = await createInvite(db, c, { send: !!p.email });
    await db.lead.update({ where: { id: l.id }, data: { stage: 'active', convertedClientId: c.id, nextFollowUpAt: null } });
    return { clientId: c.id, inviteLink: inv.link, emailed: inv.emailed, navigate: { screen: 'client', id: c.id }, message: `${l.name} is now a client.` };
  },
  async set_automation(db, _auth, p) {
    must(await db.automation.findFirst({ where: { id: p.automationId } }), 'That automation');
    await db.automation.update({ where: { id: p.automationId }, data: p.changes });
    return { message: `${p.name} is ${p.changes.enabled === false ? 'off' : p.changes.enabled ? 'on' : 'updated'}.` };
  },
  async update_settings(db, auth, p) {
    if (auth.role !== 'OWNER') throw conflict('Only the workspace owner can change business settings.');
    const b = await db.business.findFirst({ select: { id: true } });
    await db.business.update({ where: { id: b.id }, data: p.changes });
    audit({ businessId: auth.businessId, actorUserId: auth.userId, action: 'settings_business', target: b.id });
    return { message: 'Your settings are saved.' };
  },
};

/** Where the coach finishes it by hand if confirming fails. */
export const ACTION_SCREEN = { create_program: 'Programs', update_program: 'Programs', delete_program: 'Programs', duplicate_program: 'Programs', save_workout: 'the program', delete_workout: 'the program', create_exercise: 'the Exercise library', delete_exercise: 'the Exercise library', restore_exercise: 'the Exercise library', add_client: 'Clients', update_client: 'the client’s profile', message_clients: 'Messages', review_checkin: 'Check-ins', payment_reminder: 'Payments', update_lead: 'Leads', convert_lead: 'Leads', set_automation: 'Automations', update_settings: 'Settings' };

const ex = { type: 'array', description: 'Exercises in order, by their names in the library (check exercise_library).', items: { type: 'object', properties: { exercise: { type: 'string' }, sets: { type: 'integer' }, reps: { type: 'string', description: 'e.g. "8-10", "12", "30s"' }, rest_seconds: { type: 'integer' }, notes: { type: 'string' } }, required: ['exercise'] } };

/** Proposal tool definitions (Anthropic Messages API). */
export function actionToolDefinitions() {
  const P = (name, description, properties, required = []) => ({ name: `propose_${name}`, description: `${description} Creates a proposal the coach confirms; nothing happens before that.`, input_schema: { type: 'object', properties, required } });
  return [
    P('create_program', 'Create a training program. Optionally include its workouts (one per training day) built from the coach’s exercise library.', { name: { type: 'string' }, weeks: { type: 'integer' }, days_per_week: { type: 'integer' }, level: { type: 'string', description: 'Beginner, Intermediate or Advanced' }, description: { type: 'string' }, workouts: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, day: { type: 'integer' }, exercises: ex }, required: ['name'] } } }, ['name']),
    P('update_program', 'Rename a program or change its weeks, days per week, level or description.', { program_name: { type: 'string' }, new_name: { type: 'string' }, weeks: { type: 'integer' }, days_per_week: { type: 'integer' }, level: { type: 'string' }, description: { type: 'string' } }, ['program_name']),
    P('delete_program', 'Delete a program (it must have no active clients on it).', { program_name: { type: 'string' } }, ['program_name']),
    P('duplicate_program', 'Make a copy of a program, with all its workouts.', { program_name: { type: 'string' }, new_name: { type: 'string' } }, ['program_name']),
    P('save_workout', 'Add a workout to a program, or replace the exercises of one it already has (replace_workout = its name).', { program_name: { type: 'string' }, name: { type: 'string' }, day: { type: 'integer' }, replace_workout: { type: 'string' }, exercises: ex }, ['program_name', 'exercises']),
    P('delete_workout', 'Delete one workout from a program.', { program_name: { type: 'string' }, workout_name: { type: 'string' } }, ['program_name', 'workout_name']),
    P('create_exercise', 'Add the coach’s own exercise to the exercise library (a photo or video can be added on its page after).', { name: { type: 'string' }, muscle_group: { type: 'string', description: 'legs, glutes, push, chest, shoulders, pull, back, core, cardio or full body' }, pattern: { type: 'string', enum: PATTERNS }, equipment: { type: 'string' }, level: { type: 'string', enum: ['Beginner', 'Intermediate', 'Advanced'] }, instructions: { type: 'string', description: 'How-to cues, one per line' }, video_url: { type: 'string', description: 'An https link to a demo video, if the coach gave one' } }, ['name']),
    P('delete_exercise', 'Delete an exercise from the coach’s library (their own is deleted; a OneJump one is removed from their library).', { exercise_name: { type: 'string' } }, ['exercise_name']),
    P('restore_exercise', 'Put back an exercise the coach removed from their library.', { exercise_name: { type: 'string' } }, ['exercise_name']),
    P('add_client', 'Add a new client (and email their invite if there’s an email).', { name: { type: 'string' }, email: { type: 'string' }, mode: { type: 'string', enum: ['Online', 'Hybrid', 'In person'] }, goal: { type: 'string' }, program_name: { type: 'string' }, send_invite: { type: 'boolean' } }, ['name']),
    P('update_client', 'Change a client’s details or status (active, paused, inactive).', { client_name: { type: 'string' }, status: { type: 'string', enum: ['active', 'paused', 'inactive'] }, goal: { type: 'string' }, mode: { type: 'string', enum: ['Online', 'Hybrid', 'In person'] }, phone: { type: 'string' }, email: { type: 'string' }, why: { type: 'string' }, target_weight: { type: 'number' } }, ['client_name']),
    P('message_clients', 'Send one message to a group of clients: everyone active, online or in-person clients, everyone on a program, people who haven’t checked in, or a list of names. {first} becomes each client’s first name.', { group: { type: 'string', enum: ['active', 'online', 'in_person', 'program', 'missing_checkin', 'named'] }, program_name: { type: 'string' }, client_names: { type: 'array', items: { type: 'string' } }, text: { type: 'string' } }, ['text']),
    P('review_checkin', 'Mark a client’s latest check-in as reviewed without replying.', { client_name: { type: 'string' } }, ['client_name']),
    P('payment_reminder', 'Send a client the card-update reminder for their failed payment.', { client_name: { type: 'string' } }, ['client_name']),
    P('update_lead', 'Move a lead to another stage (new, contacted, consult, trial, active, retained, lost) or change their goal or contact.', { lead_name: { type: 'string' }, stage: { type: 'string', enum: ['new', 'contacted', 'consult', 'trial', 'active', 'retained', 'lost'] }, goal: { type: 'string' }, contact: { type: 'string' } }, ['lead_name']),
    P('convert_lead', 'Turn a lead into a client (emails their invite if there’s an email).', { lead_name: { type: 'string' }, email: { type: 'string' } }, ['lead_name']),
    P('set_automation', 'Turn an automation on or off, or change its message (check-in reminder, failed payment, missed workouts, milestones, gone quiet).', { automation: { type: 'string' }, enabled: { type: 'boolean' }, message: { type: 'string' } }, ['automation']),
    P('update_settings', 'Change the business name, Assist’s writing style (Supportive, Direct, Data-driven, Playful) or the time zone.', { business_name: { type: 'string' }, writing_style: { type: 'string', enum: ['Supportive', 'Direct', 'Data-driven', 'Playful'] }, timezone: { type: 'string' } }),
  ];
}

// ---------------------------------------------------------------- reading, moving around, and the guide

export const SCREENS = ['today', 'clients', 'client', 'assist', 'inbox', 'messages', 'checkins', 'programs', 'program', 'library', 'exercise', 'nutrition', 'payments', 'leads', 'automations', 'settings', 'billing', 'more'];

const GUIDE = {
  overview: 'OneJump is coaching software for personal trainers and online coaches, founded by Jansell. The iPhone app has five tabs: Today (what needs you, Assist’s drafts to approve, the morning briefing, business charts), Clients (each client’s profile with Overview, Program, Food, Progress and Notes), Assist (talk or type to me), Inbox (messages and check-ins) and More (Programs, Exercise library, Nutrition, Payments, Leads, Automations, Settings, Plan and billing).',
  programs: 'Programs: More → Programs. Tap New program to make one (name, weeks, days a week, level). Open a program to add workouts, add exercises to each workout with sets and reps, delete workouts, or delete the program (it needs no active clients). Assist can build a whole program with its workouts, change one, copy one, or start a client on one.',
  library: 'Exercise library: More → Exercise library. Tap + to add your own exercise with a photo or a video from your camera roll. Swipe left on an exercise, or open it and tap Delete, to remove it. Your own exercises are deleted; OneJump’s are removed from your library only. Assist can add, delete or bring back exercises too.',
  assist: 'Assist: type, or tap the mic to switch to voice. In voice mode Assist is always listening: talk any time, and if you start talking while it speaks it stops and listens. Voice keeps going when you leave the Assist tab; the screen corners glow green while it listens. In text mode nothing is read aloud. Anything that changes your business shows a card first: tap Confirm, or say yes.',
  clients: 'Clients: the Clients tab. Tap + to add a client and email their invite. Open a client for their program, food plan, progress, notes and messages. Assist can add clients, change their details, pause them, start them on a program, write and send messages, and build nutrition plans.',
  checkins: 'Check-ins: Inbox → Check-ins. Assist summarizes each one and drafts a reply for you to approve or edit.',
  payments: 'Payments: More → Payments (failed payments, reminders, packages). Charges, refunds and prices are changed only on that screen, not by Assist.',
  briefing: 'Morning briefing: on Today, tap the green play button. Assist reads your day one short line at a time.',
  leads: 'Leads: More → Leads. Paste a DM and Assist fills it in and drafts the reply. Assist can add leads, move them through stages and turn them into clients.',
  automations: 'Automations: More → Automations: check-in reminders, failed payments, missed workouts, milestones and gone quiet. Assist can turn them on or off or change their message.',
  settings: 'Settings: More → Settings (your profile, language, Assist’s voice and reminders). Assist can change the business name, writing style and time zone.',
};

export const ACTION_READ_TOOLS = {
  exercise_library: {
    description: 'The coach’s exercise library (OneJump’s plus their own), optionally filtered. Use it to find exact exercise names before building workouts.',
    input: { search: { type: 'string', description: 'Words to match in the name, muscle or equipment' }, only_mine: { type: 'boolean', description: 'Only the coach’s own exercises' }, removed: { type: 'boolean', description: 'Exercises the coach removed from their library' } },
    trace: ['Exercise library'],
    async run(db, a = {}) {
      let list = await libraryFor(db, { includeHidden: !!a.removed });
      if (a.removed) list = list.filter(e => e.hidden);
      if (a.only_mine) list = list.filter(e => e.businessId);
      const q = norm(a.search);
      if (q) list = list.filter(e => q.split(' ').every(w => norm(`${e.name} ${e.muscle} ${e.equipment} ${e.pattern}`).includes(w)));
      return { count: list.length, exercises: list.slice(0, 80).map(e => ({ name: e.name, muscle: e.muscle, equipment: e.equipment, level: e.level, mine: !!e.businessId, media: e.mediaType || (e.videoUrl ? 'video link' : null) })) };
    },
  },
  program_details: {
    description: 'One program’s workouts with their exercises, sets and reps, and who is on it.',
    input: { program_name: { type: 'string' } },
    trace: ['Programs', 'Workouts'],
    async run(db, a = {}, c = {}) {
      const f = await findProgram(db, a.program_name, c.lang);
      if (f.error) return { error: f.error };
      const [workouts, clients, lib] = await Promise.all([
        db.workout.findMany({ where: { programId: f.program.id, clientId: null }, orderBy: [{ week: 'asc' }, { day: 'asc' }] }),
        db.client.findMany({ where: { programId: f.program.id, status: { in: ['NEW', 'ACTIVE'] } }, select: { name: true } }),
        db.exercise.findMany({ select: { id: true, name: true } }),
      ]);
      const names = new Map(lib.map(e => [e.id, e.name]));
      return { ...f.program, clients: clients.map(x => x.name), workouts: workouts.map(w => ({ name: w.name, day: w.day, week: w.week, minutes: w.estMinutes, exercises: (w.blocks || []).flatMap(b => b.items.map(i => ({ name: names.get(i.exerciseId) || 'Removed exercise', sets: i.sets.length, reps: i.sets[0]?.reps || '' }))) })) };
    },
  },
  app_guide: {
    description: 'How to do things in OneJump (where things are, what each screen does, what Assist can do), and who made OneJump. Use it for any “how do I…” or “where is…” question about the app.',
    input: { topic: { type: 'string', enum: Object.keys(GUIDE) } },
    trace: ['OneJump guide'],
    async run(_db, a = {}) {
      return a.topic && GUIDE[a.topic] ? { topic: a.topic, guide: GUIDE[a.topic], overview: GUIDE.overview } : { guide: Object.values(GUIDE).join('\n') };
    },
  },
};

export function actionReadToolDefinitions() {
  return Object.entries(ACTION_READ_TOOLS).map(([name, t]) => ({ name, description: t.description, input_schema: { type: 'object', properties: t.input, required: name === 'program_details' ? ['program_name'] : [] } }));
}

/**
 * Things that happen on the coach's own screen right away (no data changes, so no confirmation):
 * open a screen, switch Assist between voice and text, start the morning briefing.
 */
export function uiToolDefinitions() {
  return [
    { name: 'open_screen', description: 'Open a screen in the OneJump app for the coach (they can keep talking to you). For one client, program or exercise, pass its name.', input_schema: { type: 'object', properties: { screen: { type: 'string', enum: SCREENS }, name: { type: 'string', description: 'The client, program or exercise to open' } }, required: ['screen'] } },
    { name: 'set_assist_mode', description: 'Switch Assist to voice (always listening, answers out loud) or text (typed, silent). Use when the coach asks to talk, use voice, or go back to typing.', input_schema: { type: 'object', properties: { mode: { type: 'string', enum: ['voice', 'text'] } }, required: ['mode'] } },
    { name: 'start_briefing', description: 'Play the coach’s morning briefing on the Today screen.', input_schema: { type: 'object', properties: {} } },
  ];
}

/** Runs a UI tool: returns what the app should do, plus a short result for the model. */
export async function runUiTool(db, name, a = {}, c = {}) {
  if (name === 'set_assist_mode') return { ui: { mode: a.mode === 'voice' ? 'voice' : 'text' }, out: { done: true, note: 'The app switches now.' } };
  if (name === 'start_briefing') return { ui: { action: 'briefing' }, out: { done: true } };
  const screen = SCREENS.includes(a.screen) ? a.screen : 'today';
  let id = null;
  if (['client', 'messages'].includes(screen) && clean(a.name)) {
    const f = await findClient(db, a.name, c.lang); if (f.error) return { out: { error: f.error } }; id = f.client.id;
  } else if (screen === 'program' && clean(a.name)) {
    const f = await findProgram(db, a.name, c.lang); if (f.error) return { out: { error: f.error } }; id = f.program.id;
  } else if (screen === 'exercise' && clean(a.name)) {
    const f = await findExercise(db, a.name, c.lang); if (f.error) return { out: { error: f.error } }; id = f.exercise.id;
  } else if (['client', 'program', 'exercise'].includes(screen)) {
    return { out: { error: `Which ${screen}?` } };
  }
  return { ui: { navigate: { screen, id } }, out: { opened: screen, note: 'It’s open on their screen now.' } };
}

