// Automations: the 5 templates (on/off, wording, approval) and recent runs.
import { Router } from 'express';
import { body, z } from '../lib/validate.js';
import { must, badRequest } from '../lib/errors.js';
import { AUTOMATION_TEMPLATES } from '../core/automationTemplates.js';
import { startOfMonthUtc } from '../lib/time.js';
import { draftText } from '../core/actions.js';

export const router = Router();

router.get('/', async (req, res) => {
  const since = startOfMonthUtc();
  const [autos, runs, pending, recent] = await Promise.all([
    req.db.automation.findMany(),
    req.db.automationRun.groupBy({ by: ['automationId'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    req.db.aIInsight.findMany({ where: { kind: 'automation', status: 'pending' }, orderBy: { createdAt: 'desc' } }),
    req.db.automationRun.findMany({ orderBy: { createdAt: 'desc' }, take: 12 }),
  ]);
  const counts = Object.fromEntries(runs.map(r => [r.automationId, r._count._all]));
  const order = AUTOMATION_TEMPLATES.map(t => t.key);
  const clients = new Map((await req.db.client.findMany({ where: { id: { in: pending.map(p => p.clientId).filter(Boolean) } }, select: { id: true, name: true } })).map(c => [c.id, c]));
  const minutes = recent.length ? null : 0;
  res.json({
    automations: autos.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)).map(a => ({ ...a, runsThisMonth: counts[a.id] || 0, template: a.template, fixedText: !!AUTOMATION_TEMPLATES.find(t => t.key === a.key)?.template })),
    pending: pending.map(p => ({ id: p.id, client: clients.get(p.clientId) || null, title: p.draft?.title || p.summary, rule: p.draft?.rule, text: draftText(p), createdAt: p.createdAt })),
    recent: recent.map(r => ({ id: r.id, at: r.createdAt, outcome: r.outcome, summary: r.summary })),
    totalRunsThisMonth: Object.values(counts).reduce((a, b) => a + b, 0),
    minutes,
  });
});

router.patch('/:id', body(z.object({ enabled: z.boolean().optional(), template: z.string().trim().max(1000).optional(), needsApproval: z.boolean().optional() })), async (req, res) => {
  const a = must(await req.db.automation.findFirst({ where: { id: req.params.id } }), 'That automation');
  const t = AUTOMATION_TEMPLATES.find(x => x.key === a.key);
  if (req.body.template != null && !t?.template) throw badRequest('This automation doesn’t send fixed text.');
  if (req.body.template != null && !req.body.template.trim()) throw badRequest('The message can’t be empty.');
  res.json({ automation: await req.db.automation.update({ where: { id: a.id }, data: req.body }) });
});
