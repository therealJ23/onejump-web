// Chat photos, videos, GIFs and emoji reactions, for both sides of a coach–client thread.
//  - Photos (JPEG, PNG, WebP; JPEG metadata such as GPS is stripped) and videos (MP4/MOV, up to
//    3 minutes / 60 MB) go to private storage under chat/<business>/; threads get 1-hour links.
//  - GIFs come from GIPHY through /api/gifs (the key stays on the server). Only GIPHY's own media
//    hosts are accepted, so a message can't point at an arbitrary URL.
//  - One reaction per person per message; sending another replaces it, sending none removes it.
import { randomUUID } from 'node:crypto';
import { badRequest, must } from '../lib/errors.js';
import { StorageService, sniffImage, sniffVideo, stripJpegMetadata } from '../storage/StorageService.js';

export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const REACTIONS = ['👍', '❤️', '🔥', '💪', '😂', '🙌', '👏', '😮', '😢', '🎉', '✅', '💯'];
const GIF_HOST = /^https:\/\/(media\d*|i)\.giphy\.com\//;

/** Validates an uploaded photo or video and stores it. Returns the attachment to save on the message. */
export async function storeUpload(businessId, file, { durationS = null, width = null, height = null } = {}) {
  if (!file?.buffer?.length) throw badRequest('Choose a photo or video first.');
  const img = sniffImage(file.buffer);
  if (img && ['image/jpeg', 'image/png', 'image/webp'].includes(img)) {
    if (file.buffer.length > MAX_IMAGE_BYTES) throw badRequest('That photo is too big (12 MB max).');
    const buf = img === 'image/jpeg' ? stripJpegMetadata(file.buffer) : file.buffer;
    const key = `chat/${businessId}/${randomUUID()}.${img === 'image/png' ? 'png' : img === 'image/webp' ? 'webp' : 'jpg'}`;
    await StorageService.put(key, buf, img);
    return { kind: 'image', key, width: num(width), height: num(height) };
  }
  if (img) throw badRequest('Send photos as JPEG, PNG or WebP.');
  const vid = sniffVideo(file.buffer);
  if (vid) {
    if (file.buffer.length > MAX_VIDEO_BYTES) throw badRequest('That video is too big (60 MB max). Trim it and try again.');
    const d = num(durationS);
    if (d && d > 185) throw badRequest('Videos can be up to 3 minutes.');
    const key = `chat/${businessId}/${randomUUID()}.${vid === 'video/quicktime' ? 'mov' : 'mp4'}`;
    await StorageService.put(key, file.buffer, vid);
    return { kind: 'video', key, durationS: d, width: num(width), height: num(height) };
  }
  throw badRequest('That file isn’t a photo or video I can send.');
}

/** A GIF picked from the GIPHY search. */
export function gifAttachment(g = {}) {
  const url = String(g.url || '');
  if (!GIF_HOST.test(url)) throw badRequest('That GIF can’t be sent.');
  const preview = String(g.previewUrl || '');
  return { kind: 'gif', url: url.slice(0, 500), previewUrl: GIF_HOST.test(preview) ? preview.slice(0, 500) : null, width: num(g.width), height: num(g.height), title: String(g.title || '').slice(0, 120), giphyId: String(g.id || '').slice(0, 64) };
}

const num = v => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 && n < 100000 ? n : null; };

/** What a thread shows for a message's attachments: fresh links for stored files. */
export async function shapeAttachments(m) {
  const list = Array.isArray(m.attachments) ? m.attachments : [];
  return Promise.all(list.map(async a => ({
    kind: a.kind,
    url: a.key ? await StorageService.signedUrl(a.key, 3600) : a.url,
    previewUrl: a.previewUrl || null,
    width: a.width || null, height: a.height || null, durationS: a.durationS || null, title: a.title || null,
  })));
}

/** Reactions for a list of messages, grouped: { messageId: [{ emoji, count, mine }] }. */
export async function reactionsFor(db, messageIds, userId) {
  if (!messageIds.length) return {};
  const rows = await db.messageReaction.findMany({ where: { messageId: { in: messageIds } }, select: { messageId: true, userId: true, emoji: true } });
  const out = {};
  for (const r of rows) {
    const list = out[r.messageId] ||= [];
    const e = list.find(x => x.emoji === r.emoji) || (list.push({ emoji: r.emoji, count: 0, mine: false }), list.at(-1));
    e.count++; if (r.userId === userId) e.mine = true;
  }
  return out;
}

/** Sets (or clears, with emoji = null) the person's reaction on a message in this thread. */
export async function react(db, { messageId, clientId, userId, emoji }) {
  const m = must(await db.message.findFirst({ where: { id: messageId, ...(clientId ? { clientId } : {}) }, select: { id: true, clientId: true } }), 'That message');
  if (emoji == null) { await db.messageReaction.deleteMany({ where: { messageId: m.id, userId } }); return { emoji: null }; }
  if (!REACTIONS.includes(emoji)) throw badRequest('Pick one of the reactions.');
  const existing = await db.messageReaction.findFirst({ where: { messageId: m.id, userId } });
  if (existing) await db.messageReaction.update({ where: { id: existing.id }, data: { emoji } });
  else await db.messageReaction.create({ data: { messageId: m.id, clientId: m.clientId, userId, emoji } });
  return { emoji };
}

/** One line for the inbox list and notifications. */
export function previewText(m) {
  const a = Array.isArray(m.attachments) ? m.attachments[0] : null;
  const label = a ? { image: '📷 Photo', video: '🎥 Video', gif: 'GIF' }[a.kind] : null;
  if (label && m.body) return `${label} · ${m.body}`;
  return label || m.body || '';
}
