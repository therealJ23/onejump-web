// Starts the OneJump server (and the background jobs).
import { config, assertProductionConfig } from './config.js';
import { createApp } from './app.js';
import { startJobs } from './jobs/nightly.js';
import { closeDb as disconnectPrisma } from './db/system.js';

assertProductionConfig();
// Bring the database up to date before serving anything (safe to run on every start: it only
// applies migrations that haven't run yet). Hosts can also run `npm run db:migrate` before deploys.
if (config.isProd && process.env.MIGRATE_ON_START !== 'false') {
  const { migrate } = await import('../scripts/migrate.js');
  try { await migrate({ url: config.migrateDatabaseUrl }); }
  catch (e) { console.error('[migrate] failed, not starting:', e.message); process.exit(1); }
}
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
