# Client API for the iPhone app

Base URL: `https://onejumpfit.com` (launch the app with `-oj.server http://127.0.0.1:3000` to use a local server).
All requests and responses are JSON. Every request that changes something (POST, PUT, PATCH, DELETE) must send the header `X-CSRF-Token`.

## Logging in (no passwords for clients)
1. `GET /api/auth/csrf` → `{ csrfToken }`. Keep the session cookie (`oj.sid`) that comes back. `URLSession`’s shared cookie storage does this automatically.
2. `POST /api/auth/magic-link` `{ email }` → the client gets an email with a link `…/login/magic?token=XYZ`.
3. When the app opens that link: `POST /api/auth/magic` `{ token }` → `{ ok, redirect, csrfToken }`. The session cookie is now logged in. Store the new `csrfToken`.
4. `GET /api/auth/me` → who is logged in (`role` is `CLIENT`).
5. `POST /api/auth/logout` to log out.

A `401` means “logged out” (show the login screen). A `403` with `{ code: "csrf" }` means “get a fresh token from `/api/auth/csrf` and retry once”.

## Endpoints (all under `/api/me`, only ever return this client’s own data)
| Method | Path | What |
| --- | --- | --- |
| GET | `/today` | Today screen: client, business (name, color, logo), coach, program week, streak, today’s/next workout, check-in status, weight progress, coach note |
| GET | `/workouts/:assignmentId` | One workout to log: exercises, sets (target reps/weight/rest), coach note |
| POST | `/workouts/:assignmentId/complete` | `{ sets: [{ exerciseId, sets: [{ weight, reps, done }] }], rpe (1–10), soreness?, note? }` → `{ workoutNumber, sets, volume }` |
| GET | `/checkin` | Last check-in values (to prefill), this week’s workouts done/planned |
| POST | `/checkins` | `{ weight?, sleepHours, energy, stress, soreness, nutrition, mood, text }` |
| GET | `/thread` | Messages with the coach (`from`: `me` or `coach`) |
| POST | `/messages` | `{ body }` |
| GET | `/progress` | Weights, main lift, personal bests, measurements, photos (short-lived private links) |
| POST | `/measurements` | `{ waist?, hips?, chest?, arm?, thigh?, weight? }` (inches / lb) |
| POST | `/photos` | multipart form: `photo` (JPG/PNG/WebP/HEIC, max 8 MB), `pose` |
| DELETE | `/photos/:id` | Delete a photo |
| GET | `/account` | Plan, subscription, recent payments, available packages |
| POST | `/billing/checkout` | `{ clientPlanId }` → `{ url }` to open in Safari (Stripe Checkout) |
| POST | `/billing/portal` | `{ url }` to update the card |
| GET | `/export` | All of the client’s data as JSON |

Errors look like `{ "error": "Plain-English message", "fields": { "email": "…" } }`.


# Coach API for the iPhone app

## Logging in (coaches)
1. `POST /api/auth/login` `{ email, password }` → `{ ok, csrfToken }`, or `{ twoFactor: true, csrfToken }`.
2. If `twoFactor`: `POST /api/auth/login/2fa` `{ code }` → `{ ok, csrfToken }`.
3. `GET /api/auth/me` → `role` is `OWNER` or `COACH`.

## Reading (one call per screen, labels as `{ en, es }`)
| Method | Path | What |
| --- | --- | --- |
| GET | `/api/mobile/coach` | Everything: me, Today (queue, sessions, KPIs, radar), charts, clients, threads, check-ins, leads, payments, programs, nutrition, automations, Assist stats, exercise library |
| GET | `/api/mobile/coach/clients/:id` | One client's page (stats, habits, activity, program week, food and nutrition plan, bests, measurements, photos, check-ins, notes) |
| GET | `/api/mobile/coach/threads/:clientId` | One conversation (marks it read) |
| GET | `/api/mobile/coach/checkins/:id` | One check-in with Assist's summary, reply draft and actions (written on first open) |
| GET | `/api/briefing/today` | Morning briefing lines (Pro) |

## Actions (same routes as the web app)
| Method | Path | Body |
| --- | --- | --- |
| POST | `/api/insights/:id/approve` | `{ text? }` sends a Needs-you draft (edited text optional) |
| POST | `/api/insights/:id/undo` | takes it back (5 minutes) |
| POST | `/api/threads/:clientId/messages` | `{ body }` |
| POST | `/api/checkins/:id/reply` | `{ insightId, text }` sends the reply and marks it reviewed |
| POST | `/api/checkins/:id/actions/:index/apply` | applies one suggested action |
| POST | `/api/checkins/remind` | `{ clientIds }` check-in reminder |
| POST | `/api/clients` | `{ name, email, mode, sendInvite }` → `{ client, inviteLink, emailed }` |
| POST | `/api/clients/:id/notes` | `{ body }` |
| PATCH | `/api/leads/:id` | `{ stage }` |
| POST | `/api/payments/:id/remind` | card-update reminder for a failed payment |
| PATCH | `/api/automations/:id` | `{ enabled }` |
| POST | `/api/assist/ask` | `{ question, voice, history: [{ role, text }], lang, pendingProposalId? }` → `{ answerText, spokenText, proposals, awaiting, decided? }` |
| POST | `/api/assist/proposals/:id/confirm` / `cancel` | approve or cancel what Assist prepared |
| POST | `/api/voice/speak` | `{ text, lang }` → MP3 (Elise), or 204 to use the phone's voice |
| POST | `/api/clients/:id/nutrition-plan/assist` | `{ request, lang }` → Assist's draft plan (Pro) |
| POST | `/api/clients/:id/nutrition-plan/apply-draft` | the (edited) draft → saves it for the client |
