// Applies prisma/migrations/*/migration.sql in order and records them in `_prisma_migrations`
// exactly like `prisma migrate deploy` does (same table, same sha256 checksums). That means
// either tool can be used against the same database: this one works where Prisma's
// schema-engine binary can't be downloaded; `npx prisma migrate deploy` works everywhere else.
//
//   node scripts/migrate.js            apply pending migrations (MIGRATE_DATABASE_URL)
//   node scripts/migrate.js --reset    drop every table first (refused in production)
//   node scripts/migrate.js --test     use TEST_MIGRATE_DATABASE_URL
import 'dotenv/config';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

export async function migrate({ url, reset = false, log = console.log } = {}) {
  if (!url) throw new Error('Set MIGRATE_DATABASE_URL (or DATABASE_URL) first.');
  if (reset && process.env.NODE_ENV === 'production') throw new Error('Refusing to reset a production database.');
  const { poolConfigFromUrl } = await import('../server/db/connection.js');
  const cfg = { ...poolConfigFromUrl(url), multipleStatements: true };
  let conn;
  try { conn = await mariadb.createConnection(cfg); }
  catch (e) {
    if (e.errno !== 1049 || !/^[\w-]+$/.test(cfg.database)) throw e; // 1049 = unknown database
    // First deploy (e.g. Railway): create our own database on the server, then connect to it.
    const admin = await mariadb.createConnection({ ...cfg, database: undefined });
    try { await admin.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); } finally { await admin.end(); }
    log(`[migrate] created database ${cfg.database}`);
    conn = await mariadb.createConnection(cfg);
  }
  try {
    if (reset) {
      const tables = await conn.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()');
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const { t } of tables) await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      log(`[migrate] dropped ${tables.length} tables`);
    }
    await conn.query(`CREATE TABLE IF NOT EXISTS \`_prisma_migrations\` (
      \`id\` VARCHAR(36) NOT NULL, \`checksum\` VARCHAR(64) NOT NULL, \`finished_at\` DATETIME(3) NULL,
      \`migration_name\` VARCHAR(255) NOT NULL, \`logs\` TEXT NULL, \`rolled_back_at\` DATETIME(3) NULL,
      \`started_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), \`applied_steps_count\` INTEGER UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (\`id\`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const applied = new Map((await conn.query('SELECT migration_name, checksum, finished_at FROM `_prisma_migrations` WHERE rolled_back_at IS NULL')).map(r => [r.migration_name, r]));
    const dir = path.join(root, 'prisma', 'migrations');
    const names = readdirSync(dir).filter(n => existsSync(path.join(dir, n, 'migration.sql'))).sort();
    let count = 0;
    for (const name of names) {
      const sql = readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prev = applied.get(name);
      if (prev) {
        if (!prev.finished_at) throw new Error(`Migration ${name} started but never finished. Fix the database by hand, then delete its row from _prisma_migrations.`);
        if (prev.checksum !== checksum) log(`[migrate] warning: ${name} was edited after it was applied`);
        continue;
      }
      const id = randomUUID();
      await conn.query('INSERT INTO `_prisma_migrations` (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, NOW(3), 0)', [id, checksum, name]);
      await conn.query(sql);
      await conn.query('UPDATE `_prisma_migrations` SET finished_at = NOW(3), applied_steps_count = 1 WHERE id = ?', [id]);
      log(`[migrate] applied ${name}`);
      count++;
    }
    if (!count) log('[migrate] database is up to date');
    return count;
  } finally {
    await conn.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { config } = await import('../server/config.js');
  const url = args.has('--test') ? (process.env.TEST_MIGRATE_DATABASE_URL || process.env.TEST_DATABASE_URL) : config.migrateDatabaseUrl;
  migrate({ url, reset: args.has('--reset') }).then(() => process.exit(0), e => { console.error('[migrate] failed:', e.message); process.exit(1); });
}
