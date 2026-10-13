# OneJump iPhone app (Swift + SwiftUI)

One Xcode project with **both apps**: the **Coach app** and the **Client app**.
For now a small picker on the first screen lets you choose which one to open. In the real
app, logging in decides it (coaches get the coach app, clients get the client app).

> Status: **prototype built in Swift.** Every screen from the web prototypes is here, in
> English and Spanish, with real voice. It runs on sample data. Connecting it to the live
> server is the next step (see "Next steps" below).

## Open and run it (5 minutes)

1. Install **Xcode** from the Mac App Store (free). Open it once so it finishes installing.
2. Open this folder and double-click **`OneJump.xcodeproj`**.
3. At the top of Xcode, pick a simulator, for example **iPhone 16**.
4. Press **▶ Run** (or ⌘R). The app opens in the simulator.
5. Pick **Coach app** or **Client app**.

To run it **on your own iPhone**:
1. Plug in the iPhone and pick it at the top of Xcode instead of the simulator.
2. Click **OneJump** in the left sidebar → **Signing & Capabilities** → **Team** → pick your
   Apple ID (add it with "Add an Account…" if it's not there).
3. If Xcode says the bundle ID is taken, change `com.onejumpfit.OneJump` to something like
   `com.yourname.OneJump`.
4. Press **▶ Run**. The first time, on the iPhone go to **Settings → General → VPN & Device
   Management** and trust your developer certificate.

Needs **Xcode 16 or newer** and runs on **iOS 17 or newer**.

## Where things are

```
mobile-app/
  OneJump.xcodeproj           ← open this
  OneJump/
    App/                      app entry, settings (language, light/dark), app picker
    Core/
      Design/                 brand colors, Archivo font, wordmark, Assist jump-arc mark
      Components/             cards, buttons, pills, charts helpers, chat bubbles, toasts…
      Localization/           English/Spanish system (Loc) and the language list
      Voice/                  Assist's voice (speaking) and listening (speech to text)
      Networking/             APIClient for the OneJump server (see API.md)
      Utilities/              number formatting, haptics
    Coach/
      Models/                 data types (clients, drafts, threads, check-ins…)
      Data/                   sample data for the preview
      Text/                   every coach screen's text in English and Spanish
      Store/                  CoachStore (state + actions) and Assist's conversation logic
      Views/                  one file per screen, grouped by tab
        Today/  Clients/  Inbox/  Assist/  More/  Business/  Coaching/  Account/
    Client/
      Models/  Data/  Text/  Store/
      Views/
        Today/  Workout/  Food/  Progress/  Coach/  CheckIn/  Booking/  Me/  Sheets/
    Resources/                app icon, colors, Archivo font files
```

Each screen is its own file (for example `Coach/Views/Today/NeedsYouSection.swift`), and the
screens only show data and call the store. All changes go through `CoachStore` or `ClientStore`.

## What's in it

**Coach app** (tabs: Today · Clients · Assist · Inbox · More)
- Today: time Assist saved you, **spoken morning briefing**, the **Needs-you box** (drafts one
  after another, swipe or tap to approve/skip, undo, red count), today's sessions, business
  KPIs and **charts** (revenue by month, adherence trend, revenue by package), retention radar.
- Clients: search, filters, client page with Overview / Program / Food / Progress / Notes,
  risk score, add-client invite sheet.
- Assist: talk or type. Assist answers **out loud** and asks for a **spoken “yes”** before
  sending anything; it can read your drafts one by one for you to approve by voice.
- Inbox: messages (with **automatic translation**, e.g. a lead writing in Portuguese) and
  check-ins with Assist summaries, flags, recommended actions and a drafted reply.
- More: programs, workout builder, exercise library, nutrition, payments, leads,
  automations, settings (language, appearance, Assist tone, voice), plan & billing.

**Client app** (tabs: Today · Food · ＋ · Progress · Coach)
- Today: workout, coach's note, check-in reminder, habits, food ring, next session.
- Workout player: sets with steppers, rest timer, **log a set by voice**, equipment swaps,
  effort and soreness, finish screen with personal bests.
- Food: calories and macros, log by **photo, voice, barcode or search**, check portions
  before saving, favorites.
- Progress: weight chart with goal line, personal bests, measurements, private photos.
- Coach chat with voice notes (transcribed) and translation. Weekly check-in (mostly
  pre-filled), booking, and the Me screen.

## Language (English / Español)

- **Coach:** More → Settings → **Language** (or the EN/ES button at the top of More).
- **Client:** tap your avatar on Today → **Language**.

Switching changes every screen, Assist's voice and what the app listens for. Português,
Français and Kreyòl are listed; in this prototype they show a "coming soon" note.
All text lives in `Coach/Text/CoachText.swift` and `Client/Text/ClientText.swift`.

## Voice

The app uses Apple's built-in voices (the best one installed: Premium, then Enhanced) and
Apple's speech recognition. The first time you talk to it, iOS asks for **microphone** and
**speech recognition** permission. If you say no (or the simulator has no mic), the preview
plays a sample sentence so you can still see the flow.

Tip: for a nicer voice, on the iPhone go to **Settings → Accessibility → Spoken Content →
Voices → English → Ava (Premium)** (and **Spanish → Paulina**) and download it.

## Next steps

1. **Connect to the server.** `Core/Networking/APIClient.swift` already handles the session
   cookie, CSRF token and magic-link login from `API.md`. Swap each store's sample data
   for API calls, one screen at a time.
2. **Assist on the server.** The preview's Assist answers are canned
   (`Coach/Data/AssistReplies.swift`). In production, `CoachStore.reply(to:)` calls the
   server, which calls Claude with the coach's data.
3. **Push notifications** (reminders, new messages) and **Apple Health** (steps, sleep).
4. **TestFlight**: needs the Apple Developer Program ($99/year).

Server changes the iPhone app will need: universal links for login emails, push
notifications, and an app-version check (details in the web app's PROGRESS.md).

Brand: deep green `#12281F`, green `#2F5D4E`, bone `#F4F6F1`, stone `#C6D2C8`, volt
`#D6FF3D` (Assist and highlights only), font Archivo (included, SIL Open Font License).
