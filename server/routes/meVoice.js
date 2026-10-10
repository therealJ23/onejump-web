// Client app voice (Pro, on the coach's plan): log a set by voice, voice notes to the coach, and
// server transcription for phones whose browser can't do speech recognition itself.
// Client-scoped queries use req.db; VoiceInteraction / AIUsage are coach-only tables, so they're
// written with the workspace's coach-level client, server-side only.
import { Router } from 'express';
import multer from 'multer';
import { dbForBusiness } from '../db/tenant.js';
import { body, z, audioFields } from '../lib/validate.js';
import { must, badRequest, HttpError } from '../lib/errors.js';
import { requireFeature, effectivePlan, isPro } from '../auth/middleware.js';
import { VoiceService, assertUnderLimit } from '../voice/VoiceService.js';
import { sendVoiceNote, guardClientTranscript, VOICE_NOTE_MAX_SECONDS } from '../voice/voiceNotes.js';
import { StorageService, sniffAudio } from '../storage/StorageService.js';
import { parseSet } from '../../public/js/shared/parse.js';
import { AI } from '../ai/AIService.js';

export const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 8, fieldSize: 4096 } });
const proOnly = feature => requireFeature('PRO', feature);

async function ctx(req) {
  const coach = dbForBusiness(req.auth.businessId);
  const b = await req.db.business.findFirst({ select: { id: true, plan: true, trialEndsAt: true, planStatus: true } });
  const client = must(await req.db.client.findFirst({ where: { id: req.auth.clientId } }), 'Your account');
  return { coach, client, pro: isPro(effectivePlan(b)) };
}
const audioOf = req => {
  if (!req.file) throw badRequest('No audio was received. Tap the mic, talk, then tap again.');
  const mimeType = sniffAudio(req.file.buffer);
  if (!mimeType) throw badRequest('That recording couldn’t be read. Try again.');
  return mimeType;
};
const clientLimit = async coach => {
  try { await assertUnderLimit(coach); }
  catch { throw new HttpError(429, 'Voice isn’t available right now. You can type or tap instead.', { code: 'voice_limit' }); }
};

router.get('/voice/config', async (req, res) => {
  const { pro } = await ctx(req);
  res.json({ provider: VoiceService.provider, voice: pro, voiceNoteMaxSeconds: VOICE_NOTE_MAX_SECONDS });
});

/** For browsers without speech recognition: audio → text (not stored). kind: set_log | food_log. */
router.post('/voice/transcribe', proOnly('Voice logging'), upload.single('audio'), body(audioFields), async (req, res) => {
  const mimeType = audioOf(req);
  const kind = req.body?.kind === 'food_log' ? 'food_log' : 'set_log';
  const { coach, client } = await ctx(req);
  await clientLimit(coach);
  const v = await VoiceService.transcribe(coach, req.file.buffer, { mimeType, durationMs: Math.min(16000, Number(req.body?.durationMs) || 0), hint: req.body?.hint, userId: req.auth.userId, clientId: client.id, kind });
  await guardClientTranscript(coach, { client, businessId: req.auth.businessId, text: v.transcript, source: kind });
  res.json({ transcript: v.transcript });
});

/** "10 reps at 55" → { reps, weight }. Regex first; Assist only when the regex can't read it. */
router.post('/voice/set', proOnly('Logging a set by voice'), body(z.object({ text: z.string().trim().min(1).max(200), spoken: z.boolean().default(true) })), async (req, res) => {
  const { coach, client } = await ctx(req);
  if (req.body.spoken) await guardClientTranscript(coach, { client, businessId: req.auth.businessId, text: req.body.text, source: 'set_log' });
  let r = parseSet(req.body.text), via = 'parser';
  if (!r) {
    const ai = await AI.parseSetText(req.body.text, { db: coach }).catch(() => null);
    if (ai?.data?.reps) { r = { reps: ai.data.reps, weight: ai.data.bodyweight ? null : ai.data.weight, bodyweight: !!ai.data.bodyweight, unit: 'lb' }; via = 'assist'; }
  }
  if (!r) return res.status(422).json({ error: 'I didn’t catch the reps. Try “10 reps at 55”.', code: 'no_set' });
  res.json({ ...r, via });
});

/** A voice note to the coach: audio + transcript (the coach also sees a one-line Assist summary). */
router.post('/voice-notes', proOnly('Voice notes'), upload.single('audio'), body(audioFields), async (req, res) => {
  const mimeType = audioOf(req);
  const { coach, client } = await ctx(req);
  const r = await sendVoiceNote({ coach, db: req.db, businessId: req.auth.businessId, client, senderRole: 'CLIENT', senderUserId: req.auth.userId, buf: req.file.buffer, mimeType, durationMs: req.body?.durationMs, hint: req.body?.hint });
  const m = r.message;
  res.status(201).json({ message: { id: m.id, from: 'me', body: m.body, at: m.createdAt, voice: { durationS: m.durationS } } });
});

/** A 5-minute link to play a voice note in the client's own thread. */
router.get('/messages/:id/audio', async (req, res) => {
  const m = must(await req.db.message.findFirst({ where: { id: req.params.id }, select: { audioKey: true } }), 'That voice note');
  if (!m.audioKey) throw badRequest('That message has no audio.');
  res.set('Cache-Control', 'no-store').json({ url: await StorageService.signedUrl(m.audioKey) });
});
