// Morning briefing (coach, Pro). Built at 6:30 AM by the scheduler, or on demand here.
import { Router } from 'express';
import { requireFeature } from '../auth/middleware.js';
import { users } from '../db/system.js';
import { buildBriefing, shapeBriefing } from '../assist/briefing.js';
import { todayKey } from '../lib/time.js';
import { must } from '../lib/errors.js';

export const router = Router();
const pro = requireFeature('PRO', 'The morning briefing');

async function make(req, force = false) {
  const b = await req.db.business.findFirst({ select: { timezone: true, writingStyle: true } });
  const me = await users.publicById(req.auth.userId);
  return buildBriefing(req.db, { userId: req.auth.userId, coachName: me?.name || '', style: b.writingStyle || 'Supportive', tz: b.timezone || 'UTC', force });
}

/** Today's briefing for the signed-in coach (built now if the 6:30 job hasn't yet). */
router.get('/today', pro, async (req, res) => res.json({ briefing: shapeBriefing(await make(req)) }));

/** Rebuild with the latest data (the 6:30 version is a morning snapshot). */
router.post('/today/refresh', pro, async (req, res) => res.json({ briefing: shapeBriefing(await make(req, true)) }));

/** Played (or dismissed): hides the Today banner on every device. */
router.post('/today/played', pro, async (req, res) => {
  const b = await req.db.business.findFirst({ select: { timezone: true } });
  const br = must(await req.db.briefing.findFirst({ where: { userId: req.auth.userId, date: todayKey(b.timezone || 'UTC') } }), 'Today’s briefing');
  await req.db.briefing.update({ where: { id: br.id }, data: { playedAt: br.playedAt || new Date() } });
  res.json({ ok: true });
});

/** For the Today banner: is there an unplayed briefing from this morning? (no generation here) */
router.get('/status', async (req, res) => {
  const b = await req.db.business.findFirst({ select: { timezone: true } });
  const br = await req.db.briefing.findFirst({ where: { userId: req.auth.userId, date: todayKey(b.timezone || 'UTC') }, select: { id: true, notifiedAt: true, playedAt: true } });
  res.json({ ready: !!br?.notifiedAt && !br.playedAt });
});
