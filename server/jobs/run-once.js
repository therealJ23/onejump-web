// Runs the nightly radar + automations for every workspace right now: `npm run jobs:nightly`
import { hourly, processJobs } from './nightly.js';
import { closeDb as disconnectPrisma } from '../db/system.js';

const r = await hourly(new Date(), { forceRadar: true });
const j = await processJobs();
console.log(`[jobs] ${r.businesses} workspaces · radar ${r.radar} · automation runs ${r.automationRuns} · queued jobs ${j}`);
await disconnectPrisma();
process.exit(0);
