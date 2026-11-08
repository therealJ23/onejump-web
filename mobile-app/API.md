# Client API for the iPhone app

Base URL: `https://onejumpfit.com` (launch the app with `-oj.server http://127.0.0.1:3000` to use a local server).
All requests and responses are JSON. Every request that changes something (POST, PUT, PATCH, DELETE) must send the header `X-CSRF-Token`.

## Logging in (no passwords for clients)
1. `GET /api/auth/csrf` → `{ csrfToken }`. Keep the session cookie (`oj.sid`) that comes back. `URLSession`’s shared cookie storage does this automatically.
2. `POST /api/auth/magic-link` `{ email }` → the client gets one email with a link (for the web) **and a 6-digit code** (for the app). Same answer whether or not the email exists.
3. The app: `POST /api/auth/magic-code` `{ email, code }` → `{ ok, csrfToken }`. The session cookie is now logged in. Store the new `csrfToken`. Wrong code → `401 { code: "code_wrong" }`; expired, used, replaced by a newer email or 5 wrong tries → `401 { code: "code_expired" }` (ask for a new one).
   The web: `POST /api/auth/magic` `{ token }` from the link.
4. `GET /api/auth/me` → who is logged in (`role` is `CLIENT`; `user.photoUrl` is their profile photo).
5. `POST /api/auth/logout` to log out.

A coach login (`POST /api/auth/login`) with a client's email answers `400 { code: "use_magic_link" }`: the app switches to the client login and sends the code.

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
| POST | `/delete-account` | `{ confirm: "DELETE" }` → deletes their data and login, tells the coach. `409 { code: "cancel_plan_first" }` while a paid plan is active |
| GET | `/nutrition/today?day=YYYY-MM-DD` | Targets (or none), food entries by meal, habits, favorites, coach note, features (`photo`, `voice`). No numbers when the coach hides them |
| POST | `/food-entries` | `{ meal, source, items: [{ name, grams, portionText, foodRef, calories… }], photoToken?, favoriteId? }` |
| DELETE | `/food-entries/:id` | Remove a logged food |
| POST | `/food-photo` | multipart `photo` (JPEG) → `{ photoToken, items }` (Pro) |
| POST | `/food-text` | `{ text, source: "voice" }` → `{ items }` |
| POST | `/habits/:id/check` | Tick or untick today |
| POST | `/voice-notes` | multipart `audio` (m4a), `durationMs`, `hint?` (Pro) |
| GET | `/messages/:id/audio?format=wav` | `{ url }` to play a voice note |

Food search and barcodes: `GET /api/foods/search?q=…` and `GET /api/foods/barcode/:code` (cached; USDA and Open Food Facts).

## Profile photos (coaches and clients)
| Method | Path | What |
| --- | --- | --- |
| POST | `/api/account/photo` | multipart `photo` (JPG/PNG/WebP, max 6 MB; the app sends a 640 px JPEG) → `{ photoUrl }` |
| DELETE | `/api/account/photo` | Remove it |

Photo links are signed and last an hour; the app caches photos by the link without its signature. Clients get their coach's photo in `/today`, `/thread` and `/account`; coaches get each client's `photoUrl` in `/api/mobile/coach` (and `me.photoUrl`).

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
