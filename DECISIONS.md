# Decisions

Choices made while building the MVP, and why. Newest last.

## Data and infrastructure

1. **Prisma 7 with the MariaDB driver adapter.** Prisma 7’s JavaScript client runs its query engine as WebAssembly and talks to MySQL through `@prisma/adapter-mariadb` (works with MySQL 8). No native engine binary to install or ship.
2. **Our own migration runner, compatible with Prisma’s.** The build machine couldn’t download Prisma’s schema-engine binary, so `scripts/sql-from-schema.cjs` generates the migration SQL from `schema.prisma` and `scripts/migrate.js` applies `prisma/migrations/*/migration.sql` and records them in `_prisma_migrations` with the same checksums Prisma uses. On a normal machine you can switch to `npx prisma migrate dev` / `migrate deploy` at any time; nothing else changes.
3. **Two database users.** The server connects as `onejump_app` (read/write rows only). Only migrations use `onejump_migrate` (can change tables). Limits damage from any bug or injection.
4. **Foreign keys only where they protect integrity across tenants** (memberships, client → business, workout → program, message → thread). Everything else is linked by id and always filtered by `businessId`, which keeps deletes and sample-data cleanup simple.
5. **Tenant isolation in one place.** `dbFor(session)` is a Prisma query extension that adds `businessId` (and `clientId` for clients) to every read, update and delete, stamps it on every create, uses AND semantics so a caller-supplied id can never widen the filter, and blocks raw SQL. A lint rule stops other files from importing the raw client. Cross-tenant lookups that must exist (login, invites, webhooks, admin totals) live in `server/db/system.js` as narrow named functions.
6. **Sessions in MySQL** (`UserSession` table, custom express-session store) so deploys and restarts don’t log anyone out.
7. **Times:** every business has a time zone; “today”, check-in deadlines, reminders and the nightly radar use it. Workout dates are stored as UTC midnight of the local date.
8. **Units:** pounds and inches for the MVP (the pilot coaches are in the US).

## Accounts and security

9. **CSRF:** synchronizer token per session, sent in the `X-CSRF-Token` header on every write, plus SameSite=Lax cookies.
10. **Client login links are used with POST**, not by opening the URL, so email link scanners that prefetch links can’t use them up. Links are single use and expire (30 min for login, 60 min for join, invites 14 days).
11. **The open join link (`/join/[slug]`) always confirms the email** with a login link. Typing someone’s email never logs you in as them.
12. **Two-step login** is available to every coach (TOTP, one step of clock drift allowed). Not forced yet; the build plan says “required for owners on Pro and Studio” and that can be switched on once pilot coaches have set it up.
13. **Auth forms use `method="post"`** so a password can never end up in a URL if JavaScript hasn’t loaded.
14. **OneJump admin sees totals only.** No client names, messages or emails; the platform audit list shows the action and time without targets because targets can hold client emails.

## Assist (AI)

15. **One `AIService`** with mock (default), Anthropic and OpenAI providers. Every response is validated with zod; if a provider fails, returns invalid output, or the workspace passes its monthly budget, the deterministic mock draft is used instead and the fallback is recorded.
16. **Minimal context.** Prompts get first names, goals, logged numbers and recent message text. Never emails, phone numbers or payment details.
17. **Safety guard on every draft**, server-side: pain/medical words in the client’s words switch the draft to acknowledge + refer to a physical therapist, sports-medicine doctor or qualified professional + keep training what feels fine. Drafts that diagnose or say to push through pain are replaced. The coach is notified.
18. **Approval rules:** anything Assist writes is a pending insight until the coach approves, edits or dismisses it. Approvals can be undone for 5 minutes (the message is removed). Only fixed-text reminders the coach switched on (missing check-in, failed-payment card update) send on their own.
19. **Time saved** is counted only from approved actions (edited drafts count 70%).
20. **Program adjustments apply to a per-client copy** of the upcoming week’s workouts (“tailored”), never to the shared program template, so one client’s change can’t affect others.
21. **Radar drafts outreach only on plans that include it** (Pro trial, Pro, Studio). Scores still drive the Clients list.
22. **No double messages:** the missed-workouts automation skips a client who already has a pending radar draft.
23. **Failed-payment reminders are held for High-risk clients**, so a client about to quit doesn’t get an automated “update your card” first. The coach sees it on Today and decides.

## Product scope (MVP vs V2)

24. **V2 items are visible but marked V2** where the prototype showed them (program builder, custom automations, team/roles), and left out where they’d be noise (calendar, analytics, Ask Assist, community, referrals, voice).
25. **Booking page (Pro):** a request-a-call form that creates a Lead at the Consultation stage and notifies the coach. Real time-slot booking needs the calendar, which is V2.
26. **OneJump never messages leads.** Assist drafts the reply; the coach copies it into Instagram/text/email. Converting a lead creates the client and sends the app invite.
27. **COACH role sees the whole business in the MVP.** Per-coach client assignment comes with Studio in V2; the `coachUserId` column is already there.
28. **Plan limits:** active-client caps (Starter 15, Pro 50, Studio 150, trial 50) are enforced on invite, CSV import and the join link. Existing clients always keep working. An expired trial falls back to Starter limits automatically.
29. **Client app accent:** on Pro, the coach’s accent color replaces volt inside the client app only (no AI appears there, so volt keeps meaning “Assist” everywhere else).

## Payments

30. **Stripe Connect with Stripe-managed pricing and dashboard** (the coach’s account pays Stripe fees and carries losses; OneJump takes no cut). Client payments are direct charges on the coach’s account; OneJump plans use Stripe Billing on the platform account.
31. **Two webhook endpoints:** `/api/webhooks/stripe` (OneJump plans) and `/api/webhooks/stripe-connect` (client payments). Both verify the signature on the raw body. Connected-account events are resolved to a business by account id and can only touch that business’s clients.
32. **Mock payments for development:** a test checkout page at `/client/checkout`, a mock customer portal, and retries that succeed only after the client “updates their card”, so the whole recovery loop can be tested without Stripe.

## Front end

33. **Static public pages** (landing, pricing, legal, 404) were generated once from the prototype’s templates and are committed as plain HTML. Edit them directly.
34. **Coach workspace and client app** follow the prototype’s structure: one router, one state object, small screen modules with `render`/`mount`/`actions`, and event delegation through `data-act`, `data-input`, `data-change` and `form[data-form]`. No inline event handlers (CSP blocks them anyway).
35. **Workout logging is saved on the phone as you go** (localStorage), so a lost signal or closed tab doesn’t lose sets; it’s sent when the client taps Save.
36. **The workout builder autosaves** about a second after each change.
37. **The client app’s service worker caches the app shell only.** API responses and photos are never cached (private and must be fresh).

## Deployment

38. **The coach software lives at `app.onejumpfit.com`.** The existing client-facing website already uses `onejumpfit.com`, so the app gets its own subdomain (booking pages: `app.onejumpfit.com/coach/[slug]`). Emails still come from `hello@onejumpfit.com` (Resend uses its own `send` subdomain records, so Zoho mail is unaffected).
39. **DigitalOcean App Platform** runs `npm start`; a pre-deploy job runs `npm run db:migrate`, so a failed migration stops the deploy instead of breaking the live app. In production the server refuses to start without a database URL and a 32+ character `SESSION_SECRET`, and warns loudly if email, storage or payments are still on their development stand-ins.

