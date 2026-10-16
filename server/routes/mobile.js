// The coach iPhone app's read endpoints: each screen's data in one call, shaped for the app,
// with every label in English and Spanish. Actions use the normal API routes.
import { Router } from 'express';
import { must } from '../lib/errors.js';
import { coachSnapshot, clientDetail, threadFor, checkInReport } from '../mobile/coach.js';

export const router = Router();

router.get('/coach', async (req, res) => res.json(await coachSnapshot(req.db, req.auth)));
router.get('/coach/clients/:id', async (req, res) => res.json(must(await clientDetail(req.db, req.params.id), 'That client')));
router.get('/coach/threads/:clientId', async (req, res) => res.json(must(await threadFor(req.db, req.params.clientId), 'That client')));
router.get('/coach/checkins/:id', async (req, res) => res.json(must(await checkInReport(req.db, req.params.id), 'That check-in')));
