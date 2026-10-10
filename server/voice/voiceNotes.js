// Voice notes (Pro): up to 60 seconds of audio in the client ↔ coach chat. The audio is kept
// (private, voice/{businessId}/{uuid}, 5-minute signed links) because the person chose to send
// it; the transcript becomes the message body and the coach also gets a one-line Assist summary.
// SafetyGuard runs on every transcript: pain or injury flags the coach.
import { randomUUID } from 'node:crypto';
import { VoiceService, assertUnderLimit } from './VoiceService.js';
import { StorageService } from '../storage/StorageService.js';
import { sendMessage, notify, clientEvent } from '../core/messaging.js';
import { checkText } from '../ai/safety.js';
import { raiseFlag } from '../nutrition/flags.js';
import { AI } from '../ai/AIService.js';
import { HttpError } from '../lib/errors.js';

export const VOICE_NOTE_MAX_SECONDS = 60;
export const fmtDuration = s => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, '0')}`;

/**
 * Runs SafetyGuard on something a client said by voice and alerts the coach when it mentions
 * pain, injury or a medical topic. Also raises a private nutrition-language flag if needed.
 * @param {*} coach coach-level tenant client
 */
export async function guardClientTranscript(coach, { client, businessId, text, source, sourceId = null, link = null }) {
  const s = checkText(text);
  if (s.flagged) {
    await notify(coach, { kind: 'checkin', title: `${client.name} mentioned ${s.term} in a ${source === 'voice_note' ? 'voice note' : 'voice entry'}`, body: `“${String(text).slice(0, 120)}” · review first`, link: link || `/app/clients/${client.id}` });
    await clientEvent(coach, client.id, 'safety_flag', { source, term: s.term });
  }
  if (sourceId) await raiseFlag(coach, { clientId: client.id, clientName: client.name, businessId, sourceType: source, sourceId, text });
  return s;
}

/**
 * Transcribes and stores a voice note, then posts it in the thread.
 * @param {*} coach coach-level tenant client (VoiceInteraction and AIUsage are coach-only)
 * @param {*} db the caller's own tenant client (client- or coach-scoped) for the message itself
 */
export async function sendVoiceNote({ coach, db, businessId, client, senderRole, senderUserId, buf, mimeType, durationMs, hint }) {
  try { await assertUnderLimit(coach); }
  catch (e) {
    if (senderRole === 'CLIENT') throw new HttpError(429, 'Voice notes aren’t available right now. You can type your message instead.', { code: 'voice_limit' });
    throw e;
  }
  const ms = Math.max(0, Math.min(VOICE_NOTE_MAX_SECONDS * 1000 + 1500, Number(durationMs) || 0));
  const v = await VoiceService.transcribe(coach, buf, { mimeType, durationMs: ms, hint, userId: senderUserId, clientId: client.id, kind: 'voice_note' });
  const durationS = Math.max(1, Math.round((v.durationMs || ms) / 1000));
  const audioKey = `voice/${businessId}/${randomUUID()}`;
  await StorageService.put(audioKey, buf, mimeType);
  let summary = null;
  if (senderRole === 'CLIENT' && v.transcript) {
    try { summary = (await AI.summarizeVoiceNote(v.transcript, { db: coach })).data.summary; } catch { summary = null; }
  }
  const body = v.transcript || `Voice note (${fmtDuration(durationS)})`;
  let m;
  try { m = await sendMessage(db, { clientId: client.id, body, senderUserId, senderRole, audioKey, durationS, transcriptSummary: summary }); }
  catch (e) { await StorageService.remove(audioKey).catch(() => null); throw e; }
  let safety = { flagged: false, term: null };
  if (senderRole === 'CLIENT') {
    await clientEvent(coach, client.id, 'message');
    safety = await guardClientTranscript(coach, { client, businessId, text: v.transcript, source: 'voice_note', sourceId: m.id, link: `/app/inbox/${client.id}` });
    if (!safety.flagged) await notify(coach, { kind: 'message', title: `${client.name} sent a voice note (${fmtDuration(durationS)})`, body: summary || body.slice(0, 120), link: `/app/inbox/${client.id}` });
  }
  return { message: m, transcript: v.transcript, safety };
}

/** Shapes a message for either side. The Assist summary and the health flag are coach-only. */
export function voiceFields(m, { coach = false } = {}) {
  if (!m.audioKey) return {};
  const out = { voice: { durationS: m.durationS || 0 } };
  if (coach && m.senderRole === 'CLIENT') {
    const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    // A summary that just repeats a short note adds nothing.
    out.voice.summary = m.transcriptSummary && norm(m.transcriptSummary) !== norm(m.body) ? m.transcriptSummary : null;
    const s = checkText(m.body);
    if (s.flagged) out.voice.flag = s.term;
  }
  return out;
}
