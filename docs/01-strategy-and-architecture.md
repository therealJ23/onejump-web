# OneJump — Product Strategy & Architecture

As of Oct 6, 2026. Live editable version: https://claude.ai/code/artifact/cc36ddd8-9cf0-4dcf-a80d-1e1fbac434fa

## The bet
OneJump wins if a coach with 15–60 clients gets back 5+ hours a week and loses fewer clients, so $59/month is an easy yes.

- **Who pays:** independent online and hybrid coaches with 10–60 paying clients; later, small studios with 2–8 coaches. Not gyms or franchises.
- **Problem:** existing tools deliver workouts to a phone but leave the coach to do the thinking for 40 people: reading check-ins, writing replies, noticing who is drifting, chasing failed payments, rewriting programs. Coaches learn a client is leaving when they cancel.
- **Value proposition:** *Your clients, handled. You approve.* OneJump watches every client daily, tells the coach who needs them and why, and drafts the work for one-tap approval.
  1. One queue instead of ten tabs (Today screen).
  2. No surprise cancellations (retention radar with reasons + drafted outreach).
  3. Get paid and grow in one place (payments, failed-payment recovery, leads, referrals, booking page; no add-on fees).
- **Why coaches switch:** concierge migration from Trainerize/TrueCoach/Everfit, a queue useful on day one, all-in pricing, and a visible "time saved this week".
- **Unfair advantage:** OneJump already runs a coaching business on Everfit with a signed coach: first design partner, first data, first case study.

## Target customer
Solo online/hybrid coaches with 15–50 paying clients (~$100–250/month per client), 1–5 years in, growing through Instagram/TikTok, using Everfit/Trainerize/TrueCoach plus spreadsheets and DMs. Start with one flavor (beginner/fat-loss coaches matching the "start from zero" brand, or strength coaches).
Not yet: brand-new trainers (0–5 clients), gyms/big studios, influencers with 500+ clients, big-box gym trainers.

## Competition and differentiation
| Product | Strong at | Pricing shape | Gap OneJump exploits |
|---|---|---|---|
| Everfit | Free tier (5 clients), broad features, AI Smart Response | Pro scales by clients; automation, payments, meal plans are paid add-ons | Automation and payments cost extra; AI is a reply helper, not a client-health layer |
| TrueCoach | Clean builder, big video library | Starter 5 / Standard 20 / Pro 50 clients | Coach still reviews every client by hand; automations via Zapier |
| Trainerize | Branded app, nutrition, big gym base | Branded app, video, nutrition, Stripe payments sold as add-ons | Busy; business layer bolted on |
| My PT Hub | All-in-one for PTs | Tiered by clients | Breadth over depth |

How OneJump stands out: sell a result ("keep more clients"), not "AI"; monthly ROI report (hours saved, clients kept, $ kept); a time-saved guarantee; own a niche first; 48-hour free migration (AI rebuilds programs from PDFs/screenshots); all-in pricing; the flywheel competitors can't copy: train new coaches (course) → they run their business on OneJump → OneJump Coaching routes overflow clients to opted-in coaches.

## Monetization
| Plan | Price | Clients | Adds |
|---|---|---|---|
| Free trial | $0, 14 days, no card | up to 50 | Everything in Pro |
| Starter | $29/mo | 15 | Workouts, programs, library, client app, check-ins w/ AI summaries, messaging w/ AI drafts, payments, 5 automation templates, progress |
| Pro | $59/mo | 50 | Retention radar, AI workout + program builder, Ask Assist, unlimited/custom automations, leads, booking page, referrals, analytics, branding |
| Studio | $99/mo + $25/coach after 2 | 150 | Multiple coaches, roles, assignment, shared library, studio analytics, priority support |

Rules: payments, reminders and the client app are in every plan; going over a limit prompts an upgrade, never locks out clients; annual = 2 months free. AI budget ≤5% of revenue, metered per workspace. Optional later revenue: small Stripe Connect fee on client payments (launch at 0%).
$1M ARR ≈ 1,350 coaches at $62 blended ARPU, or ≈1,000 with ~$20/mo payments revenue per coach.

## Scope
**MVP (first 10 paying coaches, online coaches first):** workspace + client invites + installable client web app; exercise library + workout builder; AI workout generator; client logging (sets/reps/weight/RPE); weekly check-ins + AI summary + suggested actions; messaging + AI drafts; Today queue; retention radar v1 (rules score, AI reasons); Stripe payments (memberships, packages, failed-payment alerts); 5 automation templates; progress (weight, measurements, photos); CSV import + concierge migration; lightweight internal admin.
**V2:** scheduling + recurring sessions + Google Calendar; multi-week AI program builder; AI adjustments from RPE/soreness/missed sessions; custom automation builder; Ask Assist (business AI); leads pipeline, booking page, referrals; full analytics; Studio (multi-coach); email/SMS; native iOS/Android client app (Capacitor wrapping the web app); nutrition targets; Instagram DM sync.
**Future:** white-label app; wearables; group programs and digital program store; AI form review on video; coach marketplace/client matching; public API/Zapier.
**Gates:** start V2 at 10 paying coaches opening Today 4+ days/week; Future work at 100 paying coaches with monthly logo churn under 4%.

## AI architecture
Features never call a vendor directly. They call `AIService`; a provider adapter (Anthropic, OpenAI or Mock) is chosen by `AI_PROVIDER`. Every output is stored as a draft (AIInsight, status pending) the coach approves.

Flow: Trigger (coach action, nightly job, client event) → Context builder (only this coach's data, minimum fields) → AIService (one method per job, versioned prompt + JSON schema) → Provider adapter → Validate + safety guard → Saved as draft → Coach approves/edits/dismisses → Action runs; edits logged as feedback.

```ts
export interface AIService {
  generateWorkout(brief: WorkoutBrief, ctx: ClientContext): Promise<Draft<Workout>>;
  suggestAdjustments(ctx: ClientContext): Promise<Draft<Adjustment[]>>;
  analyzeCheckIn(checkIn: CheckIn, ctx: ClientContext): Promise<Draft<CheckInSummary>>;
  draftMessage(intent: MessageIntent, ctx: ClientContext): Promise<Draft<string>>;
  analyzeClientRisk(signals: RiskSignals, ctx: ClientContext): Promise<Draft<RiskExplanation>>;
  generateProgram(prompt: string, ctx?: ClientContext): Promise<Draft<Program>>;
  analyzeProgress(series: ProgressSeries, ctx: ClientContext): Promise<Draft<Insight[]>>;
  analyzeBusiness(question: string, tools: ReadOnlyBusinessTools): Promise<Draft<Answer>>;
}
export interface LLMProvider { // AnthropicProvider, OpenAIProvider, MockProvider
  complete<T>(req: { system: string; prompt: string; schema: JSONSchema<T>; maxTokens: number }): Promise<T>;
}
```
Rules: deterministic first (scores and counts in code/SQL; the model explains and drafts); structured output only; tenant-scoped minimal context; the business assistant uses read-only tools, never SQL; nothing AI-written reaches a client unapproved (fixed-text reminders the coach turned on may auto-send); measure approve/edit/dismiss rates.
Safety: Assist never diagnoses. Pain, injury, medication, pregnancy or medical conditions switch the draft to: acknowledge, suggest a qualified professional, flag the client to the coach. Recommendations are suggestions; the coach is responsible for programming. Use a provider agreement that excludes customer data from training.

## UX architecture
Three apps, one design system: coach workspace (Today, Clients, Check-ins, Messages, Calendar, Programs, Builder, Library, Payments, Analytics, Leads, Referrals, Ask Assist, Automations, Settings, Billing); client app (Today, workout logging, check-in, Coach chat, Progress, Me); internal admin (MRR, coaches, churn, failed payments, AI usage, support).
Principles: attention first; Assist marked only by the logo's volt jump arc with the same three verbs (Approve, Edit, Dismiss); one primary action per screen; every state designed (empty, loading, error, confirmation with undo); clients never see risk scores, AI labels or business data.
Brand: deep green #12281F, green #2F5D4E, bone #F4F6F1, stone #C6D2C8, volt #D6FF3D (AI and primary emphasis only), Archivo type.

## Data model and security
Every tenant row carries `business_id`. The database is MySQL, which has no row-level security, so a single tenant-scoped data layer enforces isolation and automated tests prove it; clients read only their own rows. Money in cents, times in UTC.
Entities: Business, User, Membership (role: owner/coach/client), Trainer, Client, Goal, Exercise (global when business_id null), Program, Workout, WorkoutExercise, WorkoutSession, CheckIn, Measurement, ProgressMetric, ProgressPhoto, Message (+Thread), Appointment, ClientPlan, Payment, Subscription, Lead, Referral, Automation, Notification, AIInsight, ClientEvent, AIUsage, AuditLog.
Access: owner sees whole business + billing; coach sees assigned clients; client sees own data; OneJump admin sees aggregates, client-level access only through logged break-glass. Photos in private storage behind short-lived signed URLs; card data stays with Stripe; audit log; export/delete per client. Get a privacy/legal review before launch (fitness coaching usually sits outside HIPAA, but state consumer-health-data laws such as Washington's My Health My Data Act may apply).

## Platform
Web app for coaches (browser, responsive). Clients: installable home-screen web app for the MVP, native iOS/Android in V2 by wrapping the same code with Capacitor. No desktop app. Stack: plain HTML/CSS/JavaScript front end, Node.js + Express back end, MySQL 8 with Prisma, hosted on DigitalOcean.

## Risks
| Risk | Mitigation |
|---|---|
| Consumer brand OneJump Coaching competes with coaches you sell to | Hard rule: never contact/market to/recruit a coach's clients; consider "Onejump Coach" as the software name; or turn it into the opt-in client-matching flywheel |
| Switching cost | Concierge migration, CSV import, founding price |
| AI wrong/unsafe | Approval before send, medical guard, schema validation, quality metrics |
| "Has AI" is copied | Compete on retention outcomes + business layer |
| Solo founder bandwidth | Build only the MVP column; managed services; no native app until V2 |
| Payments compliance | Stripe Connect handles KYC, payouts, card data |

## Go-to-market (first 10 coaches)
1. Move OneJump's own coach off Everfit; measure hours saved and retention for 4 weeks.
2. Recruit 9 coaches from coach communities with a founding offer (Pro at $39/month for life, hands-on migration).
3. Coach-refers-coach: one free month for both.
4. Weekly 15-minute calls with each pilot coach.
Metrics: time to first approved AI action (day 1), days/week coaches open Today, drafts approved without edits, client 90-day retention vs old tool, monthly coach churn.

## Open questions
- Software name: OneJump, or "Onejump Coach" beside the consumer brand?
- Payments fee: 0% at launch or small fee on Starter?
- First AI provider (price and data terms at launch)?
- Does the first pilot coach need scheduling?

## Sources
TrueCoach pricing https://truecoach.co/pricing/ · Everfit pricing https://everfit.io/pricing/ · Trainerize pricing https://www.trainerize.com/pricing/ · brand from https://onejumpfit.com
