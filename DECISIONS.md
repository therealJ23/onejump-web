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

## Voice + Nutrition (October 2026, `docs/03-voice-and-nutrition-spec.md`)

40. **New Pro features answer 403 with an upgrade message** (`{ upgrade: 'PRO', code: 'upgrade' }`), as the spec asks. The MVP’s older Pro gates keep their 402. Clients see “Ask your coach about it”, coaches see “Upgrade in Plan & billing”.
41. **Mock voice uses the browser’s own transcript as a hint in development.** With `VOICE_PROVIDER=mock` the server can’t understand audio, so the app sends what the browser heard alongside the recording; the mock returns it (or a fixed phrase per kind). Real providers ignore the hint and transcribe the audio.
42. **Push-to-talk only.** Nothing records until a tap; recordings stop at 30 s (Talk to Assist), 60 s (voice notes), 10–15 s (set and food logging). Talk-to-Assist audio is never stored; voice-note audio is kept because the person chose to send it, in `voice/{businessId}/{uuid}` behind 5-minute links, and deleted with the client’s data.
43. **Proposals are rows, not actions.** Assist’s action tools only create an `AssistProposal`; Confirm claims it atomically (`updateMany … where status = pending`), so a double tap sends once. Expired after 10 minutes, coach-scoped, audited. Money, deleting, plan/price and nutrition-target changes are refused by voice with “I can’t do that by voice. Open … to do it.”
44. **Booking by voice is refused for now:** OneJump has no calendar yet, so “Book Mike for Thursday” answers that scheduling isn’t available.
45. **SafetyGuard on every transcript**, including set and food logging: pain or injury notifies the coach and adds a safety event; the briefing and spoken answers never say health details (they say “flagged for you”).
46. **Log a set by voice always asks the server** (regex first, Assist only when the regex can’t read it), so the plan check and SafetyGuard run every time. The parser lives in `public/js/shared/parse.js` and is shared by the browser and the server.
47. **Browser speech recognition first, server transcription as the fallback** for set and food logging. Phones without it (some Android browsers, Firefox) record and send audio to `/api/me/voice/transcribe`, which counts toward the monthly voice minutes.
48. **The morning briefing is built from the Today queue** (the same facts the coach sees), worded by Assist and checked again before it’s stored: any line that mentions a health term is replaced by the plain facts, and it’s trimmed to about 120 words. OneJump has no calendar yet, so “today’s calendar” is today’s scheduled client workouts. The email copy is opt-in (Settings → Notifications).
49. **Nested-relation writes are blocked in the tenant layer.** A nested `create` inside another model’s write would skip `businessId` stamping, so `dbFor` rejects them; each table is written on its own (e.g. a food entry, then its items). `FoodEntryItem` carries `clientId` so clients can read their own items directly.
50. **Habits moved from client tags to a `Habit` table** with daily checks and streaks. The old tag-based habits in the client app were replaced.
51. **Low-target warning when resting needs can’t be computed:** if height, weight, age or sex is missing, any target under 1,200 kcal shows the warning and needs the “I’ve reviewed this target” checkbox (audited).
52. **A meal photo’s Assist analysis is stored as a pending `AIInsight`** until the client taps Add, so the server (not the browser) supplies the estimated numbers that get saved, labelled “estimate”. Unsaved photos are deleted by the nightly job.
53. **Food data is cached for 30 days** (not-found barcodes for 1 day) in a global `FoodCache` table; it holds public food facts only, no client data.
54. **Community dictation is waiting for Community**, which isn’t built yet; the same 🎤 button drops in when it is.
55. **Voice minutes are measured on the server**, not trusted from the browser: the larger of what the provider measured, what the browser reported, and a size-based lower bound (WAV exactly; compressed audio at an assumed 128 kbps). Recordings far over the limit for their kind are refused.
56. **Meal photos never fall back to the mock.** If the AI provider is down or the workspace is over its AI budget, the client sees “I couldn’t read this photo right now. Search for the food instead” rather than a made-up meal. Other drafts still fall back to the mock text as before.
57. **“Never read aloud” covers food behaviour and at-risk language too**, not just medical words, including third-person phrasing in Assist summaries (“she skipped dinner to make up for…”). Check-ins with a private nutrition flag are treated as flagged in Ask Assist and the briefing.
58. **A proposal that fails partway is final** (status `failed`), so a second Confirm can never repeat what already happened; the coach finishes it on the normal screen. Cancel only works on pending proposals.
59. **Hide numbers holds everywhere a client can look:** numeric fields are removed and calorie/gram mentions are scrubbed from text (coach note, meal plan, habit and food names), in the app, the food search and the client’s own data export.
60. **The microphone stops when its screen goes away** (navigation, closing a modal, a re-render), and taps are ignored while the mic is starting, so nothing records without the on-screen indicator.

61. **Patched database drivers are pinned with npm `overrides`** (`mariadb` 3.5.4 everywhere, `mysql2` and `deepmerge-ts` inside the Prisma CLI), so `npm audit` reports 0 vulnerabilities without downgrading Prisma. Prisma 8 is still a release candidate; we stay on Prisma 7 until 8 is stable.
62. **Talk to Assist is hands-free (owner’s change to the spec’s push-to-talk rule, Oct 12).** Opening the window is the only tap: it listens right away, sends after about a second of quiet once you’ve spoken, and listens again after Assist answers. It never listens outside the open window, shows a red “Listening” dot whenever the mic is on (the timer was removed), pauses after 8 quiet seconds, and still needs an on-screen Confirm for any action. An always-on wake word (“Hey Assist”) isn’t built: browsers can’t listen with the page closed, and it would break the “never record in the background” rule.
63. **Talk to Assist greets you instead of showing a label.** Opening it plays a soft two-note chime (made in the browser, no sound file); the first time each day Assist also says “Hi Dani, how can I help you today?” (on screen only if spoken answers are off). While listening, the orb glows and swells with your voice; that glow is the mic-on indicator (screen readers still hear “Listening”).
64. **Landing and pricing pages lead with time saved** (Oct 12): light theme (white with OneJump greens; the volt arc becomes volt-deep so it shows on white), plain words, a “saves about…” label on each Assist job and each plan, and nutrition on both pages. Time figures are labelled estimates (30 clients, about 13 hours a week down to about 4); the app shows each coach their real minutes saved. Plan lists match what each plan actually unlocks in the app.
65. **Public forms can’t fall through to a plain browser post.** Until a page’s script is ready, form submits are blocked, and sign-up attaches its handler before checking who’s logged in (a fast tap used to post to a page that doesn’t exist).
66. **Hosting moves to Railway at onejumpfit.com** (Oct 12, owner’s call; replaces the DigitalOcean plan and the app.onejumpfit.com address). The app runs as a new service in the existing Railway project, with its own `onejump` database on the same MySQL server (created automatically by the first migration), so the old website’s tables are never touched. Uploads live on a Railway Volume instead of Cloudflare R2. `railway.json` runs migrations before every deploy. Steps: DEPLOY-RAILWAY.md.

67. **No one pays through the old website (confirmed Oct 12),** so onejumpfit.com moves straight to the app. The old site's service stays at its own railway.app address (not deleted) in case anything is needed from it.

68. **One Ask Assist window (owner’s change, Oct 15).** The top-bar microphone is gone. The green “Ask Assist” button (and ⌘K, and “Summarize my month”) opens the Talk window, which now greets the coach by name, says what Assist can do, and explains that tapping the OneJump logo turns on talking. It no longer starts listening on open: typing works straight away, and the logo turns hands-free talking on and off. The “Try saying” list was removed. The conversation stays while the tab is open (with “New conversation”), and the last 12 turns are sent so follow-up questions work.
69. **Assist (Claude) sees the whole business, read-only.** New tools: list_clients, client_details (profile, why, program, package, payments, workouts, weight trend, nutrition targets and logging, check-ins, private notes, latest messages), client_messages, unread_messages, checkins_to_review, training_week, programs, leads and payments_overview. Same rules: tenant-scoped, no emails, phone numbers or card details, actions only as proposals the coach confirms. Assist may also answer general coaching and business questions from its own expertise; facts about the business must come from tools. `ASSIST_MODEL` lets conversations use a smarter model than the drafts (e.g. `claude-sonnet-5-5`); default is the same Haiku.
70. **English and Spanish (Oct 15).** Pages are written in English; in Spanish a translator swaps known text as the page draws (dictionary of ~1,700 strings plus patterns for numbers, dates and names). Language = the choice saved on the device (coach: Settings → Profile → Language; public pages: EN | ES switch), otherwise the phone or browser language. Assist answers, listens (Deepgram multilingual) and speaks (Spanish voice, `DEEPGRAM_TTS_VOICE_ES`, default Selena) in the coach’s language. Coach- and client-written content (messages, drafts, goals, program names) is not translated. The client app and legal pages stay English for now.
71. **Public pages are always light** (landing, pricing, sign-up, log-in, onboarding, join, booking, legal). The coach workspace keeps its light/dark toggle.
72. **Every deploy gets fresh script and style addresses** (Oct 15). Cloudflare and browsers were holding old copies of the JS and CSS for up to 4 hours, so a deploy showed up only partly. Pages now point at `/v/<commit>/js/…` and `/v/<commit>/css/…` (cached for a year, new address each deploy), pages themselves are never cached, and old unversioned addresses are always re-checked.
