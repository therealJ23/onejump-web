# OneJump — Voice + Nutrition build spec

Approved to build now (October 2026). Build these after the MVP foundation they depend on: login and roles, clients, the client app, check-ins, messages and Ask Assist. Follow `CLAUDE.md` for the stack and rules: plain HTML/CSS/JavaScript front end, Node.js + Express, MySQL 8 with Prisma, every query through `dbFor(session)`.

**What it should look like:** `onejump-voice-nutrition-samples.pdf` (labeled screenshots) and the clickable prototype `onejump-prototype.html`. The prototype simulates the microphone and camera with sample phrases and sample photos; the real app uses the real microphone and camera. Where to find each screen in the prototype is listed at the end.

---

## Part 1: Voice

### What to build
| Feature | Where | Who | Plan |
|---|---|---|---|
| Dictation (🎤 button) | Every message box, check-in reply, client notes, Community post box, "+ Lead" paste box, Ask Assist input | Coach and client | All plans |
| Talk to Assist (push-to-talk, spoken answers) | Mic button in the top bar, on Ask Assist and in the Assist drawer | Coach | Pro |
| Morning briefing | "Morning briefing" button on Today, plus a 7 AM notification | Coach | Pro |
| Log a set by voice | Client workout screen ("Log next set by voice") | Client | Pro (coach's plan) |
| Voice notes | Client chat with the coach (coach can send them too) | Both | Pro |
| Voice food logging | Client Nutrition → Voice | Client | Pro |

### Voice commands
**Questions** (answered right away, on screen and spoken):
| The coach says | Assist does |
|---|---|
| "Who hasn't checked in this week?" | Lists clients missing this week's check-in |
| "Which clients are at risk of leaving?" | Lists clients by risk score with their top reasons |
| "Who has missed the most workouts?" | Ranks clients by missed workouts (14 days) |
| "Who's struggling with nutrition this week?" | Clients missing protein targets, low targets, private flags count |
| "What was my revenue last month?" | Revenue and change vs the month before |
| "Which clients haven't paid?" | Failed and upcoming payments |
| "Give me a summary of my business this month." | Revenue, clients, risks, money, leads |
| "How is Mike doing?" / "Read me Mike's check-in" | Client summary or the check-in summary |
| "Start my morning briefing" | Plays the briefing |

**Actions** (always show a confirmation card; nothing happens until the coach taps Confirm):
| The coach says | Proposal shown |
|---|---|
| "Send Marcus the drafted message" | The draft, recipient, Confirm / Cancel |
| "Reply to Priya: great job, same weights on Day 3" | The reply text, Confirm / Edit / Cancel |
| "Add a lead: Jake, wants to get stronger for climbing, found me on Instagram" | Filled lead card (name, goal, source), Save / Cancel |
| "Remind everyone who hasn't checked in" | List of recipients + message, Send all / Cancel |
| "Add a note to Chris: knee pain reported" | The note, Save / Cancel |
| "Book Mike for Thursday at 6 PM" (if scheduling exists) | Appointment details, Book / Cancel |

**Never by voice:** charges, refunds, plan or price changes, deleting anything, changing nutrition targets, messaging all clients without review. Assist answers: "I can't do that by voice. Open [screen] to do it."

**Client voice:**
| The client says | What happens |
|---|---|
| "10 reps at 55" (also "8 at 135 pounds", "12 bodyweight") | Fills and ticks the next unchecked set; toast with Undo |
| Voice note in chat | Sends audio + transcript to the coach |
| "Two eggs and toast" (Nutrition → Voice) | Parsed into foods to review, then Add |

### How it works
1. **Dictation:** the browser's built-in `SpeechRecognition` / `webkitSpeechRecognition` with interim results written into the text box. Feature-detect; hide the button where unsupported. Nothing is sent automatically. Note in the privacy policy that the browser may process dictation audio on its own servers.
2. **Talk to Assist:**
   - Browser: ask for microphone permission on the first tap (`getUserMedia`), record with `MediaRecorder` (`audio/webm;codecs=opus`, or `audio/mp4` on Safari). Tap to start, tap to stop, auto-stop at 30 seconds. Show a listening state and level meter (Web Audio `AnalyserNode`).
   - `POST /api/voice/ask` (multipart audio, max 2 MB) → `VoiceService.transcribe()` (provider from `VOICE_PROVIDER`) → `AssistService.ask(session, transcript, { voice: true })`.
   - Response: `{ transcript, answerHtml, spokenText, proposals: [{ id, type, summary, payload }] }`. `spokenText` is at most 2 short sentences.
   - Assist uses Claude tool use with **read-only tools** (missing check-ins, at-risk clients, revenue, unpaid, client summary, nutrition overview, Today queue) and **proposal tools** (propose message, lead, reminders, note, appointment). Proposal tools only create an `AssistProposal` row; they never execute.
   - `POST /api/assist/proposals/:id/confirm` runs the action through the normal service functions with the coach's own permissions. `/cancel` discards it. Proposals expire after 10 minutes and can be confirmed only once.
   - Spoken answers: browser `speechSynthesis` by default (free). With `VOICE_TTS=deepgram`, `POST /api/voice/speak` returns audio.
   - `VOICE_PROVIDER=mock` returns fixed transcripts so tests run without keys.
3. **Morning briefing:** a node-cron job at 6:30 AM in the coach's timezone builds the script from real data (Assist only words it), at most about 120 words: count of open items, the most urgent client, check-ins (pain first), failed payments, today's calendar, one piece of good news. Store it in `Briefing`; show an in-app banner and optional email at 7 AM; play with `speechSynthesis` or pre-generated audio.
4. **Set logging:** parse with a regex first (`/(\d+)\s*(?:reps?)?\s*(?:at|@|with|for)?\s*(\d+(?:\.\d+)?)?\s*(lb|lbs|pounds|kg|bodyweight)?/i`), fall back to `AIService.parseSetText`. Fill the next unchecked set, tick it, toast with Undo.
5. **Voice notes:** record up to 60 seconds → upload to R2 (private, `voice/{businessId}/{uuid}`) → transcribe → `Message` with `audioKey`, `durationS`, transcript as the body, and a one-line Assist summary for the coach. Run `SafetyGuard` on the transcript (pain or injury flags the coach).

### Voice rules
- Push-to-talk only, with a visible recording indicator. Never record in the background.
- No action without an on-screen Confirm. No money or destructive actions by voice.
- Keep transcripts. Keep audio only for voice notes the client chose to send; delete Talk-to-Assist audio after transcription.
- "Speak answers out loud" toggle, remembered per device. Never read health flags or other sensitive details aloud; show them on screen.
- `SafetyGuard` runs on every transcript.
- Per-business monthly limit (`VOICE_MONTHLY_MINUTES`, default 300). Over the limit, dictation still works; Talk to Assist says the monthly voice limit is reached.
- Log every request in `AIUsage` (seconds, provider, cost).
- Microphone denied: "Microphone access is off. Turn it on in your browser settings to use voice." Typed input keeps working.

### Voice data model (Prisma, MySQL)
```prisma
model VoiceInteraction {
  id         String   @id @default(uuid())
  businessId String
  userId     String
  transcript String   @db.Text
  durationMs Int
  provider   String
  costMicros Int      @default(0)
  createdAt  DateTime @default(now())
  @@index([businessId, createdAt])
}
model AssistProposal {
  id         String   @id @default(uuid())
  businessId String
  userId     String
  type       String              // send_message | create_lead | send_reminders | add_note | book_appointment
  summary    String
  payload    Json
  status     String   @default("pending")   // pending | confirmed | cancelled | expired
  expiresAt  DateTime
  createdAt  DateTime @default(now())
}
model Briefing {
  id         String   @id @default(uuid())
  businessId String
  userId     String
  date       DateTime @db.Date
  script     String   @db.Text
  audioKey   String?
  createdAt  DateTime @default(now())
  @@unique([userId, date])
}
// Message: add audioKey String?, durationS Int?, transcriptSummary String?
```

### Voice acceptance criteria
- [ ] Dictation button is hidden where speech recognition is unsupported; dictated text appears in the box and nothing is sent automatically.
- [ ] With `VOICE_PROVIDER=mock`, "Who hasn't checked in this week?" returns the same clients as the typed Ask Assist question.
- [ ] "Send Marcus the drafted message" creates one pending proposal and sends nothing; Confirm sends exactly once; an expired proposal can't be confirmed; a coach can't confirm another business's proposal.
- [ ] Requests over the monthly voice limit are refused with a clear message.
- [ ] "10 reps at 55" fills the next set; Undo restores it.
- [ ] A voice note shows audio and transcript to the coach; "my knee hurts" triggers the pain flag.
- [ ] Denied microphone permission shows the message above; typing still works.

---

## Part 2: Nutrition

### Approach per client (the coach chooses)
| Approach | Client sees | Best for |
|---|---|---|
| Habits | Daily habit checkboxes only, no numbers | Beginners |
| Targets | Calories, protein (+ carbs, fat) vs the coach's targets | Fat loss, strength |
| Meal plan | The coach's meal plan template, plus logging | Coaches who write plans |

Plus a **Hide numbers** toggle: the client never sees calories or macros anywhere, and the API omits them for that client.

### How clients log (always fast, always confirmed)
1. **Photo with Assist** (Pro)
   - `<input type="file" accept="image/*" capture="environment">` opens the camera on phones. Resize in the browser to max 1024 px on the long edge (JPEG ~0.8) and strip EXIF/location before upload.
   - `POST /api/me/food-photo` → store privately in R2 → `AIService.analyzeMealPhoto(image)` with Claude Haiku vision and the JSON schema below.
   - **AI identifies, the database calculates:** the model returns foods, estimated grams and confidence; the server matches each food to USDA FoodData Central and computes nutrients from grams. No match: use the model's estimate and label it "estimate".
   - The client reviews: portion chips (½×, 1×, 1½×, 2×) or grams, remove or add items, choose the meal, then Add. **Nothing is saved before Add.** Medium/low confidence items show "Check this portion".
   - Not food or unclear: "I couldn't recognize food in this photo. Try again or search instead."
   - Cost: about 1,300 image tokens + 200 output tokens, about $0.002 per photo on Haiku, about $0.20 per client per month at 3 photos a day. Caps: `NUTRITION_PHOTOS_MONTHLY` per business (default 3,000) and 20 per client per day.
2. **Search:** USDA FoodData Central `/foods/search` (free key from api.data.gov; 1,000 requests/hour). Server-side cache in `FoodCache` for 30 days. Prefer Foundation and SR Legacy foods for whole foods, Branded for brand names. Credit "USDA FoodData Central".
3. **Barcode:** scan with the browser `BarcodeDetector` API where available, otherwise a JS barcode library (e.g. `@zxing/browser`). `GET /api/foods/barcode/:code` → Open Food Facts product API → cache. One API call per real scan, no bulk scraping. Show "Contains data from Open Food Facts, available under the Open Database License" with links, in the UI and on an About/Data page. Not found → Quick add.
4. **Voice** (Pro): dictation → text → number-word/regex parser first ("two eggs and toast" = egg × 2, toast × 1), `AIService.parseFoodText` fallback → match USDA → review → Add.
5. **Quick add:** name + calories + protein (carbs and fat optional).
6. **Favorites and repeat:** save any entry as a favorite; "Repeat yesterday's lunch".
7. **Habits:** coach-defined habits, one tap to check off each day, 7-day streaks.

Vision output schema:
```json
{
  "is_food": true,
  "title": "Chicken & rice bowl",
  "items": [
    { "name": "Grilled chicken breast", "grams": 170, "portion_text": "about 6 oz", "confidence": "high" },
    { "name": "White rice, cooked", "grams": 158, "portion_text": "about 1 cup", "confidence": "medium" }
  ],
  "note": "Portions are estimated from the photo."
}
```
Prompt rules for every nutrition prompt: neutral words only (no "good" or "bad" foods, no judgment), no medical advice, no supplement advice, no diet prescriptions.

### Coach side
- **Nutrition page** (Coaching → Nutrition): KPIs (clients logging 5+ days, protein days hit, meals photographed, habit check-ins); **Needs your attention** from Assist (clients missing protein most days with personal drafted reminders, targets below resting needs, private flags); a table of clients (approach, days logged, calories vs target, protein days hit, last log) linking to each client; how clients log; meal plan templates; data credits.
- **Client → Nutrition tab:** approach selector, Hide numbers toggle, targets (calories, protein, carbs, fat), **calculator** (Mifflin-St Jeor resting needs × activity ± goal; protein suggestion 0.7–1 g per lb; shown as an estimate the coach confirms), safety warnings, Assist weekly summary with charts (logged vs target for protein and calories), today's log with meal photos, habits, coach note.
- **Weekly check-in:** days logged and protein days hit filled in automatically next to the client's own 1–10 nutrition rating; the Assist summary mentions nutrition.
- **Today queue:** "3 clients missed their protein target most days", with a personal draft for each.
- **Risk radar:** logging stopped for 5+ days after regular logging adds 6 points; protein hit on 2 or fewer days for 2 weeks adds 4.
- **Ask Assist and voice:** "Who's struggling with nutrition this week?"
- **Meal plan templates and recipes:** build once, assign to many clients.

### Safety and scope rules (must implement)
1. The coach sets every target. Assist never creates diets or targets on its own; the calculator's output is labeled an estimate and must be confirmed.
2. **Target below estimated resting needs** (Mifflin-St Jeor): warning plus a required "I've reviewed this target" checkbox to save; record it in `AuditLog`.
3. **Fast loss:** an average loss above 1% of body weight per week over 2+ weeks alerts the coach.
4. **Hide numbers:** the client UI and client API responses contain no calories or macros (test it).
5. **Language flags** in food notes, check-ins, messages and Community posts (skipping meals to make up for eating, purging, "earning" or "burning off" food, extreme restriction): create a flag visible **only to the coach**. Assist never replies to the client about it automatically. The drafted reply is warm, number-free, and suggests talking to a doctor or registered dietitian if it continues. Language suggesting someone may be at risk alerts the coach right away.
6. No supplement recommendations and no medical nutrition advice (diabetes, kidney disease, pregnancy, medications, allergies): "That's a question for your doctor or a registered dietitian."
7. **Scope reminder** when the coach chooses Meal plan: "In some states, individualized meal plans require a dietitian license. Check your state's rules, or refer to a registered dietitian." Never label a coach "dietitian" or "nutritionist" unless they've recorded that credential.
8. Neutral client UI: going over a target is shown in a neutral color, never red or shaming.
9. Food photos are private to the client and coach, served with signed URLs (5 minutes), EXIF stripped, deleted with the entry.

### Plans
- **All plans:** habits, targets, calculator, quick add, search, barcode, favorites, nutrition stats in check-ins.
- **Pro:** photo logging, voice logging, Assist nutrition summaries, alerts and insights, meal plan templates and recipes.
- Starter calls to Pro endpoints return 403 with an upgrade message.

### Nutrition data model (Prisma, MySQL)
```prisma
model NutritionPlan {
  id          String   @id @default(uuid())
  businessId  String
  clientId    String   @unique
  approach    String   @default("habits")   // habits | targets | meal_plan
  calories    Int?
  proteinG    Int?
  carbsG      Int?
  fatG        Int?
  hideNumbers Boolean  @default(false)
  mealPlanId  String?
  coachNote   String?  @db.Text
  sex         String?                         // for the calculator only
  heightIn    Float?
  activity    Float?
  lowTargetConfirmedAt DateTime?
  updatedAt   DateTime @updatedAt
}
model Habit      { id String @id @default(uuid()); businessId String; clientId String; title String; active Boolean @default(true); sortOrder Int @default(0) }
model HabitCheck { id String @id @default(uuid()); businessId String; clientId String; habitId String; date DateTime @db.Date; @@unique([habitId, date]) }
model FoodEntry {
  id         String   @id @default(uuid())
  businessId String
  clientId   String
  meal       String                         // breakfast | lunch | dinner | snack
  title      String
  source     String                         // photo | search | barcode | voice | quick | favorite
  photoKey   String?
  aiInsightId String?
  loggedAt   DateTime
  createdAt  DateTime @default(now())
  items      FoodEntryItem[]
  @@index([businessId, clientId, loggedAt])
}
model FoodEntryItem {
  id         String   @id @default(uuid())
  businessId String
  entryId    String
  name       String
  grams      Float?
  portionText String?
  calories   Float
  proteinG   Float
  carbsG     Float
  fatG       Float
  fdcId      Int?
  barcode    String?
  confidence String?                        // high | medium | low | estimate
  entry      FoodEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
}
model FoodFavorite     { id String @id @default(uuid()); businessId String; clientId String; title String; items Json }
model MealPlanTemplate { id String @id @default(uuid()); businessId String; name String; calories Int?; days Json; createdAt DateTime @default(now()) }
model Recipe           { id String @id @default(uuid()); businessId String; name String; servings Int; ingredients Json; steps Json; perServing Json }
model NutritionFlag    { id String @id @default(uuid()); businessId String; clientId String; sourceType String; sourceId String; text String @db.Text; category String; status String @default("open"); createdAt DateTime @default(now()) }
model FoodCache        { id String @id @default(uuid()); source String; externalId String; data Json; fetchedAt DateTime @default(now()); @@unique([source, externalId]) }  // public food data, not tenant-scoped
```

### Nutrition routes (Express)
| Route | Who | Does |
|---|---|---|
| `GET/PUT /api/clients/:id/nutrition-plan` | Coach | Read/update approach, targets, hide numbers (low-target confirmation rule) |
| `POST /api/clients/:id/nutrition-plan/estimate` | Coach | Calculator result (no save) |
| `GET /api/nutrition/overview` | Coach | Page data: KPIs, table, attention items |
| `GET /api/clients/:id/food-entries?from&to` | Coach | Log with photo URLs |
| `GET /api/me/nutrition/today` | Client | Plan (numbers omitted when hidden), entries, habits |
| `POST /api/me/food-photo` | Client (Pro) | Upload + analysis result (nothing saved as an entry) |
| `POST /api/me/food-text` | Client (Pro for voice) | Parse text into items |
| `GET /api/foods/search?q=` | Client/coach | USDA search via cache |
| `GET /api/foods/barcode/:code` | Client | Open Food Facts via cache |
| `POST /api/me/food-entries` / `DELETE /api/me/food-entries/:id` | Client | Save confirmed items / remove |
| `POST /api/me/habits/:id/check` | Client | Toggle today's habit |

`AIService` additions: `analyzeMealPhoto(image)`, `parseFoodText(text)`, `parseSetText(text)`, `summarizeNutrition(clientId, weekStart)`, `flagNutritionLanguage(text)`. The mock provider returns fixtures copied from the prototype (`MockTemplates.mealPhoto`, `foodText`, `nutritionSummary`).

### Nutrition acceptance criteria
- [ ] Photo: a fixture image returns items from the mock; Add saves one entry with its items; an analysis that's never confirmed saves nothing; a non-food photo shows the friendly error.
- [ ] Search returns USDA results (mocked in tests); the second identical search is a cache hit.
- [ ] Barcode: a known code returns the product with Open Food Facts attribution; an unknown code offers Quick add.
- [ ] Hide numbers: client API responses contain no calories or macros (test).
- [ ] A target below resting needs can't be saved without confirmation, and the confirmation is in the audit log.
- [ ] Restriction language creates a coach-only flag; the client sees nothing and gets no automatic reply.
- [ ] Food entries, photos, plans and flags are never visible across businesses or to other clients (isolation tests).
- [ ] On Starter, photo and voice logging return 403 with an upgrade message, and the client app shows them as Pro.

---

## Environment variables to add
```text
VOICE_PROVIDER=mock               # mock | deepgram | openai
VOICE_TTS=browser                 # browser | deepgram
DEEPGRAM_API_KEY=                 # server only
VOICE_MONTHLY_MINUTES=300
FDC_API_KEY=                      # free from api.data.gov, server only
NUTRITION_PHOTO_MODEL=claude-haiku-4-5-20251001
NUTRITION_PHOTOS_MONTHLY=3000
```

## Build order
1. Nutrition basics: plan, approach, hide numbers, targets + calculator + warnings, habits, quick add, search, barcode, coach tab and Nutrition page.
2. Dictation everywhere.
3. Photo logging, Assist nutrition summaries, Today queue item, Ask Assist answer, language flags.
4. Talk to Assist with proposals and confirmation cards.
5. Client voice: set logging, voice notes, voice food logging.
6. Morning briefing.

After each step: all tests pass, the app runs end to end with sample data, and `PROGRESS.md` is updated.

## Where each screen is in the prototype
- **Talk to Assist:** mic button in the top bar of any coach screen (also on Ask Assist).
- **Morning briefing:** Today → "Morning briefing".
- **Dictation:** Messages → Mike Torres → mic next to Send; also in every "Edit" message box.
- **Nutrition page:** menu → Coaching → Nutrition.
- **Client Nutrition tab:** Clients → Mike Torres → Nutrition (calculator: "Estimate with calculator"). Low-target warning: Clients → Hannah Lee → Nutrition.
- **Client app:** Screens tab → Client app → "Nutrition today" card → Log food (Photo, Search, Scan, Voice, Quick). Workout → "Log next set by voice". Coach tab → mic for voice notes.
