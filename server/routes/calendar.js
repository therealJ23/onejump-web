// Coach calendar: sessions, check-in calls, consultations and blocked time, plus moving a client's
// scheduled workout. Times are UTC instants; the range is local dates in the business time zone.
import { Router } from 'express';
import { body, z, id as idRule } from '../lib/validate.js';
import { coachRange, createEvent, updateEvent, moveAssignment, EVENT_TYPES } from '../core/calendar.js';
import { must } from '../lib/errors.js';
import { localYMD, addDays, ymdToDate, dateToYmd } from '../lib/time.js';

export const router = Router();
const tzOf = async db => (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const when = z.string().datetime({ offset: true });

router.get('/', async (req, res) => {
  const tz = await tzOf(req.db);
  const from = ymd.safeParse(req.query.from).success ? req.query.from : localYMD(tz);
  const to = ymd.safeParse(req.query.to).success ? req.query.to : dateToYmd(addDays(ymdToDate(from), 6));
  res.json(await coachRange(req.db, { from, to, tz }));
});

const eventBody = z.object({ type: z.enum(EVENT_TYPES), title: z.string().trim().max(120).optional(), start: when, end: when, clientId: idRule.nullable().optional(), location: z.string().trim().max(190).nullable().optional(), notes: z.string().max(2000).nullable().optional() });
router.post('/', body(eventBody), async (req, res) => res.status(201).json({ event: await createEvent(req.db, req.auth, req.body) }));
router.patch('/:id', body(eventBody.partial().extend({ status: z.enum(['scheduled', 'done', 'cancelled']).optional() })), async (req, res) => res.json({ event: await updateEvent(req.db, req.auth, req.params.id, req.body) }));
router.delete('/:id', async (req, res) => { await updateEvent(req.db, req.auth, req.params.id, { status: 'cancelled' }); res.json({ ok: true }); });

// Move a client's scheduled workout to another day (drag on the calendar).
router.patch('/assignments/:id', body(z.object({ date: ymd })), async (req, res) => {
  const a = await moveAssignment(req.db, req.params.id, req.body.date, { tz: await tzOf(req.db) });
  res.json({ assignment: { id: a.id, date: dateToYmd(a.scheduledFor) } });
});
