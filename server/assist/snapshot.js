// A small snapshot of the coach's day for Ask Assist: every client's name (so a misheard name can
// be matched to the right person), who hasn't checked in, who is at risk, check-ins waiting for a
// review and unread messages. With it, Claude answers the everyday questions ("who needs me
// today?", "who hasn't checked in?") in one step instead of calling a tool first, which is the
// biggest part of the wait. First names and statuses only: no contact details, no health details.
// Kept for 60 seconds per workspace.
import { TOOLS } from './tools.js';
import { MORE_TOOLS } from './moreTools.js';

const TTL_MS = 60e3;
const cache = new Map(); // businessId -> { at, text }

export function clearSnapshot(businessId) { if (businessId) cache.delete(businessId); else cache.clear(); }

/**
 * @param {*} db tenant-scoped client
 * @param {string} businessId cache key
 * @param {{ tz: string, now: Date }} c
 */
export async function daySnapshot(db, businessId, c) {
  const hit = cache.get(businessId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.text;
  const [roster, missing, risk, toReview, unread] = await Promise.all([
    db.client.findMany({ where: { status: { not: 'INACTIVE' } }, orderBy: { name: 'asc' }, take: 150, select: { name: true, status: true } }),
    TOOLS.missing_checkins.run(db, {}, c).catch(() => null),
    TOOLS.at_risk_clients.run(db, {}, c).catch(() => null),
    MORE_TOOLS.checkins_to_review.run(db, {}, c).catch(() => null),
    MORE_TOOLS.unread_messages.run(db, {}, c).catch(() => null),
  ]);
  const status = s => ({ NEW: 'new', ACTIVE: 'active', PAUSED: 'paused' }[s] || String(s || '').toLowerCase());
  const lines = [
    `Clients (${roster.length}): ${roster.map(r => `${r.name}${r.status === 'ACTIVE' ? '' : ` (${status(r.status)})`}`).join(', ') || 'none yet'}.`,
  ];
  if (missing) lines.push(`Haven’t sent this week’s check-in (${missing.count}): ${missing.clients.map(x => x.name).join(', ') || 'nobody'}.`);
  if (risk) lines.push(`At risk of leaving (${risk.count}): ${risk.clients.slice(0, 8).map(x => `${x.name} (${String(x.level).toLowerCase()}${x.reasons?.[0] ? `: ${x.reasons[0]}` : ''})`).join('; ') || 'nobody'}.`);
  if (toReview) lines.push(`Check-ins waiting for the coach’s review (${toReview.count}): ${toReview.checkins.map(k => k.name).join(', ') || 'none'}.`);
  if (unread) lines.push(`Unread messages from: ${(unread.clients || unread.threads || []).map(x => x.name).filter(Boolean).join(', ') || 'nobody'}.`);
  const text = lines.join('\n');
  cache.set(businessId, { at: Date.now(), text });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return text;
}
