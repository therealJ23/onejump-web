import { businesses, users } from '../server/db/system.js';
import { dbFor } from '../server/db/tenant.js';

export async function fixtures() {
  const A = await businesses.publicBySlug('dani');
  const B = await businesses.publicBySlug('northside');
  const dani = await users.byEmail('dani@reyesstrength.com');
  const mikeUser = await users.byEmail('mike.t@example.com');
  const dbA = dbFor({ businessId: A.id, role: 'OWNER', userId: dani.id });
  const dbB = dbFor({ businessId: B.id, role: 'OWNER' });
  const mike = await dbA.client.findFirst({ where: { userId: mikeUser.id } });
  const dbMike = dbFor({ businessId: A.id, role: 'CLIENT', clientId: mike.id, userId: mikeUser.id });
  return { A, B, dani, mikeUser, mike, dbA, dbB, dbMike };
}
export const DEMO_PASSWORD = 'onejump-demo-2026';
