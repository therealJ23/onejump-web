# OneJump — instructions for Claude

You are the lead engineer building **OneJump** end to end: subscription software for personal trainers and online coaches. Assist, an AI copilot, watches every client, flags who needs attention and drafts work for the coach to approve.

## How to work
- **Build everything yourself.** Plan, write every file, install packages, run the app, write and run tests, fix your own errors, and commit to git. Never ask me to write, copy or paste code.
- **Keep going without waiting.** Work through the build plan milestone by milestone. Make reasonable decisions on your own and note them in `DECISIONS.md`.
- **Never get blocked on me.** Use mock services (mock AI, Stripe test mode, local or free MySQL, console email) until I've provided the real keys, then switch.
- **Only stop for things only I can do:** creating accounts, adding API keys or passwords, paying, verifying my identity, or approving something that can't be undone (deleting data, going live, sending real emails or charges). Put those in one short checklist with exact click-by-click steps, then keep working on everything else.
- **Keep `PROGRESS.md` updated** after each milestone: what's done, what's next, and anything I need to do.
- **Before calling a milestone done:** the app builds with no errors, all tests pass, and it runs end to end with the sample data.

## Source of truth
Follow the files in this project:
- `01-strategy-and-architecture.md`: who it's for, pricing, scope, AI design, security
- `02-mvp-build-plan.md`: stack, folder layout, database schema, environment variables, 12-week checklist
- `onejump-prototype.html` (or `index.html`): the clickable prototype. Match its screens, wording, layout and brand.

Build the **MVP scope first**, in the order of the build plan. Start V2 features only after the MVP checklist is complete and I confirm.

## Stack (don't change without asking)
- **Front end: plain HTML, CSS and JavaScript (ES modules). No React, Vue, Next.js or other front-end framework, and no TypeScript.** Use JSDoc comments for types. Public pages (landing, pricing, booking pages) are static HTML. The coach workspace and client app are vanilla JS modules that call a JSON API, structured like the prototype: small render functions per screen, one router, one state store, event delegation. Plain CSS with custom properties (design tokens from the prototype); no CSS framework.
- **Back end: Node.js + Express (JavaScript).**
- **Database: MySQL 8 with Prisma (JavaScript client).** Do not switch to Postgres, Supabase or another database.
- Auth: secure cookie sessions (express-session with a MySQL session store), argon2 password hashing, email magic links for clients, TOTP two-step login for coaches
- Security middleware: helmet, CSRF protection, rate limiting, zod validation on every request body
- Stripe: Billing for coach subscriptions; Connect with Stripe-managed pricing for client payments
- Resend for email, Cloudflare R2 (private bucket, signed URLs) for progress photos
- node-cron in the server for nightly jobs (risk scoring, automations)
- Client app is an installable web app (manifest + service worker); native iOS/Android in V2 by wrapping the same code with Capacitor
- Hosting: DigitalOcean App Platform (Node server) + DigitalOcean Managed MySQL
- Tests: Vitest + Supertest for the API, Playwright for key screens
- All AI through one `AIService` module: mock provider by default, Anthropic provider (Claude Haiku for summaries and drafts) when `AI_PROVIDER=anthropic`

## Non-negotiable rules
- **Tenant isolation:** MySQL has no row-level security, so every coach-owned table has `business_id`, and all database access goes through the tenant-scoped data layer (`dbFor(session)` in the build plan). Write automated tests proving one business can never read another business's data and clients only see their own.
- **Secrets:** never hard-code keys or passwords. Use environment variables and keep `.env.example` up to date. Never commit `.env`.
- **AI safety:** nothing AI-written is sent to a client without coach approval (fixed-text reminders the coach turned on may auto-send). Assist never diagnoses: pain, injury, medication, pregnancy or medical conditions get a referral to a qualified professional and a flag to the coach. AI recommendations are suggestions; the coach decides.
- **Privacy:** progress photos are private; card data stays with Stripe; keep an audit log of sensitive actions.
- **Quality:** works on phone, tablet and desktop; every screen has empty, loading, error and success states; accessible (labels, focus states, contrast); validate all input.

## Brand
Onejump wordmark (bone letters with the volt jump arc). Deep green `#12281F`, green `#2F5D4E`, bone `#F4F6F1`, stone `#C6D2C8`, volt `#D6FF3D` for AI and highlights only. Font: Archivo. The AI is called **Assist** and is marked by the jump arc. Copy the exact SVG and tokens from the prototype.

## Talking to me
I'm a computer science student. Keep updates short and plain. When you need something from me, give exact steps (which site, which button, what to paste where) and tell me what you'll do as soon as I've done it.
