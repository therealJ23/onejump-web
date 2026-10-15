// Talk to Assist (coach, Pro): push-to-talk audio → transcript → the same Ask Assist answers and
// proposals as typing, plus a short spoken answer. Audio is transcribed and dropped; only the
// transcript is kept. Proposals wait for the coach's approval: a tap, or a spoken yes right after
// Assist reads them back (see ../assist/approvals.js).
import { Router } from 'express';
import multer from 'multer';
import { body, z, audioFields } from '../lib/validate.js';
import { badRequest } from '../lib/errors.js';
import { requireFeature } from '../auth/middleware.js';
import { VoiceService, assertUnderLimit, minutesUsed } from '../voice/VoiceService.js';
import { sniffAudio } from '../storage/StorageService.js';
import { ask } from '../assist/AssistService.js';
import { config } from '../config.js';

export const router = Router();
/** Earlier turns sent with a spoken question (a JSON string in the form data). */
function parseHistory(raw) {
  try { const h = JSON.parse(raw || '[]'); return Array.isArray(h) ? h.slice(-12).filter(x => x && typeof x.text === 'string').map(x => ({ role: x.role === 'assistant' ? 'assistant' : 'user', text: x.text.slice(0, 1500) })) : []; } catch { return []; }
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 8, fieldSize: 32 * 1024 } });
const tzOf = async db => (await db.business.findFirst({ select: { timezone: true } }))?.timezone || 'UTC';
const pro = requireFeature('PRO', 'Talk to Assist');

router.get('/config', async (req, res) => {
  res.json({ provider: VoiceService.provider, tts: config.voice.tts, limitMinutes: config.voice.monthlyMinutes, usedMinutes: Math.round(await minutesUsed(req.db) * 10) / 10, maxSeconds: 30 });
});

router.post('/ask', pro, upload.single('audio'), body(audioFields), async (req, res) => {
  if (!req.file) throw badRequest('No audio was received. Tap the circle, talk, then tap again.');
  const mimeType = sniffAudio(req.file.buffer);
  if (!mimeType) throw badRequest('That recording couldn’t be read. Try again.');
  await assertUnderLimit(req.db);
  const durationMs = Math.min(31000, Number(req.body?.durationMs) || 0);
  const lang = req.body?.lang === 'es' ? 'es' : 'en';
  const v = await VoiceService.transcribe(req.db, req.file.buffer, { mimeType, durationMs, hint: req.body?.hint, userId: req.auth.userId, kind: 'ask', lang });
  if (!v.transcript) return res.json(lang === 'es'
    ? { transcript: '', answerHtml: '<p>No te escuché bien. Inténtalo otra vez o escribe tu pregunta.</p>', spokenText: 'No te escuché bien. Inténtalo otra vez.', proposals: [], trace: [], followups: [] }
    : { transcript: '', answerHtml: '<p>I didn’t catch that. Try again, or type your question.</p>', spokenText: 'I didn’t catch that. Try again.', proposals: [], trace: [], followups: [] });
  const r = await ask(req.db, req.auth, v.transcript, { voice: true, tz: await tzOf(req.db), lang, history: parseHistory(req.body?.history), pendingProposalId: req.body?.pendingProposalId || null });
  res.json({ transcript: v.transcript, ...r });
});

/** Spoken answer as audio (VOICE_TTS=deepgram). With browser speech this returns 204 and the browser speaks. */
router.post('/speak', pro, body(z.object({ text: z.string().trim().min(1).max(1000), lang: z.enum(['en', 'es']).optional() })), async (req, res) => {
  const audio = await VoiceService.speak(req.db, req.body.text, req.body.lang);
  if (!audio) return res.status(204).end();
  res.set('Content-Type', 'audio/mpeg').set('Cache-Control', 'no-store').send(audio);
});
