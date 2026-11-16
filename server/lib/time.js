// Dates are stored in UTC. "Training days" are stored as UTC midnight of the local date
// in the coach's time zone, so a workout scheduled for Wed Oct 7 is 2026-10-07T00:00Z
// no matter where the server runs.
export const DAY = 864e5;

/** YYYY-MM-DD for a moment, in a time zone. */
export function localYMD(tz = 'UTC', d = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
export const ymdToDate = ymd => new Date(`${ymd}T00:00:00.000Z`);
export const dateToYmd = d => new Date(d).toISOString().slice(0, 10);
export const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY);
/** Today's training-day key in the coach's time zone. */
export const todayKey = (tz, now = new Date()) => ymdToDate(localYMD(tz, now));
/** Monday of the week containing a training-day key. */
export function weekStart(dayKey) {
  const d = new Date(dayKey);
  return addDays(d, -((d.getUTCDay() + 6) % 7));
}
/** Local hour and weekday (0 = Sunday) in a time zone. */
export function localParts(tz = 'UTC', d = new Date()) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(d).map(p => [p.type, p.value]));
    return { hour: Number(parts.hour), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday) };
  } catch {
    return { hour: d.getUTCHours(), weekday: d.getUTCDay() };
  }
}
export const daysBetween = (a, b) => Math.floor((new Date(b).getTime() - new Date(a).getTime()) / DAY);
export const startOfMonthUtc = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** Which weekdays (0 = Mon … 6 = Sun) a program with N training days uses. */
export function trainingWeekdays(daysPerWeek) {
  return ({ 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] })[Math.max(1, Math.min(7, daysPerWeek))];
}

/** A local wall-clock time in a time zone → the UTC instant ("2026-11-17", 8, 30, "America/New_York"). */
export function zonedToUtc(ymd, hour = 0, minute = 0, tz = 'UTC') {
  const [y, mo, d] = String(ymd).split('-').map(Number);
  let guess = Date.UTC(y, mo - 1, d, hour, minute);
  // Two passes handle the offset (and a DST change between the guess and the answer).
  for (let i = 0; i < 2; i++) {
    const p = wallParts(tz, new Date(guess));
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += Date.UTC(y, mo - 1, d, hour, minute) - shown;
  }
  return new Date(guess);
}

/** Year, month, day, hour and minute of an instant on the wall clock of a time zone. */
export function wallParts(tz = 'UTC', d = new Date()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
    return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute) };
  } catch {
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  }
}
