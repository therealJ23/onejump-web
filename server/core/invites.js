// Client invites: a single-use link (14 days) to the coach's branded app.
import { config } from '../config.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { EmailService } from '../email/EmailService.js';
import { memberships } from '../db/system.js';

export async function createInvite(db, client, { send = true } = {}) {
  const token = randomToken();
  await db.invite.create({ data: { clientId: client.id, email: client.email || null, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 14 * 864e5) } });
  const link = `${config.appUrl}/invite/${token}`;
  let emailed = false;
  if (send && client.email) {
    const b = await db.business.findFirst({ select: { id: true, name: true } });
    const coach = await memberships.coachNameFor(b.id);
    await EmailService.sendInvite({ to: client.email, clientName: client.name, coachName: coach?.name || b.name, businessName: b.name, link });
    emailed = true;
  }
  return { link, emailed };
}

/** Coaching plan client limits. Going over never locks existing clients out; it only blocks new invites. */
export const CLIENT_CAPS = { TRIAL: 50, STARTER: 15, PRO: 50, STUDIO: 150 };
