# Progress

_Last updated: October 9, 2026_

## Now building: Voice + Nutrition (approved Oct 8)

Spec: `03-voice-and-nutrition-spec.md`. Everything runs on mock voice, AI and food data until the keys below exist.

- [x] **Foundation:** new tables (voice, proposals, briefings, nutrition), tenant rules for them (plus a guard against nested writes), **Ask Assist** (typed) with read-only tools and confirmation cards
- [x] **Step 1 · Nutrition basics:** approach per client (habits / targets / meal plan), Hide numbers, targets + calculator (Mifflin-St Jeor) + low-target warning with required review (audited), habits with streaks, quick add, food search (USDA, cached 30 days), barcode (Open Food Facts), favorites and “repeat yesterday”, coach Nutrition page and Client → Nutrition tab, client Nutrition screen, data sources page, sample data
- [x] **Step 2 · Dictation everywhere:** 🎤 on every message box (inbox, client chat, every Edit box, check-in replies), client notes, the “+ Lead” paste box, lead follow-ups, Ask Assist, the client’s check-in and workout notes. Browser speech recognition with live text; nothing is sent automatically; hidden where unsupported; privacy policy updated. (Community isn’t built yet; its post box will get the same button.)
- [x] **Step 3 · Assist on nutrition:** photo logging (camera, resized and EXIF-stripped in the browser and again on the server; Assist identifies foods and grams, the server matches USDA and does the math; nothing saved before Add; monthly and daily photo caps), weekly nutrition summary with charts, Today item “N clients missed their protein target most days” with a personal number-free draft each, “Who’s struggling with nutrition?” in Ask Assist, coach-only language flags (urgent ones alert the coach right away, by notification and email), no supplement or medical nutrition advice in drafts, radar +6 when logging stops and +4 when protein is rarely hit, fast-loss alert, food-log stats next to the check-in nutrition rating
- [ ] Step 4 · Talk to Assist (voice) with confirmation cards
- [ ] Step 5 · Client voice: set logging, voice notes, voice food logging
- [ ] Step 6 · Morning briefing

**Tests:** `npm test` → lint passes, **112 API tests pass** (27 new nutrition tests from the spec’s acceptance criteria).

## MVP: built ✅

Every item on the 12-week MVP checklist in `docs/02-mvp-build-plan.md` is built and runs end to end with the sample data, using mock AI, mock payments, console email and local photo storage. The only things left need your accounts (below) or are yours to do (moving your own coaching off Everfit, onboarding the pilot coaches).

**Tests:** `npm test` → lint passes, **85 API tests pass**. `npm run test:e2e` → **14 browser tests pass** (desktop + phone).

## Done

**Foundation**
- [x] MySQL 8 schema (31 tables) with Prisma 7, migrations, two DB users (app vs migrate)
- [x] Tenant-scoped data layer `dbFor(session)` + lint rule + isolation tests (database level and over HTTP)
- [x] Sessions in MySQL, argon2 passwords, CSRF, helmet + strict CSP, rate limits, zod on every body
- [x] Sample data: Reyes Strength (18 clients, programs, check-ins, messages, payments, leads) and a second business (Northside Barbell) to prove isolation

**Weeks 1–3: accounts and building**
- [x] Sign up, log in, two-step login (TOTP) for coaches, client email login links
- [x] 10-step onboarding from the prototype, finish summary, “load sample clients”
- [x] Client invites (email + link), open join link, CSV import with preview
- [x] Exercise library (153 exercises + custom), workout builder (blocks, sets, supersets/circuits, swap, drag and drop, autosave, assign), programs

**Weeks 4–6: coaching loop**
- [x] Client app (installable): Today, workout logging with rest timer (saved on the phone), finish with RPE/soreness/note
- [x] Weekly check-in (client) and check-in review (coach)
- [x] Messaging both ways, progress (weight, lifts, bests, measurements, private photos)

**Weeks 7–9: Assist**
- [x] `AIService` with mock, Anthropic (Claude Haiku) and OpenAI providers, zod-validated output, budget + fallback
- [x] Check-in summary, suggested actions (apply/skip), drafted reply with rewrite buttons
- [x] Message drafts (reply, motivational, professional, shorter, consistency, recovery)
- [x] Workout generator (brief → draft → adjust → accept into builder) with knee/shoulder exclusions
- [x] Safety guard on every draft (referral, coach flag, no diagnosis)
- [x] Nightly risk radar with plain-words reasons + outreach drafts; Today queue with approve / edit / dismiss / undo
- [x] 5 automation templates (missed workouts, missing check-in, inactive 7 days, milestones, failed payment)

**Weeks 10–12: money + pilot**
- [x] Stripe Connect onboarding, packages, client checkout (Stripe or test mode)
- [x] Failed-payment webhook → coach notified + card-update reminder (held for high-risk clients)
- [x] Stripe Billing for OneJump plans (trial → Starter / Pro / Studio), cancel / resume, invoices
- [x] Lightweight admin (coaches, MRR, plan mix, AI usage and cost, no client details)
- [x] Leads: paste a DM → Assist fills it in and drafts the reply; follow-ups on Today; convert to client; booking page `/coach/[slug]`
- [x] Public site: landing, pricing, privacy, terms, 404
- [x] Deploy config for DigitalOcean App Platform (`.do/app.yaml`, migrations run before each deploy)

See `DECISIONS.md` for the choices behind all of this.

## Next

1. **You:** create the accounts below and send me the keys. I’ll switch each mock to the real service, test it, and deploy.
2. **Pilot:** move your own coaching over from Everfit (CSV import or the concierge migration form in Settings), then invite the 5 pilot coaches.
3. **V2** (starts only when you say go): calendar and session booking, multi-week AI program builder, custom automation builder, Ask Assist, analytics, Studio roles and client assignment, referrals, email/SMS reminders, native iOS/Android (Capacitor), nutrition targets, Instagram DM sync.

---

## What I need from you

Nothing here blocks building; everything already works locally with mocks. These are only for going live. Do them in any order and paste each key to me in chat when you have it (keys go in the server’s environment settings, never in the code).

### 1. GitHub (where the code lives) — 2 min
1. Go to **github.com/new**.
2. Repository name: `onejump-app`. Choose **Private**. Leave everything else unticked.
3. Click **Create repository**.
4. Tell me the repo name (`your-username/onejump-app`). I’ll connect it and push the code.

### 2. Anthropic API key (real Assist drafts) — 5 min
1. Go to **console.anthropic.com** and sign in.
2. **Settings → Billing** → add a card and buy **$5** of credits (that covers the pilot for a long time with Claude Haiku).
3. **Settings → API keys → Create key**. Name it `onejump-prod`. Copy the key (starts with `sk-ant-`).
4. Send it to me. I’ll set `AI_PROVIDER=anthropic` and keep the $5/month-per-coach budget cap on.

### 3. Stripe (test mode first) — 20 min
1. Go to **dashboard.stripe.com** and create an account (business name: OneJump). Keep the **Test mode** switch on (top right).
2. **API keys:** go to **dashboard.stripe.com/test/apikeys**. Copy the **Publishable key** (`pk_test_…`) and **Secret key** (`sk_test_…`, click *Reveal*).
3. **Turn on Connect:** go to **dashboard.stripe.com/test/connect/accounts/overview** → **Get started** → choose **Platform** (you’re software that coaches use to get paid) → finish the short questionnaire.
4. **OneJump’s plans:** go to **Product catalog → + Add product** three times:
   - `OneJump Starter`, **Recurring**, **$29.00 USD**, **Monthly** → Save → copy the price ID (`price_…`)
   - `OneJump Pro`, $59.00 monthly → copy its `price_…`
   - `OneJump Studio`, $99.00 monthly → copy its `price_…`
5. **Customer portal:** **Settings → Billing → Customer portal** → click **Activate test link** (lets coaches and clients update cards).
6. **Webhooks** (do this after I’ve deployed and given you the live URL): go to **dashboard.stripe.com/test/webhooks → Create an event destination**:
   - **Your account** events → choose `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` → Webhook endpoint → URL `https://YOUR-APP-URL/api/webhooks/stripe` → Create → copy the **Signing secret** (`whsec_…`).
   - Create a second destination with **Connected accounts** events → choose `account.updated`, `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted` → URL `https://YOUR-APP-URL/api/webhooks/stripe-connect` → copy its **Signing secret**.
7. Send me: publishable key, secret key, the 3 price IDs, and later the 2 signing secrets.

Going live with real money later is the same steps with Test mode off, plus Stripe’s identity check for you. I won’t switch to live keys until you say so.

### 4. Resend (sends invites and login links) — 10 min + DNS wait
1. Go to **resend.com** and sign up.
2. **Domains → Add Domain** → enter `onejumpfit.com` → Add.
3. Resend shows a few DNS records (MX and TXT for a `send` subdomain, plus a DKIM TXT). Your domain is on Cloudflare: open **dash.cloudflare.com → onejumpfit.com → DNS → Records → Add record** and add each one exactly as shown (set Proxy status to **DNS only**). They don’t touch your Zoho email records.
4. Back in Resend click **Verify DNS Records** (can take a few minutes to an hour).
5. **API Keys → Create API Key** → name `onejump-prod`, permission **Sending access** → Add → copy the key (starts with `re_`).
6. Send me the key. Emails will come from `OneJump <hello@onejumpfit.com>` unless you want a different address.

### 5. Cloudflare R2 (private progress photos) — 10 min
1. Go to **dash.cloudflare.com** and sign in (free account is fine).
2. In the left menu open **R2 Object Storage**. If asked, add a payment method (the free tier covers 10 GB; you won’t be charged at pilot size).
3. **Create bucket** → name `onejump-private` → location **Automatic** → Create. Leave public access **off**.
4. On the R2 page, find **Account Details** and copy the **Account ID**.
5. Next to **API Tokens** click **Manage** → **Create Account API token** → permission **Object Read & Write** → apply to **Specific bucket: onejump-private** → **Create API Token**.
6. Copy the **Access Key ID** and **Secret Access Key** (the secret is shown only once).
7. Send me the Account ID, Access Key ID and Secret Access Key.

### 6. DigitalOcean (hosting + database) — 15 min, about $27/month
1. Go to **cloud.digitalocean.com** and sign up (add a card).
2. **Database:** click **Create → Databases** → **MySQL** (version 8) → datacenter **New York** → plan **Basic, 1 GB** (about $15/mo) → name `onejump-db` → **Create Database Cluster**. Wait until it says *Online*.
3. In the database, open **Users & Databases**: add a database `onejump`, then add users `onejump_app` and `onejump_migrate`.
4. Open **Overview → Connection Details**, pick **Connection string**, and copy it for each user (switch the *User* dropdown). Click **Download CA certificate** too.
5. **App:** after the GitHub repo exists and I’ve pushed the code, click **Create → App Platform** → **GitHub** → allow access to `onejump-app` → I’ll give you the settings to paste (or I’ll import `.do/app.yaml` for you). Basic plan, 1 GB (about $12/mo).
6. In the database’s **Settings → Trusted Sources**, add the `onejump` app.
7. Send me the two connection strings and the CA certificate file. I’ll put them in the app’s encrypted settings, never in code.

### 7. Your domain — 5 min (after the app is deployed)
Your client-facing website (the `Website` folder) already uses onejumpfit.com, so I’ve set this app up for **app.onejumpfit.com** (booking pages become `app.onejumpfit.com/coach/dani`). Tell me if you’d rather use something else.
1. In DigitalOcean: **Apps → onejump → Settings → Domains → Add domain** → `app.onejumpfit.com` → choose **You manage your domain**.
2. Copy the CNAME target it shows. In **dash.cloudflare.com → onejumpfit.com → DNS → Records → Add record**: Type **CNAME**, Name `app`, Target = what DigitalOcean showed, Proxy status **DNS only** → Save.
3. Tell me when it’s done; I’ll check HTTPS works and the links in emails point to it.

**As soon as I have each key** I’ll: switch that service from mock to real, run the tests against it, deploy, and tell you what to click to try it yourself.
