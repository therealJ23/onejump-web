import Foundation

// What the server sends the coach app (GET /api/mobile/coach and friends), and how it becomes
// the same models the screens already use. Every label arrives in English and Spanish.

struct LocDTO: Decodable, Hashable {
    let en: String
    let es: String
    var loc: Loc { Loc(en, es) }
}

private func tone(_ s: String?) -> Tone {
    switch s {
    case "crit": return .crit
    case "warn": return .warn
    case "good": return .good
    case "info": return .info
    case "ai": return .ai
    default: return .muted
    }
}

// MARK: - The snapshot

struct LiveCoachDTO: Decodable {
    struct Me: Decodable {
        let name: String; let first: String; let initials: String; let email: String; let business: String
        let bookingUrl: String; let planLabel: LocDTO; let trialDaysLeft: Int?; let pro: Bool; let totpEnabled: Bool
    }
    struct Queue: Decodable { let id: String; let clientId: String; let reason: LocDTO; let tag: LocDTO; let tone: String; let draft: String }
    struct SessionDTO: Decodable { let clientId: String; let name: String; let time: LocDTO; let type: LocDTO; let icon: String }
    struct KPIDTO: Decodable { let value: String; let label: LocDTO; let note: LocDTO; let target: String? }
    struct Radar: Decodable { let clientId: String; let score: Int; let why: LocDTO }
    struct Today: Decodable {
        let savedLabel: String; let queue: [Queue]; let sessions: [SessionDTO]; let kpis: [KPIDTO]; let radar: [Radar]
    }
    struct Charts: Decodable {
        struct Rev: Decodable { let label: LocDTO; let cents: Int; let current: Bool? }
        struct Adh: Decodable { let label: LocDTO; let pct: Int? }
        struct Pkg: Decodable { let name: String; let cents: Int; let clients: Int }
        struct Cnt: Decodable { let label: LocDTO; let count: Int }
        let revenue: [Rev]; let adherence: [Adh]; let packages: [Pkg]; let activeClients: [Cnt]
    }
    struct Client: Decodable {
        let id: String; let name: String; let first: String; let initials: String; let avatar: UInt32
        let programId: String; let programName: String; let week: Int; let weeks: Int
        let kind: String; let tone: String; let adherence: Int?; let trainedThisWeek: Bool
        let programLabel: LocDTO; let goal: LocDTO; let package: LocDTO; let since: LocDTO
        let weight: String; let weightChange: LocDTO; let weightTotal: LocDTO; let streak: String; let spark: [Double]
        let insight: LocDTO; let suggest: LocDTO; let suggestTarget: String?; let next: LocDTO; let billing: LocDTO; let nutritionNote: LocDTO
        let noLogs: Bool; let lowProtein: Bool; let filters: [String]; let unread: Int; let checkInId: String?
    }
    struct Thread: Decodable {
        struct Last: Decodable { let fromMe: Bool; let text: String; let time: LocDTO; let isVoice: Bool }
        let id: String; let unread: Bool; let last: Last?
    }
    struct CheckIns: Decodable {
        struct Reviewed: Decodable { let clientId: String; let name: String; let when: LocDTO }
        struct Missing: Decodable { let clientId: String; let why: LocDTO }
        let toReview: [CheckInDTO]; let reviewed: [Reviewed]; let missing: [Missing]
    }
    struct Leads: Decodable {
        struct Stats: Decodable { let open: Int; let pipeline: String; let followUps: Int }
        struct Item: Decodable { let id: String; let name: String; let initials: String; let avatar: UInt32; let source: LocDTO; let when: LocDTO; let interest: LocDTO; let stage: String; let draft: String }
        let stats: Stats; let items: [Item]
    }
    struct Payments: Decodable {
        struct Attention: Decodable { let id: String; let clientId: String; let name: String; let initials: String; let avatar: UInt32; let sub: LocDTO; let reminded: Bool }
        struct Pkg: Decodable { let name: String; let meta: LocDTO; let total: String; let value: Int }
        struct Recent: Decodable { let clientId: String; let name: String; let initials: String; let avatar: UInt32; let when: LocDTO; let amount: String }
        let mrr: String; let mrrNote: LocDTO; let collected: String; let outstanding: String; let avg: String; let failedCount: Int; let onTime: String
        let attention: [Attention]; let reminderDraft: String; let packages: [Pkg]; let recent: [Recent]
    }
    struct Program: Decodable { let id: String; let name: String; let meta: LocDTO; let tag: LocDTO; let tone: String; let kind: String; let clients: Int }
    struct Nutrition: Decodable {
        struct Stat: Decodable { let value: String; let label: LocDTO }
        struct Row: Decodable { let clientId: String; let percent: Int; let label: LocDTO }
        struct Plan: Decodable { let id: String; let name: String; let meta: LocDTO }
        let stats: [Stat]; let summary: LocDTO; let rows: [Row]; let mealPlans: [Plan]
    }
    struct Automations: Decodable {
        struct Item: Decodable { let id: String; let name: LocDTO; let detail: LocDTO; let enabled: Bool }
        struct Run: Decodable { let date: LocDTO; let text: LocDTO }
        let items: [Item]; let runs: [Run]
    }
    struct Assist: Decodable { let requests: String; let approvedAsIs: String; let timeSaved: String }
    struct Exercise: Decodable { let id: String; let name: LocDTO; let group: String; let equipment: LocDTO; let howTo: [LocDTO]; let alternatives: [LocDTO]; var custom: Bool?; var mediaType: String? }

    let me: Me
    let today: Today
    let charts: Charts
    let clients: [Client]
    let threads: [Thread]
    let checkIns: CheckIns
    let leads: Leads
    let payments: Payments
    let programs: [Program]
    let nutrition: Nutrition
    let automations: Automations
    let assist: Assist
    let library: [Exercise]
}

struct CheckInDTO: Decodable {
    struct Answer: Decodable { let question: LocDTO; let answer: LocDTO }
    struct Action: Decodable { let id: String; let title: LocDTO; let detail: LocDTO; let button: LocDTO; let done: Bool }
    let id: String; let clientId: String; let name: String; let week: LocDTO; let when: LocDTO; let flag: LocDTO?
    let answers: [Answer]; let note: LocDTO; let summary: LocDTO?; let draft: String?; let insightId: String?
    let food: LocDTO; let actions: [Action]

    var report: CheckInReport {
        CheckInReport(
            week: week.loc, when: when.loc, flag: flag?.loc,
            answers: answers.map { CheckInAnswer(question: $0.question.loc, answer: $0.answer.loc) },
            note: note.loc, summary: summary?.loc ?? "", draft: Loc(same: draft ?? ""), food: food.loc,
            actions: actions.map { CheckInAction(id: $0.id, title: $0.title.loc, detail: $0.detail.loc, button: $0.button.loc, done: $0.done) },
            id: id, clientID: clientId, insightID: insightId, hasAssist: summary != nil && insightId != nil
        )
    }
}

extension CoachSnapshot {
    /// The coach's real business, from the server.
    init(live d: LiveCoachDTO, keepingSuggestions suggestions: [Loc]) {
        let k = d.today.kpis
        me = CoachMe(name: d.me.name, first: d.me.first, initials: d.me.initials, email: d.me.email, business: d.me.business,
                     bookingURL: d.me.bookingUrl, planLabel: d.me.planLabel.loc, trialDaysLeft: d.me.trialDaysLeft, pro: d.me.pro, totpEnabled: d.me.totpEnabled)
        minutesSavedLabel = d.today.savedLabel
        savedSub = Loc("this week · approved drafts and automations", "esta semana · borradores aprobados y automatizaciones")
        queue = d.today.queue.map {
            QueueItem(id: $0.id, reason: $0.reason.loc, tag: $0.tag.loc, tone: tone($0.tone), draft: Loc(same: $0.draft), clientID: $0.clientId, insightID: $0.id)
        }
        sessions = d.today.sessions.map {
            Session(time: $0.time.loc, name: $0.name, type: $0.type.loc, systemImage: $0.icon, clientID: $0.clientId)
        }
        sessionsNote = Loc(d.today.sessions.isEmpty ? "None today" : "\(d.today.sessions.count) scheduled", d.today.sessions.isEmpty ? "Ninguno hoy" : "\(d.today.sessions.count) programados")
        briefing = []
        kpis = k.map { KPI(value: $0.value, label: $0.label.loc, note: $0.note.loc, target: $0.target) }
        radar = d.today.radar.map { RadarEntry(clientID: $0.clientId, score: $0.score, why: $0.why.loc) }

        revenue = d.charts.revenue.enumerated().map { RevenuePoint(id: $0.offset, month: $0.element.label.loc, value: Int(($0.element.cents + 50) / 100)) }
        adherence = d.charts.adherence.enumerated().map { AdherencePoint(id: $0.offset, label: $0.element.label.loc, pct: $0.element.pct) }
        // Every active package with its monthly value (the chart shows the ones that earn money).
        packages = d.payments.packages.map {
            Package(name: Loc(same: $0.name), meta: $0.meta.loc, total: $0.total, value: ($0.value + 50) / 100)
        }
        activeClientsSeries = d.charts.activeClients.enumerated().map { CountPoint(id: $0.offset, label: $0.element.label.loc, count: $0.element.count) }

        clients = d.clients.map { c in
            CoachClient(
                id: c.id, name: c.name, first: c.first, initials: c.initials, avatar: c.avatar,
                programID: c.programId, week: c.week, weeks: c.weeks, kind: ClientKind(rawValue: c.kind) ?? .ok, tone: tone(c.tone),
                adherence: c.adherence, trainedThisWeek: c.trainedThisWeek, programLabel: c.programLabel.loc,
                goal: c.goal.loc, package: c.package.loc, since: c.since.loc, weight: c.weight,
                weightChange: c.weightChange.loc, weightTotal: c.weightTotal.loc, streak: c.streak, spark: c.spark,
                insight: c.insight.loc, suggest: c.suggest.loc, next: c.next.loc, billing: c.billing.loc, nutritionNote: c.nutritionNote.loc,
                noLogs: c.noLogs, lowProtein: c.lowProtein, filters: Set(c.filters.compactMap(ClientFilter.init(rawValue:))),
                programName: c.programName.isEmpty ? nil : Loc(same: c.programName), unread: c.unread, checkInID: c.checkInId, suggestTarget: c.suggestTarget
            )
        }
        extras = [:]
        lifetimeValue = [:]
        payingCount = nil

        threadOrder = d.threads.map(\.id)
        threads = Dictionary(uniqueKeysWithValues: d.threads.map { t in
            let last = t.last.map { ThreadMessage(fromMe: $0.fromMe, text: Loc(same: $0.text), time: $0.time.loc, isVoice: $0.isVoice) }
            return (t.id, CoachThread(id: t.id, unread: t.unread, messages: last.map { [$0] } ?? []))
        })
        leadPeople = [:]
        checkInOrder = d.checkIns.toReview.map(\.id)
        checkIns = Dictionary(uniqueKeysWithValues: d.checkIns.toReview.map { ($0.id, $0.report) })
        let clientsByID = Dictionary(uniqueKeysWithValues: d.clients.map { ($0.id, $0) })
        reviewedCheckIns = d.checkIns.reviewed.map {
            ReviewedCheckIn(clientID: $0.clientId, name: $0.name, initials: clientsByID[$0.clientId]?.initials ?? "?", avatar: clientsByID[$0.clientId]?.avatar ?? 0xC6D6E6, when: $0.when.loc)
        }
        missingCheckIns = d.checkIns.missing.map { MissingCheckIn(clientID: $0.clientId, why: $0.why.loc) }

        leads = d.leads.items.map {
            Lead(id: $0.id, name: $0.name, initials: $0.initials, avatar: $0.avatar, source: $0.source.loc, when: $0.when.loc,
                 interest: $0.interest.loc, draft: Loc(same: $0.draft), stage: $0.stage == "booked" ? .booked : $0.stage == "replied" ? .replied : .new)
        }
        leadStats = ("\(d.leads.stats.open)", d.leads.stats.pipeline, "\(d.leads.stats.followUps)")
        let p = d.payments
        payments = PaymentSummary(
            mrr: p.mrr, mrrNote: p.mrrNote.loc, collected: p.collected, outstanding: p.outstanding, avg: p.avg, failedCount: p.failedCount, onTime: p.onTime,
            attention: p.attention.map { PaymentAttention(id: $0.id, clientID: $0.clientId, name: $0.name, initials: $0.initials, avatar: $0.avatar, sub: $0.sub.loc, reminded: $0.reminded) },
            reminderDraft: Loc(same: p.reminderDraft)
        )
        recentPayments = p.recent.map { Payment(clientID: $0.clientId, name: $0.name, initials: $0.initials, avatar: $0.avatar, when: $0.when.loc, amount: $0.amount) }

        programs = d.programs.map {
            ProgramSummary(id: $0.id, meta: $0.meta.loc, tag: $0.tag.loc, tone: tone($0.tone),
                           kind: $0.kind == "assistDraft" ? .assistDraft : $0.kind == "active" ? .active : .template, name: Loc(same: $0.name))
        }
        library = d.library.map {
            LibraryExercise(id: $0.id, name: $0.name.loc, group: MuscleGroup(rawValue: $0.group) ?? .core, equipment: $0.equipment.loc,
                            howTo: $0.howTo.map(\.loc), alternatives: $0.alternatives.map(\.loc), custom: $0.custom ?? false, mediaType: $0.mediaType)
        }
        nutritionStats = d.nutrition.stats.map { KPI(value: $0.value, label: $0.label.loc, note: "") }
        nutritionSummary = d.nutrition.summary.loc
        nutrition = d.nutrition.rows.map { NutritionRow(clientID: $0.clientId, percent: $0.percent, label: $0.label.loc) }
        howClientsLog = []
        habitShares = []
        mealPlans = d.nutrition.mealPlans.map { MealPlanTemplate(id: $0.id, name: Loc(same: $0.name), shortName: Loc(same: $0.name), meta: $0.meta.loc) }
        automations = d.automations.items.map { ToggleSetting(id: $0.id, name: $0.name.loc, detail: $0.detail.loc) }
        automationOn = Dictionary(uniqueKeysWithValues: d.automations.items.map { ($0.id, $0.enabled) })
        automationRuns = d.automations.runs.map { DatedLine(date: $0.date.loc, text: $0.text.loc) }
        assistUsage = (d.assist.requests, d.assist.approvedAsIs, d.assist.timeSaved)
        self.suggestions = suggestions
    }
}

// MARK: - One client's page

struct LiveClientDetailDTO: Decodable {
    struct Stat: Decodable { let value: String; let label: LocDTO; let note: LocDTO }
    struct Habit: Decodable { let title: LocDTO; let value: LocDTO; let on: Bool }
    struct Dated: Decodable { let date: LocDTO; let text: LocDTO }
    struct Row: Decodable { let day: LocDTO; let name: LocDTO; let meta: LocDTO; let label: LocDTO; let tone: String }
    struct Program: Decodable { let name: String?; let rows: [Row] }
    struct Macro: Decodable { let label: LocDTO; let now: Int; let target: Int; let unit: String; let warn: Bool }
    struct Plan: Decodable { let approach: String?; let calories: Int?; let proteinG: Int?; let carbsG: Int?; let fatG: Int?; let coachNote: String?; let saved: Bool }
    struct Food: Decodable { let logged: LocDTO; let macros: [Macro]; let note: LocDTO; let plan: Plan; let lowProtein: Bool }
    struct Best: Decodable { let name: LocDTO; let value: String; let date: LocDTO }
    struct Measure: Decodable { let name: LocDTO; let value: String; let change: LocDTO }
    struct History: Decodable { let week: LocDTO; let date: LocDTO; let label: LocDTO; let tone: String }

    let riskScore: Int?
    let riskWhy: LocDTO?
    let stats: [Stat]
    let weightTotal: LocDTO
    let spark: [Double]
    let habits: [Habit]
    let activity: [Dated]
    let next: LocDTO
    let billing: LocDTO
    let lifetimeValue: String
    let program: Program
    let food: Food
    let bests: [Best]
    let measures: [Measure]
    let photos: [LocDTO]
    let checkInHistory: [History]
    let notes: [Dated]

    var detail: ClientDetailData {
        ClientDetailData(
            riskScore: riskScore, riskWhy: riskWhy?.loc,
            stats: stats.map { KPI(value: $0.value, label: $0.label.loc, note: $0.note.loc, noteMuted: true) },
            weightTotal: weightTotal.loc, spark: spark,
            habits: habits.map { HabitStat(title: $0.title.loc, value: $0.value.loc, on: $0.on) },
            activity: activity.map { DatedLine(date: $0.date.loc, text: $0.text.loc) },
            next: next.loc, billing: billing.loc, lifetimeValue: lifetimeValue,
            programName: program.name.map { Loc(same: $0) },
            weekRows: program.rows.map { WeekRow(day: $0.day.loc, name: $0.name.loc, meta: $0.meta.loc, label: $0.label.loc, tone: tone($0.tone)) },
            foodLogged: food.logged.loc,
            macros: food.macros.map { MacroLine(label: $0.label.loc, now: $0.now, target: $0.target, unit: $0.unit, warn: $0.warn) },
            foodNote: food.note.loc,
            nutritionPlan: NutritionPlanInfo(approach: food.plan.approach, calories: food.plan.calories, proteinG: food.plan.proteinG, carbsG: food.plan.carbsG, fatG: food.plan.fatG, coachNote: food.plan.coachNote, saved: food.plan.saved),
            bests: bests.map { PersonalBest(name: $0.name.loc, value: $0.value, date: $0.date.loc) },
            measures: measures.map { BodyMeasure(name: $0.name.loc, value: $0.value, change: $0.change.loc) },
            photos: photos.map(\.loc),
            checkInHistory: checkInHistory.map { CheckInHistoryRow(week: $0.week.loc, date: $0.date.loc, label: $0.label.loc, tone: tone($0.tone)) },
            notes: notes.map { ClientNote(date: $0.date.loc, text: $0.text.loc) }
        )
    }
}

/// One conversation.
struct LiveThreadDTO: Decodable {
    struct Message: Decodable {
        let id: String; let fromMe: Bool; let text: String; let time: LocDTO; let isVoice: Bool
        var durationS: Int?; var summary: String?; var flag: String?
    }
    let id: String
    let messages: [Message]

    var messagesForApp: [ThreadMessage] {
        messages.map { m in
            var t = ThreadMessage(fromMe: m.fromMe, text: Loc(same: m.text), time: m.time.loc, isVoice: m.isVoice)
            t.serverID = m.id
            t.seconds = m.durationS
            t.summary = m.summary
            t.flag = m.flag
            return t
        }
    }
}
