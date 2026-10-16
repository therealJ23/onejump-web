import Foundation

/// Everything the coach screens show, in one place.
///
/// The demo uses `CoachSnapshot.sample` (built from `CoachData`). When a coach logs in, the
/// store replaces it with the live one from the server (`GET /api/mobile/coach`), so every
/// screen reads `store.data` and works the same either way.
struct CoachSnapshot {
    var me: CoachMe

    // Today
    var minutesSavedLabel: String
    var savedSub: Loc
    var queue: [QueueItem]
    var sessions: [Session]
    var sessionsNote: Loc
    var briefing: [Loc]
    var kpis: [KPI]
    var radar: [RadarEntry]

    // Charts
    var revenue: [RevenuePoint]
    var adherence: [AdherencePoint]
    var packages: [Package]
    var activeClientsSeries: [CountPoint]

    // Clients
    var clients: [CoachClient]
    var extras: [String: ClientExtras]
    var lifetimeValue: [String: String]
    var payingCount: Int?

    // Inbox
    var threadOrder: [String]
    var threads: [String: CoachThread]
    var leadPeople: [String: LeadPerson]
    var checkInOrder: [String]
    var checkIns: [String: CheckInReport]
    var reviewedCheckIns: [ReviewedCheckIn]
    var missingCheckIns: [MissingCheckIn]

    // Business
    var leads: [Lead]
    var leadStats: (open: String, pipeline: String, followUps: String)
    var payments: PaymentSummary
    var recentPayments: [Payment]

    // Coaching
    var programs: [ProgramSummary]
    var library: [LibraryExercise]
    var nutritionStats: [KPI]
    var nutritionSummary: Loc
    var nutrition: [NutritionRow]
    var howClientsLog: [ShareRow]
    var habitShares: [ShareRow]
    var mealPlans: [MealPlanTemplate]
    var automations: [ToggleSetting]
    var automationOn: [String: Bool]
    var automationRuns: [DatedLine]

    // Settings
    var assistUsage: (requests: String, approved: String, saved: String)
    var suggestions: [Loc]

    /// The program's name for a client (live clients carry it; the sample looks it up).
    func programName(_ id: String) -> Loc {
        if let p = programs.first(where: { $0.id == id }), !p.name.en.isEmpty { return p.name }
        if let c = clients.first(where: { $0.programID == id }), let label = c.programName { return label }
        return CoachData.programName(id)
    }
}

extension CoachSnapshot {
    /// Ask Assist suggestions for a real business (the demo's mention sample clients).
    static let liveSuggestions: [Loc] = [
        Loc("Who needs me today?", "¿Quién me necesita hoy?"),
        Loc("Who hasn’t checked in this week?", "¿Quién no ha hecho su check-in esta semana?"),
        Loc("How’s my business doing this month?", "¿Cómo va mi negocio este mes?"),
        Loc("Which clients haven’t paid?", "¿Qué clientes no han pagado?")
    ]

    /// While the coach's business is loading.
    static func empty(name: String = "") -> CoachSnapshot {
        let first = name.split(separator: " ").first.map(String.init) ?? ""
        return CoachSnapshot(
            me: CoachMe(name: name, first: first, initials: String(first.prefix(1)), email: "", business: "", bookingURL: "", planLabel: "", trialDaysLeft: nil, pro: true, totpEnabled: false),
            minutesSavedLabel: "0h 00m", savedSub: "", queue: [], sessions: [], sessionsNote: "", briefing: [], kpis: [], radar: [],
            revenue: [], adherence: [], packages: [], activeClientsSeries: [],
            clients: [], extras: [:], lifetimeValue: [:], payingCount: nil,
            threadOrder: [], threads: [:], leadPeople: [:], checkInOrder: [], checkIns: [:], reviewedCheckIns: [], missingCheckIns: [],
            leads: [], leadStats: ("0", "$0", "0"),
            payments: PaymentSummary(mrr: "$0", mrrNote: "", collected: "$0", outstanding: "$0", avg: "$0", failedCount: 0, onTime: "—", attention: [], reminderDraft: ""),
            recentPayments: [], programs: [], library: [], nutritionStats: [], nutritionSummary: "", nutrition: [],
            howClientsLog: [], habitShares: [], mealPlans: [], automations: [], automationOn: [:], automationRuns: [],
            assistUsage: ("0", "—", "0h"), suggestions: liveSuggestions
        )
    }

    /// The demo: Alex Rivera's sample business.
    static let sample = CoachSnapshot(
        me: CoachMe(name: "Alex Rivera", first: "Alex", initials: "AR", email: "alex@onejumpfit.com", business: "Alex Rivera Coaching",
                    bookingURL: "onejumpfit.com/alex", planLabel: CT.proTrial, trialDaysLeft: 11, pro: true, totpEnabled: true),
        minutesSavedLabel: "6h 40m",
        savedSub: CT.savedSub,
        queue: CoachData.queue,
        sessions: CoachData.sessions,
        sessionsNote: CT.booked3,
        briefing: CoachData.briefing,
        kpis: [
            KPI(value: "$1,972", label: CT.kRevenue, note: CT.kRevenueUp, target: "payments"),
            KPI(value: "9", label: CT.kActive, note: CT.kActiveUp, target: "clients"),
            KPI(value: CT.k7of9.en, label: CT.kCheckins, note: CT.k2missing, target: "checkins", noteMuted: true),
            KPI(value: "92%", label: CT.kRetention, note: CT.kRetentionUp)
        ],
        radar: CoachData.radar,
        revenue: CoachData.revenue,
        adherence: CoachData.adherence.enumerated().map { AdherencePoint(id: $0.offset, label: Loc("Wk \($0.offset + 1)", "Sem \($0.offset + 1)"), pct: $0.element) },
        packages: CoachData.packages,
        activeClientsSeries: zip(["May", "Jun", "Jul", "Aug", "Sep", "Oct"], [4, 5, 5, 7, 8, 9]).enumerated().map { i, pair in
            CountPoint(id: i, label: Loc(pair.0, ["May": "may", "Jun": "jun", "Jul": "jul", "Aug": "ago", "Sep": "sep", "Oct": "oct"][pair.0] ?? pair.0), count: pair.1)
        },
        clients: CoachData.clients,
        extras: CoachData.extras,
        lifetimeValue: CoachData.lifetimeValue,
        payingCount: 9,
        threadOrder: CoachData.threadOrder,
        threads: CoachData.threads,
        leadPeople: CoachData.leadPeople,
        checkInOrder: CoachData.checkInOrder,
        checkIns: Dictionary(uniqueKeysWithValues: CoachData.checkIns.map { key, report in
            var r = report
            r.id = key
            r.clientID = key
            return (key, r)
        }),
        reviewedCheckIns: CoachData.reviewedCheckIns,
        missingCheckIns: CoachData.missingCheckIns,
        leads: CoachData.leads.map { lead in
            var l = lead
            l.stage = CoachData.initialLeadStages[lead.id] ?? .new
            return l
        },
        leadStats: ("\(CoachData.leads.count)", "$845", "4"),
        payments: PaymentSummary(
            mrr: "$1,972", mrrNote: CT.mrrSub, collected: "$1,574", outstanding: "$398", avg: "$219", failedCount: 0, onTime: "98%",
            attention: [
                PaymentAttention(id: "sofia", clientID: "sofia", name: "Sofia Ramirez", initials: "SR", avatar: 0xE3D2B5, sub: CT.overdue6, reminded: false),
                PaymentAttention(id: "tyler", clientID: "tyler", name: "Tyler Johnson", initials: "TJ", avatar: 0xC9D6E2, sub: CT.due15, reminded: true)
            ],
            reminderDraft: CT.reminderText
        ),
        recentPayments: CoachData.recentPayments,
        programs: CoachData.programs,
        library: CoachData.library,
        nutritionStats: [
            KPI(value: "7", label: CT.onPlan, note: ""),
            KPI(value: "84%", label: CT.avgProtein, note: ""),
            KPI(value: "5", label: CT.loggedToday, note: "")
        ],
        nutritionSummary: CT.nutritionBody,
        nutrition: CoachData.nutrition,
        howClientsLog: CoachData.howClientsLog,
        habitShares: CoachData.habitShares,
        mealPlans: CoachData.mealPlans,
        automations: CoachData.automations,
        automationOn: CoachData.initialAutomations,
        automationRuns: CoachData.automationRuns,
        assistUsage: ("412", "78%", "27h"),
        suggestions: CoachData.suggestions
    )
}

// MARK: - A client's page

extension ClientDetailData {
    /// The sample page for a demo client (the defaults, plus anything special for that client).
    static func sample(for client: CoachClient) -> ClientDetailData {
        let extras = CoachData.extras[client.id]
        let isNew = client.kind.isNew
        let macros: [MacroLine]
        if client.noLogs {
            macros = [
                MacroLine(label: CT.calories, now: 0, target: 2400, unit: "kcal"),
                MacroLine(label: CT.protein, now: 0, target: 180, unit: "g"),
                MacroLine(label: CT.carbs, now: 0, target: 260, unit: "g"),
                MacroLine(label: CT.fat, now: 0, target: 75, unit: "g")
            ]
        } else if client.lowProtein {
            macros = [
                MacroLine(label: CT.calories, now: 1540, target: 1750, unit: "kcal"),
                MacroLine(label: CT.protein, now: 92, target: 135, unit: "g", warn: true),
                MacroLine(label: CT.carbs, now: 190, target: 190, unit: "g"),
                MacroLine(label: CT.fat, now: 54, target: 60, unit: "g")
            ]
        } else {
            macros = [
                MacroLine(label: CT.calories, now: 1620, target: 2000, unit: "kcal"),
                MacroLine(label: CT.protein, now: 118, target: 140, unit: "g"),
                MacroLine(label: CT.carbs, now: 160, target: 200, unit: "g"),
                MacroLine(label: CT.fat, now: 52, target: 65, unit: "g")
            ]
        }
        return ClientDetailData(
            riskScore: extras?.riskScore,
            riskWhy: extras?.riskWhy,
            stats: [
                KPI(value: client.adherence.map { "\($0)%" } ?? "—", label: CT.adherence, note: CT.last2Weeks, noteMuted: true),
                KPI(value: client.weight, label: CT.weight, note: client.weightChange, noteMuted: true),
                KPI(value: client.streak, label: CT.streak, note: CT.days, noteMuted: true)
            ],
            weightTotal: client.weightTotal,
            spark: client.spark,
            habits: (extras?.habits ?? CoachData.defaultHabits).map { h in
                isNew ? HabitStat(title: h.title, value: CoachData.startsTomorrow, on: false) : h
            },
            activity: isNew ? CoachData.newClientActivity : (extras?.activity ?? CoachData.defaultActivity),
            next: client.next,
            billing: client.billing,
            lifetimeValue: CoachData.lifetimeValue[client.id] ?? "$0",
            programName: nil,
            weekRows: [],
            foodLogged: client.noLogs ? CT.nothingLogged : CT.logged3,
            macros: macros,
            foodNote: client.nutritionNote,
            nutritionPlan: nil,
            bests: isNew ? [] : (extras?.bests ?? CoachData.defaultBests),
            measures: extras?.measures ?? CoachData.defaultMeasures,
            photos: isNew ? [] : CoachData.photoDates,
            checkInHistory: isNew ? CoachData.newClientCheckInHistory : (extras?.checkInHistory ?? CoachData.defaultCheckInHistory),
            notes: CoachData.defaultNotes
        )
    }
}

extension ClientDetailData {
    /// A live client's page before it has loaded: what the list row already knows.
    static func placeholder(for client: CoachClient) -> ClientDetailData {
        ClientDetailData(
            riskScore: nil, riskWhy: nil,
            stats: [
                KPI(value: client.adherence.map { "\($0)%" } ?? "—", label: CT.adherence, note: CT.last2Weeks, noteMuted: true),
                KPI(value: client.weight, label: CT.weight, note: client.weightChange, noteMuted: true),
                KPI(value: client.streak, label: Loc("Workouts", "Entrenamientos"), note: Loc("done so far", "hechos hasta hoy"), noteMuted: true)
            ],
            weightTotal: client.weightTotal, spark: client.spark,
            habits: [], activity: [], next: client.next, billing: client.billing, lifetimeValue: "—",
            programName: client.programName, weekRows: [],
            foodLogged: "", macros: [], foodNote: client.nutritionNote, nutritionPlan: nil,
            bests: [], measures: [], photos: [], checkInHistory: [], notes: []
        )
    }
}
