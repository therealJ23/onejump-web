# OneJump — MVP Build Plan

What to build first, how the code is organized, and in what order. Front end in plain HTML/CSS/JavaScript, back end in Node.js + Express, database MySQL. Pairs with `01-strategy-and-architecture.md` and the clickable prototype (`prototype/onejump-prototype.html`, open it in a browser).

## Goal of the MVP
Ten paying online coaches who open **Today** at least 4 days a week. Start with OneJump's own coach (moving off Everfit), then 5–9 outside coaches onboarded by hand.

## Stack
| Layer | Choice | Why |
|---|---|---|
| Front end | **Plain HTML, CSS and JavaScript (ES modules)**, no framework | The founder's choice; the prototype is already built this way and becomes the starting point |
| Back end | Node.js + Express | JavaScript everywhere; simple and well known |
| Database | **MySQL 8** (Aiven free plan while building; DigitalOcean Managed MySQL in production) | The founder's choice |
| ORM / migrations | Prisma (JavaScript client, MySQL provider) | Safe queries, migrations in git |
| Tenant isolation | Tenant-scoped data layer (Prisma client extension) + tests | MySQL has no row-level security, so isolation is enforced in code |
| Auth | express-session + MySQL session store, argon2, magic links, TOTP 2FA | No paid auth service needed |
| Security | helmet, CSRF tokens, express-rate-limit, zod validation | Standard protection for an Express app |
| Payments | Stripe Billing (coach pays OneJump) + Stripe Connect with Stripe-managed pricing (client pays coach) | Stripe handles cards, payouts, identity checks; Connect costs OneJump nothing in this mode |
| Background jobs | node-cron inside the server (+ a jobs table for retries) | Automations, nightly risk scoring |
| AI | `server/ai/`: AIService + providers (anthropic, openai, mock) | Swap vendors with one env var |
| Email | Resend | Pay as you go |
| Files | Cloudflare R2 (private bucket, signed URLs) | Progress photos, videos; no egress fees |
| Hosting | DigitalOcean App Platform (Node) | From $5/month; same provider as the database |
| Mobile (V2) | Capacitor wraps the client web app into iOS/Android apps | Reuses the same HTML/CSS/JS |
| Tests | Vitest + Supertest, Playwright | API and screen tests |

Accounts you need: GitHub, DigitalOcean (App Platform + Managed MySQL), Aiven (free MySQL while building, optional), Stripe (test mode), Resend, Cloudflare (R2), an Anthropic API key when you leave the mock.

## Repository layout
```text
onejump/
  public/                   # static HTML/CSS/JS served as-is
    index.html              # landing page
    pricing.html
    css/tokens.css          # brand tokens from the prototype
    css/app.css
    js/coach/               # coach workspace: router.js, state.js, screens/*.js
    js/client/              # client app: screens/*.js, manifest.json, sw.js
    js/shared/              # icons, formatting, charts, api.js (fetch wrapper)
    img/onejump-wordmark.svg
  server/
    index.js                # Express app, middleware, static files
    routes/                 # auth, clients, checkins, messages, workouts, payments, leads, admin, webhooks
    db/tenant.js            # dbFor(session): the only way routes touch the database
    ai/                     # AIService.js, providers/{anthropic,openai,mock}.js, prompts/, schemas/
    core/                   # risk.js, automations.js, adherence.js, timeSaved.js
    payments/               # PaymentService.js, stripe.js, mock.js
    jobs/                   # nightly.js (node-cron)
  prisma/schema.prisma      # MySQL schema + migrations
  prisma/seed.js            # sample data from the prototype
  tests/                    # isolation tests, API tests, Playwright
  .env.example              # never commit .env
```

## Environment variables (`.env.example`)
```text
DATABASE_URL=mysql://user:pass@host:3306/onejump   # server only
SESSION_SECRET=                   # server only
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=                 # server only
R2_SECRET_ACCESS_KEY=             # server only
R2_BUCKET=onejump-private
AI_PROVIDER=mock                  # mock | anthropic | openai
ANTHROPIC_API_KEY=                # server only
OPENAI_API_KEY=                   # server only
AI_MONTHLY_BUDGET_USD=5
STRIPE_SECRET_KEY=                # server only, test key while building
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_CLIENT_ID=
RESEND_API_KEY=
APP_URL=http://localhost:3000
PORT=3000
```

## Core data model (MVP subset, Prisma syntax)
```prisma
datasource db { provider = "mysql"; url = env("DATABASE_URL") }

model Business {
  id               String   @id @default(uuid())
  name             String
  slug             String   @unique          // onejumpfit.com/coach/[slug]
  plan             Plan     @default(TRIAL)
  stripeCustomerId String?
  stripeAccountId  String?                   // Stripe Connect
  brandColor       String?  @default("#D6FF3D")
  logoUrl          String?
  createdAt        DateTime @default(now())
  members          Membership[]
  clients          Client[]
}
enum Plan { TRIAL STARTER PRO STUDIO }

model User {
  id          String       @id @default(uuid())
  email       String       @unique
  name        String
  memberships Membership[]
}
model Membership {
  id         String   @id @default(uuid())
  userId     String
  businessId String
  role       Role                              // OWNER | COACH | CLIENT
  user       User     @relation(fields: [userId], references: [id])
  business   Business @relation(fields: [businessId], references: [id])
  @@unique([userId, businessId])
}
enum Role { OWNER COACH CLIENT }

model Client {
  id          String   @id @default(uuid())
  businessId  String
  userId      String?                          // set when the client accepts the invite
  coachId     String?
  name        String
  email       String?
  goal        String?
  status      ClientStatus @default(ACTIVE)    // NEW ACTIVE PAUSED INACTIVE
  programId   String?
  riskScore   Int?
  riskLevel   RiskLevel?
  riskReasons Json?                            // MySQL has no array type
  startedAt   DateTime @default(now())
  business    Business @relation(fields: [businessId], references: [id])
  @@index([businessId, status])
}
enum ClientStatus { NEW ACTIVE PAUSED INACTIVE }
enum RiskLevel { LOW MEDIUM HIGH }

model Exercise {
  id          String  @id @default(uuid())
  businessId  String?                          // null = OneJump global library
  name        String
  muscle      String
  equipment   String
  level       String
  pattern     String                           // squat, hinge, push, pull, lunge, core, carry, jump, cardio
  kneeLoad    Boolean @default(false)
  videoUrl    String?
  howTo       Json?
  altIds      Json?
}

model Program {
  id         String @id @default(uuid())
  businessId String
  name       String
  weeks      Int
  daysPerWeek Int
  source     String @default("manual")         // manual | assist
  workouts   Workout[]
}
model Workout {
  id         String @id @default(uuid())
  businessId String
  programId  String?
  name       String
  week       Int?
  day        Int?
  blocks     Json                              // [{kind:'single'|'superset'|'circuit', items:[{exerciseId, sets:[{reps,load,rpe,rest}], tempo, notes}]}]
  program    Program? @relation(fields: [programId], references: [id])
}
model WorkoutSession {
  id          String   @id @default(uuid())
  businessId  String
  clientId    String
  workoutId   String
  completedAt DateTime?
  sets        Json                             // logged weight/reps per set
  rpe         Int?
  soreness    Int?
  note        String?
}

model CheckIn {
  id          String   @id @default(uuid())
  businessId  String
  clientId    String
  weekOf      DateTime
  weight      Float?
  sleepHours  Float?
  energy      Int?
  stress      Int?
  soreness    Int?
  nutrition   Int?
  mood        Int?
  text        String?
  status      String   @default("submitted")   // submitted | reviewed
  submittedAt DateTime @default(now())
  @@index([businessId, weekOf])
}

model Thread  { id String @id @default(uuid()); businessId String; clientId String @unique; messages Message[] }
model Message {
  id           String   @id @default(uuid())
  businessId   String
  threadId     String
  senderUserId String
  body         String
  aiInsightId  String?                          // set when sent from an Assist draft
  readAt       DateTime?
  createdAt    DateTime @default(now())
  thread       Thread   @relation(fields: [threadId], references: [id])
}

model ClientPlan { id String @id @default(uuid()); businessId String; name String; priceCents Int; interval String; stripePriceId String? }
model Payment {
  id              String @id @default(uuid())
  businessId      String
  clientId        String
  amountCents     Int
  status          String                        // paid | failed | upcoming | refunded
  failureReason   String?
  stripeInvoiceId String?
  createdAt       DateTime @default(now())
}

model Lead {
  id         String   @id @default(uuid())
  businessId String
  name       String
  handle     String?                            // @instagram handle
  contact    String?
  source     String                             // instagram_dm | booking_page | referral | walk_in | other
  goal       String?
  firstMessage String?
  stage      String   @default("new")           // new | contacted | consult | trial | active | retained | lost
  nextFollowUpAt DateTime?
  createdAt  DateTime @default(now())
}

model Automation { id String @id @default(uuid()); businessId String; trigger String; action String; template String?; needsApproval Boolean @default(true); enabled Boolean @default(true) }

model AIInsight {
  id            String   @id @default(uuid())
  businessId    String
  clientId      String?
  kind          String                          // checkin_summary | message_draft | risk | workout | program | adjustment
  summary       String?
  draft         Json?
  status        String   @default("pending")    // pending | approved | edited | dismissed
  model         String
  promptVersion String
  createdAt     DateTime @default(now())
}
model ClientEvent { id String @id @default(uuid()); businessId String; clientId String; kind String; at DateTime @default(now()); data Json? }
model AuditLog   { id String @id @default(uuid()); businessId String?; actorUserId String; action String; target String; at DateTime @default(now()) }
```

## Tenant isolation on MySQL (no row-level security)
MySQL can't enforce isolation in the database, so the app does it in one place and tests prove it.
```js
// server/db/tenant.js: the ONLY way routes get a database client
/** @param {{ businessId: string, role: 'OWNER'|'COACH'|'CLIENT', clientId?: string }} session */
export function dbFor(session) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (GLOBAL_MODELS.has(model)) return query(args);           // e.g. global Exercise rows
          args.where = { ...(args.where ?? {}), businessId: session.businessId };
          if (session.role === 'CLIENT' && CLIENT_OWNED.has(model)) args.where.clientId = session.clientId;
          if (operation.startsWith('create')) args.data = { ...args.data, businessId: session.businessId };
          return query(args);
        },
      },
    },
  });
}
```
- Lint rule: importing the raw `prisma` client outside `server/db` fails the build.
- Tests: seed two businesses; every route and query must return zero rows from the other business, and a client must see only their own rows.
- Use a least-privilege MySQL user for the app (no DROP/GRANT).

## Build order (about 12 weeks part-time)
**Weeks 1–3: foundation**
- [ ] Express server serving `public/`, MySQL database, Prisma schema + migrations, tenant-scoped data layer + isolation tests, seed data (copy the prototype's sample clients)
- [ ] Split the prototype's single HTML file into `public/` pages, CSS and JS modules; replace its mock data calls with `api.js` calls
- [ ] Sign up, log in, onboarding (10 steps from the prototype), create Business + OWNER membership
- [ ] Client invites by link/email; client accepts → CLIENT membership
- [ ] Exercise library seeded (~150 exercises), workout builder (blocks, sets, supersets)

**Weeks 4–6: coaching loop**
- [ ] Client web app: today's workout, set logging, finish with RPE/soreness
- [ ] Weekly check-in form (client) and check-in review screen (coach)
- [ ] Messaging (thread per client), progress (weight, measurements, private photos)
- [ ] CSV client import

**Weeks 7–9: Assist**
- [ ] `server/ai/` with MockProvider first, then one real provider behind `AI_PROVIDER`
- [ ] Check-in summary + suggested actions + drafted reply
- [ ] Message drafts (reply, motivational, professional, shorter, recovery)
- [ ] Workout generator (brief → draft → accept into builder), knee/shoulder exclusions, safety guard
- [ ] Risk scoring job (nightly) + AI-written reasons; Today queue with Approve / Edit / Dismiss
- [ ] 5 automation templates (missed workouts, missing check-in, inactive 7 days, milestones, failed payment)

**Weeks 10–12: money + pilot**
- [ ] Stripe Connect onboarding for coaches; packages and memberships; client checkout
- [ ] Failed-payment webhook → notify coach + card-update reminder
- [ ] Stripe Billing for OneJump plans (trial → Starter/Pro)
- [ ] Lightweight admin (coaches, MRR, failed payments, AI usage)
- [ ] Move OneJump's coach off Everfit; onboard 5 outside coaches

## Leads in the MVP (no Meta approval needed)
- **Booking page** `onejumpfit.com/coach/[slug]` in the coach's Instagram bio: anyone who books becomes a Lead (stage `consult`) and a calendar event.
- **"+ Lead" button** (always visible on phone): coach copies a DM from Instagram, pastes it; Assist fills name, goal, source = Instagram DM, stage = New, and drafts a reply with the booking link. Coach copies the reply back to Instagram and taps "Mark contacted".
- **Follow-up reminders:** no reply in 3 days → Today shows "Follow up with Jake" with a drafted message.
- **Convert:** one tap turns a lead into a client and sends the app invite.

## Instagram DM sync (V2)
- Works only for Instagram **professional** accounts (Business or Creator).
- **Phase 1 (Standard Access):** works for people with a role on the Meta app (you + testers, including a few pilot coaches). No App Review or business verification. Build: Meta developer app → webhook route `server/routes/webhooks/instagram.js` → subscribe to `messages` → create/update Lead → reply via API.
- **Phase 2 (Advanced Access):** needed for any coach. Requires Meta **business verification** (registered business documents) and **App Review** per permission (`instagram_business_basic`, `instagram_business_manage_messages`): privacy policy, data-deletion process, screen recording, test logins.
- Rules: 24-hour reply window; official API only, never scraping. Start business verification early; it's slow.
- Docs: https://developers.facebook.com/docs/graph-api/overview/access-levels and https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api

## What to reuse from the prototype
The prototype is already plain HTML, CSS and JavaScript, so its screens, styles and helpers move into `public/` almost as-is. Its layers map 1:1 to the real app:
- `MockTemplates` + `AIService` + `MockProvider` → `server/ai/` (same method names; mock outputs become test fixtures)
- `RiskEngine.score()` → `server/core/risk.js` (weights: missed workouts 7 each (max 35), missed check-ins 12 each (max 24), messaging drop ≥40% = 12, negative sentiment 15, plateau ≥3 weeks 10, failed payment 15, adherence <60% = 10; high ≥65, medium ≥40)
- `SafetyGuard` term list → server-side guard applied to every draft
- `Data.scoped(session)` → `dbFor(session)` tenant-scoped data layer (the real enforcement on MySQL)
- `DB` sample data → `prisma/seed.js`
- Screens and copy → reference for every page
