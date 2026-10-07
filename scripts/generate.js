// Runs `prisma generate`. Prisma 7 generates the client with a WASM engine, but its CLI
// still checks for the schema-engine binary on start. Where binaries.prisma.sh is
// unreachable (some sandboxes), point that check at a stub so generation still works.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const env = { ...process.env };
const probe = spawnSync('npx', ['prisma', 'version'], { env, encoding: 'utf8', timeout: 120000 });
if (probe.status !== 0 && /binaries\.prisma\.sh|checksum/i.test((probe.stderr || '') + (probe.stdout || ''))) {
  env.PRISMA_SCHEMA_ENGINE_BINARY = existsSync('/bin/true') ? '/bin/true' : process.execPath;
  env.PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = '1';
  console.log('[generate] Prisma engine download blocked here; using the WASM generator only.');
}
const r = spawnSync('npx', ['prisma', 'generate'], { env, stdio: 'inherit', timeout: 300000 });
process.exit(r.status ?? 1);
