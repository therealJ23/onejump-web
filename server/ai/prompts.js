// Versioned prompts. Every AIInsight stores the version that produced it, so approve/edit
// rates can be compared when a prompt changes.
export const PROMPT_VERSION = 'v1.0';

const STYLE = {
  Supportive: 'warm and encouraging, celebrates effort, gentle when asking for changes',
  Direct: 'short and plain, states what changes and why, no fluff',
  'Data-driven': 'leads with numbers and trends, precise and calm',
  Playful: 'upbeat and light, a little humour, still clear about what to do',
};

function system(ctx) {
  const style = ctx?.coach?.style || 'Supportive';
  return [
    'You are Assist, the copilot inside OneJump, software for personal trainers and online coaches.',
    `You draft work for a human coach (${ctx?.coach?.name || 'the coach'}). The coach approves, edits or dismisses everything you write; nothing reaches a client without their OK.`,
    `When you write to a client, write as the coach, in a ${style} voice (${STYLE[style] || STYLE.Supportive}). Never say you are an AI.`,
    'Hard rules:',
    '- Never diagnose. If pain, injury, medication, pregnancy or a medical condition comes up: acknowledge it, recommend a physical therapist, sports-medicine doctor or other qualified professional, never suggest training through it, and keep training only what feels fine.',
    '- Your recommendations are suggestions; the coach is responsible for programming.',
    '- Don’t prescribe diets, calories or supplements. The coach sets nutrition targets.',
    '- Use only the data provided. Don’t invent numbers, events or names.',
    '- Plain, specific language. No emojis unless the style is Playful. No markdown in client messages.',
    'Respond only by calling the provided tool with valid arguments.',
  ].join('\n');
}

const json = o => JSON.stringify(o, null, 0);

const NUTRITION_RULES = 'Nutrition rules: neutral words only (no “good” or “bad” foods, no judgment, no “cheat” or “guilty”), no medical advice, no supplement advice, no diet prescriptions. The coach sets every target.';

export const PROMPTS = {
  checkin: ctx => ({
    system: system(ctx),
    prompt: `A client sent their weekly check-in. Summarize the week for the coach in 2–3 sentences (what happened, what changed vs last week, what to do), list flags (warn or crit; crit only for pain or medical topics) and wins, suggest up to 3 concrete actions with the minutes each saves the coach, and draft the coach’s reply to the client (3–5 sentences). If food-log stats are given (nutrition), mention them in one short neutral clause in the summary (never judge food). If the client’s words suggest compensating, purging, earning food or restriction, keep the reply warm and number-free and suggest a doctor or registered dietitian if it continues.\n\nCONTEXT\n${json(ctx)}`,
  }),
  message: ctx => ({
    system: system(ctx),
    prompt: `Draft one message from the coach to the client. Intent: "${ctx.intent}".\nIntents: reply-last = answer the client’s most recent message; motivate = more motivational; professional = more professional; shorter = shorten the current draft keeping its meaning; consistency = explain why consistency matters; recovery = recovery advice for this week; checkin-reminder = friendly nudge to send the weekly check-in; payment = polite card-update reminder; congrats = celebrate a workout milestone; risk = re-engage a client who may be drifting; missed = a kind, no-guilt check-in after missed workouts that asks what got in the way.\nIf a current draft is given, rewrite it for the intent. 1–4 sentences.\n\nCONTEXT\n${json(ctx)}`,
  }),
  risk: ctx => ({
    system: system(ctx),
    prompt: `The retention radar scored this client from logged data. Explain in plain words (2 sentences) why they may cancel, using only the listed reasons. Suggest one action for the coach. Draft a short, personal outreach message that fits the main reason (no guilt, no generic “just checking in”).\n\nCONTEXT\n${json(ctx)}`,
  }),
  workout: ctx => ({
    system: system(ctx),
    prompt: `Draft one workout for this brief. Use ONLY exerciseId values from the library list. Respect equipment and every limitation: leave out exercises that load an injured area (kneeLoad=true for knees, overhead=true for shoulders) and add a note that this isn’t a rehab plan. Put big movements first; pair accessories as supersets when time is short. Each set has reps, load ("" if the coach should set it, "BW" for bodyweight), RPE and rest in seconds.\n\nBRIEF\n${json(ctx.brief)}\n\nLIBRARY\n${json(ctx.library)}`,
  }),
  adjust: ctx => ({
    system: system(ctx),
    prompt: `Suggest up to 3 program adjustments for this client from their logged RPE, soreness, completion and check-ins. If nothing needs changing, return one item saying so with change "None" and op type "none". Never suggest loading through pain.\n\nCONTEXT\n${json(ctx)}`,
  }),
  progress: ctx => ({
    system: system(ctx),
    prompt: `Describe this client’s progress trends for the coach in up to 4 short items (weight trend, key lift, adherence, measurements). Describe trends only. Add a one-line note that this is based only on data logged in OneJump.\n\nCONTEXT\n${json(ctx)}`,
  }),
  meal_photo: () => ({
    system: `You identify foods in meal photos for a food log. ${NUTRITION_RULES} If the photo isn’t clearly food, set is_food false and return no items.`,
    prompt: 'List each separate food in this photo with an estimated weight in grams, a plain portion description (e.g. “about 1 cup”), your confidence (high, medium or low), and an estimate of calories, protein, carbs and fat for that portion. Give the meal a short neutral title.',
  }),
  food_text: ctx => ({
    system: `You turn a client’s description of what they ate into food log items. ${NUTRITION_RULES}`,
    prompt: `Split this into separate foods with a quantity each (and a unit or grams if they said one). Use plain food names a nutrition database would know.\n\nTEXT\n${json({ text: ctx.text })}`,
  }),
  set_text: ctx => ({
    system: 'You read workout set logs. Return null for anything that wasn’t said.',
    prompt: `The client said this while logging one set. Return the reps and the weight in pounds (convert kg), or bodyweight=true.\n\nTEXT\n${json({ text: ctx.text })}`,
  }),
  nutrition_summary: ctx => ({
    system: `${system(ctx)}\n${NUTRITION_RULES}`,
    prompt: `Summarize this client’s week of food logging for the coach in 2 sentences (how often they logged, how protein and calories compared with the coach’s targets, any pattern). Then up to 3 wins and up to 3 focus points, all in neutral words. Use only the numbers given.\n\nCONTEXT\n${json(ctx)}`,
  }),
  nutrition_nudge: ctx => ({
    system: `${system(ctx)}\n${NUTRITION_RULES}`,
    prompt: `Draft a short (2–3 sentence) friendly message from the coach to the client about protein this week. No numbers, no calories, no judgment. Offer one easy, concrete idea and ask a simple question.\n\nCONTEXT\n${json(ctx)}`,
  }),
  voice_summary: ctx => ({
    system: 'You summarize voice notes from clients for their coach. One short line, plain words. Never diagnose.',
    prompt: `Summarize this voice note in one line (what they want or report).\n\nTRANSCRIPT\n${json({ text: ctx.text })}`,
  }),
  briefing: ctx => ({
    system: `${system(ctx)}\nYou word a spoken morning briefing. Never mention health details (pain, injuries, conditions, food behaviours); say a check-in or client “is flagged for you” instead.`,
    prompt: `Word this coach’s morning briefing as 5–7 short spoken lines, under 120 words total, using only these facts: greeting with the day, number of open items, the most urgent client, check-ins (flagged first, without details), failed payments, today’s workouts, one piece of good news.\n\nFACTS\n${json(ctx.facts)}`,
  }),
  lead: ctx => ({
    system: system(ctx),
    prompt: `A prospective client messaged the coach (pasted from Instagram, text or email). Extract their first name (or "" if unknown) and goal, and draft a short friendly reply with the coach’s price and booking link.\n\nCONTEXT\n${json(ctx)}`,
  }),
};
