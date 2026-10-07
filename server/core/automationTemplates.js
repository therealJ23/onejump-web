// The 5 automation templates in every plan (MVP). Wording matches the prototype.
// Fixed-text reminders the coach switches on may send on their own; anything Assist
// writes itself waits for the coach's approval.
export const AUTOMATION_TEMPLATES = [
  {
    key: 'missed_workouts',
    trigger: 'Client misses 2 workouts in 7 days',
    action: 'Create a task for you and draft a check-in message',
    needsApproval: true,
    template: null,
    minutes: 6,
  },
  {
    key: 'missing_checkin',
    trigger: 'Weekly check-in not submitted by Monday 9 AM',
    action: 'Send your check-in reminder',
    needsApproval: false,
    template: 'Hey {first}! Quick reminder to send your weekly check-in. Takes 2 minutes and it’s how I adjust next week.',
    minutes: 2,
  },
  {
    key: 'inactive_7d',
    trigger: 'Client hasn’t opened the app for 7 days',
    action: 'Notify you',
    needsApproval: false,
    template: null,
    minutes: 1,
  },
  {
    key: 'milestone',
    trigger: 'Client completes 10, 25, 50 or 100 workouts',
    action: 'Draft a personal congratulations message',
    needsApproval: true,
    template: null,
    minutes: 3,
  },
  {
    key: 'failed_payment',
    trigger: 'A client payment fails',
    action: 'Notify you and send a card-update reminder',
    needsApproval: false,
    template: 'Hi {first}, your last payment didn’t go through. You can update your card in the app under Me → Billing. Thanks!',
    minutes: 3,
  },
];

export const templateFor = key => AUTOMATION_TEMPLATES.find(t => t.key === key);

/** Creates any missing template rows for a business (idempotent). */
export async function ensureAutomations(db) {
  const existing = new Set((await db.automation.findMany({ select: { key: true } })).map(a => a.key));
  const missing = AUTOMATION_TEMPLATES.filter(t => !existing.has(t.key));
  if (missing.length) {
    await db.automation.createMany({ data: missing.map(t => ({ key: t.key, trigger: t.trigger, action: t.action, template: t.template, needsApproval: t.needsApproval, enabled: true })), skipDuplicates: true });
  }
}

export const fillTemplate = (text, client) => String(text || '').replace(/\{first\}|\{first name\}/g, (client?.name || 'there').split(' ')[0]);
