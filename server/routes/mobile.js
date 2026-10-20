// The coach iPhone app's read endpoints: each screen's data in one call, shaped for the app,
// with every label in English and Spanish. Actions use the normal API routes.
import { Router } from 'express';
import { must } from '../lib/errors.js';
import { coachSnapshot, clientDetail, threadFor, checkInReport } from '../mobile/coach.js';
import { buildBriefing } from '../assist/briefing.js';
import { isPro, effectivePlan } from '../auth/middleware.js';
import { users } from '../db/system.js';

export const router = Router();

/** Builds today's morning briefing in the background, so the play button starts right away. */
async function warmBriefing(db, auth) {
  const b = await db.business.findFirst({ select: { plan: true, planStatus: true, trialEndsAt: true, timezone: true, writingStyle: true } });
  if (!b || !isPro(effectivePlan(b))) return;
  const me = await users.publicById(auth.userId);
  await buildBriefing(db, { userId: auth.userId, coachName: me?.name || '', style: b.writingStyle || 'Supportive', tz: b.timezone || 'UTC' });
}

router.get('/coach', async (req, res) => {
  res.json(await coachSnapshot(req.db, req.auth));
  if (process.env.NODE_ENV !== 'test') warmBriefing(req.db, req.auth).catch(e => console.error('[briefing] warm-up failed:', e.message));
});
router.get('/coach/clients/:id', async (req, res) => res.json(must(await clientDetail(req.db, req.params.id), 'That client')));
router.get('/coach/threads/:clientId', async (req, res) => res.json(must(await threadFor(req.db, req.params.clientId), 'That client')));
router.get('/coach/checkins/:id', async (req, res) => res.json(must(await checkInReport(req.db, req.params.id), 'That check-in')));
