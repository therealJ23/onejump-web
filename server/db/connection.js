// Turns a mysql:// URL into a MariaDB-connector pool config (the driver Prisma's MySQL adapter uses).
import { config } from '../config.js';

/** @param {string} url */
export function poolConfigFromUrl(url, extra = {}) {
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  const u = new URL(url);
  /** @type {Record<string, any>} */
  const cfg = {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    connectionLimit: Number(u.searchParams.get('connection_limit') || 10),
    allowPublicKeyRetrieval: !config.databaseSsl,
    timezone: 'Z', // store and read times as UTC
    ...extra,
  };
  const sslParam = u.searchParams.get('ssl') || u.searchParams.get('ssl-mode') || u.searchParams.get('sslaccept');
  if (config.databaseSsl || (sslParam && !/^(false|disabled)$/i.test(sslParam))) {
    cfg.ssl = config.databaseCaCert ? { ca: config.databaseCaCert.replace(/\\n/g, '\n'), rejectUnauthorized: true } : { rejectUnauthorized: true };
  }
  return cfg;
}
