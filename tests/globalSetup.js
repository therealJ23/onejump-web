// Fresh test database for every run: drop everything, migrate, seed the two sample workspaces.
export default async function setup() {
  process.env.NODE_ENV = 'test';
  process.env.VITEST = 'true';
  const { migrate } = await import('../scripts/migrate.js');
  const { config } = await import('../server/config.js');
  await migrate({ url: config.migrateDatabaseUrl, reset: true, log: () => {} });
  const { seed } = await import('../prisma/seed.js');
  await seed({ log: () => {} });
  const { disconnectPrisma } = await import('../server/db/prisma.js');
  await disconnectPrisma();
}
