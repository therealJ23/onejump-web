// Proves tenant isolation on MySQL (no row-level security): one business can never read or
// change another business's rows, and a client only ever sees their own.
import { describe, it, expect, beforeAll } from 'vitest';
import { Prisma } from '../server/db/prisma.js';
import { dbFor, TenantAccessError, _internals } from '../server/db/tenant.js';
import { fixtures } from './helpers.js';

const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
const MODELS = Prisma.dmmf.datamodel.models.map(m => m.name);
const TENANT_MODELS = MODELS.filter(m => !_internals.SYSTEM_MODELS.has(m) && m !== 'Business');

let f;
beforeAll(async () => { f = await fixtures(); });

describe('tenant isolation between businesses', () => {
  it('every tenant table only returns rows from the session’s business', async () => {
    for (const model of TENANT_MODELS) {
      for (const [db, own, other] of [[f.dbA, f.A.id, f.B.id], [f.dbB, f.B.id, f.A.id]]) {
        const rows = await db[lc(model)].findMany();
        for (const r of rows) {
          if (model === 'Exercise') expect([own, null]).toContain(r.businessId);
          else expect(r.businessId, `${model} leaked`).toBe(own);
          expect(r.businessId).not.toBe(other);
        }
      }
    }
  });

  it('the seed put data from both businesses in the core tables (so the test above is meaningful)', async () => {
    for (const model of ['Client', 'CheckIn', 'Message', 'Thread', 'Payment', 'Program', 'Workout', 'WorkoutAssignment', 'Measurement', 'Lead', 'Note', 'Automation', 'Subscription', 'ClientPlan']) {
      expect(await f.dbA[lc(model)].count(), `${model} in A`).toBeGreaterThan(0);
      expect(await f.dbB[lc(model)].count(), `${model} in B`).toBeGreaterThan(0);
    }
  });

  it('can’t read another business’s client by id', async () => {
    const bClient = await f.dbB.client.findFirst();
    expect(await f.dbA.client.findUnique({ where: { id: bClient.id } })).toBeNull();
    expect(await f.dbA.client.findFirst({ where: { id: bClient.id } })).toBeNull();
    expect(await f.dbA.client.count({ where: { id: bClient.id } })).toBe(0);
    expect(await f.dbA.checkIn.findMany({ where: { clientId: bClient.id } })).toEqual([]);
    expect(await f.dbA.message.findMany({ where: { clientId: bClient.id } })).toEqual([]);
  });

  it('can’t override businessId in a where clause', async () => {
    const rows = await f.dbA.client.findMany({ where: { businessId: f.B.id } });
    expect(rows.every(r => r.businessId === f.A.id)).toBe(true);
  });

  it('can’t update or delete another business’s rows', async () => {
    const bClient = await f.dbB.client.findFirst();
    await expect(f.dbA.client.update({ where: { id: bClient.id }, data: { name: 'Hacked' } })).rejects.toThrow();
    await expect(f.dbA.client.delete({ where: { id: bClient.id } })).rejects.toThrow();
    expect((await f.dbA.client.updateMany({ where: { id: bClient.id }, data: { name: 'Hacked' } })).count).toBe(0);
    expect((await f.dbA.message.deleteMany({ where: { clientId: bClient.id } })).count).toBe(0);
    const still = await f.dbB.client.findFirst({ where: { id: bClient.id } });
    expect(still.name).not.toBe('Hacked');
  });

  it('creates are stamped with the session’s business, whatever the caller sends', async () => {
    const n = await f.dbA.note.create({ data: { businessId: f.B.id, clientId: f.mike.id, authorUserId: f.dani.id, body: 'stamp test' } });
    expect(n.businessId).toBe(f.A.id);
    const many = await f.dbA.notification.createMany({ data: [{ businessId: f.B.id, kind: 'x', title: 'stamp test' }] });
    expect(many.count).toBe(1);
    expect(await f.dbB.notification.count({ where: { title: 'stamp test' } })).toBe(0);
    await f.dbA.note.delete({ where: { id: n.id } });
    await f.dbA.notification.deleteMany({ where: { title: 'stamp test' } });
  });

  it('updates can’t move a row to another business', async () => {
    const n = await f.dbA.note.create({ data: { clientId: f.mike.id, authorUserId: f.dani.id, body: 'move test' } });
    await f.dbA.note.update({ where: { id: n.id }, data: { businessId: f.B.id, body: 'moved?' } });
    const after = await f.dbA.note.findFirst({ where: { id: n.id } });
    expect(after.businessId).toBe(f.A.id);
    await f.dbA.note.delete({ where: { id: n.id } });
  });

  it('the Business table only shows the session’s own business', async () => {
    const list = await f.dbA.business.findMany();
    expect(list.map(b => b.id)).toEqual([f.A.id]);
    await expect(f.dbA.business.update({ where: { id: f.B.id }, data: { name: 'Hacked' } })).rejects.toThrow();
    await expect(f.dbA.business.create({ data: { name: 'x', slug: 'x' } })).rejects.toThrow(TenantAccessError);
  });

  it('aggregations are scoped too', async () => {
    const all = await f.dbA.payment.groupBy({ by: ['businessId'], _count: { _all: true } });
    expect(all.map(r => r.businessId)).toEqual([f.A.id]);
    const agg = await f.dbA.payment.aggregate({ where: { status: 'failed' }, _count: { _all: true } });
    expect(agg._count._all).toBe(await f.dbA.payment.count({ where: { status: 'failed' } }));
  });

  it('shared exercises are readable but not writable; custom exercises stay private', async () => {
    const custom = await f.dbB.exercise.create({ data: { name: 'Northside secret lift', muscle: 'Back', equipment: 'Barbell', level: 'Advanced', pattern: 'pull' } });
    expect(custom.businessId).toBe(f.B.id);
    const seenByA = await f.dbA.exercise.findMany({ where: { name: 'Northside secret lift' } });
    expect(seenByA).toEqual([]);
    const global = await f.dbA.exercise.findFirst({ where: { businessId: null } });
    expect(global).toBeTruthy();
    await expect(f.dbA.exercise.update({ where: { id: global.id }, data: { name: 'Renamed' } })).rejects.toThrow();
    expect((await f.dbA.exercise.deleteMany({ where: { id: global.id } })).count).toBe(0);
    await f.dbB.exercise.delete({ where: { id: custom.id } });
  });

  it('system tables and raw SQL are not available to tenant code', async () => {
    await expect(f.dbA.user.findMany()).rejects.toThrow(TenantAccessError);
    await expect(f.dbA.magicLink.findMany()).rejects.toThrow(TenantAccessError);
    await expect(f.dbA.userSession.findMany()).rejects.toThrow(TenantAccessError);
    expect(() => f.dbA.$queryRawUnsafe('SELECT 1')).toThrow(TenantAccessError);
    expect(() => f.dbA.$executeRaw).toThrow(TenantAccessError);
  });

  it('refuses a session without a business', () => {
    expect(() => dbFor({ role: 'OWNER' })).toThrow(TenantAccessError);
    expect(() => dbFor({ businessId: f.A.id, role: 'CLIENT' })).toThrow(TenantAccessError);
  });
});

describe('clients only see their own data', () => {
  it('a client sees exactly one client row: their own', async () => {
    const rows = await f.dbMike.client.findMany();
    expect(rows.map(r => r.id)).toEqual([f.mike.id]);
    const other = await f.dbA.client.findFirst({ where: { NOT: { id: f.mike.id } } });
    expect(await f.dbMike.client.findUnique({ where: { id: other.id } })).toBeNull();
  });

  it('client-owned tables are filtered to the client', async () => {
    for (const model of _internals.CLIENT_OWNED) {
      const rows = await f.dbMike[lc(model)].findMany();
      for (const r of rows) { expect(r.clientId, `${model} leaked`).toBe(f.mike.id); expect(r.businessId).toBe(f.A.id); }
    }
    expect((await f.dbMike.checkIn.findMany()).length).toBeGreaterThan(0);
    expect((await f.dbMike.message.findMany()).length).toBeGreaterThan(0);
  });

  it('coach-only tables are off limits to clients', async () => {
    for (const model of ['lead', 'aIInsight', 'note', 'automation', 'notification', 'auditLog', 'clientEvent', 'invite', 'membership', 'aIUsage']) {
      await expect(f.dbMike[model].findMany(), model).rejects.toThrow(TenantAccessError);
    }
  });

  it('a client can’t write as another client or change coach data', async () => {
    const other = await f.dbA.client.findFirst({ where: { NOT: { id: f.mike.id }, status: 'ACTIVE' } });
    const k = await f.dbMike.checkIn.create({ data: { clientId: other.id, weekOf: new Date(), text: 'spoof' } });
    expect(k.clientId).toBe(f.mike.id);
    await f.dbMike.checkIn.delete({ where: { id: k.id } });
    const othersCheckin = await f.dbA.checkIn.findFirst({ where: { clientId: other.id } });
    await expect(f.dbMike.checkIn.update({ where: { id: othersCheckin.id }, data: { text: 'x' } })).rejects.toThrow();
    await expect(f.dbMike.program.create({ data: { name: 'x', weeks: 1, daysPerWeek: 1 } })).rejects.toThrow(TenantAccessError);
    await expect(f.dbMike.workout.updateMany({ data: { name: 'x' } })).rejects.toThrow(TenantAccessError);
    await expect(f.dbMike.client.create({ data: { name: 'x' } })).rejects.toThrow(TenantAccessError);
  });

  it('a client can only change harmless fields on their own record', async () => {
    const before = await f.dbA.client.findFirst({ where: { id: f.mike.id } });
    await f.dbMike.client.update({ where: { id: f.mike.id }, data: { riskScore: 0, status: 'INACTIVE', lastActiveAt: new Date() } });
    const after = await f.dbA.client.findFirst({ where: { id: f.mike.id } });
    expect(after.status).toBe(before.status);
    expect(after.riskScore).toBe(before.riskScore);
  });
});
