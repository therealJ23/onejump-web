// Gives an existing account OneJump admin access (the /admin page). Sign up first, then run:
//   npm run admin:grant -- you@example.com
// On Railway: service → ⋯ → "Run command" (or the Railway CLI: railway run npm run admin:grant -- you@example.com)
import 'dotenv/config';
import { users } from '../server/db/system.js';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(email)) { console.error('Usage: npm run admin:grant -- you@example.com'); process.exit(1); }
const u = await users.byEmail(email);
if (!u) { console.error(`No account for ${email}. Sign up at /signup first.`); process.exit(1); }
await users.update(u.id, { isPlatformAdmin: true });
console.log(`${email} is now a OneJump admin. Open /admin.`);
process.exit(0);
