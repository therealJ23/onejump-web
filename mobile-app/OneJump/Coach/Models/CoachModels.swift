import SwiftUI

// Data types for the coach app. Text that changes with the language is `Loc`.
// When the app connects to the OneJump server, these are what the API responses map to.

// MARK: - Clients

enum ClientKind: String {
    case risk, checkin, overdue, ok, new, paused, invited

    var label: Loc {
        switch self {
        case .risk: return Loc("At risk", "En riesgo")
        case .checkin: return Loc("Check-in", "Revisión")
        case .overdue: return Loc("Overdue", "Atrasado")
        case .ok: return Loc("On track", "Al día")
        case .new: return Loc("New", "Nuevo")
        case .paused: return Loc("Paused", "En pausa")
        case .invited: return Loc("Invited", "Invitado")
        }
    }

    var isNew: Bool { self == .new || self == .invited }
}

enum ClientFilter: String, CaseIterable, Hashable {
    case all, attention, new, paused
}

struct CoachClient: Identifiable {
    let id: String
    var name: String
    var first: String
    var initials: String
    var avatar: UInt32
    var programID: String
    var week: Int
    var weeks: Int
    var kind: ClientKind
    var tone: Tone
    var adherence: Int?
    var trainedThisWeek: Bool
    var programLabel: Loc?
    var goal: Loc
    var package: Loc
    var since: Loc
    var weight: String
    var weightChange: Loc
    var weightTotal: Loc
    var streak: String
    /// Weight trend for the sparkline (bigger number = lower on the chart).
    var spark: [Double]
    var insight: Loc
    var suggest: Loc
    var next: Loc
    var billing: Loc
    var nutritionNote: Loc
    var noLogs = false
    var lowProtein = false
    var filters: Set<ClientFilter> = []

    var avatarColor: Color { Color(hex: avatar) }
}

/// Extra detail for some clients (anyone without it uses the defaults).
struct ClientExtras {
    var riskScore: Int?
    var riskWhy: Loc?
    var habits: [HabitStat]?
    var activity: [DatedLine]?
    var bests: [PersonalBest]?
    var measures: [BodyMeasure]?
    var checkInHistory: [CheckInHistoryRow]?
}

struct HabitStat: Identifiable {
    let id = UUID()
    let title: Loc
    let value: Loc
    let on: Bool
}

struct DatedLine: Identifiable {
    let id = UUID()
    let date: Loc
    let text: Loc
}

struct PersonalBest: Identifiable {
    let id = UUID()
    let name: Loc
    let value: String
    let date: Loc
}

struct BodyMeasure: Identifiable {
    let id = UUID()
    let name: Loc
    let value: String
    let change: Loc
}

struct CheckInHistoryRow: Identifiable {
    let id = UUID()
    let week: Loc
    let date: Loc
    let label: Loc
    let tone: Tone
}

struct RadarEntry: Identifiable {
    var id: String { clientID }
    let clientID: String
    let score: Int
    let why: Loc
}

// MARK: - Needs-you queue

/// A message Assist drafted that is waiting for the coach.
struct QueueItem: Identifiable {
    let id: String // the client's id
    let reason: Loc
    let tag: Loc
    let tone: Tone
    let draft: Loc
}

enum QueueState {
    case pending, editing, sent, skipped

    var isWaiting: Bool { self == .pending || self == .editing }
}

struct Session: Identifiable {
    let id = UUID()
    let time: Loc
    let name: String
    let type: Loc
    let systemImage: String
}

// MARK: - Messages

struct ThreadMessage: Identifiable {
    let id = UUID()
    var fromMe: Bool
    var text: Loc
    /// The original text when the person wrote in another language.
    var original: String?
    var time: Loc
    var isVoice = false
    /// Outgoing message that was sent in the client's language.
    var sentInTheirLanguage = false
    /// What the client actually received (translated).
    var outgoingTranslation: String?
}

struct CoachThread {
    let id: String
    var unread: Bool
    var isLead = false
    var isForeign = false
    var languageName: Loc?
    var languageCode: String?
    var messages: [ThreadMessage]
    var suggestion: Loc?
    var suggestionOut: String?
    /// Reply that arrives a moment after the coach answers (for the preview).
    var autoReply: ThreadMessage?
}

struct LeadPerson {
    let name: String
    let initials: String
    let avatar: UInt32
    let sub: Loc
}

// MARK: - Check-ins

struct CheckInAnswer: Identifiable {
    let id = UUID()
    let question: Loc
    let answer: Loc
}

struct CheckInAction: Identifiable {
    let id: String
    let title: Loc
    let detail: Loc
    let button: Loc
}

struct CheckInReport {
    let week: Loc
    let when: Loc
    var flag: Loc?
    let answers: [CheckInAnswer]
    let note: Loc
    let summary: Loc
    let draft: Loc
    let food: Loc
    let actions: [CheckInAction]
}

enum CheckInState { case open, sent }

struct ReviewedCheckIn: Identifiable {
    let id = UUID()
    let name: String
    let initials: String
    let avatar: UInt32
    let when: Loc
}

struct MissingCheckIn: Identifiable {
    var id: String { clientID }
    let clientID: String
    let why: Loc
}

// MARK: - Leads

struct Lead: Identifiable {
    let id: String
    let name: String
    let initials: String
    let avatar: UInt32
    let source: Loc
    let when: Loc
    let interest: Loc
    let draft: Loc
}

enum LeadStage { case new, replied, booked }

// MARK: - Programs and exercises

enum ProgramKind { case assistDraft, active, template }

struct ProgramSummary: Identifiable {
    let id: String
    let meta: Loc
    let tag: Loc
    let tone: Tone
    let kind: ProgramKind
}

struct BuilderExercise: Identifiable {
    let id = UUID()
    let name: Loc
    let reps: Loc
    let rest: Loc
    let sets: Int
}

struct ProgramWorkout: Identifiable {
    let id = UUID()
    let name: Loc
    let meta: Loc
}

enum MuscleGroup: String, CaseIterable, Hashable {
    case all, legs, push, pull, core

    var label: Loc {
        switch self {
        case .all: return Loc("All", "Todos")
        case .legs: return Loc("Legs", "Piernas")
        case .push: return Loc("Push", "Empuje")
        case .pull: return Loc("Pull", "Jalón")
        case .core: return Loc("Core", "Core")
        }
    }
}

struct LibraryExercise: Identifiable {
    let id: String
    let name: Loc
    let group: MuscleGroup
    let equipment: Loc
}

// MARK: - Nutrition, automations, settings

struct NutritionRow: Identifiable {
    var id: String { clientID }
    let clientID: String
    let percent: Int
    let label: Loc
}

struct ShareRow: Identifiable {
    let id = UUID()
    let title: Loc
    let percent: Int
}

struct MealPlanTemplate: Identifiable {
    let id = UUID()
    let name: Loc
    let shortName: Loc
    let meta: Loc
}

struct ToggleSetting: Identifiable {
    let id: String
    let name: Loc
    let detail: Loc
}

enum AssistTone: String, CaseIterable { case friendly, direct, hype }

// MARK: - Business

struct Package: Identifiable {
    let id = UUID()
    let name: Loc
    let meta: Loc
    let total: String
    let value: Int
}

struct Payment: Identifiable {
    let id = UUID()
    let name: String
    let initials: String
    let avatar: UInt32
    let when: Loc
    let amount: String
}

struct RevenuePoint: Identifiable {
    let id: Int
    let month: Loc
    let value: Int
}

struct PlanOption: Identifiable {
    let id: String
    let name: String
    let price: String
    let saves: Loc
    let meta: Loc
}

struct ClientNote: Identifiable {
    let id = UUID()
    let date: Loc
    let text: Loc
}

// MARK: - Assist conversation

struct AssistPoint: Identifiable {
    let id = UUID()
    let bold: Loc
    let text: Loc
}

struct AssistTableRow: Identifiable {
    let id = UUID()
    let week: Loc
    let sets: Loc
    let intensity: Loc
}

enum ActionKind { case queue, lead, post, program, client, queueItem }

struct ActionCardTemplate {
    let kind: ActionKind
    let label: Loc
    let sub: Loc
    let button: Loc
    let doneText: Loc
    let ask: Loc
    let doneSay: Loc
}

/// A canned Assist answer (the real app gets these from the AI service on the server).
struct AssistTemplate {
    let text: Loc
    var points: [AssistPoint] = []
    var table: [AssistTableRow] = []
    var quote: Loc?
    var foot: Loc?
    let say: Loc
    var card: ActionCardTemplate?
}

/// One action Assist offers inside an answer ("Approve & send", "Add as draft").
struct ActionCard {
    var kind: ActionKind
    var queueID: String?
    var label: String
    var sub: String
    var button: String
    var doneText: String
    var ask: String
    var doneSay: String
    var noSay: String
    var done = false
    var dismissed = false

    var isOpen: Bool { !done && !dismissed }
}

/// A line in the Assist chat, already in the current language.
struct AssistMessage: Identifiable {
    let id = UUID()
    var fromMe: Bool
    var text: String
    var points: [(bold: String, text: String)] = []
    var table: [(week: String, sets: String, intensity: String)] = []
    var quote: String?
    var foot: String?
    var say: String?
    var card: ActionCard?
}
