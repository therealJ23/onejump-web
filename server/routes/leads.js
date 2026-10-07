// Leads (Pro): paste a DM, Assist fills it in and drafts the reply; follow-ups; convert to client.
import { Router } from 'express';
import { config } from '../config.js';
import { body, z, name } from '../lib/validate.js';
import { must, conflict } from '../lib/errors.js';
import { requirePlan } from '../auth/middleware.js';
import { leadReply } from '../ai/drafts.js';
import { createInvite } from '../core/invites.js';
import { ensureThread } from '../core/messaging.js';

export const router = Router();
router.use(requirePlan('PRO', 'The leads pipeline'));

const STAGES = ['new', 'contacted', 'consult', 'trial', 'active', 'retained', 'lost'];
const SOURCES = ['instagram_dm', 'booking_page', 'referral', 'walk_in', 'google', 'other'];

router.get('/', async (req, res) => {
  const leads = await req.db.lead.findMany({ orderBy: { createdAt: 'desc' } });
  const open = leads.filter(l => ['new', 'contacted', 'consult', 'trial'].includes(l.stage));
  res.json({ leads, stats: { open: open.length, needReply: leads.filter(l => l.stage === 'new').length, pipelineCents: open.reduce((n, l) => n + (l.valueCents || 0), 0), followUps: leads.filter(l => l.stage === 'contacted' && l.nextFollowUpAt && l.nextFollowUpAt <= new Date()).length } });
});

router.post('/parse', body(z.object({ dm: z.string().trim().min(1).max(3000) })), async (req, res) => {
  const b = await req.db.business.findFirst({ select: { slug: true } });
  const plan = await req.db.clientPlan.findFirst({ where: { active: true, priceCents: { gt: 0 }, interval: 'month' }, orderBy: { createdAt: 'asc' } });
  const ins = await leadReply(req.db, req.body.dm, { price: plan ? `$${Math.round(plan.priceCents / 100)}/month` : null, bookingLink: `${config.appUrl.replace(/^https?:\/\//, '')}/join/${b.slug}` });
  res.json({ insightId: ins.id, ...ins.draft });
});

const leadSchema = z.object({ name, handle: z.string().trim().max(60).optional(), contact: z.string().trim().max(120).optional(), source: z.enum(SOURCES).default('instagram_dm'), goal: z.string().trim().max(160).optional(), firstMessage: z.string().trim().max(3000).optional(), insightId: z.string().max(64).optional() });
router.post('/', body(leadSchema), async (req, res) => {
  const { insightId, ...d } = req.body;
  const plan = await req.db.clientPlan.findFirst({ where: { active: true, priceCents: { gt: 0 } }, orderBy: { createdAt: 'asc' } });
  const lead = await req.db.lead.create({ data: { ...d, stage: 'new', valueCents: plan?.priceCents || null, nextFollowUpAt: new Date(Date.now() + 3 * 864e5) } });
  if (insightId) await req.db.aIInsight.updateMany({ where: { id: insightId, kind: 'lead_reply', status: 'pending' }, data: { status: 'approved', decidedAt: new Date(), decidedBy: req.auth.userId, sourceId: lead.id } });
  res.status(201).json({ lead });
});

router.patch('/:id', body(z.object({ stage: z.enum(STAGES).optional(), goal: z.string().trim().max(160).optional(), contact: z.string().trim().max(120).optional() })), async (req, res) => {
  const l = must(await req.db.lead.findFirst({ where: { id: req.params.id } }), 'That lead');
  const data = { ...req.body };
  if (data.stage === 'contacted' && l.stage !== 'contacted') Object.assign(data, { lastContactAt: new Date(), nextFollowUpAt: new Date(Date.now() + 3 * 864e5) });
  if (data.stage && data.stage !== 'contacted') data.nextFollowUpAt = null;
  res.json({ lead: await req.db.lead.update({ where: { id: l.id }, data }) });
});

router.get('/:id/draft', async (req, res) => {
  const l = must(await req.db.lead.findFirst({ where: { id: req.params.id } }), 'That lead');
  const b = await req.db.business.findFirst({ select: { slug: true } });
  const link = `${config.appUrl.replace(/^https?:\/\//, '')}/join/${b.slug}`;
  const first = l.name.split(' ')[0], goal = (l.goal || 'your goals').toLowerCase();
  if (l.stage === 'new' && l.firstMessage) {
    const ins = await leadReply(req.db, l.firstMessage, { bookingLink: link });
    return res.json({ text: ins.draft.reply, assist: true });
  }
  const text = {
    new: `Hi ${first}, thanks for reaching out about ${goal}! I’d love to hear more. Do you have 20 minutes this week for a free call? You can pick a time here: ${link}`,
    contacted: `Hi ${first}, just following up in case my last message got buried. Still happy to chat about ${goal} whenever suits you.`,
    consult: `Great talking with you, ${first}! As promised, here’s the link to get started: ${link}. Want me to set it up?`,
    trial: `Hey ${first}, your trial wraps up soon. Great start so far. Want to keep going?`,
  }[l.stage] || `Hi ${first}, thanks again for your interest!`;
  res.json({ text, assist: false });
});

router.post('/:id/convert', body(z.object({ email: z.string().trim().max(190).optional() })), async (req, res) => {
  const l = must(await req.db.lead.findFirst({ where: { id: req.params.id } }), 'That lead');
  if (l.convertedClientId) throw conflict(`${l.name} is already a client.`);
  const email = (req.body.email || (/@/.test(l.contact || '') ? l.contact : '') || '').toLowerCase() || null;
  if (email && await req.db.client.findFirst({ where: { email } })) throw conflict('A client with that email already exists.');
  const c = await req.db.client.create({ data: { name: l.name, email, goal: l.goal, status: 'NEW', coachUserId: req.auth.userId, tags: [`From ${l.source.replace('_', ' ')}`] } });
  await ensureThread(req.db, c.id);
  const inv = await createInvite(req.db, c, { send: !!email });
  await req.db.lead.update({ where: { id: l.id }, data: { stage: 'active', convertedClientId: c.id, nextFollowUpAt: null } });
  res.json({ client: c, inviteLink: inv.link, emailed: inv.emailed });
});
