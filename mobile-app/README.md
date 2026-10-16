# OneJump iPhone app (Swift + SwiftUI)

One Xcode project with **both apps**: the **Coach app** and the **Client app**.

> Status: **the coach app runs on your real OneJump account.** Log in with the same email
> and password as onejumpfit.com and you see your own clients, drafts, check-ins, messages,
> payments and charts, and Assist (Claude, on the server) answers with your data and speaks
> with your Elise voice. **Try the demo** on the login screen opens the sample business (and
> the client app), with nothing sent anywhere.
> The client app is still the demo: clients log in with an email link, and email isn't set
> up yet (Resend).

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

Needs **Xcode 15 or newer** and runs on **iOS 17 or newer** (iPhone).

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

- **Login screen:** follows the iPhone's language (like the website).
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

## Logging in

The app talks to `https://onejumpfit.com`, the same JSON API as the web app (see `API.md`).
The session cookie is kept for 14 days of inactivity, so you stay logged in. **More →
Settings → Log out** signs out. Coaches who turned on two-step login enter their 6-digit code.

Everything Assist knows comes from the server; the app never holds an API key.

## Test it on your iPhone with TestFlight

You need the **Apple Developer Program** ($99/year) on your Apple ID.

1. **Xcode → Settings → Accounts → +** → Apple ID → sign in.
2. Open `OneJump.xcodeproj`, click **OneJump** (blue icon, top of the left sidebar) →
   target **OneJump** → **Signing & Capabilities** → tick **Automatically manage signing** →
   **Team**: pick your name (Apple Developer Program).
3. In a browser, go to **appstoreconnect.apple.com → Apps → + → New App**:
   Platform **iOS**, Name **OneJump** (if it's taken: **OneJump Coach**), Language
   **English (U.S.)**, Bundle ID **com.onejumpfit.OneJump**, SKU **onejump-ios**, Access
   **Full Access** → **Create**.
4. Back in Xcode, at the top choose **Any iOS Device (arm64)** as the destination.
5. **Product → Archive.** When the Organizer window opens: **Distribute App → App Store
   Connect → Distribute**. Wait for "Uploaded".
6. In App Store Connect → your app → **TestFlight**. After 5–15 minutes the build shows
   (status "Ready to Submit" / "Testing"). Under **Internal Testing** click **+**, make a group
   (for example "Me"), add yourself.
7. On your iPhone, install **TestFlight** from the App Store, open the email invite (or the
   TestFlight app) and tap **Install**.

Every new upload needs a higher build number: target **OneJump → General → Build** (1 → 2 → 3).
Export compliance is answered in the app (`ITSAppUsesNonExemptEncryption = NO`), so TestFlight
won't ask about encryption.

Without the paid program you can still run it on your own iPhone for 7 days: plug it in,
pick it at the top of Xcode, choose your personal team in Signing, press ▶ Run.

## Checks that run on every push (GitHub Actions)

- Builds with Xcode 15.4 and 16, and a **Release archive for real iPhones** (the same build
  TestFlight gets, unsigned).
- Screenshots of the demo **and of the signed-in coach app**, using the server's real
  responses from `Fixtures/` (made by the server's tests from its sample business). To
  refresh them, run the dump test described in `Fixtures/README.md`.
- Results are saved to the `ios-ci-logs` branch.

## Next steps

1. **Client app on the server** (needs email for login links: Resend), then push
   notifications for reminders and new messages.
2. **Apple Health** (steps, sleep) for clients.
3. **App Store release**: screenshots, description, privacy answers (the app collects name,
   email and what coaches type or say to Assist, for app functionality only; no tracking).

Server changes the iPhone app will need: universal links for login emails, push
notifications, and an app-version check (details in the web app's PROGRESS.md).

Brand: deep green `#12281F`, green `#2F5D4E`, bone `#F4F6F1`, stone `#C6D2C8`, volt
`#D6FF3D` (Assist and highlights only), font Archivo (included, SIL Open Font License).
