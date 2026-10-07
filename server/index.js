// Starts the OneJump server (and the background jobs).
import { config, assertProductionConfig } from './config.js';
import { createApp } from './app.js';
import { startJobs } from './jobs/nightly.js';
import { closeDb as disconnectPrisma } from './db/system.js';

assertProductionConfig();
const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`OneJump running at ${config.appUrl} (AI: ${config.ai.provider}, payments: ${config.payments.provider}, email: ${config.email.provider})`);
});
const jobs = config.jobsEnabled ? startJobs() : null;

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  jobs?.stop();
  server.close(async () => { await disconnectPrisma(); process.exit(0); });
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
