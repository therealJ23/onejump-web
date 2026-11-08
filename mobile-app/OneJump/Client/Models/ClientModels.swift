import Foundation

// Data types for the client app.

// MARK: - Workouts

struct WorkoutExercise {
    let name: Loc
    let target: Loc
    /// Rest between sets, in seconds.
    let rest: Int
    let cue: Loc
    let sets: Int
    let weight: Double
    let reps: Int
    var isTimed = false
    let last: Loc
    let swaps: [Loc]
    /// The server's exercise id (live accounts), sent back when the workout is saved.
    var serverID: String? = nil
    /// Each set's own target (live accounts; the coach can set different weights per set).
    var setTargets: [SetEntry]? = nil
}

struct SetEntry: Equatable {
    var weight: Double
    var reps: Int
    var done = false
}

// MARK: - Food

enum Meal: String, CaseIterable, Hashable {
    case breakfast, lunch, snacks, dinner

    var name: Loc {
        switch self {
        case .breakfast: return Loc("Breakfast", "Desayuno")
        case .lunch: return Loc("Lunch", "Almuerzo")
        case .snacks: return Loc("Snacks", "Meriendas")
        case .dinner: return Loc("Dinner", "Cena")
        }
    }
}

struct FoodItem: Identifiable {
    let id = UUID()
    let name: Loc
    let quantity: Loc
    let kcal: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    var source: Loc?
    /// Live accounts: grams and the food database reference, so the server can check the numbers.
    var grams: Double? = nil
    var foodRef: String? = nil
    var confidence: String? = nil
    /// Live accounts: the saved entry (or favorite) this row stands for.
    var entryID: String? = nil

    /// The same food at a different portion ("2 × 1 cup").
    func scaled(_ multiplier: Double) -> FoodItem {
        let quantityText: Loc = multiplier == 1
            ? quantity
            : Loc("\(Fmt.trimmed(multiplier)) × \(quantity.en)", "\(Fmt.trimmed(multiplier)) × \(quantity.es)")
        return FoodItem(name: name, quantity: quantityText, kcal: kcal * multiplier, protein: protein * multiplier,
                        carbs: carbs * multiplier, fat: fat * multiplier, source: source,
                        grams: grams.map { $0 * multiplier }, foodRef: foodRef, confidence: confidence, entryID: entryID)
    }
}

/// A food waiting for the client to check it before it's saved.
struct ReviewItem: Identifiable {
    let id = UUID()
    let food: FoodItem
    var multiplier: Double = 1
}

enum FoodDay: Hashable { case yesterday, today }

enum LogMode: Hashable { case photo, voice, barcode, search }

enum LogStage: Hashable { case photo, voice, barcode, search, reading, review }

struct Macros {
    var count = 0
    var kcal: Double = 0
    var protein: Double = 0
    var carbs: Double = 0
    var fat: Double = 0

    static func total(_ foods: [FoodItem]) -> Macros {
        foods.reduce(into: Macros()) { m, f in
            m.count += 1
            m.kcal += f.kcal
            m.protein += f.protein
            m.carbs += f.carbs
            m.fat += f.fat
        }
    }
}

// MARK: - Habits, progress

struct Habit: Identifiable {
    let id: String
    let title: Loc
    var detail: Loc?
}

enum WeightRange: String, CaseIterable, Hashable {
    case oneMonth = "1M", threeMonths = "3M", all = "All"
}

struct WeightSeries {
    /// Weight readings (lb), oldest first.
    let values: [Double]
    let start: Loc
}

struct ClientRecord: Identifiable {
    let id = UUID()
    let name: Loc
    let value: String
    let date: Loc
    var isNew = false
}

// MARK: - Coach chat

struct ChatMessage: Identifiable {
    let id = UUID()
    var fromMe: Bool
    var text: Loc
    /// The coach's original English, shown when the app is in another language.
    var original: String?
    var time: Loc
    var isVoice = false
    var duration: String?
    /// A voice message recorded on this phone (playable).
    var audioURL: URL?
    var seconds: Int?
    /// Live accounts: the message's id on the server (to play its audio).
    var serverID: String? = nil
}

// MARK: - Live account

/// Someone shown in the client app: the client themself or their coach.
struct ClientPerson: Equatable {
    var name: String
    var first: String
    var initials: String
    var photoURL: String?

    static let demoCoach = ClientPerson(name: "Alex Rivera", first: "Alex", initials: "AR", photoURL: nil)
    static let demoMe = ClientPerson(name: "Maya Chen", first: "Maya", initials: "MC", photoURL: nil)

    init(name: String, first: String? = nil, initials: String? = nil, photoURL: String? = nil) {
        self.name = name
        self.first = first ?? (name.split(separator: " ").first.map(String.init) ?? name)
        self.initials = initials ?? ClientPerson.initials(of: name)
        self.photoURL = photoURL
    }

    static func initials(of name: String) -> String {
        let parts = name.split(separator: " ").prefix(2).compactMap { $0.first.map(String.init) }
        return parts.isEmpty ? "?" : parts.joined().uppercased()
    }
}

/// Daily calorie and macro targets (nil when the coach coaches habits or hides numbers).
struct MacroTargets: Equatable {
    var kcal: Double
    var protein: Double
    var carbs: Double
    var fat: Double

    static let demo = MacroTargets(kcal: ClientData.kcalTarget, protein: ClientData.proteinTarget, carbs: ClientData.carbsTarget, fat: ClientData.fatTarget)
}

/// A private progress photo on the server.
struct ProgressPhotoItem: Identifiable, Equatable {
    let id: String
    let url: String
    let date: Loc
}

// MARK: - Check-in, booking, settings

struct CheckInScale: Identifiable {
    let id: String
    let label: Loc
    let options: [Loc]
}

struct SlotRef: Hashable {
    let day: Int
    let time: Int
}

enum Units: String, Hashable { case pounds, kilograms }
