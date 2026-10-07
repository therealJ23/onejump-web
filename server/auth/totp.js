// TOTP two-step login for coaches (RFC 6238, 30-second steps, 6 digits).
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

export function newSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}
function totp(secret, label = 'OneJump') {
  return new OTPAuth.TOTP({ issuer: 'OneJump', label, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
}
/** Accepts the current code and one step either side (clock drift). */
export function verifyCode(secret, code) {
  const clean = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  return totp(secret).validate({ token: clean, window: 1 }) !== null;
}
export function currentCode(secret) { return totp(secret).generate(); }
export async function setupPayload(secret, email) {
  const uri = totp(secret, email).toString();
  return { uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }), secret };
}
