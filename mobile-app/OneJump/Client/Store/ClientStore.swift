import SwiftUI

enum ClientTab: Hashable {
    case today, food, log, progress, coach
}

/// Screens pushed inside a client tab.
enum ClientRoute: Hashable {
    case checkIn, book, me
}

/// What the app is listening for right now.
enum ClientListenMode { case set, food, note, voiceNote }

/// All state and actions for the client app.
@Observable
final class ClientStore {
    let settings: AppSettings
    let toast = ToastCenter()

    var voice: VoiceService { settings.voice }
    var lang: AppLanguage { settings.language }

    // MARK: Navigation
    var tab: ClientTab = .today
    var todayPath: [ClientRoute] = []
    var foodPath: [ClientRoute] = []
    var progressPath: [ClientRoute] = []
    var coachPath: [ClientRoute] = []
    var showQuickLog = false
    var showWorkout = false
    var showFoodLogger = false
    var showWeightSheet = false
    var showMeasureSheet = false
    var showFinishSheet = false

    // MARK: Habits and water
    var habits: [String: Bool] = ["steps": false, "water": false, "sleep": true, "protein": true]
    var water: Double = 1.25

    // MARK: Workout
    var sets: [[SetEntry]] = ClientData.workout.map { ex in
        Array(repeating: SetEntry(weight: ex.weight, reps: ex.reps), count: ex.sets)
    }
    var currentExercise = 0
    var workoutStarted = false
    var startDate: Date?
    var endDate: Date?
    var restEndsAt: Date?
    var workoutDone = false
    var swapped: [Int: Int] = [:]
    var effort = 7
    var soreness = 1
    @ObservationIgnored var restToken = 0

    // MARK: Listening
    var listenMode: ClientListenMode?

    // MARK: Food
    var foodDay: FoodDay = .today
    var addedFoods: [Meal: [FoodItem]] = [:]
    var logMode: LogMode = .photo
    var logStage: LogStage = .photo
    var review: [ReviewItem] = []
    var reviewMeal: Meal = .dinner
    var foodQuery = ""
    var heardFood = ""
    @ObservationIgnored var logToken = 0

    // MARK: Progress
    var weightRange: WeightRange = .threeMonths
    var weight: Double = 152.4
    var weightDraft: Double = 152.4
    var measures: [Double] = [29.5, 38.0, 35.5, 11.5]
    var measureDraft: [Double] = [29.5, 38.0, 35.5, 11.5]
    var newPhotos = 0

    // MARK: Coach chat
    var chatExtra: [ChatMessage] = []
    var chatInput = ""
    var readCoach = false
    var showOriginal: Set<UUID> = []

    // MARK: Check-in
    var checkInAnswers: [String: Int] = ["sleep": 3, "energy": 3, "stress": 1, "sore": 1]
    var nutritionAnswer = 0
    var checkInNote = ""
    var checkInSent = false
    var checkInPhotos: Set<String> = []

    // MARK: Booking and settings
    var booked = SlotRef(day: 0, time: 1)
    var pickedSlot: SlotRef?
    var reminders: [String: Bool] = ["workout": true, "meals": true, "checkin": true]
    var units: Units = .pounds

    init(settings: AppSettings) {
        self.settings = settings
        // Launch argument used for previews and screenshots: -ojOpen "food" or "workout"
        if let link = UserDefaults.standard.string(forKey: "ojOpen") {
            open(link: link)
        }
    }

    /// Opens a screen from a short link like "food", "workout", "log:voice" or "me".
    /// Ready for push notifications and universal links later.
    func open(link: String) {
        let parts = link.split(separator: ":", maxSplits: 1).map(String.init)
        let detail = parts.count > 1 ? parts[1] : ""
        switch parts.first ?? "" {
        case "today": go(.today)
        case "food": go(.food)
        case "progress": go(.progress)
        case "coach": go(.coach)
        case "me": go(.today); push(.me)
        case "book": go(.today); push(.book)
        case "checkIn": go(.today); push(.checkIn)
        case "quick": showQuickLog = true
        case "workout": startWorkout()
        case "log":
            let mode: LogMode
            switch detail {
            case "voice": mode = .voice
            case "barcode": mode = .barcode
            case "search": mode = .search
            default: mode = .photo
            }
            go(.food)
            openLogger(mode)
        default: break
        }
    }

    // MARK: - Navigation

    func go(_ tab: ClientTab) {
        stopListening()
        self.tab = tab
        switch tab {
        case .today: todayPath = []
        case .food: foodPath = []
        case .progress: progressPath = []
        case .coach:
            coachPath = []
            readCoach = true
        case .log: break
        }
    }

    func push(_ route: ClientRoute) {
        if route == .book { pickedSlot = nil }
        showQuickLog = false
        switch tab {
        case .today, .log: todayPath.append(route)
        case .food: foodPath.append(route)
        case .progress: progressPath.append(route)
        case .coach: coachPath.append(route)
        }
    }

    /// Opens the weekly check-in from anywhere.
    func openCheckIn() {
        showQuickLog = false
        if tab == .log { tab = .today }
        push(.checkIn)
    }

    // MARK: - Language

    func setLanguage(_ language: AppLanguage) {
        guard language.isFullySupported else {
            toast.show(SharedText.langSoon(lang))
            return
        }
        guard language != lang else { return }
        stopListening()
        voice.stopSpeaking()
        review = []
        settings.language = language
        after(0.05) { [weak self] in
            guard let self else { return }
            self.toast.show(SharedText.appLanguageToast(self.lang))
        }
    }

    // MARK: - Listening helpers

    func stopListening() {
        voice.stopListening()
        listenMode = nil
    }

    private func listen(_ mode: ClientListenMode, fallback: String, then done: @escaping (String) -> Void) {
        listenMode = mode
        voice.listen(fallback: fallback) { [weak self] text in
            self?.listenMode = nil
            done(text)
        }
    }

    // MARK: - Habits and water

    func toggleHabit(_ habit: Habit) {
        let on = !(habits[habit.id] ?? false)
        withAnimation(.snappy) { habits[habit.id] = on }
        if on {
            toast.show(CLT.habitDone(habit.title(lang))(lang))
        } else {
            Haptics.tick()
        }
    }

    func addWater() {
        let liters = min(3, water + 0.25)
        withAnimation(.snappy) {
            water = liters
            habits["water"] = liters >= 3
        }
        toast.show(CLT.waterToast(Fmt.trimmed(liters))(lang))
    }

    // MARK: - Workout

    var allSets: [SetEntry] { sets.flatMap { $0 } }
    var setsDone: Int { allSets.filter(\.done).count }

    func isExerciseDone(_ index: Int) -> Bool {
        sets[safe: index]?.allSatisfy(\.done) ?? false
    }

    /// The first set not yet logged in the current exercise (nil when all are done).
    var activeSetIndex: Int? {
        sets[currentExercise].firstIndex { !$0.done }
    }

    func exerciseName(_ index: Int) -> Loc {
        let ex = ClientData.workout[index]
        if let swap = swapped[index], let name = ex.swaps[safe: swap] { return name }
        return ex.name
    }

    /// Pounds lifted so far (weight × reps for every logged set).
    var volume: Double {
        var total = 0.0
        for (i, exercise) in ClientData.workout.enumerated() where !exercise.isTimed {
            for set in sets[i] where set.done {
                total += set.weight * Double(set.reps)
            }
        }
        return total
    }

    /// New personal bests in this workout ("Dumbbell bench press · 35 lb").
    var newBests: [String] {
        ClientData.bestWeight.keys.sorted().compactMap { i in
            guard let best = ClientData.bestWeight[i] else { return nil }
            let top = sets[i].filter(\.done).map(\.weight).max() ?? 0
            return top > best ? "\(ClientData.workout[i].name(lang)) · \(Fmt.trimmed(top)) lb" : nil
        }
    }

    func startWorkout() {
        if !workoutStarted {
            workoutStarted = true
            startDate = Date()
        }
        showQuickLog = false
        showWorkout = true
    }

    /// Changes weight or reps on a set (and the sets after it that aren't logged yet).
    func adjust(set index: Int, weight delta: Double = 0, reps repsDelta: Int = 0) {
        let e = currentExercise
        for i in index..<sets[e].count where i == index || !sets[e][i].done {
            if delta != 0 { sets[e][i].weight = max(0, sets[e][i].weight + delta) }
            if repsDelta != 0 { sets[e][i].reps = max(1, sets[e][i].reps + repsDelta) }
        }
    }

    func logSet(_ index: Int, weight: Double? = nil, reps: Int? = nil) {
        let e = currentExercise
        guard sets[e].indices.contains(index) else { return }
        withAnimation(.snappy) {
            if let weight { sets[e][index].weight = weight }
            if let reps { sets[e][index].reps = reps }
            sets[e][index].done = true
            if let weight {
                for i in sets[e].indices where i > index && !sets[e][i].done {
                    sets[e][i].weight = weight
                    if let reps { sets[e][i].reps = reps }
                }
            }
        }
        startRest(seconds: ClientData.workout[e].rest)
        Haptics.success()
    }

    func startRest(seconds: Int) {
        restToken += 1
        let token = restToken
        restEndsAt = Date().addingTimeInterval(TimeInterval(seconds))
        after(Double(seconds)) { [weak self] in
            guard let self, token == self.restToken, !self.workoutDone else { return }
            self.restEndsAt = nil
            self.voice.speak(CLT.restOver(self.lang))
        }
    }

    func skipRest() {
        restToken += 1
        withAnimation(.snappy) { restEndsAt = nil }
    }

    func swap(to option: Int) {
        swapped[currentExercise] = option
        toast.show(CLT.swappedTo(exerciseName(currentExercise)(lang))(lang))
    }

    /// Moves to the next exercise that isn't finished (or opens the finish sheet).
    func goToNextExercise() {
        let next = ClientData.workout.indices.first { $0 > currentExercise && !isExerciseDone($0) }
            ?? ClientData.workout.indices.first { !isExerciseDone($0) }
        if let next {
            withAnimation(.snappy) { currentExercise = next }
            skipRest()
        } else {
            showFinishSheet = true
        }
    }

    /// "12 reps at 30" → logs the set. Understands English and Spanish.
    func logSetByVoice() {
        guard let index = activeSetIndex else { return }
        let e = currentExercise
        let ex = ClientData.workout[e]
        let current = sets[e][index]
        let example = ex.isTimed
            ? CLT.secondsExample(current.reps)(lang)
            : CLT.voiceExample(current.reps, Fmt.trimmed(current.weight + (e == 0 && index == 2 ? 5 : 0)))(lang)

        listen(.set, fallback: example) { [weak self] text in
            guard let self else { return }
            guard !text.isEmpty else {
                self.toast.show(CLT.noCatchSet(self.lang))
                return
            }
            let numbers = Self.numbers(in: text)
            var reps = current.reps
            var weight = current.weight
            if ex.isTimed {
                if let first = numbers.first { reps = Int(first) }
            } else if numbers.count >= 2 {
                let lower = text.lowercased()
                let weightFirst = lower.range(of: #"^\D*\d+(\.\d+)?\s*(lb|lbs|libras|pounds|pound)"#, options: .regularExpression) != nil
                if weightFirst {
                    weight = numbers[0]
                    reps = Int(numbers[1])
                } else {
                    reps = Int(numbers[0])
                    weight = numbers[1]
                }
            } else if let first = numbers.first {
                reps = Int(first)
            }
            self.logSet(index, weight: ex.isTimed ? nil : weight, reps: reps)
            let spoken = ex.isTimed
                ? CLT.loggedSaySeconds(reps)(self.lang)
                : CLT.loggedSay(reps, Fmt.trimmed(weight))(self.lang)
            self.voice.speak(spoken)
        }
    }

    static func numbers(in text: String) -> [Double] {
        let pattern = #"\d+(\.\d+)?"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).compactMap { match in
            Range(match.range, in: text).flatMap { Double(text[$0]) }
        }
    }

    func saveWorkout() {
        restToken += 1
        restEndsAt = nil
        endDate = Date()
        showFinishSheet = false
        withAnimation(.snappy) { workoutDone = true }
        voice.speak(CLT.savedSay(lang))
    }

    func closeWorkout() {
        stopListening()
        showWorkout = false
    }

    // MARK: - Food

    func meals(for day: FoodDay) -> [Meal: [FoodItem]] {
        guard day == .today else { return ClientData.mealsYesterday }
        var result: [Meal: [FoodItem]] = [:]
        for meal in Meal.allCases {
            result[meal] = (ClientData.mealsToday[meal] ?? []) + (addedFoods[meal] ?? [])
        }
        return result
    }

    func totals(for day: FoodDay) -> Macros {
        Macros.total(Meal.allCases.flatMap { meals(for: day)[$0] ?? [] })
    }

    /// Opens the food logger in one of its four ways.
    func openLogger(_ mode: LogMode, meal: Meal = .dinner) {
        stopListening()
        logToken += 1
        logMode = mode
        logStage = mode == .photo ? .photo : (mode == .voice ? .voice : (mode == .barcode ? .barcode : .search))
        review = []
        reviewMeal = meal
        foodQuery = ""
        heardFood = ""
        let token = logToken
        // If the quick-log sheet is open, let it close before the logger slides up.
        let delay = showQuickLog ? 0.4 : 0
        showQuickLog = false
        if delay > 0 {
            after(delay) { [weak self] in
                guard let self, token == self.logToken else { return }
                self.showFoodLogger = true
            }
        } else {
            showFoodLogger = true
        }
        if mode == .voice {
            after(delay + 0.5) { [weak self] in
                guard let self, token == self.logToken else { return }
                self.listenForFood()
            }
        }
        if mode == .barcode {
            after(delay + 2.3) { [weak self] in
                guard let self, token == self.logToken, self.logStage == .barcode else { return }
                withAnimation(.snappy) { self.logStage = .reading }
                after(0.9) { [weak self] in
                    guard let self, token == self.logToken else { return }
                    self.showReview(ClientData.barcodeItems)
                }
            }
        }
    }

    func takePhoto() {
        let token = logToken
        withAnimation(.snappy) { logStage = .reading }
        after(1.7) { [weak self] in
            guard let self, token == self.logToken else { return }
            self.showReview(ClientData.photoItems)
        }
    }

    func listenForFood() {
        if listenMode == .food {
            stopListening()
            return
        }
        let token = logToken
        listen(.food, fallback: ClientData.sayFood(lang)) { [weak self] text in
            guard let self, token == self.logToken else { return }
            guard !text.isEmpty else {
                self.toast.show(CLT.noCatchFood(self.lang))
                return
            }
            self.heardFood = text
            withAnimation(.snappy) { self.logStage = .reading }
            after(1.4) { [weak self] in
                guard let self, token == self.logToken else { return }
                self.showReview(ClientData.voiceItems)
            }
        }
    }

    private func showReview(_ foods: [FoodItem]) {
        withAnimation(.snappy) {
            review = foods.map { ReviewItem(food: $0) }
            logStage = .review
        }
    }

    func addSearchResult(_ food: FoodItem) {
        var item = food
        if item.source == nil { item.source = ClientData.fromSearch }
        withAnimation(.snappy) {
            review.append(ReviewItem(food: item))
            logStage = .review
        }
    }

    func changePortion(_ id: UUID, by delta: Double) {
        guard let i = review.firstIndex(where: { $0.id == id }) else { return }
        review[i].multiplier = max(0.5, review[i].multiplier + delta)
    }

    func addReviewedFoods() {
        guard !review.isEmpty else { return }
        let foods = review.map { $0.food.scaled($0.multiplier) }
        let totals = Macros.total(foods)
        let mealName = reviewMeal.name(lang).lowercased()
        let byVoice = logMode == .voice
        withAnimation(.snappy) {
            addedFoods[reviewMeal, default: []].append(contentsOf: foods)
            foodDay = .today
        }
        review = []
        showFoodLogger = false
        tab = .food
        foodPath = []
        toast.show(CLT.addedTo(mealName)(lang))
        if byVoice {
            voice.speak(CLT.addedSay(foods.count, mealName, Fmt.grouped(Int(totals.kcal.rounded())), Int(totals.protein.rounded()))(lang))
        }
    }

    func searchMore() {
        withAnimation(.snappy) {
            logMode = .search
            logStage = .search
        }
    }

    func addFavorite(_ food: FoodItem) {
        withAnimation(.snappy) {
            addedFoods[.snacks, default: []].append(food)
            foodDay = .today
        }
        toast.show(CLT.addedToSnacks(food.name(lang))(lang))
    }

    // MARK: - Progress

    func saveWeight() {
        weight = (weightDraft * 10).rounded() / 10
        showWeightSheet = false
        toast.show(CLT.weightSaved(Fmt.oneDecimal(weight))(lang))
    }

    func saveMeasurements() {
        measures = measureDraft
        showMeasureSheet = false
        toast.show(CLT.measurementsSaved(lang))
    }

    func addProgressPhoto() {
        withAnimation(.snappy) { newPhotos += 1 }
        toast.show(CLT.photoAdded(lang))
    }

    // MARK: - Coach chat

    var allChat: [ChatMessage] { ClientData.chat + chatExtra }

    func sendChat() {
        let text = chatInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let time = lang == .english ? CLT.delivered : CLT.deliveredInEnglish
        withAnimation(.snappy) {
            chatExtra.append(ChatMessage(fromMe: true, text: Loc(same: text), time: time))
        }
        chatInput = ""
    }

    /// Records a voice note (with a written transcript) for the coach.
    func toggleVoiceNote() {
        if listenMode == .voiceNote {
            stopListening()
            toast.show(CLT.voiceNoteDiscarded(lang))
            return
        }
        listen(.voiceNote, fallback: ClientData.sayVoiceNote(lang)) { [weak self] text in
            guard let self else { return }
            guard !text.isEmpty else {
                self.toast.show(CLT.nothingRecorded(self.lang))
                return
            }
            let seconds = max(3, Int((Double(text.split(separator: " ").count) / 2.4).rounded()))
            let time = self.lang == .english ? CLT.delivered : CLT.deliveredInEnglish
            withAnimation(.snappy) {
                self.chatExtra.append(ChatMessage(fromMe: true, text: Loc(same: text), time: time, isVoice: true,
                                                  duration: "0:" + String(format: "%02d", seconds)))
            }
            self.toast.show(CLT.voiceNoteSent(self.lang))
        }
    }

    func startVoiceNoteFromQuickLog() {
        showQuickLog = false
        go(.coach)
        after(0.5) { [weak self] in self?.toggleVoiceNote() }
    }

    // MARK: - Check-in

    func dictateCheckInNote() {
        listen(.note, fallback: ClientData.sayNote(lang)) { [weak self] text in
            guard let self, !text.isEmpty else { return }
            self.checkInNote = self.checkInNote.isEmpty ? text : self.checkInNote + " " + text
        }
    }

    func sendCheckIn() {
        stopListening()
        withAnimation(.snappy) { checkInSent = true }
        voice.speak(CLT.checkInSentSay(lang))
    }

    // MARK: - Booking

    func slotLabel(_ slot: SlotRef) -> String {
        "\(ClientData.slotDaysShort[slot.day](lang)) \(ClientData.slotTimes[slot.day][slot.time](lang))"
    }

    func confirmBooking() {
        guard let slot = pickedSlot else {
            toast.show(CLT.pickFirst(lang))
            return
        }
        withAnimation(.snappy) {
            booked = slot
            pickedSlot = nil
        }
        toast.show(CLT.moved(lang))
    }
}
