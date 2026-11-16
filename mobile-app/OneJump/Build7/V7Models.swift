import SwiftUI

// Build 7 data from the server: chat media and reactions, the calendar, the week planner, the
// approve-all queue, time saved, recipes and the live-speech token. Dates come as ISO strings.

/// Short name for the API client's error.
typealias APIError = APIClient.APIError

enum ISO {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()
    static func date(_ s: String?) -> Date? {
        guard let s else { return nil }
        return withFraction.date(from: s) ?? plain.date(from: s)
    }
    static func string(_ d: Date) -> String { withFraction.string(from: d) }
    /// "2026-11-17" in the phone's calendar.
    static func ymd(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
    static func fromYMD(_ s: String) -> Date? {
        let p = s.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
    }
}

// MARK: - Chat

struct ChatAttachment: Decodable, Hashable {
    let kind: String          // image | video | gif
    let url: String?
    var previewUrl: String?
    var width: Int?
    var height: Int?
    var durationS: Int?
    var title: String?
    var aspect: CGFloat {
        guard let w = width, let h = height, w > 0, h > 0 else { return 4.0 / 3.0 }
        return max(0.5, min(2.2, CGFloat(w) / CGFloat(h)))
    }
}

struct ChatReaction: Decodable, Hashable {
    let emoji: String
    let count: Int
    let mine: Bool
}

enum Reactions {
    static let quick = ["👍", "❤️", "🔥", "💪", "😂", "🙌"]
    static let all = ["👍", "❤️", "🔥", "💪", "😂", "🙌", "👏", "😮", "😢", "🎉", "✅", "💯"]
}

struct GifItem: Decodable, Identifiable, Hashable {
    let id: String
    var title: String?
    let url: String
    var previewUrl: String?
    var width: Int?
    var height: Int?
}

struct GifResponse: Decodable {
    let available: Bool
    let items: [GifItem]
    var error: String?
}

struct SentMessageResponse: Decodable {
    struct M: Decodable { let id: String; var body: String?; var attachments: [ChatAttachment]?; var reactions: [ChatReaction]? }
    let message: M
}

struct ReactResponse: Decodable { let emoji: String? }

// MARK: - Calendar

struct CalEvent: Decodable, Identifiable, Hashable {
    struct Client: Decodable, Hashable { let id: String; let name: String; var photoUrl: String? }
    let id: String
    let type: String          // session | call | consult | block
    let title: String
    let startRaw: String
    let endRaw: String
    var location: String?
    var notes: String?
    var status: String?
    var client: Client?

    enum CodingKeys: String, CodingKey { case id, type, title, startRaw = "start", endRaw = "end", location, notes, status, client }
    var start: Date { ISO.date(startRaw) ?? Date() }
    var end: Date { ISO.date(endRaw) ?? Date() }
}

struct CalSlot: Decodable, Hashable {
    let start: String
    let end: String
}

struct CalRange: Decodable {
    let events: [CalEvent]
    let workoutsDue: [String: Int]
    let openSlots: [CalSlot]
}

struct CalEventResponse: Decodable { let event: CalEvent }

struct ClientMonth: Decodable {
    struct W: Decodable, Hashable { let assignmentId: String; let workoutId: String; let name: String; var estMinutes: Int?; var exercises: Int?; let state: String }
    struct S: Decodable, Hashable { let id: String; let type: String; let title: String; let start: String; let end: String; var location: String? }
    struct Day: Decodable { let workouts: [W]; let sessions: [S]; let checkin: Bool }
    let month: String
    let days: [String: Day]
    let today: String
    var canReschedule: Bool?
}

// MARK: - Week planner

struct PlanWeek: Decodable {
    struct P: Decodable { let id: String; let name: String; let weeks: Int; let daysPerWeek: Int }
    struct W: Decodable, Hashable { let id: String; let name: String; var week: Int?; let everyWeek: Bool; let exercises: Int; var estMinutes: Int?; var pattern: String?; var imageUrl: String? }
    struct D: Decodable, Identifiable { var id: Int { day }; let day: Int; let workout: W? }
    let program: P
    let week: Int
    let days: [D]
}

struct ScheduleResponse: Decodable { struct W: Decodable { let id: String; let day: Int? }; let workout: W; let everyWeek: Bool }
struct OKResponse: Decodable { var ok: Bool?; var created: Int? }

// MARK: - Approve-all queue and time saved

struct AssistQueueItem: Decodable, Identifiable, Hashable {
    struct C: Decodable, Hashable { let id: String; let name: String }
    let kind: String          // insight | proposal
    let id: String
    let type: String
    var client: C?
    let title: String
    let text: String
    let minutes: Int
    let needsReview: Bool
}

struct QueueResponse: Decodable { let items: [AssistQueueItem]; let count: Int; let batchable: Int }

struct QueueApproveResponse: Decodable {
    struct R: Decodable { let id: String; let ok: Bool; var error: String? }
    let results: [R]
    let ok: Int
    let failed: Int
}

struct TimeSavedResponse: Decodable {
    let weekMinutes: Int
    let weekLabel: String
    let monthMinutes: Int
    let monthLabel: String
}

// MARK: - Recipes

struct RecipeDTO: Decodable, Identifiable, Hashable {
    struct Macros: Decodable, Hashable { var calories: Double?; var proteinG: Double?; var carbsG: Double?; var fatG: Double? }
    struct Ing: Decodable, Hashable { let name: String; var grams: Double? }
    let id: String
    let name: String
    let servings: Int
    var minutes: Int?
    let tags: [String]
    let imageUrl: String
    let ingredients: [Ing]
    let steps: [String]
    var perServing: Macros?
}

struct RecipesResponse: Decodable {
    struct Suggestion: Decodable { let recipeId: String; let remainingProteinG: Int; let text: String }
    let recipes: [RecipeDTO]
    var suggestion: Suggestion?
    var hideNumbers: Bool?
}

// MARK: - Live speech (Deepgram Flux)

struct STTTokenResponse: Decodable {
    let available: Bool
    var token: String?
    var url: String?
    var queryString: String?
    var sampleRate: Int?
}
