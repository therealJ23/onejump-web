import argon2 from 'argon2';

const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = plain => argon2.hash(plain, OPTIONS);

export async function verifyPassword(hash, plain) {
  if (!hash) return false;
  try { return await argon2.verify(hash, plain); } catch { return false; }
}

/** Constant-ish time for unknown emails so response time doesn't reveal which accounts exist. */
let dummy = null;
export async function burnTime(plain) {
  if (!dummy) dummy = await hashPassword('not-a-real-password-just-timing');
  await verifyPassword(dummy, plain);
}
