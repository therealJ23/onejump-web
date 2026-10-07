// The raw Prisma client. ONLY files inside server/db/ may import this module
// (enforced by scripts/lint.js). Routes use dbFor(session) from ./tenant.js.
import { PrismaClient } from '../../generated/prisma/index.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from '../config.js';
import { poolConfigFromUrl } from './connection.js';

/** @type {PrismaClient | null} */
let client = null;

export function getPrisma() {
  if (!client) {
    const adapter = new PrismaMariaDb(poolConfigFromUrl(config.databaseUrl));
    client = new PrismaClient({ adapter, log: config.isProd ? ['error'] : ['error', 'warn'] });
  }
  return client;
}

export async function disconnectPrisma() {
  if (client) { await client.$disconnect(); client = null; }
}

export { Prisma } from '../../generated/prisma/index.js';
