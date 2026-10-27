// Turns a WebM/Opus voice note (what Chrome, Edge and Firefox record) into a WAV file the
// iPhone can play. iOS's audio player can't open WebM, so the iPhone app asks for
// `?format=wav` and gets this instead. Pure JavaScript + WebAssembly (libopus), no ffmpeg.
import { OpusDecoder } from 'opus-decoder';

const OUT_RATE = 24000; // speech sounds the same at 24 kHz and the file is half the size
const MAX_SECONDS = 600;

// EBML element IDs (with their length marker, as they appear in the file).
const MASTER = new Set([
  0x18538067, // Segment
  0x1f43b675, // Cluster
  0x1654ae6b, // Tracks
  0xae, // TrackEntry
  0xa0, // BlockGroup
  0xe1, // Audio
]);
const ID = { simpleBlock: 0xa3, block: 0xa1, codecId: 0x86, codecPrivate: 0x63a2, trackNumber: 0xd7, trackType: 0x83 };

/** Reads an EBML variable-length number. `keepMarker` for IDs. Returns null if it runs off the end. */
function vint(buf, pos, keepMarker) {
  if (pos >= buf.length) return null;
  const first = buf[pos];
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8 || pos + len > buf.length) return null;
  let value = keepMarker ? first : first & (0xff >> len);
  let allOnes = value === (0xff >> len);
  for (let i = 1; i < len; i++) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) allOnes = false;
  }
  return { value, len, unknown: !keepMarker && allOnes };
}

/** True if the first bytes are a WebM/Matroska file. */
export const isWebm = buf => !!buf && buf.length > 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;

/**
 * Pulls the Opus packets out of a WebM file (MediaRecorder output: one audio track,
 * clusters of SimpleBlocks, often with unknown sizes).
 * @returns {{ packets: Uint8Array[], channels: number, preSkip: number }}
 */
export function demuxWebmOpus(buf) {
  const tracks = new Map(); // trackNumber → { codec, priv, type }
  let current = null;
  const blocks = [];
  let pos = 0;
  while (pos < buf.length) {
    const id = vint(buf, pos, true);
    if (!id) break;
    const size = vint(buf, pos + id.len, false);
    if (!size) break;
    const start = pos + id.len + size.len;
    if (MASTER.has(id.value)) {
      if (id.value === 0xae) { current = {}; tracks.set(Symbol('pending'), current); }
      pos = start; // step inside
      continue;
    }
    if (size.unknown) break; // only masters may have unknown size
    const end = Math.min(buf.length, start + size.value);
    const body = buf.subarray(start, end);
    if (id.value === ID.simpleBlock || id.value === ID.block) blocks.push(body);
    else if (current && id.value === ID.codecId) current.codec = body.toString('latin1');
    else if (current && id.value === ID.codecPrivate) current.priv = Buffer.from(body);
    else if (current && id.value === ID.trackNumber) current.number = body.reduce((n, b) => n * 256 + b, 0);
    else if (current && id.value === ID.trackType) current.type = body[0];
    pos = end;
  }
  const opus = [...tracks.values()].find(t => t.codec === 'A_OPUS');
  if (!opus) throw new Error('No Opus audio in this file');
  const packets = [];
  for (const b of blocks) {
    const tn = vint(b, 0, false);
    if (!tn || tn.value !== opus.number) continue;
    const flags = b[tn.len + 2];
    if (flags & 0x06) continue; // laced blocks don't happen for MediaRecorder Opus
    const frame = b.subarray(tn.len + 3);
    if (frame.length) packets.push(new Uint8Array(frame));
  }
  const head = opus.priv && opus.priv.subarray(0, 8).toString('latin1') === 'OpusHead' ? opus.priv : null;
  return { packets, channels: head ? head[9] || 1 : 1, preSkip: head ? head.readUInt16LE(10) : 312 };
}

/** 16-bit mono PCM WAV. */
function wav(samples, rate) {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + samples.length * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return out;
}

/** WebM/Opus bytes → WAV bytes (mono, 24 kHz). Throws if the file isn't WebM/Opus. */
export async function webmToWav(buf) {
  if (!isWebm(buf)) throw new Error('Not a WebM file');
  const { packets, channels, preSkip } = demuxWebmOpus(buf);
  if (!packets.length) throw new Error('No audio in this file');
  const decoder = new OpusDecoder({ channels: Math.min(2, channels), preSkip: 0 });
  await decoder.ready;
  try {
    const { channelData, samplesDecoded } = decoder.decodeFrames(packets);
    const n = Math.min(samplesDecoded, MAX_SECONDS * 48000);
    const ratio = 48000 / OUT_RATE;
    const outLen = Math.max(0, Math.floor((n - preSkip) / ratio));
    const mono = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      let sum = 0;
      for (let k = 0; k < ratio; k++) {
        const s = preSkip + i * ratio + k;
        for (const ch of channelData) sum += ch[s] || 0;
      }
      mono[i] = sum / (ratio * channelData.length);
    }
    return wav(mono, OUT_RATE);
  } finally {
    decoder.free();
  }
}

const converting = new Map(); // key → Promise, so two taps don't convert twice

/**
 * A 5-minute link to a voice note. With `format: 'wav'` (the iPhone app), a WebM recording is
 * converted once and the WAV is kept next to it (`<key>.wav`) for next time. Anything else
 * (MP4/AAC from Safari, WAV, MP3) is already playable and comes back as it is.
 * Only call after the caller's access to the message was checked.
 */
export async function playableAudioUrl(audioKey, { format } = {}) {
  const { StorageService } = await import('../storage/StorageService.js');
  if (format !== 'wav') return StorageService.signedUrl(audioKey);
  const wavKey = `${audioKey}.wav`;
  let job = converting.get(audioKey);
  if (!job) {
    job = (async () => {
      if (await StorageService.get(wavKey)) return wavKey;
      const original = await StorageService.get(audioKey);
      if (!original || !isWebm(original)) return audioKey;
      try {
        await StorageService.put(wavKey, await webmToWav(original), 'audio/wav');
        return wavKey;
      } catch (e) {
        console.warn('[voice] WebM → WAV failed, sending the original:', e.message);
        return audioKey;
      }
    })().finally(() => converting.delete(audioKey));
    converting.set(audioKey, job);
  }
  return StorageService.signedUrl(await job);
}
