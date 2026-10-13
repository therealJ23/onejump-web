# Client API for the iPhone app

Base URL: `http://localhost:3000` while developing, later `https://app.onejumpfit.com`.
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
