// One small state store for the coach workspace.
export const state = {
  me: null,
  counts: { queue: 0, checkins: 0, unread: 0, notifications: 0, minutesSaved: 0 },
  ui: {},
};
export function ui(key, def) {
  if (!(key in state.ui)) state.ui[key] = typeof def === 'function' ? def() : def;
  return state.ui[key];
}
export const setUi = (key, val) => { state.ui[key] = val; };

const RANK = { STARTER: 1, TRIAL: 2, PRO: 2, STUDIO: 3 };
/** Plan gating (a trial is Pro). */
export const hasPlan = p => RANK[state.me?.business?.effectivePlan || 'STARTER'] >= RANK[p];
export const biz = () => state.me?.business || {};
export const coachFirst = () => (state.me?.user?.name || '').split(' ')[0];
