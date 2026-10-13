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

    /// The same food at a different portion ("2 × 1 cup").
    func scaled(_ multiplier: Double) -> FoodItem {
        let quantityText: Loc = multiplier == 1
            ? quantity
            : Loc("\(Fmt.trimmed(multiplier)) × \(quantity.en)", "\(Fmt.trimmed(multiplier)) × \(quantity.es)")
        return FoodItem(name: name, quantity: quantityText, kcal: kcal * multiplier, protein: protein * multiplier,
                        carbs: carbs * multiplier, fat: fat * multiplier, source: source)
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
