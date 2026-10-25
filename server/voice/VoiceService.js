// VoiceService: speech to text (and optional text to speech) behind one interface.
//   VOICE_PROVIDER = mock (default) | deepgram | openai
//   VOICE_TTS      = browser (default: the browser's own voice, free) | deepgram
// The mock returns a fixed transcript so tests and local development run without keys. In
// development it also accepts the browser's own live transcript as a hint, so talking to the
// app on your computer still does what you said.
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { startOfMonthUtc } from '../lib/time.js';
import { HttpError } from '../lib/errors.js';

export const MOCK_PHRASES = [
  'Who hasn’t checked in this week?',
  'Which clients are at risk of leaving?',
  'What was my revenue last month?',
  'Send Marcus the drafted message',
  'Add a lead: Jake, wants to get stronger for climbing, found me on Instagram',
  'Give me a summary of my business this month.',
];
// What the mock "hears" for client voice, by kind (when no hint is given).
export const MOCK_CLIENT_PHRASES = {
  voice_note: ['Hey, legs feel a lot better today. Can we move Friday’s session to 7 instead of 6?', 'Quick one: the gym was packed so I swapped the bench for dumbbells. Hope that’s okay.'],
  set_log: ['10 reps at 55', '8 at 135 pounds', '12 bodyweight'],
  food_log: ['Two eggs and toast', 'Chicken and rice with broccoli'],
};
// USD per minute of audio (check the providers' pricing pages when switching).
const PRICE_PER_MIN = { deepgram: 0.0077, openai: 0.006, mock: 0 };
const TTS_PRICE_PER_1K_CHARS = 0.03; // Aura-2
const FLUX_TTS_PRICE_PER_1K_CHARS = 0.045;

class MockVoice {
  constructor() { this.name = 'mock'; }
  async transcribe(buf, { hint, kind = 'ask' } = {}) {
    if (hint && String(hint).trim()) return { transcript: String(hint).trim().slice(0, 2000) };
    const list = MOCK_CLIENT_PHRASES[kind] || MOCK_PHRASES;
    const i = parseInt(createHash('sha1').update(buf).digest('hex').slice(0, 6), 16) % list.length;
    return { transcript: list[i] };
  }
}

class DeepgramVoice {
  constructor({ apiKey, model, fetchImpl = fetch }) { if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set'); this.name = 'deepgram'; this.key = apiKey; this.model = model; this.fetch = fetchImpl; }
  async transcribe(buf, { mimeType = 'audio/webm', lang = 'en', keyterms = [] } = {}) {
    // Spanish speakers often mix in English (names, exercises), so Spanish uses multilingual mode.
    // Key terms (client names, exercises, coaching words) help Nova-3 spell names right even when
    // they're said quickly or with an accent. If Deepgram won't take them, it's retried without.
    const base = `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(this.model)}&smart_format=true&punctuate=true&filler_words=false${lang === 'es' ? '&language=multi' : ''}`;
    const terms = /^nova-3/.test(this.model) ? keytermQuery(keyterms) : '';
    const call = url => this.fetch(url, { method: 'POST', headers: { Authorization: `Token ${this.key}`, 'Content-Type': mimeType.split(';')[0] }, body: buf, signal: AbortSignal.timeout(30000) });
    let res = await call(base + terms);
    if (!res.ok && terms && res.status === 400) res = await call(base);
    if (!res.ok) throw new Error(`Deepgram ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    return { transcript: json.results?.channels?.[0]?.alternatives?.[0]?.transcript || '', durationMs: json.metadata?.duration ? Math.round(json.metadata.duration * 1000) : null };
  }
  async speak(text, voice = config.voice.deepgramVoice) {
    const version = voice.startsWith('flux-') ? 'v2' : 'v1'; // Flux voices use the newer endpoint
    const res = await this.fetch(`https://api.deepgram.com/${version}/speak?model=${encodeURIComponent(voice)}&encoding=mp3`, {
      method: 'POST', headers: { Authorization: `Token ${this.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) { const why = (await res.text().catch(() => '')).slice(0, 200); console.error(`[voice] Deepgram TTS ${res.status} for ${voice}: ${why}`); throw new Error(`Deepgram TTS ${res.status}`); }
    return Buffer.from(await res.arrayBuffer());
  }
}

class OpenAIVoice {
  constructor({ apiKey, model, fetchImpl = fetch }) { if (!apiKey) throw new Error('OPENAI_API_KEY is not set'); this.name = 'openai'; this.key = apiKey; this.model = model; this.fetch = fetchImpl; }
  async transcribe(buf, { mimeType = 'audio/webm' } = {}) {
    const ext = /mp4|m4a|aac/.test(mimeType) ? 'm4a' : /ogg/.test(mimeType) ? 'ogg' : /wav/.test(mimeType) ? 'wav' : 'webm';
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mimeType.split(';')[0] }), `audio.${ext}`);
    form.append('model', this.model);
    if (this.model === 'whisper-1') form.append('response_format', 'verbose_json'); // includes the audio's duration
    const res = await this.fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${this.key}` }, body: form, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`OpenAI transcription ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    return { transcript: json.text || '', durationMs: json.duration ? Math.round(json.duration * 1000) : null };
  }
}

/** Deepgram key terms as query parameters (at most 50 short terms). */
export function keytermQuery(terms = []) {
  const seen = new Set(), out = [];
  for (const t of terms) {
    const v = String(t || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (v.length < 2 || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase()); out.push(v);
    if (out.length >= 50) break;
  }
  return out.map(t => `&keyterm=${encodeURIComponent(t)}`).join('');
}

/** Words worth recognizing for this workspace: the app's own words and every client's name. */
export const APP_TERMS = ['OneJump', 'Assist', 'check-in', 'check-ins', 'macros', 'RPE', 'deload', 'superset'];
export async function keytermsFor(db) {
  try {
    const clients = await db.client.findMany({ where: { status: { not: 'INACTIVE' } }, select: { name: true }, take: 40 });
    return [...clients.map(c => c.name), ...APP_TERMS];
  } catch { return APP_TERMS; }
}

/** The longest recording each kind accepts, in seconds (the browser stops on its own before this). */
export const MAX_SECONDS = { ask: 30, voice_note: 60, set_log: 10, food_log: 15 };
/**
 * A server-side lower bound for how long a recording is, so the monthly limit can't be dodged by
 * sending a small duration. WAV is exact; compressed audio assumes at most 128 kbps (browsers
 * record speech at 32–128 kbps), so a big file always counts as long.
 */
export function estimateDurationMs(buf, mimeType = '') {
  if (!buf?.length) return 0;
  if (/wav/.test(mimeType) && buf.length > 44 && buf.subarray(0, 4).toString() === 'RIFF') {
    const byteRate = buf.readUInt32LE(28);
    if (byteRate > 0) return Math.round(((buf.length - 44) / byteRate) * 1000);
  }
  return Math.round((buf.length * 8 / 128000) * 1000);
}

export function makeVoiceProvider(name = config.voice.provider, opts = {}) {
  if (name === 'deepgram') return new DeepgramVoice({ apiKey: config.voice.deepgramKey, model: config.voice.deepgramModel, ...opts });
  if (name === 'openai') return new OpenAIVoice({ apiKey: config.ai.openaiKey, model: config.voice.openaiTranscribeModel, ...opts });
  return new MockVoice();
}

let provider = null;
const active = () => { if (!provider) { try { provider = makeVoiceProvider(); } catch (e) { console.error('[voice] provider setup failed, using mock:', e.message); provider = new MockVoice(); } } return provider; };
export const setVoiceProviderForTests = p => { provider = p; };

/** Minutes of server-side speech-to-text used this month by one business. */
export async function minutesUsed(db) {
  const r = await db.voiceInteraction.aggregate({ where: { createdAt: { gte: startOfMonthUtc() } }, _sum: { durationMs: true } });
  return (r._sum.durationMs || 0) / 60000;
}
export async function assertUnderLimit(db) {
  const used = await minutesUsed(db);
  if (used >= config.voice.monthlyMinutes) throw new HttpError(429, 'Your monthly voice limit is reached. Typing still works, and dictation in text boxes still works. Voice resets on the 1st.', { code: 'voice_limit', usedMinutes: Math.round(used), limitMinutes: config.voice.monthlyMinutes });
  return used;
}

export const VoiceService = {
  get provider() { return active().name; },
  /**
   * Transcribes audio and records the request (VoiceInteraction + AIUsage). The audio itself is
   * not stored here; callers that keep audio (voice notes) store it themselves.
   * @param {*} db tenant client for the business (coach-level)
   */
  async transcribe(db, buf, { mimeType, durationMs = 0, hint = null, userId, clientId = null, kind = 'ask', lang = 'en', keyterms = null }) {
    const p = active();
    const estimate = estimateDurationMs(buf, mimeType), max = (MAX_SECONDS[kind] || 60) * 1000;
    if (estimate > max * 1.5 + 2000) throw new HttpError(400, `That recording is too long. Keep it under ${Math.round(max / 1000)} seconds.`, { code: 'too_long' });
    let out;
    // Key terms only matter for the real provider; the coach's own words get their client names.
    const terms = p.name === 'deepgram' ? (keyterms || (kind === 'ask' || !clientId ? await keytermsFor(db) : APP_TERMS)) : [];
    try { out = await p.transcribe(buf, { mimeType, hint, kind, lang, keyterms: terms }); }
    catch (e) { console.error(`[voice] ${p.name} failed:`, e.message); throw new HttpError(502, 'I couldn’t hear that clearly. Try again, or type instead.', { code: 'voice_failed' }); }
    // Bill the longest of: what the provider measured, what the browser reported, and the size-based estimate.
    const ms = Math.round(Math.max(0, Number(out.durationMs) || 0, Math.min(max * 1.5 + 2000, Number(durationMs) || 0), estimate));
    const costMicros = Math.round((ms / 60000) * (PRICE_PER_MIN[p.name] ?? 0) * 1e6);
    const transcript = String(out.transcript || '').trim();
    await db.voiceInteraction.create({ data: { userId, clientId, kind, transcript, durationMs: ms, provider: p.name, costMicros } });
    await db.aIUsage.create({ data: { kind: `voice_${kind}`, provider: p.name, model: p.name === 'deepgram' ? config.voice.deepgramModel : p.name === 'openai' ? config.voice.openaiTranscribeModel : 'mock-voice', seconds: Math.round(ms / 1000), costMicros } }).catch(() => null);
    return { transcript, durationMs: ms, provider: p.name };
  },
  /** Server text-to-speech (VOICE_TTS=deepgram). Returns MP3 bytes, or null for browser speech. */
  async speak(db, text, lang = 'en') {
    if (config.voice.tts !== 'deepgram' || !config.voice.deepgramKey) return null;
    const voice = lang === 'es' ? config.voice.deepgramVoiceEs : config.voice.deepgramVoice;
    const dg = active() instanceof DeepgramVoice ? active() : new DeepgramVoice({ apiKey: config.voice.deepgramKey, model: config.voice.deepgramModel });
    const audio = await dg.speak(String(text).slice(0, 1000), voice);
    await db.aIUsage.create({ data: { kind: 'voice_tts', provider: 'deepgram', model: voice, costMicros: Math.round(text.length / 1000 * (voice.startsWith('flux-') ? FLUX_TTS_PRICE_PER_1K_CHARS : TTS_PRICE_PER_1K_CHARS) * 1e6) } }).catch(() => null);
    return audio;
  },
};
