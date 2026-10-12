// Generates the landing (public/index.html) and pricing (public/pricing.html) pages: node scripts/gen-landing.mjs
// Output is plain HTML committed to public/; icons are inlined from public/js/shared/icons.js.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const { icon, arc, wordmark } = await import(`${root}/js/shared/icons.js`);
const check = () => icon('check');

const head = (title, desc) => `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta name="theme-color" content="#FFFFFF">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900&display=swap">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/app.css">
<link rel="stylesheet" href="/css/public.css">
</head>`;

const nav = `<header class="pub-nav">
    <a href="/" aria-label="OneJump home" style="display:flex">${wordmark()}</a>
    <nav class="links" aria-label="Sections"><a href="/#how">How it works</a><a href="/#assist">What Assist does</a><a href="/#nutrition">Nutrition</a><a href="/pricing">Pricing</a></nav>
    <div class="row"><a class="btn ghost sm" href="/login">Log in</a><a class="btn assist sm" href="/signup">Start free trial</a></div>
  </header>`;

const footer = `<footer class="footer"><div class="row between wrap" style="max-width:1180px;margin:0 auto;gap:16px">${wordmark()}<span class="small">Move · Improve · Repeat</span><nav class="row wrap small" style="gap:18px" aria-label="Footer"><a href="/pricing">Pricing</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/data-sources">Food data</a><a href="mailto:hello@onejumpfit.com">hello@onejumpfit.com</a></nav></div></footer>`;

// ---------------------------------------------------------------- plans (must match the app's plan gating)
const tiers = [
  { name: 'Starter', price: 29, sub: 'Up to 15 active clients', saves: 'Saves about 3 hours a week', blurb: 'For coaches getting started. Assist already does your check-ins and messages.',
    items: ['Assist reads every check-in and writes your reply', 'Assist writes messages in your voice', 'Assist builds workouts from a short description', 'Nutrition: habits, targets, food search and barcode scan', 'Talk instead of type in every message box', 'Free client app, workouts and progress photos', 'Payments through Stripe, plus 5 automatic reminders'] },
  { name: 'Pro', price: 59, sub: 'Up to 50 active clients', saves: 'Saves about 9 hours a week', blurb: 'The full Assist. Most of your admin, done for you.', feature: true,
    items: ['Everything in Starter, plus:', 'Talk to Assist hands-free and get spoken answers', 'A morning briefing of your day at 7 AM', 'Spots clients who might quit and writes the message', 'Nutrition with AI: photo food logging, weekly summaries and protein reminders', 'Clients log sets and food by voice, and send voice notes', 'Leads, your own booking page and custom branding'] },
  { name: 'Studio', price: 99, sub: 'Up to 150 active clients', saves: 'Handles 150 clients without hiring help', blurb: 'For busy studios. All of Pro, for a much bigger client list.',
    items: ['Everything in Pro', 'Up to 150 active clients', 'Priority support', 'Coming soon: more coaches, roles and studio-wide reports'] },
];
const pricingCards = () => `<div class="price-grid">${tiers.map(t => `<div class="card price ${t.feature ? 'feature' : ''}">
    <div class="row between"><div class="h2" style="color:inherit">${t.name}</div>${t.feature ? '<span class="assist-badge">Most popular</span>' : ''}</div>
    <div><span class="amt">$${t.price}</span><span class="muted"> /month</span></div><div class="small muted">${t.sub}</div>
    <div class="time-save">${icon('clock')}<span>${t.saves}</span></div>
    <p class="small">${t.blurb}</p>
    <ul>${t.items.map(i => `<li>${check()}<span>${i}</span></li>`).join('')}</ul>
    <div style="margin-top:auto;padding-top:8px"><a class="btn ${t.feature ? 'assist' : 'primary'}" style="width:100%" href="/signup">Start free trial</a></div>
  </div>`).join('')}</div>`;

// ---------------------------------------------------------------- landing
const heroQueue = [
  ['assist', 'clipboard', 'Mike sent his check-in', 'Summary and reply are ready. Suggests lighter legs this week.', 'Approve', '6 min'],
  ['crit', 'alert', 'Marcus may cancel', 'Missed 5 workouts and his payment failed. A message is ready.', 'Review', '10 min'],
  ['assist', 'utensils', '3 clients low on protein', 'A friendly reminder is written for each one.', 'Send all', '12 min'],
  ['warn', 'card', '2 payments failed', 'Card-update reminders are ready to send.', 'Send both', '6 min'],
];
const hours = [['Answering check-ins', 4.5, 1.5], ['Writing & changing programs', 3, 1], ['Checking food logs', 2, 0.5], ['Chasing check-ins & payments', 2.5, 0.5], ['Following up with leads', 1, 0.3]];
const before = hours.reduce((n, h) => n + h[1], 0), after = hours.reduce((n, h) => n + h[2], 0);
const max = Math.max(...hours.map(h => h[1]));
const saved = Math.round(before - after);

const jobs = [
  ['clipboard', 'Answers check-ins', 'Reads each weekly check-in, sums it up in 3 lines and writes your reply.', 'About 5 min per check-in'],
  ['utensils', 'Tracks nutrition', 'Clients log food with a photo, a barcode or their voice. Assist adds it up and shows you who’s off track.', 'About 2 hours a week'],
  ['alert', 'Spots who might quit', 'Notices clients who are slipping, tells you why in plain words, and writes the message to bring them back.', 'Keeps clients longer'],
  ['mic', 'Works by voice', 'Ask “Who hasn’t checked in?” or say “Send Marcus his message” while you drive. It answers out loud.', 'Hands-free'],
  ['speaker', 'Briefs you every morning', 'A 40-second rundown at 7 AM: who needs you, payments and one piece of good news.', 'About 15 min a day'],
  ['card', 'Chases for you', 'Sends check-in and card-update reminders in your own words, so you never chase by hand.', 'About 2 hours a week'],
];

const week = [['M', 92, true], ['T', 64, false], ['W', 100, true], ['T', 88, true], ['F', 55, false], ['S', 96, true], ['S', 0, false]];

const landing = `${head('OneJump · Save hours every week with an AI assistant for coaches', 'OneJump’s AI assistant reads check-ins, writes replies, tracks nutrition and spots clients who might quit. You just approve. Coaches get about 9 hours back every week.')}
<body>
<div class="pub light">
  ${nav}
  <main>
  <section class="hero">
    <div class="hero-in">
      <div style="padding-bottom:clamp(40px,6vw,80px)">
        <div class="eyebrow" style="color:var(--green)">For personal trainers and online coaches</div>
        <h1 style="margin-top:18px">Get ${saved} hours back<br><span class="jump-line">every <span class="jump">week.<svg viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true"><path d="M8 54C90 -8 210 -8 292 54"/><circle cx="8" cy="54" r="6"/><circle cx="292" cy="54" r="6"/></svg></span></span></h1>
        <p class="lede">OneJump comes with <b>Assist</b>, an AI helper that does your busywork. It reads check-ins, writes replies, tracks your clients’ food and spots who might quit. You check its work and tap approve.</p>
        <div class="cta"><a class="btn assist lg" href="/signup">Start free for 14 days</a><a class="btn lg outline-light" href="#how">See how it works ${icon('arrowR')}</a></div>
        <p class="fine">No card needed · Cancel any time · We move your clients over for free</p>
      </div>
      <div class="hero-shot" aria-label="Preview of the Today screen (example data)">
        <div class="row between wrap" style="padding:2px 4px 14px;gap:10px"><div><div class="eyebrow" style="color:var(--muted)">Today</div><div class="h2">4 things need you</div></div><span class="assist-badge">${arc()}Assist saved you 6h 40m this week</span></div>
        <div style="background:#fff;border:1px solid var(--line);border-radius:14px">
          ${heroQueue.map(([sev, ic, t, s, a, mins], i) => `<div class="q-item"${i ? ' style="border-top:1px solid var(--line)"' : ''}><span class="q-icon ${sev}">${icon(ic)}</span><div class="stack s4" style="min-width:0"><div class="strong small">${t}</div><div class="tiny muted">${s}</div><span class="saves">${icon('clock')}saves ${mins}</span></div><span class="btn xs ${i === 0 ? 'primary' : ''}" aria-hidden="true">${a}</span></div>`).join('')}
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-in">
      <div class="stack s16"><div class="kicker">The problem</div><h2>Coaching is the fun part. The typing isn’t.</h2>
      <p class="muted" style="max-width:62ch">With 30 clients, most coaches spend about ${Math.round(before)} hours a week reading, writing and chasing. Assist writes the first draft of all of it, so that drops to about ${Math.round(after)}.</p></div>
      <div class="week-chart">
        <div class="stack s8"><div class="row between wrap"><div class="h3">A coaching week, 30 clients</div><div class="legend"><span><i style="background:var(--stone)"></i>Without OneJump</span><span><i style="background:var(--green)"></i>With OneJump</span></div></div>
          ${hours.map(([l, b, a]) => `<div class="hours-row"><span class="muted">${l}</span><span class="stack s4"><span class="b" style="width:${(b / max) * 100}%"></span><span class="b after" style="width:${(a / max) * 100}%"></span></span><span class="num small strong" style="text-align:right">${b}h → ${a}h</span></div>`).join('')}
          <div class="tiny faint">Estimate for a coach with 30 clients. OneJump counts your real time saved every week.</div>
        </div>
        <div class="stack s16" style="justify-content:center"><div class="eyebrow">Time back, every week</div><div class="display" style="font-size:clamp(3rem,2rem + 4vw,5.5rem);line-height:.9;color:var(--green)">${saved} hours</div><p class="muted">That’s a full workday back. Take on more clients, or get your evenings back. You still make every decision; Assist just does the typing.</p></div>
      </div>
    </div>
  </section>

  <section class="section tint" id="how">
    <div class="section-in">
      <div class="stack s16"><div class="kicker">How it works</div><h2>Three steps. You stay in charge.</h2></div>
      <div class="grid g3">
        ${[['Clients log', 'Workouts, weekly check-ins and meals go into the free client app. A photo of the plate is enough.'], ['Assist does the work', 'It reads everything, writes the replies and lines up what needs you, most urgent first.'], ['You tap approve', 'Approve, edit or skip. Nothing Assist writes reaches a client without your OK.']].map(([t, p], i) => `<div class="step-card"><div class="display step-n">${i + 1}</div><div class="h2">${t}</div><p class="muted">${p}</p></div>`).join('')}
      </div>
    </div>
  </section>

  <section class="section" id="assist">
    <div class="section-in">
      <div class="stack s16"><div class="kicker">What Assist does for you</div><h2>Every job it takes off your plate.</h2><p class="muted" style="max-width:60ch">Assist is the AI inside OneJump. Think of it as an assistant who never sleeps, writes in your voice and always asks before it sends.</p></div>
      <div class="grid g3">
        ${jobs.map(([ic, t, p, s]) => `<div class="card pad stack s8 job"><span class="q-icon assist">${icon(ic)}</span><div class="h3">${t}</div><p class="muted small">${p}</p><span class="saves">${icon('clock')}${s}</span></div>`).join('')}
      </div>
      <div class="row top" style="gap:10px;color:var(--muted);font-size:.92rem">${icon('shield')}<span>Assist never gives medical advice. If a client mentions pain, an injury or a medical question, it flags it to you and suggests they see a professional. Each coach’s data is kept private and separate.</span></div>
    </div>
  </section>

  <section class="section tint" id="nutrition">
    <div class="section-in">
      <div class="split" style="align-items:center">
        <div class="stack s16"><div class="kicker">Nutrition</div><h2>Nutrition coaching, without the spreadsheets.</h2>
          <p class="muted" style="max-width:52ch">Pick what fits each client: simple habits, calorie and protein targets, or a meal plan. Clients log in seconds, and you see their whole week at a glance.</p>
          <ul class="config-list">${['Snap a photo of the plate. Assist lists the foods and portions.', 'Scan a barcode or search a large food database.', 'Or just say it: “two eggs and toast”.', 'Hide the numbers for clients who do better without counting.', 'Assist writes a friendly reminder for clients who fall behind.'].map(t => `<li>${check()}<span>${t}</span></li>`).join('')}</ul>
        </div>
        <div class="card pad stack s16" style="box-shadow:var(--shadow-2)" aria-label="Example nutrition week">
          <div class="row"><span class="av md" style="background:#CFE3D6" aria-hidden="true">MT</span><div class="grow"><div class="h3">Mike Torres</div><div class="small muted">Protein this week · target 160 g</div></div></div>
          <span class="pill good" style="align-self:flex-start"><span class="dot"></span>On target 4 of 6 days</span>
          <div class="nut-week" aria-label="Protein each day this week">${week.map(([d, v, ok]) => `<div class="stack s4" style="align-items:center"><div class="nut-bar"><i style="height:${v}%" class="${ok ? 'ok' : ''}"></i></div><span class="tiny muted">${d}</span></div>`).join('')}</div>
          <div class="assist-card pad-sm stack s8"><div class="row"><span class="assist-badge">${arc()}Assist</span></div><div class="small">Protein was low at breakfast on 2 days. A short reminder with easy breakfast ideas is ready for you to send.</div></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="pricing">
    <div class="section-in">
      <div class="stack s16"><div class="kicker">Pricing</div><h2>Simple plans. Every one saves you time.</h2><p class="muted">Every plan comes with Assist, the client app and payments. Try Pro free for 14 days, no card needed.</p></div>
      ${pricingCards()}
      <div><a class="btn" href="/pricing">Compare plans in detail ${icon('arrowR')}</a></div>
    </div>
  </section>

  <section class="section tint" id="switch">
    <div class="section-in">
      <div class="split" style="align-items:center">
        <div class="stack s16"><div class="kicker">Switching</div><h2>Moving from Trainerize, TrueCoach or Everfit?</h2><p class="muted">We move your clients and programs for you, free. Your clients get an invite to the new app with their history already in it.</p><div><a class="btn assist lg" href="/signup">Start free and book a move</a></div></div>
        <ol class="stack s16" style="list-style:none;margin:0;padding:0">${['Send us your client list and programs (even as PDFs)', 'We set everything up in OneJump; you take a quick look', 'Clients get a one-tap invite, and payments move to your Stripe account'].map((t, i) => `<li class="row top" style="gap:16px"><span class="display step-n" style="font-size:1.6rem;width:28px">${i + 1}</span><span>${t}</span></li>`).join('')}</ol>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-in" style="max-width:820px">
      <h2>Questions</h2>
      <div class="faq">
        ${[
          ['How much time will I really save?', 'Most coaches lose the most time reading check-ins and writing replies. Assist writes the first draft, so you only check and approve. OneJump counts the minutes it saves you and shows the total every week.'],
          ['Does Assist message my clients on its own?', 'No. Anything Assist writes waits for your OK. Only fixed reminders you switch on, like “your check-in is due”, send by themselves.'],
          ['Is the AI going to replace me?', 'No. Assist does the typing and the sorting; you make the decisions. Clients pay for you, and OneJump gives you more time for them.'],
          ['Do my clients have to count calories?', 'Only if you want them to. For each client you pick habits, targets or a meal plan, and you can hide the numbers completely.'],
          ['What happens with injuries or medical questions?', 'Assist never diagnoses or gives medical advice. It flags the message to you and drafts a reply that suggests seeing a qualified professional.'],
          ['Who owns my client data?', 'You do. Export it any time. OneJump never contacts or markets to your clients.'],
          ['What does it cost my clients?', 'Nothing. The client app is free for them. You charge them through your own Stripe account, and OneJump takes no cut.'],
        ].map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}
      </div>
      <div><a class="btn assist lg" href="/signup">Start free for 14 days</a></div>
    </div>
  </section>
  </main>
  ${footer}
</div>
</body>
</html>
`;

// ---------------------------------------------------------------- pricing
const yes = `<span style="color:var(--good)" aria-label="Included">${check()}</span>`, no = '<span style="color:var(--faint)" aria-label="Not included">—</span>';
const rows = [
  ['Active clients', '15', '50', '150'],
  ['Time saved each week (estimate)', 'About 3 h', 'About 9 h', 'About 9 h+'],
  ['Assist reads check-ins and writes your reply', yes, yes, yes],
  ['Assist writes messages in your voice', yes, yes, yes],
  ['Assist builds workouts from a short description', yes, yes, yes],
  ['Talk instead of type (dictation)', yes, yes, yes],
  ['Nutrition: habits, targets, food search, barcode scan', yes, yes, yes],
  ['Nutrition with AI: photo logging, weekly summaries, protein reminders', no, yes, yes],
  ['Talk to Assist hands-free, with spoken answers', no, yes, yes],
  ['Morning briefing at 7 AM', no, yes, yes],
  ['Spots clients who might quit (retention radar)', no, yes, yes],
  ['Client voice notes and logging by voice', no, yes, yes],
  ['Workouts, programs and the free client app', yes, yes, yes],
  ['Payments (no OneJump fee)', yes, yes, yes],
  ['Automatic reminders', '5', '5', '5'],
  ['Leads and your own booking page', no, yes, yes],
  ['Custom branding in the client app', no, yes, yes],
  ['Support', 'Email', 'Email + chat', 'Priority'],
];
const pricing = `${head('Pricing · OneJump', 'Simple plans for personal trainers and online coaches. Every plan includes Assist, the AI that saves you hours every week.')}
<body>
<div class="pub light">
  ${nav}
  <main>
  <section class="section">
    <div class="section-in">
      <div class="stack s16"><div class="kicker">Pricing</div><h1 class="display" style="font-size:clamp(2.2rem,1.6rem + 2.4vw,3.6rem);line-height:1">Simple plans. Every one saves you time.</h1><p class="muted" style="max-width:60ch">Every plan comes with Assist, the client app and payments. Every new account starts with 14 days of Pro for free. No card until you pick a plan.</p></div>
      ${pricingCards()}
      <section class="card table-wrap" aria-label="Compare plans"><table class="t"><thead><tr><th style="min-width:240px">Compare plans</th><th style="text-align:center;min-width:110px">Starter</th><th style="text-align:center;min-width:110px">Pro</th><th style="text-align:center;min-width:110px">Studio</th></tr></thead>
        <tbody>${rows.map(([l, ...c], i) => `<tr${i === 1 ? ' class="row-time"' : ''}><td class="small strong">${l}</td>${c.map(v => `<td class="small" style="text-align:center">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></section>
      <div class="grid g3">
        <div class="panel pad stack s8"><div class="h3">No cut of client payments</div><p class="small muted">Clients pay you through your own Stripe account. Stripe’s normal card fees apply; OneJump adds nothing.</p></div>
        <div class="panel pad stack s8"><div class="h3">AI included</div><p class="small muted">Assist is part of every plan (about 1,000 actions a month). Pro includes 300 voice minutes a month; typing and dictation are unlimited. No surprise charges.</p></div>
        <div class="panel pad stack s8"><div class="h3">Leave any time</div><p class="small muted">Month to month. Export all your data whenever you want.</p></div>
      </div>
    </div>
  </section>
  </main>
  ${footer}
</div>
</body>
</html>
`;

writeFileSync(`${root}/index.html`, landing);
writeFileSync(`${root}/pricing.html`, pricing);
console.log('wrote index.html and pricing.html', { before, after, saved });
