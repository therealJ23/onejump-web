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

// ---------------------------------------------------------------- nutrition
import { checkNutritionLanguage, flagReplyText } from '../nutrition/language.js';
export const DIETITIAN = 'That’s a question for your doctor or a registered dietitian.';
const SUPPLEMENT_OR_MEDICAL = /\b(supplements?|fat[- ]?burners?|diet pills?|appetite suppress\w*|creatine|pre-?workouts?|detox|cleanse|keto pills?|weight[- ]loss pills?|ozempic|semaglutide|wegovy|mounjaro|diabet\w*|blood sugar|insulin|kidney\w*|pregnan\w*|breastfeed\w*|medications?|allerg\w*|celiac|ibs|cholesterol|thyroid|eating disorder)\b/i;
const RECOMMENDS_SUPPLEMENT = /\b(take|try|use|start|add|recommend|grab|buy)\b.{0,25}\b(supplements?|fat[- ]?burners?|diet pills?|creatine|pre-?workout|detox|cleanse|appetite suppress\w*|weight[- ]loss pills?)\b/i;
const JUDGING = /\b(bad|junk|cheat|guilty|naughty|clean eating|dirty) (food|foods|meal|meals|day|eating)\b|\b(junk food|cheat meal|cheat day)\b/i;

/**
 * Nutrition safety on a client-facing draft:
 *  - food language that suggests compensating, purging, earning food, restriction or risk in the
 *    client's words → the warm, number-free reply (the coach still decides whether to send it)
 *  - supplements or medical nutrition (diabetes, kidney disease, pregnancy, medications, allergies)
 *    → never advise; refer to a doctor or registered dietitian
 *  - judging words about food are softened away by replacing the draft
 */
export function guardNutrition(text, { contextTexts = [], firstName = 'there' } = {}) {
  let out = String(text || '').trim();
  const flag = contextTexts.map(checkNutritionLanguage).find(r => r.flagged);
  if (flag) return { text: flagReplyText(firstName || 'there', flag.category), nutritionFlag: flag.category, rewritten: true };
  const asked = contextTexts.some(t => SUPPLEMENT_OR_MEDICAL.test(String(t || '')));
  if (RECOMMENDS_SUPPLEMENT.test(out)) out = `Thanks for asking, ${firstName || 'there'}. I don’t recommend supplements. ${DIETITIAN} In the meantime, regular meals with some protein are a great place to focus.`;
  else if (asked && !/doctor|dietitian|qualified professional/i.test(out)) out = `Good question, ${firstName || 'there'}. ${DIETITIAN} I’m happy to work your training and habits around whatever they suggest.`;
  if (JUDGING.test(out)) out = out.replace(JUDGING, 'that meal');
  return { text: out, nutritionFlag: null, rewritten: out !== String(text || '').trim() };
}
