// Private file storage for progress photos and logos.
// - local (development): files under var/uploads, served only through short-lived signed URLs
// - r2 (production): a private Cloudflare R2 bucket, presigned GET URLs that expire in 5 minutes
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { hmac, safeEqual } from '../lib/crypto.js';

const TTL_SECONDS = 300;
let s3 = null;

async function r2() {
  if (!s3) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    s3 = new S3Client({ region: 'auto', endpoint: `https://${config.storage.r2AccountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.storage.r2AccessKeyId, secretAccessKey: config.storage.r2Secret } });
  }
  return s3;
}
const useR2 = () => config.storage.provider === 'r2' && config.storage.r2AccessKeyId;
const localPath = key => {
  const p = path.resolve(config.storage.localDir, key);
  if (!p.startsWith(path.resolve(config.storage.localDir))) throw new Error('Bad key');
  return p;
};

export const StorageService = {
  provider: () => (useR2() ? 'r2' : 'local'),

  async put(key, buffer, contentType) {
    if (useR2()) {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      await (await r2()).send(new PutObjectCommand({ Bucket: config.storage.r2Bucket, Key: key, Body: buffer, ContentType: contentType }));
      return key;
    }
    const p = localPath(key);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, buffer);
    writeFileSync(p + '.type', contentType);
    return key;
  },

  /** A URL that works for 5 minutes. Only call after the caller's access to the file was checked. */
  async signedUrl(key) {
    if (useR2()) {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      return getSignedUrl(await r2(), new GetObjectCommand({ Bucket: config.storage.r2Bucket, Key: key }), { expiresIn: TTL_SECONDS });
    }
    const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    const sig = hmac(`${key}|${exp}`, 'file');
    return `/files/${encodeURIComponent(key)}?exp=${exp}&sig=${sig}`;
  },

  /** Express handler for local signed URLs. */
  serveLocal(req, res) {
    const key = decodeURIComponent(req.params.key || '');
    const exp = Number(req.query.exp), sig = String(req.query.sig || '');
    if (!key || !exp || exp < Date.now() / 1000 || !safeEqual(sig, hmac(`${key}|${exp}`, 'file'))) return res.status(403).send('Link expired');
    const p = localPath(key);
    if (!existsSync(p)) return res.status(404).send('Not found');
    res.set('Content-Type', existsSync(p + '.type') ? readFileSync(p + '.type', 'utf8') : 'application/octet-stream');
    res.set('Cache-Control', 'private, max-age=300');
    res.send(readFileSync(p));
  },

  async remove(key) {
    if (useR2()) {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await (await r2()).send(new DeleteObjectCommand({ Bucket: config.storage.r2Bucket, Key: key }));
      return;
    }
    const p = localPath(key);
    if (existsSync(p)) unlinkSync(p);
    if (existsSync(p + '.type')) unlinkSync(p + '.type');
  },
};

/** Checks the first bytes so a renamed file can't pass as an image. */
export function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.subarray(4, 12).toString().startsWith('ftyphei') || buf.subarray(4, 12).toString().startsWith('ftypmif') || buf.subarray(4, 12).toString().startsWith('ftypheic')) return 'image/heic';
  if (buf.subarray(0, 6).toString() === 'GIF87a' || buf.subarray(0, 6).toString() === 'GIF89a') return 'image/gif';
  return null;
}
