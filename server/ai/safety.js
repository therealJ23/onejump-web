// Assist coaches; it never diagnoses. Pain, injury, medication, pregnancy or medical
// conditions switch a draft to: acknowledge, suggest a qualified professional, flag the
// client to the coach. Applied server-side to every input and every draft.
export const SAFETY_TERMS = /\b(pain|painful|hurt|hurts|hurting|injur\w*|sprain\w*|strain(ed)?|tear|torn|doctor|physio\w*|medication|meds|pregnan\w*|postpartum|dizzy|dizziness|faint\w*|chest pain|numb\w*|tingl\w*|surgery|diagnos\w*|concussion|fracture\w*|swollen|swelling|blood pressure|diabet\w*|asthma|heart condition)\b/i;

export const REFERRAL = 'Because this involves pain, I’d like you to get it checked by a physical therapist or sports-medicine doctor before we load it again.';
export const GENERIC_MEDICAL_REFERRAL = 'That’s outside what I can advise on as your coach, so please check with your doctor or a qualified professional before we change anything. I’ll keep the rest of your plan going in the meantime.';

/** Words a coach's AI must never use to diagnose. */
const DIAGNOSIS = /\b(you (probably |likely |may |might )?have (a |an )?(torn|tear|sprain|tendinitis|tendonitis|bursitis|hernia|fracture|meniscus|acl|mcl|rotator cuff|sciatica|plantar fasciitis|condition))|(it('|’)?s (probably|likely) (a |an )?(tear|sprain|tendinitis|tendonitis|fracture))\b/i;
/** Never tell someone to train through pain. */
const PUSH_THROUGH = /\b(push(ing)? through (the )?pain|train(ing)? through (the )?pain|ignore (the )?pain|work(ing)? through (the )?pain)\b/i;

export function checkText(text) {
  const m = String(text || '').match(SAFETY_TERMS);
  return m ? { flagged: true, term: m[0].toLowerCase() } : { flagged: false, term: null };
}
export const isPain = term => /pain|hurt|injur|sprain|strain|tear|torn|swoll|swell|fractur|numb|tingl/.test(term || '');

/**
 * Makes a client-facing draft safe. If the client context mentioned a medical topic and the
 * draft doesn't refer them to a professional, or if the draft diagnoses / says to push through
 * pain, the draft is replaced with an acknowledge + refer + "we'll keep training around it" reply.
 * @returns {{ text: string, safety: { flagged: boolean, term: string|null, rewritten: boolean } }}
 */
export function guardDraft(text, { contextTexts = [], firstName = '' } = {}) {
  let out = String(text || '').trim();
  const ctx = contextTexts.map(checkText).find(r => r.flagged) || { flagged: false, term: null };
  const own = checkText(out);
  const refers = /(physical therapist|physiotherapist|sports[- ]medicine|doctor|qualified professional|medical professional|healthcare)/i.test(out);
  let rewritten = false;
  if (DIAGNOSIS.test(out) || PUSH_THROUGH.test(out) || (ctx.flagged && !refers)) {
    const hi = firstName ? `Thanks for telling me, ${firstName}.` : 'Thanks for telling me.';
    out = `${hi} ${isPain(ctx.term || own.term) ? REFERRAL : GENERIC_MEDICAL_REFERRAL} Until then we’ll keep training everything that feels fine, and I’ll adjust your plan around it. Let me know what they say.`;
    rewritten = true;
  }
  return { text: out, safety: { flagged: ctx.flagged || own.flagged, term: ctx.term || own.term, rewritten } };
}
