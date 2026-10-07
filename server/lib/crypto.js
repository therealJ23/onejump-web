import { randomBytes, createHash, createCipheriv, createDecipheriv, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { config } from '../config.js';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = s => createHash('sha256').update(String(s)).digest('hex');
export const hmac = (s, purpose = 'sign') => createHmac('sha256', `${purpose}:${config.sessionSecret}`).update(String(s)).digest('base64url');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

let key = null;
function encKey() {
  if (!key) key = scryptSync(config.sessionSecret, 'onejump-field-encryption', 32);
  return key;
}
/** AES-256-GCM for small secrets at rest (TOTP seeds). */
export function encrypt(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
export function decrypt(token) {
  const buf = Buffer.from(String(token), 'base64url');
  const d = createDecipheriv('aes-256-gcm', encKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}
