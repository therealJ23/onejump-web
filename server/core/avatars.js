// Profile photos: one per user (coach or client), kept in private storage like progress photos
// and shown through short-lived signed links. Coaches see their clients' photos; clients see
// their coach's photo. Nobody else can reach them.
import { randomUUID } from 'node:crypto';
import { users } from '../db/system.js';
import { StorageService, sniffImage, stripJpegMetadata } from '../storage/StorageService.js';
import { badRequest } from '../lib/errors.js';

export const AVATAR_MAX_BYTES = 6 * 1024 * 1024;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
/** Profile photo links last an hour, so lists the app keeps open don't break after 5 minutes. */
const TTL = 3600;

/** A signed link for a stored photo key (null when there's no photo). */
export const photoUrl = key => (key ? StorageService.signedUrl(key, TTL) : Promise.resolve(null));

/** userId → signed photo link, for the users in the list that have a photo. */
export async function photoUrlsFor(userIds) {
  const keys = await users.avatarKeys(userIds);
  const out = new Map();
  await Promise.all([...keys].map(async ([id, key]) => out.set(id, await StorageService.signedUrl(key, TTL))));
  return out;
}

/** Saves a new profile photo for a user (replacing the old one) and returns its link. */
export async function saveAvatar(userId, buffer) {
  const type = sniffImage(buffer);
  if (type === 'image/heic') throw badRequest('Use a JPG or PNG photo. On iPhone, the app converts it for you.');
  if (!EXT[type]) throw badRequest('Use a JPG, PNG or WebP photo.');
  let bytes = buffer;
  if (type === 'image/jpeg') {
    bytes = stripJpegMetadata(buffer); // no location or camera details in a profile photo
    if (!bytes) throw badRequest('That photo couldn’t be read. Try another one.');
  }
  const key = `avatars/${userId}/${randomUUID()}.${EXT[type]}`;
  await StorageService.put(key, bytes, type);
  const old = await users.avatarKey(userId);
  await users.setAvatar(userId, key);
  if (old) await StorageService.remove(old).catch(() => null);
  return StorageService.signedUrl(key, TTL);
}

export async function removeAvatar(userId) {
  const old = await users.avatarKey(userId);
  if (!old) return;
  await users.setAvatar(userId, null);
  await StorageService.remove(old).catch(() => null);
}

/** clientId → signed photo link, for a workspace's clients who have a photo (tenant-scoped db). */
export async function clientPhotoUrls(db, clientIds = null) {
  const rows = await db.client.findMany({ where: { userId: { not: null }, ...(clientIds ? { id: { in: [...new Set(clientIds)] } } : {}) }, select: { id: true, userId: true } });
  const byUser = await photoUrlsFor(rows.map(r => r.userId));
  const out = new Map();
  for (const r of rows) if (byUser.has(r.userId)) out.set(r.id, byUser.get(r.userId));
  return out;
}

/** Adds `photoUrl` to each row that has an `id` (a client id). */
export async function withClientPhotos(db, rows, idKey = 'id') {
  if (!rows?.length) return rows;
  const urls = await clientPhotoUrls(db, rows.map(r => r[idKey]).filter(Boolean));
  for (const r of rows) r.photoUrl = urls.get(r[idKey]) || null;
  return rows;
}
