// How many minutes an approved Assist draft or action saved the coach, from the work itself
// instead of one fixed number per kind (Nov 16). The rates are conservative on purpose: it's
// better to under-count than to promise time a coach didn't get back.
//
//   Writing: 30 words a minute (typing on a phone while thinking about what to say), plus a
//   lookup of the client's context before writing (1 minute; 3 for a check-in, which has answers
//   to read first).
//   Programs: 5 minutes to plan the structure, then 2 per workout plus 1.2 per exercise (picking
//   it, then sets, reps and rest).
//   A message to several clients: the writing once, plus 15 seconds per extra person.
// Anything else uses a small fixed estimate.

const WPM = 30;
const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const writing = t => words(t) / WPM;
const exercisesIn = blocks => (Array.isArray(blocks) ? blocks : []).reduce((n, b) => n + ((b?.items || []).length || 0), 0);

const FIXED = {
  update_program: 3, duplicate_program: 4, delete_program: 1, delete_workout: 1, create_exercise: 3, delete_exercise: 1, restore_exercise: 1,
  add_client: 4, update_client: 2, review_checkin: 2, update_lead: 2, convert_lead: 4, set_automation: 5, update_settings: 2,
  create_package: 6, update_package: 3, create_lead: 2, create_event: 2, move_event: 1, assign_program: 3, nutrition_plan: 15,
  adjustment: 8, risk_review: 4,
};

/**
 * @param {string} kind proposal type (send_message, create_program…) or insight kind (message_draft, checkin_summary…)
 * @param {{ text?: string, workouts?: Array<{blocks?: unknown[]}>, blocks?: unknown[], recipients?: unknown[], clientIds?: unknown[] }} work
 * @returns {number} whole minutes, at least 1 (0 for unknown kinds with nothing in them)
 */
export function savedMinutes(kind, work = {}) {
  const text = work.text || '';
  let m;
  switch (kind) {
    case 'send_message': case 'message_draft': case 'risk': case 'lead_reply': case 'payment_reminder': case 'automation': case 'nutrition_nudge':
      m = 1 + writing(text); break;
    case 'reply_checkin': case 'checkin_summary':
      m = 3 + writing(text); break;
    case 'add_note':
      m = 0.5 + writing(text); break;
    case 'message_clients': case 'send_reminders': {
      const n = (work.recipients || work.clientIds || []).length || 1;
      m = 1 + writing(text || work.template || '') + 0.25 * Math.max(0, n - 1); break;
    }
    case 'create_program': {
      const ws = Array.isArray(work.workouts) ? work.workouts : [];
      m = 5 + ws.reduce((n, w) => n + 2 + 1.2 * exercisesIn(w.blocks), 0); break;
    }
    case 'save_workout': case 'workout':
      m = 2 + 1.2 * exercisesIn(work.blocks || work.exercises?.map(() => ({ items: [1] }))); break;
    default:
      m = FIXED[kind] ?? 2;
  }
  return Math.max(1, Math.round(m));
}
