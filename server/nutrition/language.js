// Words that suggest someone is struggling with food (or may be at risk). Pure functions, no
// imports, so the AI layer, the safety guard and the flag service can all use them.
export const PATTERNS = [
  ['at_risk', 'urgent', /\b(kill(ing)? myself|end it all|don'?t want to (be here|live|wake up)|want to die|hurt(ing)? myself|self[- ]?harm|suicid\w*|no reason to live|better off without me)\b/i],
  ['purging', 'normal', /\b(purg(e|ed|ing)|throw(ing)? (it |everything )?up after|threw (it |everything )?up after|make myself (sick|throw up|vomit)|made myself (sick|throw up|vomit)|laxatives?|diuretics? to)\b/i],
  ['compensating', 'normal', /\b(skip(ped|ping)? (a |my |all my )?(meals?|breakfast|lunch|dinner) (to|because|since|so|after)|(to )?make up for (eating|what i ate|last night|the weekend|it|that|the pizza|dinner)|compensate for (eating|the|what)|starv(e|ing|ed) (myself )?(to|after|because)|not eat(ing)? tomorrow (to|because))\b/i],
  ['earning', 'normal', /\b(earn(ed|ing)? (my |the |this |that |a )?(food|dinner|lunch|breakfast|dessert|meal|pizza|treat|cheat meal|calories|snack)|burn(ed|ing)? (it|that|this|them|those calories|the calories|the [a-z]+|off the [a-z]+) off|burn off (the|that|what|my)|work(ed|ing)? off (the|that|what i ate|dinner)|cancel out (what i ate|the|that)|deserve to eat|have to earn)\b/i],
  ['restriction', 'normal', /\b(only (ate|had|eat|eating) [1-9]\d{1,2}\b|(under|less than|below) [3-9]\d{2} (calories|cals?|kcal)|didn'?t eat (anything|all day|today)|not eating (anything|at all)|fast(ed|ing) for (2|3|4|5|two|three|four|five|a few) days|haven'?t eaten (since|in \d|all day|anything)|starv(e|ing|ed)( myself)?)\b/i],
];
export const CATEGORY_LABEL = { at_risk: 'May be at risk', purging: 'Purging', compensating: 'Compensating', earning: 'Earning or burning off food', restriction: 'Extreme restriction', fast_loss: 'Fast weight loss' };

export function checkNutritionLanguage(text) {
  const t = String(text || '').replace(/[’]/g, "'");
  for (const [category, severity, re] of PATTERNS) { const m = t.match(re); if (m) return { flagged: true, category, severity, match: m[0] }; }
  return { flagged: false, category: null, severity: null, match: null };
}

/** The reply the coach can send: warm, no numbers, no judgment, points to a doctor or dietitian if it continues. */
export function flagReplyText(first, category) {
  if (category === 'at_risk') return `Hey ${first}, I read what you wrote and I want you to know I’m glad you told me. You matter a lot more than any training plan. Can we talk today? If you’re ever thinking about hurting yourself, please call or text 988 (in the US) or your local emergency number right away. I’m here.`;
  return `Hey ${first}, thanks for being honest with me. I don’t want food to feel like something you have to earn or make up for, and one meal or one day never undoes your progress. Let’s keep things simple and regular this week. If this keeps coming up, it’s worth talking to your doctor or a registered dietitian, and I’m happy to help you find one.`;
}
