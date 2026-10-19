// System-level database access: the few operations that happen before there is a
// workspace session (sign-up, log-in, invite and magic-link tokens), background jobs
// that need the list of businesses, Stripe webhooks that arrive with only Stripe IDs,
// and the internal admin's aggregate numbers.
//
// Everything here is deliberately narrow: each function does one thing and returns
// the minimum fields. Anything that reads or writes a workspace's data goes through
// dbFor(session) / dbForBusiness(id) in ./tenant.js instead.
import { getPrisma } from './prisma.js';

const db = () => getPrisma();
const userPublic = { id: true, email: true, name: true, totpEnabled: true, isPlatformAdmin: true, createdAt: true, lastLoginAt: true };

// ------------------------------------------------------------- users
export const users = {
  byEmail: email => db().user.findUnique({ where: { email: email.toLowerCase().trim() } }),
  byId: id => db().user.findUnique({ where: { id } }),
  publicById: id => db().user.findUnique({ where: { id }, select: userPublic }),
  create: ({ email, name, passwordHash = null }) => db().user.create({ data: { email: email.toLowerCase().trim(), name, passwordHash }, select: userPublic }),
  update: (id, data) => db().user.update({ where: { id }, data, select: userPublic }),
  setTotp: (id, totpSecret, totpEnabled) => db().user.update({ where: { id }, data: { totpSecret, totpEnabled }, select: { id: true } }),
  totpSecret: async id => (await db().user.findUnique({ where: { id }, select: { totpSecret: true } }))?.totpSecret || null,
  touchLogin: id => db().user.update({ where: { id }, data: { lastLoginAt: new Date() }, select: { id: true } }),
};

// ------------------------------------------------------------- memberships
export const memberships = {
  forUser: userId => db().membership.findMany({
    where: { userId },
    select: { id: true, role: true, businessId: true, title: true, business: { select: { id: true, name: true, slug: true, plan: true, onboardedAt: true } } },
    orderBy: { createdAt: 'asc' },
  }),
  find: (userId, businessId) => db().membership.findUnique({ where: { userId_businessId: { userId, businessId } } }),
  addClient: (userId, businessId) => db().membership.upsert({
    where: { userId_businessId: { userId, businessId } },
    create: { userId, businessId, role: 'CLIENT' },
    update: {},
  }),
  /** Owners and coaches of a workspace (for the morning briefing). */
  coachesFor: async businessId => (await db().membership.findMany({ where: { businessId, role: { in: ['OWNER', 'COACH'] } }, select: { userId: true, user: { select: { name: true, email: true } } } })).map(m => ({ userId: m.userId, name: m.user.name, email: m.user.email })),
  coachNameFor: async businessId => {
    const m = await db().membership.findFirst({ where: { businessId, role: 'OWNER' }, select: { title: true, bio: true, user: { select: { name: true, email: true } } } });
    return m ? { name: m.user.name, email: m.user.email, title: m.title, bio: m.bio } : null;
  },
};

// ------------------------------------------------------------- businesses
export const businesses = {
  slugTaken: async slug => !!(await db().business.findUnique({ where: { slug }, select: { id: true } })),
  publicBySlug: slug => db().business.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, brandColor: true, logoUrl: true } }),
  publicById: id => db().business.findUnique({ where: { id }, select: { id: true, name: true, slug: true, brandColor: true, logoUrl: true, timezone: true, plan: true } }),
  /** Creates a workspace and its OWNER membership in one transaction. */
  createWithOwner: async ({ userId, name, slug, trialDays = 14 }) => db().$transaction(async tx => {
    const business = await tx.business.create({ data: { name, slug, plan: 'TRIAL', planStatus: 'trialing', trialEndsAt: new Date(Date.now() + trialDays * 864e5) } });
    await tx.membership.create({ data: { userId, businessId: business.id, role: 'OWNER' } });
    return business;
  }),
  allIds: async () => (await db().business.findMany({ select: { id: true, timezone: true } })),
  byStripeAccount: accountId => db().business.findFirst({ where: { stripeAccountId: accountId }, select: { id: true } }),
  byStripeCustomer: customerId => db().business.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } }),
};

// ------------------------------------------------------------- tokens
export const magicLinks = {
  create: ({ userId, businessId, tokenHash, ttlMinutes = 30, purpose = 'login' }) =>
    db().magicLink.create({ data: { userId, businessId, tokenHash, purpose, expiresAt: new Date(Date.now() + ttlMinutes * 60e3) } }),
  /** Single use: returns the link only if it was unused and unexpired, and marks it used atomically. */
  consume: async tokenHash => {
    const link = await db().magicLink.findUnique({ where: { tokenHash } });
    if (!link || link.usedAt || link.expiresAt < new Date()) return null;
    const r = await db().magicLink.updateMany({ where: { id: link.id, usedAt: null }, data: { usedAt: new Date() } });
    return r.count === 1 ? link : null;
  },
};

export const invites = {
  /** Resolves an invite token to its workspace. The caller continues with dbForBusiness(businessId). */
  resolve: tokenHash => db().invite.findUnique({ where: { tokenHash }, select: { id: true, businessId: true, clientId: true, email: true, expiresAt: true, acceptedAt: true } }),
};

// ------------------------------------------------------------- sessions (express-session store)
export const sessions = {
  get: sid => db().userSession.findUnique({ where: { sid } }),
  set: (sid, data, expiresAt) => db().userSession.upsert({ where: { sid }, create: { sid, data, expiresAt }, update: { data, expiresAt } }),
  touch: (sid, expiresAt) => db().userSession.updateMany({ where: { sid }, data: { expiresAt } }),
  destroy: sid => db().userSession.deleteMany({ where: { sid } }),
  prune: () => db().userSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
  destroyForUser: async (userId, exceptSid) => {
    // session data is JSON text; match on the stored userId
    const rows = await db().userSession.findMany({ where: { data: { contains: `"userId":"${userId}"` } }, select: { sid: true } });
    const ids = rows.map(r => r.sid).filter(s => s !== exceptSid);
    if (ids.length) await db().userSession.deleteMany({ where: { sid: { in: ids } } });
    return ids.length;
  },
};

// ------------------------------------------------------------- audit (platform-level events)
export function audit({ businessId = null, actorUserId = null, action, target = '', ip = null, meta = undefined }) {
  return db().auditLog.create({ data: { businessId, actorUserId, action, target: String(target).slice(0, 190), ip, meta } }).catch(() => null);
}

// ------------------------------------------------------------- jobs table
export const jobs = {
  enqueue: (name, payload, runAt = new Date()) => db().job.create({ data: { name, payload, runAt } }),
  claimDue: async (limit = 20) => {
    const due = await db().job.findMany({ where: { status: { in: ['queued', 'failed'] }, attempts: { lt: 3 }, runAt: { lte: new Date() } }, orderBy: { runAt: 'asc' }, take: limit });
    const claimed = [];
    for (const j of due) {
      const r = await db().job.updateMany({ where: { id: j.id, status: j.status }, data: { status: 'running', attempts: { increment: 1 } } });
      if (r.count === 1) claimed.push(j);
    }
    return claimed;
  },
  finish: (id, error = null) => db().job.update({ where: { id }, data: error ? { status: 'failed', lastError: String(error).slice(0, 4000), runAt: new Date(Date.now() + 5 * 60e3) } : { status: 'done', lastError: null } }),
};

// ------------------------------------------------------------- internal admin (aggregates only)
export const admin = {
  /** Business-level numbers. Never returns client names, check-ins or messages. */
  businesses: async () => {
    const list = await db().business.findMany({
      select: { id: true, name: true, slug: true, plan: true, planStatus: true, trialEndsAt: true, createdAt: true, onboardedAt: true, stripeAccountStatus: true,
        members: { where: { role: 'OWNER' }, select: { user: { select: { name: true, lastLoginAt: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    const clientCounts = await db().client.groupBy({ by: ['businessId'], where: { status: { in: ['NEW', 'ACTIVE'] } }, _count: { _all: true } });
    const failed = await db().payment.groupBy({ by: ['businessId'], where: { status: 'failed' }, _count: { _all: true } });
    const cc = Object.fromEntries(clientCounts.map(r => [r.businessId, r._count._all]));
    const fc = Object.fromEntries(failed.map(r => [r.businessId, r._count._all]));
    return list.map(b => ({ ...b, owner: b.members[0]?.user?.name || '—', lastActiveAt: b.members[0]?.user?.lastLoginAt || null, members: undefined, activeClients: cc[b.id] || 0, failedClientPayments: fc[b.id] || 0 }));
  },
  aiUsageSince: since => db().aIUsage.groupBy({ by: ['kind'], where: { createdAt: { gte: since } }, _count: { _all: true }, _sum: { costMicros: true } }),
  aiDecisionsSince: since => db().aIInsight.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  totalClients: () => db().client.count({ where: { status: { in: ['NEW', 'ACTIVE'] } } }),
  openSupport: () => db().supportRequest.findMany({ where: { status: 'open' }, select: { id: true, kind: true, createdAt: true, businessId: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
  // Platform-level events only, without targets: they can hold client emails.
  recentAudit: () => db().auditLog.findMany({ where: { businessId: null }, orderBy: { at: 'desc' }, take: 30, select: { action: true, at: true } }),

  // ---- HQ insights: OneJump's own business (coach plans), totals only ----
  /** Every workspace's plan fields (no client data). */
  planRows: () => db().business.findMany({
    select: { id: true, name: true, plan: true, planStatus: true, trialEndsAt: true, planRenewsAt: true, cancelAtPeriodEnd: true, createdAt: true, updatedAt: true, onboardedAt: true,
      members: { where: { role: 'OWNER' }, select: { user: { select: { lastLoginAt: true } } } } },
  }),
  /** Coach-plan billing events since a date (started, paid, failed, canceled). */
  planEvents: since => db().auditLog.findMany({ where: { businessId: { not: null }, action: { in: ['plan_started', 'plan_paid', 'plan_payment_failed', 'plan_cancel'] }, at: { gte: since } }, select: { businessId: true, action: true, target: true, meta: true, at: true }, orderBy: { at: 'asc' } }),
  /** AI spend between two dates, in micro-dollars. */
  aiCostBetween: async (from, to) => (await db().aIUsage.aggregate({ where: { createdAt: { gte: from, lt: to } }, _sum: { costMicros: true } }))._sum.costMicros || 0,
  /** Clients added across all workspaces between two dates (a count, nothing else). */
  clientsAddedBetween: (from, to) => db().client.count({ where: { startedAt: { gte: from, lt: to } } }),
};

// ------------------------------------------------------------- global exercise library
export const library = {
  globalCount: () => db().exercise.count({ where: { businessId: null } }),
  /** Inserts OneJump's shared exercises (businessId = null) and links alternatives by name. */
  seedGlobal: async (rows, howTo = {}) => {
    const existing = new Set((await db().exercise.findMany({ where: { businessId: null }, select: { name: true } })).map(e => e.name));
    const fresh = rows.filter(r => !existing.has(r[0]));
    if (fresh.length) {
      await db().exercise.createMany({ data: fresh.map(([name, muscle, equipment, level, pattern, kneeLoad, overhead]) => ({ businessId: null, name, muscle, equipment, level, pattern, kneeLoad, overhead, howTo: howTo[pattern] || null })) });
    }
    const all = await db().exercise.findMany({ where: { businessId: null }, select: { id: true, name: true } });
    const byName = new Map(all.map(e => [e.name, e.id]));
    for (const [name, , , , , , , alts] of rows) {
      const ids = (alts || []).map(a => byName.get(a)).filter(Boolean);
      await db().exercise.updateMany({ where: { businessId: null, name }, data: { altIds: ids } });
    }
    return all.length;
  },
};
// ------------------------------------------------------------- public food data cache (USDA, Open Food Facts)
// Not tenant data: it holds public nutrition facts only, shared by every workspace.
export const foodCache = {
  get: (source, externalId) => db().foodCache.findUnique({ where: { source_externalId: { source, externalId: String(externalId).slice(0, 190) } } }),
  put: (source, externalId, data) => db().foodCache.upsert({
    where: { source_externalId: { source, externalId: String(externalId).slice(0, 190) } },
    create: { source, externalId: String(externalId).slice(0, 190), data, fetchedAt: new Date() },
    update: { data, fetchedAt: new Date() },
  }),
  prune: olderThan => db().foodCache.deleteMany({ where: { fetchedAt: { lt: olderThan } } }),
};

export { disconnectPrisma as closeDb } from './prisma.js';
