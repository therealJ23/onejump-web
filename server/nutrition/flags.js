// Language flags: words in food notes, check-ins, messages or voice notes that suggest
// compensating, purging, "earning" food, extreme restriction, or that someone may be at risk.
// A flag is visible ONLY to the coach. Assist never replies to the client about it; the coach
// gets a warm, number-free draft to edit and send themselves, if they choose to.
import { notify, clientEvent } from '../core/messaging.js';
import { memberships } from '../db/system.js';
import { EmailService } from '../email/EmailService.js';
import { saveInsight } from '../ai/drafts.js';
import { config } from '../config.js';
import { PROMPT_VERSION } from '../ai/prompts.js';
import { checkNutritionLanguage, flagReplyText, CATEGORY_LABEL } from './language.js';

export { checkNutritionLanguage, flagReplyText, CATEGORY_LABEL };

/**
 * Creates a coach-only flag (once per source) and alerts the coach. Uses the coach-level client.
 * @returns {Promise<object|null>} the flag, or null when nothing was flagged
 */
export async function raiseFlag(db, { clientId, clientName, businessId, sourceType, sourceId, text }) {
  const r = checkNutritionLanguage(text);
  if (!r.flagged) return null;
  const existing = await db.nutritionFlag.findFirst({ where: { sourceType, sourceId } });
  if (existing) return existing;
  const flag = await db.nutritionFlag.create({ data: { clientId, sourceType, sourceId: String(sourceId), text: String(text).slice(0, 4000), category: r.category, severity: r.severity } });
  await clientEvent(db, clientId, 'nutrition_flag', { category: r.category, sourceType });
  const first = String(clientName || 'A client').split(' ')[0];
  if (r.severity === 'urgent') {
    await notify(db, { kind: 'risk', title: `Urgent: please check on ${first} today`, body: 'Something they wrote suggests they may be at risk. Only you can see this.', link: `/app/clients/${clientId}/nutrition` });
    const coach = businessId ? await memberships.coachNameFor(businessId) : null;
    if (coach?.email) await EmailService.sendCoachAlert({ to: coach.email, subject: `Please check on ${first} today`, text: `Something ${first} wrote in OneJump suggests they may be at risk. Open their profile to read it. If you believe they are in immediate danger, contact local emergency services.`, link: `${config.appUrl}/app/clients/${clientId}/nutrition`, linkLabel: 'Open their profile' }).catch(() => null);
  } else {
    await notify(db, { kind: 'nutrition', title: `Private flag for ${first}`, body: `${CATEGORY_LABEL[r.category]} language. Only you can see this.`, link: `/app/clients/${clientId}/nutrition` });
  }
  return flag;
}

export async function flagReplyDraft(db, client, flag) {
  const first = client.name.split(' ')[0];
  return saveInsight(db, { clientId: client.id, kind: 'message_draft', source: 'nutrition_flag', sourceId: flag.id, draft: { text: flagReplyText(first, flag.category), intent: 'nutrition_flag' }, minutesSaved: 5, model: 'template', promptVersion: PROMPT_VERSION });
}
