// Runs the nightly radar + automations for every workspace right now: `npm run jobs:nightly`
import { hourly, processJobs } from './nightly.js';
import { disconnectPrisma } from '../db/prisma.js';

const r = await hourly(new Date(), { forceRadar: true });
const j = await processJobs();
console.log(`[jobs] ${r.businesses} workspaces · radar ${r.radar} · automation runs ${r.automationRuns} · queued jobs ${j}`);
await disconnectPrisma();
process.exit(0);
