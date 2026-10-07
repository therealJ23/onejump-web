// Tenant isolation for MySQL (which has no row-level security).
//
// dbFor(session) is the ONLY way routes and services get a database client. Every
// query it runs is rewritten so that:
//   - reads and writes only ever touch rows where businessId = session.businessId
//   - creates are stamped with the session's businessId (a request can't choose it)
//   - updates can't move a row to another business
//   - a CLIENT session only sees and writes its own rows (clientId = session.clientId)
//   - a CLIENT session can't touch coach-only tables at all
//   - raw SQL is not available
// tests/isolation.test.js proves these rules against a real MySQL database.
import { getPrisma } from './prisma.js';

/** Tables with no businessId that are never reachable from a tenant client. */
const SYSTEM_MODELS = new Set(['User', 'MagicLink', 'UserSession', 'Job']);
/** Rows with businessId = null are OneJump's shared library: readable by everyone, writable by no tenant. */
const SHARED_MODELS = new Set(['Exercise']);
/** Tables whose rows belong to one client: a CLIENT session is filtered to clientId = its own. */
const CLIENT_OWNED = new Set(['CheckIn', 'WorkoutSession', 'WorkoutAssignment', 'Measurement', 'ProgressPhoto', 'Thread', 'Message', 'Payment', 'Subscription']);
/** Coach-only tables: a CLIENT session can't read or write them. */
const CLIENT_DENIED = new Set(['Lead', 'AIInsight', 'Automation', 'AutomationRun', 'AuditLog', 'ClientEvent', 'Note', 'Invite', 'Notification', 'AIUsage', 'SupportRequest', 'Membership']);
/** What a CLIENT session may change. Everything else is read-only for clients. */
const CLIENT_WRITABLE = new Set(['CheckIn', 'WorkoutSession', 'WorkoutAssignment', 'Measurement', 'ProgressPhoto', 'Message', 'Thread', 'Client']);

const READS = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']);
const CREATES = new Set(['create', 'createMany', 'createManyAndReturn']);
const UNIQUE_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert']);
const RAW = new Set(['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe', '$runCommandRaw']);

export class TenantAccessError extends Error {
  constructor(message) { super(message); this.name = 'TenantAccessError'; this.status = 403; }
}

/**
 * @typedef {{ businessId: string, role: 'OWNER'|'COACH'|'CLIENT', userId?: string|null, clientId?: string|null }} TenantSession
 */

function withAnd(where, condition) {
  const w = { ...(where || {}) };
  const existing = w.AND == null ? [] : Array.isArray(w.AND) ? w.AND : [w.AND];
  w.AND = [...existing, condition];
  return w;
}
function stripTenantKeys(data, isClient) {
  if (!data || typeof data !== 'object') return data;
  const d = { ...data };
  delete d.businessId;
  delete d.business;
  if (isClient) { delete d.clientId; delete d.client; }
  return d;
}

/** @param {TenantSession} s */
function rewrite(s, model, operation, args) {
  const isClient = s.role === 'CLIENT';
  const bid = s.businessId;
  args = { ...(args || {}) };

  if (SYSTEM_MODELS.has(model)) throw new TenantAccessError(`${model} is not available to tenant code`);
  if (isClient && CLIENT_DENIED.has(model)) throw new TenantAccessError(`Clients can't access ${model}`);
  if (isClient && !READS.has(operation) && !CLIENT_WRITABLE.has(model)) throw new TenantAccessError(`Clients can't change ${model}`);

  // Business: the tenant row itself. No businessId column; filter by id. Asking for any other
  // id matches nothing (AND), it never silently returns or updates the session's own row.
  if (model === 'Business') {
    if (CREATES.has(operation) || operation.startsWith('delete') || operation === 'upsert') throw new TenantAccessError('Businesses are created and deleted by the system');
    if (isClient && !READS.has(operation)) throw new TenantAccessError('Clients can\'t change the business');
    args.where = withAnd(args.where, { id: bid });
    if (args.where.id == null) args.where.id = bid;
    if (args.data) { args.data = { ...args.data }; delete args.data.id; }
    return args;
  }

  // Client: a CLIENT session only sees its own client row; can't create clients.
  if (model === 'Client') {
    if (isClient && (CREATES.has(operation) || operation.startsWith('delete') || operation === 'upsert')) throw new TenantAccessError('Clients can\'t create or delete client records');
    if (CREATES.has(operation)) return stampCreate(args, operation, { businessId: bid }, false);
    args.where = { ...(args.where || {}), businessId: bid };
    if (isClient) {
      args.where = withAnd(args.where, { id: s.clientId });
      if (args.where.id == null && UNIQUE_OPS.has(operation)) args.where.id = s.clientId;
    }
    if (operation === 'upsert') { args.create = { ...args.create, businessId: bid }; args.update = stripTenantKeys(args.update, false); }
    if (args.data) {
      args.data = stripTenantKeys(args.data, false);
      if (isClient) args.data = pick(args.data, ['lastActiveAt', 'name', 'phone']);
    }
    return args;
  }

  // Shared library rows (businessId null) are readable, never writable by a tenant.
  if (SHARED_MODELS.has(model)) {
    if (READS.has(operation)) { args.where = withAnd(args.where, { OR: [{ businessId: bid }, { businessId: null }] }); return args; }
  }

  const ownsByClient = isClient && CLIENT_OWNED.has(model);
  const scope = where => {
    const w = { ...(where || {}), businessId: bid };
    return ownsByClient ? withAnd(w, { clientId: s.clientId }) : w;
  };
  if (CREATES.has(operation)) return stampCreate(args, operation, ownsByClient ? { businessId: bid, clientId: s.clientId } : { businessId: bid }, isClient);
  if (operation === 'upsert') {
    args.where = scope(args.where);
    args.create = { ...stripTenantKeys(args.create, isClient), businessId: bid, ...(ownsByClient ? { clientId: s.clientId } : {}) };
    args.update = stripTenantKeys(args.update, isClient);
    return args;
  }
  args.where = scope(args.where);
  if (args.data) args.data = stripTenantKeys(args.data, isClient);
  return args;
}

function stampCreate(args, operation, stamp, isClient) {
  if (operation === 'create') args.data = { ...stripTenantKeys(args.data, isClient), ...stamp };
  else args.data = (Array.isArray(args.data) ? args.data : [args.data]).map(d => ({ ...stripTenantKeys(d, isClient), ...stamp }));
  return args;
}
function pick(o, keys) { const r = {}; for (const k of keys) if (k in o) r[k] = o[k]; return r; }

const cache = new Map();
const CACHE_MAX = 500;

/**
 * Returns a Prisma client that can only see one business (and, for clients, one client).
 * @param {TenantSession} session
 */
export function dbFor(session) {
  if (!session || !session.businessId || !session.role) throw new TenantAccessError('No workspace in this session');
  if (session.role === 'CLIENT' && !session.clientId) throw new TenantAccessError('Client session without a client');
  const key = `${session.businessId}|${session.role}|${session.clientId || ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = { businessId: session.businessId, role: session.role, clientId: session.clientId || null, userId: session.userId || null };
  const extended = getPrisma().$extends({
    name: 'tenant',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(rewrite(s, model, operation, args));
        },
      },
    },
  });
  const guarded = new Proxy(extended, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && RAW.has(prop)) throw new TenantAccessError('Raw SQL is not available to tenant code');
      return Reflect.get(target, prop, receiver);
    },
  });
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, guarded);
  return guarded;
}

/** Owner-level tenant client for background jobs that work on one business at a time. */
export function dbForBusiness(businessId) {
  return dbFor({ businessId, role: 'OWNER', userId: null });
}

export const _internals = { SYSTEM_MODELS, SHARED_MODELS, CLIENT_OWNED, CLIENT_DENIED, CLIENT_WRITABLE };
