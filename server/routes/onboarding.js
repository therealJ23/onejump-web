// The 10-step coach onboarding from the prototype, plus "load sample clients".
import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { users, businesses } from '../db/system.js';
import { body, z } from '../lib/validate.js';
import { badRequest, conflict } from '../lib/errors.js';
import { StorageService, sniffImage } from '../storage/StorageService.js';
import { ensureAutomations } from '../core/automationTemplates.js';
import { slugify } from './auth.js';
import { loadSampleWorkspace, removeSampleClients } from '../seed/sampleWorkspace.js';
import { runRadar } from '../core/radar.js';
import { runAutomations } from '../core/automations.js';

export const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });

const SPECS = ['Fat loss', 'Strength', 'Muscle gain', 'Beginners', 'Athletes', 'Older adults', 'Pre and postnatal', 'Mobility', 'Endurance and hybrid', 'Nutrition coaching'];
const GOALS = ['Save time', 'Keep clients longer', 'Get more clients', 'Make more per client', 'Look more professional'];
const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  biz: z.string().trim().min(1).max(80).optional(),
  type: z.enum(['Online', 'In person', 'Hybrid']).optional(),
  count: z.enum(['0–5', '6–15', '16–30', '31–60', '60+']).optional(),
  spec: z.array(z.enum(SPECS)).max(10).optional(),
  style: z.enum(['Supportive', 'Direct', 'Data-driven', 'Playful']).optional(),
  pkgName: z.string().trim().min(1).max(80).optional(),
  price: z.coerce.number().min(0).max(100000).optional(),
  interval: z.enum(['month', 'week', 'once']).optional(),
  days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  from: z.coerce.number().int().min(0).max(23).optional(),
  to: z.coerce.number().int().min(1).max(24).optional(),
  goals: z.array(z.enum(GOALS)).max(5).optional(),
  timezone: z.string().max(60).optional(),
  finish: z.boolean().optional(),
});

async function current(req) {
  const b = await req.db.business.findFirst();
  const u = await users.publicById(req.auth.userId);
  const plan = await req.db.clientPlan.findFirst({ orderBy: { createdAt: 'asc' } });
  const av = b.availability || {};
  return {
    name: u.name, biz: b.name, slug: b.slug, logoUrl: b.logoUrl ? await StorageService.signedUrl(b.logoUrl) : null,
    type: b.coachingType || 'Hybrid', count: b.clientBand || '16–30', spec: b.specialties || ['Fat loss', 'Strength', 'Beginners'], style: b.writingStyle || 'Supportive',
    pkgName: plan?.name || 'Coached Online', price: plan ? plan.priceCents / 100 : 150, interval: plan?.interval || 'month',
    days: av.days || [1, 2, 3, 4, 5], from: av.from ?? 6, to: av.to ?? 19, goals: b.goals || ['Save time', 'Keep clients longer'], onboarded: !!b.onboardedAt, timezone: b.timezone,
  };
}

function summary(o) {
  const money = n => '$' + Number(n).toLocaleString('en-US');
  return [
    o.type === 'Online' ? 'Online coaching: the calendar shows calls and consultations only' : `${o.type} coaching: sessions and consultations use your availability`,
    `${o.style} style: Assist drafts messages in a ${o.style.toLowerCase()} tone`,
    o.goals.includes('Keep clients longer') ? 'Retention radar pinned to the top of Today' : 'Retention radar on, in the Clients view',
    o.goals.includes('Get more clients') ? 'Leads added to your menu' : 'Leads available under Business',
    `“${o.pkgName}” at ${money(o.price)}/${o.interval === 'once' ? 'one-time' : o.interval} ready to sell once Stripe is connected`,
    `${o.spec.slice(0, 3).join(', ')}${o.spec.length > 3 ? '…' : ''}: Assist starts from these when it builds workouts`,
    o.count === '0–5' || o.count === '6–15' ? 'Suggested plan: Starter covers up to 15 clients' : 'Suggested plan: Pro covers up to 50 clients',
  ];
}

router.get('/', async (req, res) => res.json(await current(req)));

router.put('/', body(schema), async (req, res) => {
  const d = req.body;
  const b = await req.db.business.findFirst();
  if (d.name) await users.update(req.auth.userId, { name: d.name });
  const data = {};
  if (d.biz && d.biz !== b.name) {
    data.name = d.biz;
    if (!b.onboardedAt) {
      const want = slugify(d.biz.split(' ')[0]);
      if (want !== b.slug && !(await businesses.slugTaken(want))) data.slug = want;
    }
  }
  if (d.type) data.coachingType = d.type;
  if (d.count) data.clientBand = d.count;
  if (d.spec) data.specialties = d.spec;
  if (d.style) data.writingStyle = d.style;
  if (d.goals) data.goals = d.goals;
  if (d.timezone) { try { new Intl.DateTimeFormat('en-US', { timeZone: d.timezone }); data.timezone = d.timezone; } catch { /* ignore bad zones */ } }
  if (d.days || d.from != null || d.to != null) {
    const av = b.availability || {};
    data.availability = { days: d.days ?? av.days ?? [1, 2, 3, 4, 5], from: d.from ?? av.from ?? 6, to: d.to ?? av.to ?? 19 };
    if (data.availability.to <= data.availability.from) throw badRequest('“To” must be after “From”.', { fields: { to: 'Pick a later time' } });
  }
  if (d.pkgName || d.price != null || d.interval) {
    const plan = await req.db.clientPlan.findFirst({ orderBy: { createdAt: 'asc' } });
    const pd = { ...(d.pkgName ? { name: d.pkgName } : {}), ...(d.price != null ? { priceCents: Math.round(d.price * 100) } : {}), ...(d.interval ? { interval: d.interval } : {}) };
    if (plan) await req.db.clientPlan.update({ where: { id: plan.id }, data: pd });
    else await req.db.clientPlan.create({ data: { name: d.pkgName || 'Coached Online', priceCents: Math.round((d.price ?? 150) * 100), interval: d.interval || 'month', description: 'Program, weekly check-in, messaging' } });
  }
  if (d.finish) data.onboardedAt = new Date();
  if (Object.keys(data).length) await req.db.business.update({ where: { id: b.id }, data });
  await ensureAutomations(req.db);
  const o = await current(req);
  res.json({ ...o, summary: d.finish ? summary(o) : undefined });
});

router.post('/logo', upload.single('logo'), async (req, res) => {
  if (!req.file) throw badRequest('Choose an image file.');
  const type = sniffImage(req.file.buffer);
  if (!type || type === 'image/heic') throw badRequest('Upload a PNG, JPG, WebP or GIF.');
  const key = `logos/${req.auth.businessId}/${randomUUID()}`;
  await StorageService.put(key, req.file.buffer, type);
  await req.db.business.update({ where: { id: req.auth.businessId }, data: { logoUrl: key } });
  res.json({ logoUrl: await StorageService.signedUrl(key) });
});

router.post('/sample-data', async (req, res) => {
  const all = await req.db.client.findMany({ select: { tags: true } });
  if (all.some(c => Array.isArray(c.tags) && c.tags.includes('Sample'))) throw conflict('Sample clients are already loaded.');
  const b = await req.db.business.findFirst();
  await loadSampleWorkspace(req.db, { coachUserId: req.auth.userId, sampleTag: 'Sample', withLeads: false, tz: b.timezone });
  await runRadar(req.db, { tz: b.timezone });
  await runAutomations(req.db, { tz: b.timezone, only: ['milestone', 'missed_workouts'] });
  res.json({ ok: true });
});

router.delete('/sample-data', async (req, res) => {
  const n = await removeSampleClients(req.db, 'Sample');
  res.json({ ok: true, removed: n });
});
