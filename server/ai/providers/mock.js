// MockProvider: deterministic, offline drafts with the same shape the real models return.
// It's the default (AI_PROVIDER=mock) so the whole product works without an API key, and
// its outputs double as test fixtures. It reads the same structured context the prompts embed.
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import { REFERRAL, checkText, isPain } from '../safety.js';
import { splitFoods, parseSet } from '../../../public/js/shared/parse.js';

const r1 = n => Math.round(n * 10) / 10;
const plural = (n, w, p) => `${n} ${n === 1 ? w : (p || w + 's')}`;
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const sentences = s => (String(s).match(/[^.!?]+[.!?]+/g) || [String(s)]).map(x => x.trim());

function styleWrap(style, supportive, direct, data, playful) {
  return ({ Supportive: supportive, Direct: direct ?? supportive, 'Data-driven': data ?? direct ?? supportive, Playful: playful ?? supportive })[style] || supportive;
}

// ------------------------------------------------------------------ check-ins
function checkin(ctx) {
  const k = ctx.checkin, p = ctx.previous || {}, f = ctx.client.first, style = ctx.coach?.style;
  const safety = checkText(k.text);
  const flags = [], wins = [], actions = [];
  const sore2 = k.soreness >= 7 && (p.soreness >= 7);
  if (safety.flagged) flags.push({ level: 'crit', text: isPain(safety.term) ? 'Reports pain in this check-in' : 'Mentions a medical topic' });
  if (k.soreness >= 7) flags.push({ level: 'warn', text: sore2 ? `Soreness ${k.soreness}/10 for 2 weeks running` : `Soreness up to ${k.soreness}/10` });
  if (k.sleepHours != null && p.sleepHours != null && k.sleepHours < p.sleepHours - 0.4) flags.push({ level: 'warn', text: `Sleep down to ${k.sleepHours} h (from ${p.sleepHours} h)` });
  if (k.nutrition != null && k.nutrition <= 5) flags.push({ level: 'warn', text: `Nutrition adherence ${k.nutrition}/10` });
  if (ctx.plateauWeeks >= 3) flags.push({ level: 'warn', text: `Weight flat for ${ctx.plateauWeeks} weeks` });
  const wk = ctx.weightChange?.week, tot = ctx.weightChange?.total;
  const losing = /fat|lose|loss/i.test(`${ctx.client.goalType} ${ctx.client.goal}`);
  if (wk != null && wk < 0 && losing) wins.push(`Down ${Math.abs(wk)} lb this week${tot != null && tot < 0 ? ` (${Math.abs(tot)} lb total)` : ''}`);
  if (k.workoutsPlanned && k.workoutsDone >= k.workoutsPlanned) wins.push(`All ${k.workoutsPlanned} workouts done`);
  if (k.energy >= 8) wins.push(`Energy ${k.energy}/10`);
  const travel = /travel|road|hotel|trip|flight/i.test(k.text || '');
  const done = k.workoutsPlanned ? `${k.workoutsDone} of ${k.workoutsPlanned} workouts` : `${plural(k.workoutsDone || 0, 'workout')}`;
  let summary, reply;

  if (safety.flagged) {
    summary = `${f} completed ${done}. They report ${isPain(safety.term) ? 'pain' : 'a medical concern'} in this check-in (“${excerpt(k.text, safety.term)}”). That’s outside coaching scope: recommend they see a physical therapist or sports-medicine doctor before loading it again.`;
    actions.push({ kind: 'adjust', label: 'Pause the movements that bother it until they’ve been assessed', detail: 'Your call: train around it with exercises that feel fine. Assist won’t suggest loading through pain.', minutes: 10, op: { type: 'add_note', text: `Reported ${safety.term} in check-in. Paused painful movements until assessed.` } });
    actions.push({ kind: 'reply', label: 'Send the drafted reply (includes referral)', minutes: 6 });
    actions.push({ kind: 'note', label: `Add a note to ${f}’s profile: ${safety.term} reported`, minutes: 2, op: { type: 'add_note', text: `${cap(safety.term)} reported in weekly check-in.` } });
    reply = `${wins.length ? `${wins[0]}, nice work. ` : 'Thanks for the check-in. '}About what you mentioned: I don’t want you training through it. ${REFERRAL} Until then we’ll keep training everything that feels fine. Let me know what they say.`;
  } else if (sore2 || (k.soreness >= 7 && k.sleepHours != null && p.sleepHours != null && k.sleepHours < p.sleepHours - 0.4)) {
    summary = `${f} completed ${done}${wk != null && wk < 0 && losing ? ` and is down another ${Math.abs(wk)} lb${tot != null && tot < 0 ? ` (${Math.abs(tot)} lb since starting)` : ''}` : ''}. Soreness has been ${k.soreness}/10${sore2 ? ' for two weeks' : ''}${k.sleepHours != null ? ` while sleep is at ${k.sleepHours} hours` : ''}. Consider reducing leg volume this week and putting the focus on recovery.`;
    actions.push({ kind: 'adjust', label: 'Reduce lower-body volume about 25% this week', detail: 'Remove 1 set from each lower-body exercise. Keep load and RPE 7.', minutes: 12, op: { type: 'reduce_volume', area: 'lower' } });
    if (k.sleepHours != null && k.sleepHours < 7) actions.push({ kind: 'habit', label: 'Add a 7-hour sleep target to their habits', detail: 'They’ll see it on their Today screen.', minutes: 3, op: { type: 'add_tag', text: 'Sleep 7+ hours' } });
    actions.push({ kind: 'reply', label: 'Send the drafted reply', minutes: 6 });
    reply = styleWrap(style,
      `Thanks for the check-in, ${f}. ${wk != null && wk < 0 && losing ? `Down another ${Math.abs(wk)} lb is great work during a busy week. ` : 'Solid week. '}${sore2 ? 'Two weeks of high soreness' : 'High soreness'}${k.sleepHours != null && k.sleepHours < 7 ? ' plus short sleep' : ''} tells me we should pull back a little, so I’ve trimmed one set from each leg exercise this week. Same weights, less volume. Aim for 7 hours of sleep where you can. How’s the rest of the week looking?`,
      `${wk != null && wk < 0 ? `Down ${Math.abs(wk)} lb, good. ` : ''}Soreness at ${k.soreness} ${sore2 ? 'two weeks running ' : ''}means too much leg volume, so I cut a set from each lower-body lift. Sleep 7 hours.`,
      `${wk != null ? `Weight: ${wk > 0 ? '+' : '−'}${Math.abs(wk)} lb${tot != null ? ` (${tot > 0 ? '+' : '−'}${Math.abs(tot)} total)` : ''}. ` : ''}Soreness ${k.soreness}/10${sore2 ? ' for 2 weeks' : ''}; sleep ${k.sleepHours} h. Lower-body volume −25% this week; load unchanged.`,
      `${wk != null && wk < 0 ? `Another ${Math.abs(wk)} lb gone! ` : ''}Your legs are clearly filing a complaint, so we’re giving them a lighter week. Sleep is your secret weapon this week.`);
  } else if (ctx.plateauWeeks >= 3 || (k.nutrition != null && k.nutrition <= 5)) {
    summary = `${f} trained ${done}${travel ? ' despite travel' : ''}. ${ctx.plateauWeeks >= 3 ? `Weight has been within 0.5 lb for ${ctx.plateauWeeks} weeks` : 'Progress is slowing'}${k.nutrition != null && k.nutrition <= 5 ? ` and nutrition adherence dropped to ${k.nutrition}/10` : ''}.${/frustrat|annoy|stuck|not working/i.test(k.text || '') ? ' They sound frustrated, so the reply matters more than the program this week.' : ''}`;
    if (travel) actions.push({ kind: 'adjust', label: 'Add a 30-minute hotel-gym workout to their program', detail: 'Dumbbells and bodyweight only, for travel days.', minutes: 15, op: { type: 'add_note', text: 'Add a 30-minute hotel workout for travel days.' } });
    actions.push({ kind: 'habit', label: 'Set a simple protein-at-every-meal goal', detail: 'You set the numbers. Assist doesn’t prescribe diets.', minutes: 4, op: { type: 'add_tag', text: 'Protein at every meal' } });
    actions.push({ kind: 'reply', label: 'Send the drafted reply', minutes: 6 });
    reply = `I know the scale sitting still is frustrating, ${f}. ${k.workoutsDone ? `${cap(plural(k.workoutsDone, 'workout'))}${travel ? ' during a travel week' : ''} is exactly the consistency that pays off. ` : ''}A few weeks at the same weight usually means food on busy days is the lever, not more training. ${travel ? 'I added a 30-minute hotel workout and' : 'Let’s add'} a simple protein-at-every-meal goal. Want to do a quick call this week to plan the next few weeks?`;
  } else {
    summary = `${f} completed ${done}${k.energy != null ? ` with good energy (${k.energy}/10)` : ''}${k.sleepHours != null ? ` and sleep (${k.sleepHours} h)` : ''}. Nothing needs changing; a short note of encouragement is enough.`;
    actions.push({ kind: 'reply', label: 'Send the drafted reply', minutes: 4 });
    reply = styleWrap(style, `Great week, ${f}. ${wins[0] ? `${wins[0]}. ` : ''}Everything is moving in the right direction, so we’ll keep the plan as is. Keep it up!`, `Good week, ${f}. No changes. Keep going.`, `Good week, ${f}: ${done}${k.sleepHours != null ? `, sleep ${k.sleepHours} h` : ''}. Plan stays the same.`, `Look at you, ${f}! Plan stays the same because it’s working. Keep it rolling!`);
  }
  const n = ctx.nutrition;
  if (n && n.daysLogged != null) summary += ` Food log: ${n.daysLogged} of 7 days logged${n.proteinHitDays != null ? `, protein target reached on ${n.proteinHitDays}` : ''}.`;
  return { summary, flags, wins: wins.slice(0, 4), actions: actions.slice(0, 3), reply };
}
function excerpt(text, term) {
  const s = sentences(text).find(x => x.toLowerCase().includes(String(term).toLowerCase())) || String(text);
  return s.length > 110 ? s.slice(0, 107) + '…' : s.replace(/[.!?]$/, '');
}

// ------------------------------------------------------------------ messages
function message(ctx) {
  const f = ctx.client?.first || 'there', style = ctx.coach?.style;
  const c = ctx.client || {};
  const lastClient = [...(ctx.lastMessages || [])].reverse().find(m => m.from === 'client');
  const T = {
    motivate: () => `Hey ${f}! Quick reminder of how far you’ve come: ${c.workoutsDone || 'a lot of'} workouts done${ctx.weightChange?.total < 0 && /fat|lose/i.test(`${c.goalType} ${c.goal}`) ? ` and ${Math.abs(ctx.weightChange.total)} lb down` : ''}. The work you’re doing now is what gets you to “${(c.goal || 'your goal').toLowerCase()}”. One session at a time. I’m proud of you.`,
    professional: () => `Hi ${f}, thanks for the update. I’ve reviewed your last week and I’ll keep your program on track${c.week ? ` for week ${c.week}` : ''}. If anything changes with your schedule, let me know and I’ll adjust it.`,
    consistency: () => `${f}, the clients who get results aren’t the ones with perfect weeks. They’re the ones who keep showing up after an imperfect one. Even two short sessions this week keeps the momentum going. What’s one session you can lock in?`,
    recovery: () => `Recovery tip for this week, ${f}: keep your sessions at an easier effort (about RPE 6), walk 20–30 minutes on rest days, and aim for 7+ hours of sleep. Soreness should ease within a few days. If anything feels like pain rather than soreness, tell me.`,
    missed: () => `Hey ${f}, I noticed a couple of sessions slipped this week. No stress, it happens to everyone. What got in the way? If your schedule changed, I can adjust the plan so it fits.`,
    'checkin-reminder': () => `Hey ${f}! Just checking in. I noticed you haven’t sent your weekly check-in yet. How are you feeling this week?`,
    payment: () => `Hi ${f}, your last payment didn’t go through. You can update your card in the app under Me → Billing. Thanks!`,
    congrats: () => `${f}! That was workout #${ctx.milestone || c.workoutsDone || 50} with me. That’s ${ctx.milestone || c.workoutsDone || 50} times you showed up. Huge.`,
    risk: () => riskDraft(ctx),
    'checkin-reply': () => `Thanks for the check-in, ${f}. Everything is moving in the right direction, so we’ll keep the plan as is.`,
    'reply-last': () => replyLast(f, lastClient?.text || ''),
  };
  let text;
  if (ctx.intent === 'shorter') {
    const src = ctx.current || T.professional();
    const s = sentences(src);
    text = s.slice(0, Math.max(1, Math.ceil(s.length / 2))).join(' ').trim();
  } else {
    text = (T[ctx.intent] || T.professional)();
    if (style === 'Direct' && ctx.intent !== 'reply-last') text = sentences(text).slice(0, 2).join(' ');
  }
  return { text };
}
function replyLast(f, last) {
  const s = checkText(last);
  if (s.flagged) return `Thanks for flagging it, ${f}. Please don’t push on with anything that hurts. ${isPain(s.term) ? REFERRAL : 'Please check with your doctor before we change anything.'} We’ll keep training everything else in the meantime.`;
  if (/sore|doms|wrecked|tight/i.test(last)) return `Totally normal after a harder session, ${f}, especially if sleep was short. It should ease in 2–3 days. Keep moving gently and let me know if it ever feels sharp or like pain rather than soreness.`;
  if (/swap|move|resched|switch|instead of|can we/i.test(last)) return `Of course, ${f}. That works. Just keep a rest day between your next two sessions and you’re all set.`;
  if (/\?/.test(last)) return `Good question, ${f}. Short answer: yes, that’s fine. I’ll keep an eye on it in your next check-in.`;
  if (/!|great|good|better|pr\b|done/i.test(last)) return `Love this, ${f}! That’s exactly the kind of week that adds up. Keep it going.`;
  return `Thanks ${f}, got it. I’ll get back to you shortly with a plan.`;
}

// ------------------------------------------------------------------ risk
function riskDraft(ctx) {
  const f = ctx.client?.first || 'there';
  const reasons = (ctx.risk?.reasons || []).join(' | ').toLowerCase();
  if (/said “|frustrat|tone/.test(reasons)) return `Hey ${f}, I’ve been thinking about what you said, and you’re right that the plan has to fit your life, not the other way round. Can we do 15 minutes this week? I’ll bring a lighter version built around your schedule. ${ctx.client?.goal ? 'Your goal is very doable from here.' : ''}`.trim();
  if (/weight flat|progress slowing/.test(reasons)) return `Hey ${f}, I can tell the plateau is getting to you, and that’s fair. Let’s do a 15-minute call this week and make a simple plan for the next few weeks. You’re doing the hard part already.`;
  if (/missed/.test(reasons)) return `Hey ${f}, I noticed the last couple of weeks have been tough to fit training in, which is completely normal. Would 3 shorter sessions a week work better for now? Tell me what your schedule looks like and I’ll rebuild the plan around it.`;
  if (/check-in/.test(reasons)) return `Hi ${f}, how are you doing? I haven’t seen a check-in for a bit. Would it help to move your check-in to a different day or shorten sessions for a while?`;
  if (/payment/.test(reasons)) return `Hi ${f}, how are things going with training? Quick heads-up that your last payment didn’t go through; you can update your card in the app under Me → Billing.`;
  return `Hey ${f}, just checking in. How are things going with training lately?`;
}
function risk(ctx) {
  const f = ctx.client.first, r = ctx.risk, reasons = r.reasons || [];
  const has = re => reasons.some(x => re.test(x));
  const parts = [];
  const missed = reasons.find(x => /Missed/.test(x));
  if (missed) parts.push(missed.replace(/^Missed/, 'missed').replace(/ in the last 14 days/, ' in two weeks'));
  const ci = reasons.find(x => /check-in/.test(x));
  if (ci) parts.push(/weeks/.test(ci) ? `hasn’t checked in for ${ci.match(/\d+/)?.[0] || 'two'} weeks` : 'skipped last week’s check-in');
  if (has(/Messaging/)) parts.push('is messaging far less than usual');
  if (has(/payment/)) parts.push('their last payment failed');
  if (has(/Said|Frustrated/)) parts.push('their recent messages sound doubtful');
  if (has(/Weight flat|Progress slowing/)) parts.push('their weight has stalled');
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] || 'shows a few early warning signs';
  const early = ctx.client.daysSinceStart != null && ctx.client.daysSinceStart <= 45 ? ` They’re ${ctx.client.daysSinceStart} days in, which is when early dropouts usually happen.` : '';
  const explanation = r.level === 'HIGH'
    ? `${f} is one of the clients most likely to cancel: they ${list}.${early}`
    : `${f}’s engagement is slipping: they ${list}. Nothing alarming, but a personal touch now is cheaper than a win-back later.${early}`;
  let action;
  if (has(/Said|Frustrated/) && has(/payment/)) action = `Offer ${f} a short call and a lighter plan built around their schedule. Sort the payment after the conversation, not before.`;
  else if (has(/Said|Frustrated/)) action = `Book a 15-minute call with ${f}; reply to their last message first.`;
  else if (has(/Weight flat/)) action = `Book a 15-minute call with ${f} to plan the next block; reply to their check-in first.`;
  else if (missed) action = `Send ${f} a supportive message and ask whether the current program is still realistic.`;
  else if (ci) action = `Offer ${f} a different check-in day and shorter sessions for a few weeks.`;
  else if (has(/payment/)) action = `Ask ${f} how training is going. The card-update reminder goes out separately.`;
  else action = `Send ${f} a quick personal check-in.`;
  return { explanation, action, draft: riskDraft(ctx) };
}

// ------------------------------------------------------------------ workouts
function workout(ctx) {
  const b = ctx.brief, lib = ctx.library;
  const eq = new Set((b.equipment || []).map(x => x.toLowerCase()));
  const fullGym = eq.has('full gym');
  const has = e => ['bodyweight', 'band'].includes(e.equipment.toLowerCase()) || fullGym || eq.has(e.equipment.toLowerCase());
  const knee = /knee/i.test(b.injuries || ''), shoulder = /shoulder/i.test(b.injuries || ''), back = /back/i.test(b.injuries || '');
  const rand = rng((b.seed || 1) * 97 + (b.minutes || 45));
  let pool = lib.filter(has);
  if (knee) pool = pool.filter(e => !e.kneeLoad);
  if (shoulder) pool = pool.filter(e => !e.overhead && !/Dips|Bench press$|Push press/.test(e.name));
  if (back) pool = pool.filter(e => !/Deadlift|Good morning|Barbell row|Back squat/.test(e.name));
  if (b.prefs) { const avoid = b.prefs.toLowerCase(); pool = pool.filter(e => !avoid.includes('no ' + e.name.toLowerCase())); }
  if (b.level === 'Beginner') { const easy = pool.filter(e => e.level !== 'Advanced'); if (easy.length > 8) pool = easy; }
  const used = new Set();
  const pick = pats => { const c = pool.filter(e => pats.includes(e.pattern) && !used.has(e.id)); if (!c.length) return null; const e = c[Math.floor(rand() * c.length)]; used.add(e.id); return e; };
  const minutes = b.minutes || 45;
  const n = minutes <= 30 ? 4 : minutes <= 45 ? 5 : minutes <= 60 ? 6 : 7;
  const goal = b.goal || 'General fitness';
  const order = goal === 'Athletic performance'
    ? [['jump'], ['squat', 'lunge'], ['hinge'], ['push'], ['pull'], ['core', 'carry'], ['cardio']]
    : [['squat', 'lunge'], ['hinge'], ['push'], ['pull'], ['lunge', 'squat'], ['core', 'carry'], ['cardio', 'iso']];
  const exs = order.slice(0, n).map(pick).filter(Boolean);
  const beginner = b.level === 'Beginner';
  const scheme = {
    'Fat loss': { sets: beginner ? 2 : 3, reps: '10–12', rpe: '7', rest: '60' },
    Strength: { sets: beginner ? 3 : 4, reps: '5', rpe: '7–8', rest: '150' },
    'Muscle gain': { sets: beginner ? 3 : 4, reps: '8–12', rpe: '8', rest: '90' },
    'Athletic performance': { sets: 3, reps: '5', rpe: '7', rest: '120' },
    'General fitness': { sets: beginner ? 2 : 3, reps: '8–10', rpe: '7', rest: '75' },
  }[goal] || { sets: 3, reps: '10', rpe: '7', rest: '75' };
  let blocks = exs.map((e, i) => {
    const acc = i >= 3, jump = e.pattern === 'jump', cardio = e.pattern === 'cardio';
    const reps = jump ? '5' : cardio ? '6 × 30 s' : e.pattern === 'carry' ? '40 m' : e.pattern === 'core' ? '8 each side' : acc && goal === 'Strength' ? '8–10' : scheme.reps;
    const sets = Array.from({ length: cardio ? 1 : scheme.sets }, () => ({ reps, load: e.equipment === 'Bodyweight' ? 'BW' : '', rpe: cardio ? '8' : scheme.rpe, rest: acc ? '60' : scheme.rest }));
    return { kind: 'single', items: [{ exerciseId: e.id, tempo: i < 2 && goal !== 'Athletic performance' ? '3-0-1' : '', notes: knee && ['squat', 'lunge'].includes(e.pattern) ? 'Pain-free range only' : '', sets }] };
  });
  if (blocks.length >= 5 && minutes <= 60) { const a = blocks.splice(3, 2); blocks.splice(3, 0, { kind: 'superset', items: [a[0].items[0], a[1].items[0]] }); }
  const notes = [];
  if (knee) notes.push('Knee limitation noted: deep knee-bending and jumping exercises were left out. If the client has pain, they should see a qualified professional; this isn’t a rehab plan.');
  if (shoulder) notes.push('Shoulder limitation noted: overhead pressing and dips were left out. This isn’t a rehab plan.');
  if (back) notes.push('Back limitation noted: heavy spinal-loading lifts were left out. This isn’t a rehab plan.');
  const name = `${goal === 'Fat loss' ? 'Full-body conditioning' : goal === 'Strength' ? 'Strength day' : goal === 'Athletic performance' ? 'Power + strength' : goal === 'Muscle gain' ? 'Hypertrophy day' : 'Full-body session'}`;
  return {
    name, estMinutes: minutes, blocks, notes,
    rationale: `${scheme.sets} working sets of ${scheme.reps} at RPE ${scheme.rpe} suits a ${(b.level || 'intermediate').toLowerCase()} client focused on ${goal.toLowerCase()}. Big movements come first while fresh; accessories are paired to fit ${minutes} minutes.`,
  };
}

// ------------------------------------------------------------------ adjustments
function adjust(ctx) {
  const f = ctx.client.first, items = [];
  const cis = ctx.recentCheckins || [];
  if (ctx.safety?.flagged) items.push({ text: `${f} reported ${ctx.safety.term} recently. Assist won’t suggest loading that area until they’ve been assessed by a qualified professional.`, change: 'Your decision: pause the movements that bother it', why: 'Pain or medical topic reported', op: { type: 'none' } });
  if (cis.length >= 2 && cis[0].soreness >= 7 && cis[1].soreness >= 7) items.push({ text: `${f} has reported high soreness for two consecutive weeks. Consider reducing lower-body volume this week.`, change: 'One fewer set on each lower-body exercise this week', why: `Soreness ${cis[0].soreness}/10 and ${cis[1].soreness}/10`, op: { type: 'reduce_volume', area: 'lower' } });
  const stuck = (ctx.lifts || []).find(l => l.sessionsAtLoad >= 2 && l.lastRpe != null && l.lastRpe <= 7 && l.lastLoad > 0);
  if (stuck && !ctx.safety?.flagged) items.push({ text: `${stuck.name} has been at ${stuck.lastLoad} lb for ${stuck.sessionsAtLoad} sessions at RPE ${stuck.lastRpe}. When soreness settles, consider moving up.`, change: `${stuck.name}: ${stuck.lastLoad} → ${stuck.lastLoad + (stuck.lower ? 10 : 5)} lb`, why: `${stuck.sessionsAtLoad} sessions at RPE ≤ 7`, op: { type: 'increase_load', exerciseId: stuck.exerciseId, amount: stuck.lower ? 10 : 5 } });
  if (ctx.client.adherence != null && ctx.client.adherence < 60) items.push({ text: `${f} completed ${ctx.client.adherence}% of sessions over 4 weeks. Consider fewer, shorter sessions while life is busy.`, change: `${ctx.client.daysPerWeek || 4} → ${Math.max(2, (ctx.client.daysPerWeek || 4) - 1)} days a week, shorter sessions`, why: 'Low completion', op: { type: 'fewer_days' } });
  if (!items.length) items.push({ text: `${f} is on track. No changes suggested this week.`, change: 'None', why: `Adherence ${ctx.client.adherence ?? '—'}%`, op: { type: 'none' } });
  return { items: items.slice(0, 3) };
}

// ------------------------------------------------------------------ progress
function progress(ctx) {
  const out = [], w = (ctx.weights || []).map(x => x.value);
  const weeks = Math.max(1, w.length - 1);
  if (w.length >= 2) {
    const dw = r1(w[w.length - 1] - w[0]);
    if (dw < -1) out.push({ tone: 'good', title: `Down ${Math.abs(dw)} lb in ${plural(weeks, 'week')}`, text: `About ${(Math.abs(dw) / weeks).toFixed(1)} lb a week, or ${(Math.abs(dw) / weeks / w[0] * 100).toFixed(1)}% of body weight per week.` });
    else if (ctx.plateauWeeks >= 3) out.push({ tone: 'warn', title: `Weight flat for ${ctx.plateauWeeks} weeks`, text: `Within 0.5 lb while workouts continued. Food on busy days is a likely lever; check with ${ctx.client.first} before changing anything.` });
    else if (dw > 1) out.push({ tone: 'info', title: `Up ${dw} lb in ${plural(weeks, 'week')}`, text: /muscle|strength/i.test(ctx.client.goalType || '') ? 'In line with a muscle or strength goal.' : 'Worth a conversation if fat loss is the goal.' });
    else out.push({ tone: 'info', title: 'Weight steady', text: `Within ${Math.abs(dw)} lb over ${plural(weeks, 'week')}.` });
  }
  const l = ctx.keyLift;
  if (l && l.values.length >= 2) {
    const lg = r1(l.values[l.values.length - 1] - l.values[0]);
    if (lg > 0) out.push({ tone: 'good', title: `${l.name} up ${lg} lb`, text: `${l.values[0]} → ${l.values[l.values.length - 1]} lb over the same period (${Math.round(lg / Math.max(1, l.values[0]) * 100)}%).` });
  }
  if (ctx.client.adherence != null) {
    const a = ctx.client.adherence;
    out.push({ tone: a >= 80 ? 'good' : a >= 65 ? 'warn' : 'crit', title: `Adherence ${a}% over 4 weeks`, text: a >= 80 ? 'Consistent. Progress is coming from showing up.' : 'Consistency is the main thing to work on before changing the program.' });
  }
  if (ctx.waist && ctx.waist.length === 2) { const d = r1(ctx.waist[1] - ctx.waist[0]); if (d) out.push({ tone: d < 0 ? 'good' : 'info', title: `Waist ${d < 0 ? 'down' : 'up'} ${Math.abs(d)} in`, text: 'From the first and latest measurements.' }); }
  if (!out.length) out.push({ tone: 'info', title: 'Not enough data yet', text: `Trends appear after ${ctx.client.first} logs a few workouts and check-ins.` });
  return { items: out.slice(0, 4), note: 'Based only on data logged in OneJump. Assist describes trends; it doesn’t make medical or body-composition claims.' };
}

// ------------------------------------------------------------------ leads
function lead(ctx) {
  const dm = String(ctx.dm || '');
  const goal = (dm.match(/(?:want to|trying to|looking to|goal is to|hoping to)\s+([^.!?\n]+)/i)?.[1] || dm.match(/(?:help with|help me)\s+([^.!?\n]+)/i)?.[1] || '').trim();
  const name = dm.match(/(?:\b[Ii]['’]?m|[Mm]y name is|[Tt]his is)\s+([A-Z][a-z]+)/)?.[1] || '';
  const price = ctx.coach?.price ? `My online coaching is ${ctx.coach.price}. ` : '';
  const link = ctx.coach?.bookingLink ? ` Pick a time here: ${ctx.coach.bookingLink}` : '';
  return { name, goal: goal ? cap(goal) : '', reply: `Hey${name ? ' ' + name : ''}! ${goal ? `${cap(goal)} is a great goal. ` : 'Thanks for reaching out! '}${price}Want to hop on a free 20-minute call?${link}` };
}

// ------------------------------------------------------------------ nutrition (fixtures)
export const MEAL_PHOTOS = [
  { title: 'Chicken & rice bowl', items: [['Grilled chicken breast', 170, 'about 6 oz', 'high', [281, 52.7, 0, 6.1]], ['White rice, cooked', 158, 'about 1 cup', 'medium', [205, 4.3, 44.6, 0.5]], ['Broccoli, cooked', 90, 'about ½ cup', 'medium', [32, 2.2, 6.5, 0.4]]] },
  { title: 'Eggs, toast and avocado', items: [['Eggs, scrambled', 100, '2 eggs', 'high', [155, 12.6, 1.1, 10.6]], ['Whole-wheat toast', 64, '2 slices', 'high', [161, 7.9, 27.3, 2.2]], ['Avocado', 75, 'about ½ avocado', 'medium', [120, 1.5, 6.4, 11]]] },
  { title: 'Salmon salad', items: [['Salmon, cooked', 140, 'about 5 oz', 'medium', [288, 30.8, 0, 16.8]], ['Mixed salad greens', 85, 'about 2 cups', 'high', [14, 1.3, 2.8, 0.2]], ['Olive oil dressing', 14, 'about 1 tbsp', 'low', [124, 0, 0, 14]]] },
  { title: 'Greek yogurt bowl', items: [['Greek yogurt, plain', 170, '1 container', 'high', [100, 17.3, 6.1, 0.7]], ['Blueberries', 75, 'about ½ cup', 'medium', [43, 0.5, 10.9, 0.2]], ['Granola', 30, 'about ¼ cup', 'low', [141, 3, 19.2, 6]]] },
  { title: 'Burger and fries', items: [['Cheeseburger', 120, '1 burger', 'high', [316, 16.8, 32.4, 13.2]], ['French fries', 117, '1 medium serving', 'medium', [365, 4, 48, 17.6]]] },
];
/** Offline photo "analysis": a near-uniform image (blank, dark, a wall) isn't food; otherwise a fixture picked from the image bytes. */
function meal_photo(ctx) {
  const buf = ctx.image;
  let isFood = true;
  try {
    const img = jpeg.decode(buf, { useTArray: true, maxResolutionInMP: 20, maxMemoryUsageInMB: 256 });
    let n = 0, sum = 0, sq = 0;
    for (let i = 0; i < img.data.length; i += 4 * 37) { const l = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]; sum += l; sq += l * l; n++; }
    const sd = Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
    isFood = sd > 12;
  } catch { isFood = false; }
  if (!isFood) return { is_food: false, title: '', items: [], note: 'Portions are estimated from the photo.' };
  const pick = MEAL_PHOTOS[parseInt(createHash('sha1').update(buf).digest('hex').slice(0, 8), 16) % MEAL_PHOTOS.length];
  return { is_food: true, title: pick.title, items: pick.items.map(([name, grams, portion_text, confidence, [c, p, cb, f]]) => ({ name, grams, portion_text, confidence, estimate: { calories: c, protein_g: p, carbs_g: cb, fat_g: f } })), note: 'Portions are estimated from the photo.' };
}
function food_text(ctx) {
  return { items: splitFoods(ctx.text).map(x => ({ name: x.food, qty: x.qty, unit: x.unit, grams: x.unit === 'g' ? x.qty : x.unit === 'oz' ? Math.round(x.qty * 28.35) : null })) };
}
function set_text(ctx) {
  const r = parseSet(ctx.text);
  return { reps: r?.reps ?? null, weight: r?.weight ?? null, bodyweight: !!r?.bodyweight };
}
function nutrition_summary(ctx) {
  const f = ctx.client?.first || 'They', w = ctx.week, t = ctx.targets || {};
  const logged = `${f} logged food on ${w.daysLogged} of 7 days`;
  const protein = t.proteinG && w.daysLogged ? ` and reached the protein target on ${w.proteinHitDays} of them` : '';
  const cal = t.calories && w.avgCalories ? ` Calories averaged about ${w.avgCalories.toLocaleString('en-US')} on logged days (target ${t.calories.toLocaleString('en-US')}).` : '';
  const wins = [], focus = [];
  if (w.daysLogged >= 5) wins.push(`Logged ${w.daysLogged} days this week`);
  if (t.proteinG && w.proteinHitDays >= 4) wins.push(`Protein target reached on ${w.proteinHitDays} days`);
  if (w.photos >= 3) wins.push('Uses photo logging regularly');
  if (w.daysLogged < 3) focus.push('Logging on more days so the picture is clearer');
  if (t.proteinG && w.daysLogged >= 3 && w.proteinHitDays * 2 < w.daysLogged) focus.push('Adding a protein source to breakfast and lunch');
  if (ctx.habits?.some(h => h.daysThisWeek <= 2)) focus.push(`Habit to revisit: ${ctx.habits.find(h => h.daysThisWeek <= 2).title}`);
  return { summary: `${logged}${protein}.${cal}`, wins: wins.slice(0, 3), focus: focus.slice(0, 3) };
}
function nutrition_nudge(ctx) {
  const f = ctx.client?.first || 'there';
  return { text: styleWrap(ctx.coach?.style,
    `Hey ${f}! Quick nutrition note: protein has been on the lighter side most days this week. An easy win is adding a palm-sized portion to breakfast and lunch, like eggs, Greek yogurt, chicken or tofu. Want me to send a few quick ideas that fit your week?`,
    `${f}, protein was light most days this week. Add a palm-sized portion at breakfast and lunch. Want a few easy options?`,
    `${f}, protein came in under target on most logged days this week. Adding one portion at breakfast and one at lunch would close most of the gap. Want a short list of options?`,
    `${f}! Your protein has been playing hide and seek this week. Let’s find it: a palm-sized portion at breakfast and lunch does the trick. Want some easy ideas?`) };
}
function voice_summary(ctx) {
  const s = sentences(ctx.text || '').map(x => x.replace(/^(hey|hi|hello)[ ,]+\w+[ ,]+/i, '').replace(/^(so|um|uh|okay|ok)[ ,]+/i, '')).filter(Boolean);
  const ask = s.find(x => /\?|can we|could we|can i|should i|is it ok|move|swap|reschedul/i.test(x)) || s[0] || 'Voice note';
  const line = ask.replace(/[.!?]+$/, '');
  return { summary: (line.length > 120 ? line.slice(0, 117) + '…' : cap(line)) };
}
function briefing(ctx) { return { lines: ctx.facts.lines }; }

const TASKS = { checkin, message, risk, workout, adjust, progress, lead, meal_photo, food_text, set_text, nutrition_summary, nutrition_nudge, voice_summary, briefing };

export class MockProvider {
  constructor() { this.name = 'mock'; this.model = 'mock-assist-1'; }
  async complete({ task, input }) {
    const fn = TASKS[task];
    if (!fn) throw new Error(`Mock provider has no template for ${task}`);
    return { data: fn(input), usage: { inputTokens: 0, outputTokens: 0, costMicros: 0 }, model: this.model };
  }
}
