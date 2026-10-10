// Coach inbox: one thread per client, Assist drafts in the coach's voice, group messages.
import { Router } from 'express';
import { body, z, audioFields } from '../lib/validate.js';
import { must, badRequest } from '../lib/errors.js';
import { sendMessage } from '../core/messaging.js';
import { messageDraft } from '../ai/drafts.js';
import { fillTemplate } from '../core/automationTemplates.js';
import { programWeek } from '../core/training.js';
import { DAY } from '../lib/time.js';
import { missingCheckinClients } from '../core/checkinStatus.js';
import multer from 'multer';
import { requireFeature, planOf, isPro } from '../auth/middleware.js';
import { VoiceService } from '../voice/VoiceService.js';
import { sendVoiceNote, voiceFields, fmtDuration } from '../voice/voiceNotes.js';
import { StorageService, sniffAudio } from '../storage/StorageService.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 8, fieldSize: 4096 } });

export const router = Router();

router.get('/', async (req, res) => {
  const [threads, clients] = await Promise.all([
    req.db.thread.findMany({ orderBy: { lastMessageAt: 'desc' } }),
    req.db.client.findMany({ select: { id: true, name: true, status: true, riskLevel: true } }),
  ]);
  const byId = new Map(clients.map(c => [c.id, c]));
  const out = [];
  for (const t of threads) {
    const c = byId.get(t.clientId);
    if (!c || !t.lastMessageAt) continue;
    const m = await req.db.message.findFirst({ where: { threadId: t.id }, orderBy: { createdAt: 'desc' }, select: { body: true, senderRole: true, createdAt: true, audioKey: true, durationS: true, transcriptSummary: true } });
    const text = m?.audioKey ? `🎤 Voice note · ${fmtDuration(m.durationS)} — ${m.transcriptSummary || m.body}` : m?.body;
    out.push({ clientId: c.id, name: c.name, status: c.status, unread: t.coachUnread, last: m ? { body: text.slice(0, 160), fromCoach: m.senderRole !== 'CLIENT', at: m.createdAt } : null });
  }
  res.json({ threads: out, unread: out.filter(t => t.unread).length });
});

router.get('/:clientId', async (req, res) => {
  const c = must(await req.db.client.findFirst({ where: { id: req.params.clientId } }), 'That client');
  const t = await req.db.thread.findFirst({ where: { clientId: c.id } });
  const messages = t ? await req.db.message.findMany({ where: { threadId: t.id }, orderBy: { createdAt: 'asc' }, take: 300 }) : [];
  if (t?.coachUnread) {
    await req.db.thread.update({ where: { id: t.id }, data: { coachUnread: 0 } });
    await req.db.message.updateMany({ where: { threadId: t.id, senderRole: 'CLIENT', readAt: null }, data: { readAt: new Date() } });
  }
  const program = c.programId ? await req.db.program.findFirst({ where: { id: c.programId }, select: { name: true } }) : null;
  const k = await req.db.checkIn.findFirst({ where: { clientId: c.id, submittedAt: { gte: new Date(Date.now() - 8 * DAY) } }, orderBy: { submittedAt: 'desc' }, select: { id: true, status: true } });
  res.json({
    client: { id: c.id, name: c.name, program: program?.name || null, week: programWeek(c), adherence: c.adherence, risk: c.riskLevel ? { level: c.riskLevel, score: c.riskScore } : null, checkin: k, status: c.status },
    features: { voiceNotes: isPro(await planOf(req.db)), voiceProvider: VoiceService.provider },
    messages: messages.map(m => ({ id: m.id, from: m.senderRole === 'CLIENT' ? 'them' : 'me', body: m.body, at: m.createdAt, assist: !!m.aiInsightId, edited: m.aiEdited, system: !m.senderUserId && m.senderRole === 'COACH', ...voiceFields(m, { coach: true }) })),
  });
});

/** The coach records a voice note to a client (Pro). The coach's own words, so no approval step. */
router.post('/:clientId/voice-notes', requireFeature('PRO', 'Voice notes'), upload.single('audio'), body(audioFields), async (req, res) => {
  const c = must(await req.db.client.findFirst({ where: { id: req.params.clientId } }), 'That client');
  if (!req.file) throw badRequest('No audio was received. Tap the mic, talk, then tap again.');
  const mimeType = sniffAudio(req.file.buffer);
  if (!mimeType) throw badRequest('That recording couldn’t be read. Try again.');
  const r = await sendVoiceNote({ coach: req.db, db: req.db, businessId: req.auth.businessId, client: c, senderRole: 'COACH', senderUserId: req.auth.userId, buf: req.file.buffer, mimeType, durationMs: req.body?.durationMs, hint: req.body?.hint });
  const m = r.message;
  res.status(201).json({ message: { id: m.id, from: 'me', body: m.body, at: m.createdAt, ...voiceFields(m, { coach: true }) } });
});

/** A 5-minute link to play a voice note in this coach's own workspace. */
router.get('/:clientId/messages/:id/audio', async (req, res) => {
  const m = must(await req.db.message.findFirst({ where: { id: req.params.id, clientId: req.params.clientId }, select: { audioKey: true } }), 'That voice note');
  if (!m.audioKey) throw badRequest('That message has no audio.');
  res.set('Cache-Control', 'no-store').json({ url: await StorageService.signedUrl(m.audioKey) });
});

router.post('/:clientId/messages', body(z.object({ body: z.string().trim().min(1).max(5000), insightId: z.string().max(64).optional() })), async (req, res) => {
  const c = must(await req.db.client.findFirst({ where: { id: req.params.clientId } }), 'That client');
  let aiInsightId = null, aiEdited = false;
  if (req.body.insightId) {
    const ins = await req.db.aIInsight.findFirst({ where: { id: req.body.insightId, clientId: c.id, status: 'pending' } });
    if (ins) {
      aiEdited = req.body.body.trim() !== String(ins.draft?.text || '').trim();
      aiInsightId = ins.id;
      await req.db.aIInsight.update({ where: { id: ins.id }, data: { status: aiEdited ? 'edited' : 'approved', finalText: req.body.body, decidedAt: new Date(), decidedBy: req.auth.userId, minutesSaved: aiEdited ? Math.round(ins.minutesSaved * 0.7) : ins.minutesSaved } });
    }
  }
  const m = await sendMessage(req.db, { clientId: c.id, body: req.body.body, senderUserId: req.auth.userId, senderRole: 'COACH', aiInsightId, aiEdited });
  res.status(201).json({ message: { id: m.id, from: 'me', body: m.body, at: m.createdAt, assist: !!aiInsightId, edited: aiEdited } });
});

const INTENTS = ['reply-last', 'motivate', 'professional', 'consistency', 'recovery', 'shorter', 'checkin-reminder', 'payment', 'missed'];
router.post('/:clientId/draft', body(z.object({ intent: z.enum(INTENTS), current: z.string().max(5000).optional() })), async (req, res) => {
  const c = must(await req.db.client.findFirst({ where: { id: req.params.clientId } }), 'That client');
  // Older unsent inbox drafts for this client are superseded.
  await req.db.aIInsight.updateMany({ where: { clientId: c.id, kind: 'message_draft', source: 'inbox', status: 'pending' }, data: { status: 'expired' } });
  const i = await messageDraft(req.db, c, req.body.intent, { current: req.body.current || '' });
  res.json({ insightId: i.id, text: i.draft.text, safety: i.draft.safety });
});

/** Rewrites any text (Edit dialogs) without tying it to a thread. */
router.post('/:clientId/rewrite', body(z.object({ intent: z.enum(INTENTS), current: z.string().max(5000) })), async (req, res) => {
  const c = must(await req.db.client.findFirst({ where: { id: req.params.clientId } }), 'That client');
  const i = await messageDraft(req.db, c, req.body.intent, { current: req.body.current });
  await req.db.aIInsight.update({ where: { id: i.id }, data: { status: 'expired' } });
  res.json({ text: i.draft.text });
});

const SEGMENTS = ['missing_checkin', 'active', 'online', 'program'];
router.post('/broadcast', body(z.object({ segment: z.enum(SEGMENTS), programId: z.string().max(64).optional(), body: z.string().trim().min(1).max(3000) })), async (req, res) => {
  const where = { status: { in: ['NEW', 'ACTIVE'] } };
  if (req.body.segment === 'online') where.mode = 'Online';
  if (req.body.segment === 'program') { if (!req.body.programId) throw badRequest('Pick a program.'); where.programId = req.body.programId; }
  const list = req.body.segment === 'missing_checkin' ? await missingCheckinClients(req.db) : await req.db.client.findMany({ where });
  for (const c of list) await sendMessage(req.db, { clientId: c.id, body: fillTemplate(req.body.body, c), senderUserId: req.auth.userId, senderRole: 'COACH' });
  res.json({ ok: true, sent: list.length });
});

router.get('/segments/counts', async (req, res) => {
  const clients = await req.db.client.findMany({ where: { status: { in: ['NEW', 'ACTIVE'] } }, select: { id: true, mode: true, programId: true, startedAt: true } });
  const programs = await req.db.program.findMany({ where: { archived: false }, select: { id: true, name: true } });
  res.json({
    missing_checkin: (await missingCheckinClients(req.db)).length,
    active: clients.length, online: clients.filter(c => c.mode === 'Online').length,
    programs: programs.map(p => ({ id: p.id, name: p.name, count: clients.filter(c => c.programId === p.id).length })).filter(p => p.count),
  });
});
