# OneJump

Coaching software for personal trainers and online coaches. **Assist**, the AI copilot, watches every client, flags who needs attention and drafts the work (check-in replies, outreach, workouts, follow-ups) for the coach to approve.

- **Front end:** plain HTML, CSS and JavaScript modules (no framework, no build step)
- **Back end:** Node.js + Express
- **Database:** MySQL 8 with Prisma
- **Runs fully offline** with mock AI, mock payments, console email and local file storage, so you can build and test without any accounts.

## Run it on your computer (Mac)

You need **Node.js 20.19 or newer** (nodejs.org → LTS) and a **MySQL 8 server** (the one MySQL Workbench connects to is fine).

1. Check the tools in a terminal: `node -v` should print v20.19 or higher, and MySQL Workbench should connect to your local instance.
2. Open this folder in VS Code: **File → Open Folder…** → Desktop → Onejump → **web-app**. Then open the terminal in VS Code: **Terminal → New Terminal**.
3. Create the databases and users (once). Either:
   - **MySQL Workbench:** File → Open SQL Script… → `scripts/setup-local-db.sql` → click the lightning bolt, or
   - **Terminal:** `mysql -u root -p < scripts/setup-local-db.sql`
4. Create your settings file and install packages:
   ```bash
   cp .env.example .env
   npm install
   ```
5. Build the tables and load the sample data:
   ```bash
   npm run db:reset
   ```
6. Start the server:
   ```bash
   npm run dev
   ```
7. Open **http://localhost:3000**.

### Sample logins (local only)

| Who | How to log in |
| --- | --- |
| Coach (Reyes Strength, Pro trial) | `dani@reyesstrength.com` / `onejump-demo-2026` |
| Another coach (Northside Barbell, Studio) | `alex@northsidebarbell.com` / `onejump-demo-2026` |
| Client (Mike Torres) | On the login page choose **I’m a client**, enter `mike.t@example.com`, then open the link from **http://localhost:3000/dev/outbox** |
| OneJump admin | `ops@onejumpfit.com` / `onejump-demo-2026` → http://localhost:3000/admin |

Emails (invites, login links) aren’t really sent locally; they show up at **/dev/outbox**.

### Useful pages

| Page | URL |
| --- | --- |
| Landing / pricing | `/`, `/pricing` |
| Sign up → onboarding | `/signup` |
| Coach workspace | `/app` |
| Client app (installable) | `/client` |
| Booking page | `/coach/dani` |
| Client join link | `/join/dani` |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the server and restart on changes |
| `npm start` | Start the server (production) |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Load the sample workspaces |
| `npm run db:reset` | Wipe the local database, migrate and seed |
| `npm test` | Architecture lint + API tests (Vitest + Supertest, uses `onejump_test`) |
| `npm run test:e2e` | Browser tests (Playwright). First time: `npx playwright install chromium` |
| `npm run jobs:nightly` | Run the nightly jobs once (risk radar, automations) |

## How it’s organised

```
server/
  app.js            Express app: security middleware, sessions, routes, pages
  index.js          starts the server and the background jobs (node-cron)
  config.js         every setting comes from environment variables
  db/tenant.js      dbFor(session): the tenant-scoped data layer (see "Security")
  db/system.js      the few cross-tenant queries (login, invites, webhooks, admin)
  auth/             passwords (argon2), sessions, CSRF, two-step login, roles
  ai/               AIService + mock / Anthropic / OpenAI providers, prompts, schemas, safety guard
  core/             coaching logic: risk radar, automations, Today queue, training, money
  payments/         PaymentService: mock and Stripe (Billing + Connect)
  email/, storage/  Resend or console email; Cloudflare R2 or local private files
  routes/           one file per API area
  jobs/             nightly radar, hourly automations, queued Assist jobs
public/
  index.html …      static public pages
  app.html          coach workspace (js/coach: router, state, shell, screens/)
  client.html       client app (js/client), manifest + service worker
  admin.html        OneJump HQ (js/admin)
  css/              design tokens and styles from the prototype
prisma/             schema, migrations, seed
tests/              API tests (Vitest), browser tests (tests/e2e, Playwright)
docs/               strategy, build plan, clickable prototype
```

## Security

- **Tenant isolation.** MySQL has no row-level security, so every coach-owned table has `businessId` and all access goes through `dbFor(session)`, which adds the business (and, for clients, the client) to every query and stamps it on every insert. Raw SQL is blocked there, and `npm run lint` fails if any file outside `server/db/` imports the raw Prisma client. `tests/isolation.test.js` and `tests/api.test.js` prove one business can’t read or change another’s data and clients only see their own.
- **Accounts.** argon2id passwords, cookie sessions stored in MySQL, CSRF tokens on every write, rate limits on login and links, two-step login (TOTP) for coaches, single-use email links for clients.
- **Validation.** Every request body is checked with zod.
- **Assist safety.** Nothing Assist writes reaches a client until the coach approves it (fixed-text reminders the coach turns on can send on their own). Pain, injury, medication, pregnancy and medical topics always get a referral to a qualified professional and a flag to the coach; drafts that diagnose or say “push through the pain” are replaced.
- **Privacy.** Progress photos are private files behind links that expire after 5 minutes, and viewing them is logged. Card data stays with Stripe. Sensitive actions go to the audit log.

## Going live

See **PROGRESS.md → “What I need from you”** for the accounts and keys (GitHub, DigitalOcean, Stripe, Resend, Cloudflare R2, Anthropic), with click-by-click steps. Deployment uses `.do/app.yaml` (DigitalOcean App Platform + Managed MySQL); migrations run automatically before each deploy.
