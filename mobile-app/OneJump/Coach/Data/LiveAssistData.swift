import Foundation

// What the server sends for Ask Assist, the morning briefing and the nutrition plan builder.

/// GET /api/briefing/today
struct BriefingDTO: Decodable {
    struct Briefing: Decodable { let lines: [String]; let seconds: Int? }
    let briefing: Briefing
}

/// POST /api/assist/ask → Assist's answer, with anything it prepared for the coach to approve.
struct AskResponse: Decodable {
    struct Decided: Decodable { let id: String; let confirmed: Bool; let message: String?; var navigate: Navigate? }
    /// A screen Assist opened for the coach ("programs", or "client" with its id).
    struct Navigate: Decodable { let screen: String; var id: String? }
    var answerText: String?
    var answerHtml: String?
    var spokenText: String?
    var proposals: [ProposalDTO]?
    var followups: [String]?
    /// The proposal a spoken "yes" or "no" will answer next (nil when it needs a tap).
    var awaiting: String?
    /// Set when the question was a yes/no to a proposal: what happened.
    var decided: Decided?
    var action: String?
    /// Open this screen (the coach can keep talking).
    var navigate: Navigate?
    /// "voice" or "text": the coach asked to switch how they talk to Assist.
    var mode: String?
}

/// Something Assist prepared (a message, a reply, a note, a lead, reminders, a program, a nutrition plan).
struct ProposalDTO: Decodable {
    struct Payload: Decodable {
        var text: String?
        var clientId: String?
        var clientName: String?
        var name: String?
        var goal: String?
        var recipients: [String]?
        var template: String?
        var programName: String?
        var weeks: Int?
        var daysPerWeek: Int?
        var startDate: String?
        var voiceOk: Bool?
        var line: String?
        var notes: [String]?
        var scopeReminder: String?
        var draft: NutritionDraft?
        var checkinId: String?
        /// For everything else Assist can do (programs, exercises, clients…): the card's lines,
        /// its button, whether it deletes something, and what Assist says out loud.
        var lines: [String]?
        var button: String?
        var destructive: Bool?
        var say: String?
    }
    let id: String
    let type: String
    let summary: String
    let payload: Payload
}

/// A nutrition plan Assist drafted. The coach can change it before saving.
struct NutritionDraft: Codable, Equatable {
    struct Meal: Codable, Equatable { var meal: String; var items: [String] }
    struct Day: Codable, Equatable { var label: String; var meals: [Meal] }
    struct MealPlan: Codable, Equatable { var name: String; var days: [Day] }

    var summary: String
    var approach: String
    var calories: Int?
    var proteinG: Int?
    var carbsG: Int?
    var fatG: Int?
    var habits: [String]
    var mealPlan: MealPlan?
    var coachNote: String?
    var needsProfessional: Bool
    var professionalReason: String?

    /// The JSON body for POST /api/clients/:id/nutrition-plan/apply-draft.
    func body(habits chosen: [String], includeMealPlan: Bool, confirmLowTarget: Bool) -> [String: Any] {
        func orNull(_ v: Any?) -> Any { v ?? NSNull() }
        var b: [String: Any] = ["approach": approach, "habits": chosen, "confirmLowTarget": confirmLowTarget]
        b["calories"] = orNull(calories)
        b["proteinG"] = orNull(proteinG)
        b["carbsG"] = orNull(carbsG)
        b["fatG"] = orNull(fatG)
        b["coachNote"] = orNull(coachNote?.isEmpty == false ? coachNote : nil)
        if includeMealPlan, let mealPlan {
            b["mealPlan"] = [
                "name": mealPlan.name,
                "days": mealPlan.days.map { day in
                    ["label": day.label, "meals": day.meals.map { ["meal": $0.meal, "items": $0.items] as [String: Any] }] as [String: Any]
                }
            ] as [String: Any]
        } else {
            b["mealPlan"] = NSNull()
        }
        return b
    }
}

/// POST /api/clients/:id/nutrition-plan/assist
struct NutritionDraftResponse: Decodable {
    struct Estimate: Decodable { var rmr: Int?; var maintenance: Int?; var calories: Int?; var proteinG: Int?; var missing: [String]? }
    var draft: NutritionDraft
    var notes: [String]
    var scopeReminder: String?
    var estimate: Estimate?
}

/// POST /api/clients
struct NewClientResponse: Decodable {
    struct Client: Decodable { let id: String; let name: String }
    let client: Client
    let inviteLink: String?
    let emailed: Bool?
}
