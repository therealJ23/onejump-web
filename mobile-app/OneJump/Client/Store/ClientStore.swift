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

/// All state and actions for the client app. In the demo (and a coach's preview) it shows the
/// sample client; when a client is signed in (`live`), everything comes from their own account
/// through the client API (`/api/me/…`, see ClientStore+Live below).
@Observable
final class ClientStore {
    let settings: AppSettings
    let toast = ToastCenter()
    /// A client is signed in: real data, and every action goes to the server.
    let live: Bool

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

    // MARK: Content (the sample client in the demo; the client's own account when live)
    var loaded = false
    var loadError: String?
    var coachPerson = ClientPerson.demoCoach
    var mePerson = ClientPerson.demoMe
    var greeting: Loc = CLT.hello
    var dateLine: Loc = CLT.date
    var streakText: Loc = CLT.streakLine
    var goalText: Loc = CLT.goalLine2
    var workout: [WorkoutExercise] = ClientData.workout
    var bestWeight: [Int: Double] = ClientData.bestWeight
    var workoutTitle: Loc = CLT.workoutName
    var workoutMeta: Loc = CLT.workoutMeta
    var workoutNote: Loc? = CLT.coachNote
    /// Live: the workout's day when it isn't today ("Monday"); nil = today.
    var workoutDay: Loc?
    var workoutAssignmentID: String?
    var hasWorkout = true
    /// Live: the workout's sets are loading (the player opens once they're here).
    var workoutLoading = false
    var mealsTodayBase: [Meal: [FoodItem]] = ClientData.mealsToday
    var mealsYesterdayBase: [Meal: [FoodItem]] = ClientData.mealsYesterday
    var targets: MacroTargets? = .demo
    /// The coach turned on "Hide numbers": no calories or macros anywhere.
    var hideNumbers = false
    var nutritionNote: String?
    var habitList: [Habit] = ClientData.habits
    var favoriteFoods: [FoodItem] = ClientData.favorites
    var chatBase: [ChatMessage] = ClientData.chat
    /// Pro features of the coach's plan (photo and voice food logging, voice notes).
    var photoLogging = true
    var voiceLogging = true
    var voiceNotes = true
    var weightPoints: [Double]?
    var weightStart: Loc?
    var weightChangeText: Loc = CLT.lostSince
    var goalWeight: Double? = ClientData.goalWeight
    var workoutsDone = 22
    var streakDays = 18
    var records: [ClientRecord] = ClientData.records
    var progressPhotos: [ProgressPhotoItem] = []
    var paymentProblem = false
    var planLine: Loc = CLT.planLine
    var paidLine: Loc = CLT.paidLine
    var weekDone = 2
    var weekPlanned = 3
    var lastCoachMessage: Loc?
    /// Live: a photo the client just picked, shown while it uploads.
    var pendingProfilePhoto: UIImage?
    var uploadingPhoto = false
    /// Live: food search results from the server (USDA / Open Food Facts).
    var foodSearchResults: [FoodItem] = []
    var searchingFoods = false
    /// Live: Assist's reading of a meal photo, kept until the foods are added.
    var pendingPhotoToken: String?
    /// Live: the check-in's sleep (hours) and mood answers.
    var checkInSleep: Double = 7
    var checkInMood = 3
    var sendingCheckIn = false
    var savingWorkout = false

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
    /// Why the last barcode didn't work (not found, offline, bad number).
    var barcodeMessage: Loc?
    /// The meal photo being read (shown in the frame while Assist works).
    var foodPhoto: UIImage?
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

    init(settings: AppSettings, live: Bool = false) {
        self.settings = settings
        self.live = live
        if live {
            // Nothing sample shows while the account loads.
            coachPerson = ClientPerson(name: "", first: "", initials: "")
            mePerson = ClientPerson(name: settings.coachName)
            greeting = Loc(same: "")
            streakText = Loc(same: "")
            goalText = Loc(same: "")
            workout = []
            sets = []
            bestWeight = [:]
            hasWorkout = false
            mealsTodayBase = [:]
            mealsYesterdayBase = [:]
            targets = nil
            habitList = []
            habits = [:]
            favoriteFoods = []
            chatBase = []
            weightPoints = []
            goalWeight = nil
            workoutsDone = 0
            streakDays = 0
            records = []
            readCoach = true
            weight = 0
            dateLine = Loc(Self.today(.english), Self.today(.spanish))
            return
        }
        // Launch argument used for previews and screenshots: -ojOpen "food" or "workout"
        if let link = UserDefaults.standard.string(forKey: "ojOpen") {
            open(link: link)
        }
    }

    /// "Saturday, Nov 7" in the app's language.
    static func today(_ lang: AppLanguage) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: lang == .spanish ? "es" : "en_US")
        f.setLocalizedDateFormatFromTemplate("EEEEMMMd")
        return f.string(from: Date())
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
        if live {
            withAnimation(.snappy) { habits[habit.id] = on }
            Haptics.tick()
            toggleHabitLive(habit, on: on)
            return
        }
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
        sets[safe: currentExercise]?.firstIndex { !$0.done }
    }

    func exerciseName(_ index: Int) -> Loc {
        guard let ex = workout[safe: index] else { return "" }
        if let swap = swapped[index], let name = ex.swaps[safe: swap] { return name }
        return ex.name
    }

    /// Pounds lifted so far (weight × reps for every logged set).
    var volume: Double {
        var total = 0.0
        for (i, exercise) in workout.enumerated() where !exercise.isTimed {
            for set in sets[safe: i] ?? [] where set.done {
                total += set.weight * Double(set.reps)
            }
        }
        return total
    }

    /// New personal bests in this workout ("Dumbbell bench press · 35 lb").
    var newBests: [String] {
        bestWeight.keys.sorted().compactMap { i in
            guard let best = bestWeight[i], let ex = workout[safe: i], let done = sets[safe: i] else { return nil }
            let top = done.filter(\.done).map(\.weight).max() ?? 0
            return top > best ? "\(ex.name(lang)) · \(Fmt.trimmed(top)) lb" : nil
        }
    }

    func startWorkout() {
        if live && workout.isEmpty {
            loadWorkoutThenStart()
            return
        }
        guard !workout.isEmpty else { return }
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
        startRest(seconds: workout[safe: e]?.rest ?? 60)
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
        let next = workout.indices.first { $0 > currentExercise && !isExerciseDone($0) }
            ?? workout.indices.first { !isExerciseDone($0) }
        if let next {
            withAnimation(.snappy) { currentExercise = next }
            skipRest()
        } else {
            showFinishSheet = true
        }
    }

    /// "12 reps at 30" → logs the set. Understands English and Spanish.
    func logSetByVoice() {
        guard let index = activeSetIndex, let ex = workout[safe: currentExercise] else { return }
        let e = currentExercise
        let current = sets[e][index]
        let example = ex.isTimed
            ? CLT.secondsExample(current.reps)(lang)
            : CLT.voiceExample(current.reps, Fmt.trimmed(current.weight + (e == 0 && index == 2 ? 5 : 0)))(lang)

        listen(.set, fallback: live ? "" : example) { [weak self] text in
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
        if live {
            saveWorkoutLive()
            return
        }
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
        guard day == .today else { return mealsYesterdayBase }
        var result: [Meal: [FoodItem]] = [:]
        for meal in Meal.allCases {
            result[meal] = (mealsTodayBase[meal] ?? []) + (addedFoods[meal] ?? [])
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
        foodPhoto = nil
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
        barcodeMessage = nil
    }

    /// A barcode was scanned (or typed): look the product up, then let the client check the portion.
    func lookUpBarcode(_ raw: String) {
        let code = raw.filter(\.isNumber)
        guard (8...14).contains(code.count) else {
            barcodeMessage = CLT.badBarcode
            return
        }
        let token = logToken
        barcodeMessage = nil
        withAnimation(.snappy) { logStage = .reading }
        Task { @MainActor [weak self] in
            guard let self else { return }
            let result: BarcodeLookup.Result
            if self.live {
                result = await self.barcodeLive(code)
            } else {
                result = await BarcodeLookup.find(code)
            }
            guard token == self.logToken else { return }
            switch result {
            case .found(let food):
                self.showReview([food])
            case .notFound:
                self.barcodeMessage = CLT.barcodeNotFound
                withAnimation(.snappy) { self.logStage = .barcode }
            case .failed:
                self.barcodeMessage = CLT.barcodeOffline
                withAnimation(.snappy) { self.logStage = .barcode }
            }
        }
    }

    /// A meal photo was taken or chosen. Signed in (the coach trying the client app), Assist on
    /// the server reads it; in the demo, sample foods stand in.
    func analyzePhoto(_ image: UIImage) {
        let token = logToken
        foodPhoto = image
        withAnimation(.snappy) { logStage = .reading }
        if live {
            analyzePhotoLive(image, token: token)
            return
        }
        guard settings.signedIn else {
            after(1.7) { [weak self] in
                guard let self, token == self.logToken else { return }
                self.showReview(ClientData.photoItems)
                self.toast.show(CLT.demoPhotoNote(self.lang))
            }
            return
        }
        Task { @MainActor [weak self] in
            let jpeg = await Task.detached(priority: .userInitiated) { image.jpegForUpload(maxSide: 1600, quality: 0.8) }.value
            guard let self, token == self.logToken else { return }
            guard let jpeg else {
                self.photoFailed(CLT.photoUnreadable(self.lang))
                return
            }
            do {
                let answer: PhotoAnswer = try await APIClient.shared.upload("/api/nutrition/photo-preview", field: "photo", file: jpeg, filename: "meal.jpg", mimeType: "image/jpeg", timeout: 90)
                guard token == self.logToken else { return }
                let foods = answer.items.map { $0.food(source: CLT.fromPhotoAssist) }
                if foods.isEmpty { self.photoFailed(CLT.notFoodPhoto(self.lang)) } else { self.showReview(foods) }
            } catch {
                guard token == self.logToken else { return }
                self.photoFailed((error as? LocalizedError)?.errorDescription ?? CLT.notFoodPhoto(self.lang))
            }
        }
    }

    private func photoFailed(_ message: String) {
        toast.show(message)
        withAnimation(.snappy) {
            foodPhoto = nil
            logStage = .photo
        }
    }

    func listenForFood() {
        if listenMode == .food {
            stopListening()
            return
        }
        let token = logToken
        listen(.food, fallback: live ? "" : ClientData.sayFood(lang)) { [weak self] text in
            guard let self, token == self.logToken else { return }
            guard !text.isEmpty else {
                self.toast.show(CLT.noCatchFood(self.lang))
                return
            }
            self.heardFood = text
            withAnimation(.snappy) { self.logStage = .reading }
            if self.live {
                self.matchFoodText(text, token: token)
                return
            }
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
        if live {
            saveReviewedFoodsLive()
            return
        }
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
        if live {
            logFavoriteLive(food)
            return
        }
        withAnimation(.snappy) {
            addedFoods[.snacks, default: []].append(food)
            foodDay = .today
        }
        toast.show(CLT.addedToSnacks(food.name(lang))(lang))
    }

    // MARK: - Progress

    func saveWeight() {
        if live {
            saveWeightLive()
            return
        }
        weight = (weightDraft * 10).rounded() / 10
        showWeightSheet = false
        toast.show(CLT.weightSaved(Fmt.oneDecimal(weight))(lang))
    }

    func saveMeasurements() {
        if live {
            saveMeasurementsLive()
            return
        }
        measures = measureDraft
        showMeasureSheet = false
        toast.show(CLT.measurementsSaved(lang))
    }

    func addProgressPhoto() {
        withAnimation(.snappy) { newPhotos += 1 }
        toast.show(CLT.photoAdded(lang))
    }

    // MARK: - Coach chat

    var allChat: [ChatMessage] { chatBase + chatExtra }

    func sendChat() {
        let text = chatInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        if live {
            sendChatLive(text)
            return
        }
        let time = lang == .english ? CLT.delivered : CLT.deliveredInEnglish
        withAnimation(.snappy) {
            chatExtra.append(ChatMessage(fromMe: true, text: Loc(same: text), time: time))
        }
        chatInput = ""
    }

    /// Records a voice note (with a written transcript) for the coach.
    // MARK: Voice messages

    /// Whether a voice message is recording now.
    var recordingVoiceMessage: Bool { VoiceNoteRecorder.shared.isRecording }

    /// Starts recording a voice message to the coach (real audio, with a transcript).
    func startVoiceMessage() {
        let recorder = VoiceNoteRecorder.shared
        guard !recorder.isRecording else { return }
        stopListening()
        voice.stopSpeaking()
        VoiceNotePlayer.shared.stop()
        recorder.onLimit = { [weak self] recording in
            guard let self else { return }
            self.toast.show(SharedText.voiceMessageLimit(self.lang))
            if let recording { self.deliverVoiceMessage(recording) }
        }
        Task { @MainActor [weak self] in
            guard let self else { return }
            if !(await recorder.start(language: self.lang)) { self.toast.show(SharedText.micNeeded(self.lang)) }
        }
    }

    func sendVoiceMessage() {
        guard let recording = VoiceNoteRecorder.shared.stop() else {
            toast.show(SharedText.voiceMessageTooShort(lang))
            return
        }
        deliverVoiceMessage(recording)
    }

    func cancelVoiceMessage() {
        VoiceNoteRecorder.shared.cancel()
        toast.show(SharedText.voiceMessageDiscarded(lang))
    }

    private func deliverVoiceMessage(_ recording: VoiceNoteRecorder.Recording) {
        if live {
            deliverVoiceMessageLive(recording)
            return
        }
        let seconds = max(1, Int(recording.seconds.rounded()))
        let time = lang == .english ? CLT.delivered : CLT.deliveredInEnglish
        var message = ChatMessage(fromMe: true, text: Loc(same: recording.transcript), time: time, isVoice: true,
                                  duration: VoiceMessageRow.clock(seconds))
        message.audioURL = recording.url
        message.seconds = seconds
        withAnimation(.snappy) { chatExtra.append(message) }
        Haptics.tap()
        toast.show(CLT.voiceNoteSent(lang))
    }

    /// The quick-log button and older callers: record, or send what's recording.
    func toggleVoiceNote() {
        if recordingVoiceMessage { sendVoiceMessage() } else { startVoiceMessage() }
    }

    func startVoiceNoteFromQuickLog() {
        showQuickLog = false
        go(.coach)
        after(0.5) { [weak self] in self?.toggleVoiceNote() }
    }

    // MARK: - Check-in

    func dictateCheckInNote() {
        listen(.note, fallback: live ? "" : ClientData.sayNote(lang)) { [weak self] text in
            guard let self, !text.isEmpty else { return }
            self.checkInNote = self.checkInNote.isEmpty ? text : self.checkInNote + " " + text
        }
    }

    func sendCheckIn() {
        stopListening()
        if live {
            sendCheckInLive()
            return
        }
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

// MARK: - Barcode lookup

/// Finds a packaged food by its barcode in Open Food Facts (free, public, no key).
/// The demo client isn't logged in, so it asks Open Food Facts directly; once real client
/// accounts exist this can go through the server's `/api/foods/barcode/:code` (cached).
enum BarcodeLookup {
    enum Result { case found(FoodItem), notFound, failed }

    private struct Answer: Decodable {
        let status: Int?
        let product: Product?
    }

    private struct Product: Decodable {
        let product_name: String?
        let generic_name: String?
        let brands: String?
        let serving_size: String?
        let serving_quantity: Double?
        let nutriments: [String: Double]?

        enum CodingKeys: String, CodingKey { case product_name, generic_name, brands, serving_size, serving_quantity, nutriments }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            product_name = try? c.decodeIfPresent(String.self, forKey: .product_name)
            generic_name = try? c.decodeIfPresent(String.self, forKey: .generic_name)
            brands = try? c.decodeIfPresent(String.self, forKey: .brands)
            serving_size = try? c.decodeIfPresent(String.self, forKey: .serving_size)
            // Open Food Facts sends serving_quantity as a number or a string.
            if let n = try? c.decodeIfPresent(Double.self, forKey: .serving_quantity) {
                serving_quantity = n
            } else if let s = try? c.decodeIfPresent(String.self, forKey: .serving_quantity) {
                serving_quantity = Double(s)
            } else {
                serving_quantity = nil
            }
            // Nutriments mixes numbers and strings; keep only the numbers.
            if let all = try? c.decodeIfPresent([String: Flexible].self, forKey: .nutriments) {
                nutriments = all.compactMapValues(\.number)
            } else {
                nutriments = nil
            }
        }
    }

    private struct Flexible: Decodable {
        let number: Double?
        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let d = try? c.decode(Double.self) { number = d }
            else if let s = try? c.decode(String.self) { number = Double(s) }
            else { number = nil }
        }
    }

    static func find(_ code: String) async -> Result {
        let fields = "product_name,generic_name,brands,nutriments,serving_size,serving_quantity"
        guard let url = URL(string: "https://world.openfoodfacts.org/api/v2/product/\(code).json?fields=\(fields)") else { return .failed }
        var request = URLRequest(url: url, timeoutInterval: 12)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // Open Food Facts asks every app to say who it is.
        request.setValue("OneJump-iOS/1.0 (hello@onejumpfit.com)", forHTTPHeaderField: "User-Agent")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 404 { return .notFound }
            guard (200..<300).contains(status) else { return .failed }
            let answer = try JSONDecoder().decode(Answer.self, from: data)
            guard answer.status == 1, let p = answer.product, let food = food(from: p) else { return .notFound }
            return .found(food)
        } catch {
            return .failed
        }
    }

    private static func food(from p: Product) -> FoodItem? {
        let n = p.nutriments ?? [:]
        guard let kcal100 = n["energy-kcal_100g"] ?? n["energy_100g"].map({ $0 / 4.184 }) else { return nil }
        let protein100 = n["proteins_100g"] ?? 0
        let carbs100 = n["carbohydrates_100g"] ?? 0
        let fat100 = n["fat_100g"] ?? 0

        let name = (p.product_name ?? p.generic_name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let brand = p.brands?.split(separator: ",").first.map { $0.trimmingCharacters(in: .whitespaces) }
        let title = name.isEmpty ? (brand ?? "Product") : (brand.map { name.localizedCaseInsensitiveContains($0) ? name : "\(name) · \($0)" } ?? name)

        // One serving when the label gives one, otherwise 100 g.
        let grams = (p.serving_quantity ?? 0) > 0 ? p.serving_quantity! : 100
        let quantity: Loc
        if (p.serving_quantity ?? 0) > 0 {
            let label = p.serving_size?.trimmingCharacters(in: .whitespaces) ?? ""
            quantity = label.isEmpty
                ? Loc("1 serving (\(Int(grams.rounded())) g)", "1 porción (\(Int(grams.rounded())) g)")
                : Loc("1 serving (\(label))", "1 porción (\(label))")
        } else {
            quantity = Loc(same: "100 g")
        }
        let f = grams / 100
        return FoodItem(name: Loc(same: title), quantity: quantity,
                        kcal: kcal100 * f, protein: protein100 * f, carbs: carbs100 * f, fat: fat100 * f,
                        source: Loc("Barcode · Open Food Facts", "Código · Open Food Facts"))
    }
}

/// Assist's reading of a meal photo (`POST /api/nutrition/photo-preview`).
struct PhotoAnswer: Decodable {
    struct Item: Decodable {
        let name: String
        let matched: String?
        let grams: Double?
        let portionText: String?
        let calories: Double?
        let proteinG: Double?
        let carbsG: Double?
        let fatG: Double?

        func food(source: Loc) -> FoodItem {
            let portion = portionText ?? grams.map { "\(Int($0.rounded())) g" } ?? ""
            return FoodItem(name: Loc(name, name), quantity: Loc(portion, portion),
                            kcal: (calories ?? 0).rounded(), protein: (proteinG ?? 0).rounded(),
                            carbs: (carbsG ?? 0).rounded(), fat: (fatG ?? 0).rounded(), source: source)
        }
    }
    let title: String?
    let items: [Item]
}

// MARK: - Live account (a signed-in client)

/// Answers from the client API (`/api/me/…`), shaped the way the server sends them.
enum LiveAPI {
    /// A number the server may send as a number, a numeric string or "" (empty = none).
    struct Num: Decodable {
        let value: Double?
        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let d = try? c.decode(Double.self) { value = d }
            else if let s = try? c.decode(String.self) { value = Double(s) }
            else { value = nil }
        }
    }

    /// How-to text: one string or a list of steps.
    struct Lines: Decodable {
        let lines: [String]
        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let list = try? c.decode([String].self) { lines = list }
            else if let one = try? c.decode(String.self) { lines = [one] }
            else { lines = [] }
        }
    }

    struct Person: Decodable { let name: String; let first: String?; let photoUrl: String? }

    struct Today: Decodable {
        struct Client: Decodable { let name: String; let first: String; let goal: String?; let targetWeight: Double?; let photoUrl: String? }
        struct Program: Decodable { let name: String; let week: Int; let weeks: Int }
        struct Planned: Decodable { let id: String; let name: String; let estMinutes: Int?; let count: Int; let first: String? }
        struct Slot: Decodable { let assignmentId: String; let date: String; let status: String; let note: String?; let workout: Planned }
        struct Week: Decodable { let done: Int; let planned: Int }
        struct CheckIn: Decodable { let doneThisWeek: Bool }
        struct Weight: Decodable { let start: Double; let current: Double; let change: Double; let since: String }
        struct Note: Decodable { let text: String }
        let client: Client
        let coach: Person
        let program: Program?
        let streak: Int
        let today: Slot?
        let next: Slot?
        let week: Week
        let checkin: CheckIn
        let weight: Weight?
        let coachNote: Note?
        let paymentProblem: Bool
        let workoutsDone: Int
    }

    struct WorkoutDetail: Decodable {
        struct Assignment: Decodable { let id: String; let status: String; let note: String? }
        struct PlannedSet: Decodable { let target: String; let reps: Num; let weight: Num; let rest: Num? }
        struct Exercise: Decodable { let exerciseId: String; let name: String; let equipment: String?; let howTo: Lines?; let notes: String?; let sets: [PlannedSet] }
        struct Workout: Decodable { let id: String; let name: String; let estMinutes: Int?; let exercises: [Exercise] }
        let assignment: Assignment
        let workout: Workout
    }

    struct Macros: Decodable { let calories: Double?; let proteinG: Double?; let carbsG: Double?; let fatG: Double? }

    struct Nutrition: Decodable {
        struct Item: Decodable { let name: String; let grams: Double?; let portionText: String? }
        struct Entry: Decodable { let id: String; let meal: String; let title: String?; let source: String?; let totals: Macros?; let items: [Item]? }
        struct HabitRow: Decodable { let id: String; let title: String; let done: Bool; let streak: Int? }
        struct Favorite: Decodable { let id: String; let title: String }
        struct Features: Decodable { let photo: Bool?; let voice: Bool? }
        let day: String
        let today: String
        let approach: String?
        let hideNumbers: Bool?
        let targets: Macros?
        let entries: [Entry]
        let habits: [HabitRow]?
        let favorites: [Favorite]?
        let coachNote: String?
        let features: Features?
    }

    struct Thread: Decodable {
        struct Voice: Decodable { let durationS: Double? }
        struct Message: Decodable { let id: String; let from: String; let body: String?; let at: String; let voice: Voice? }
        struct Features: Decodable { let voiceNotes: Bool? }
        let messages: [Message]
        let coach: Person?
        let features: Features?
    }

    struct Progress: Decodable {
        struct Point: Decodable { let date: String; let value: Double }
        struct Best: Decodable { let name: String; let weight: Double?; let reps: Int? }
        struct Measure: Decodable { let takenAt: String; let weight: Double?; let waist: Double?; let hips: Double?; let chest: Double?; let arm: Double? }
        struct Photo: Decodable { let id: String; let takenAt: String; let url: String }
        let workoutsDone: Int
        let weightChange: Double?
        let weights: [Point]
        let bests: [Best]
        let measurements: [Measure]
        let photos: [Photo]
    }

    struct Account: Decodable {
        struct Client: Decodable { let name: String; let email: String?; let goal: String?; let payStatus: String?; let photoUrl: String? }
        struct Plan: Decodable { let name: String; let priceCents: Int; let interval: String? }
        struct Subscription: Decodable { let status: String; let currentPeriodEnd: String?; let cancelAtPeriodEnd: Bool? }
        let client: Client
        let coach: Person
        let plan: Plan?
        let subscription: Subscription?
    }

    struct Food: Decodable {
        struct Serving: Decodable { let label: String; let grams: Double }
        let ref: String?
        let name: String
        let brand: String?
        let per100g: Macros?
        let servings: [Serving]?
        let defaultGrams: Double?
    }
    struct FoodResults: Decodable { let results: [Food] }
    struct BarcodeAnswer: Decodable { let food: Food }

    /// A food Assist or the parser found (photo, voice or typed text).
    struct Matched: Decodable {
        let name: String
        let grams: Double?
        let portionText: String?
        let foodRef: String?
        let confidence: String?
        let calories: Double?
        let proteinG: Double?
        let carbsG: Double?
        let fatG: Double?
    }
    struct Matches: Decodable { let items: [Matched] }
    struct PhotoReading: Decodable { let photoToken: String?; let title: String?; let items: [Matched] }

    struct PhotoSaved: Decodable { let photoUrl: String? }
    struct ProgressPhotoSaved: Decodable {
        struct Photo: Decodable { let id: String; let takenAt: String; let url: String }
        let photo: Photo
    }
    struct MessageSent: Decodable {
        struct Message: Decodable { let id: String; let body: String? }
        let message: Message
    }
    struct Completed: Decodable { let workoutNumber: Int?; let volume: Double?; let sets: Int? }
    struct AudioLink: Decodable { let url: String }
}

extension LiveAPI {
    /// Dates from the server ("2026-11-09T00:00:00.000Z").
    static func date(_ text: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: text) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: text)
    }

    /// A date in both languages ("Nov 7" / "7 nov"), in UTC for plain calendar days.
    static func day(_ text: String, utc: Bool = false, weekday: Bool = false) -> Loc {
        guard let d = date(text) else { return Loc(same: "") }
        func fmt(_ id: String) -> String {
            let f = DateFormatter()
            f.locale = Locale(identifier: id)
            if utc { f.timeZone = TimeZone(identifier: "UTC") }
            f.setLocalizedDateFormatFromTemplate(weekday ? "EEEE" : "MMMd")
            return f.string(from: d)
        }
        return Loc(fmt("en_US"), fmt("es"))
    }

    /// "9:42 PM", or "Nov 2, 9:42 PM" for older messages.
    static func time(_ text: String) -> Loc {
        guard let d = date(text) else { return Loc(same: "") }
        func fmt(_ id: String) -> String {
            let f = DateFormatter()
            f.locale = Locale(identifier: id)
            f.setLocalizedDateFormatFromTemplate(Calendar.current.isDateInToday(d) ? "jmm" : "MMMdjmm")
            return f.string(from: d)
        }
        return Loc(fmt("en_US"), fmt("es"))
    }

    static func meal(_ server: String) -> Meal {
        switch server {
        case "breakfast": return .breakfast
        case "lunch": return .lunch
        case "dinner": return .dinner
        default: return .snacks
        }
    }

    static func serverMeal(_ meal: Meal) -> String {
        meal == .snacks ? "snack" : meal.rawValue
    }

    static func food(_ f: Food, source: Loc) -> FoodItem {
        let serving = f.servings?.first
        let grams = f.defaultGrams ?? serving?.grams ?? 100
        let label = f.servings?.first(where: { abs($0.grams - grams) < 0.5 })?.label ?? "\(Int(grams.rounded())) g"
        let per = f.per100g
        let k = grams / 100
        let title = f.brand.map { f.name.localizedCaseInsensitiveContains($0) ? f.name : "\(f.name) · \($0)" } ?? f.name
        return FoodItem(name: Loc(same: title), quantity: Loc(same: label),
                        kcal: (per?.calories ?? 0) * k, protein: (per?.proteinG ?? 0) * k,
                        carbs: (per?.carbsG ?? 0) * k, fat: (per?.fatG ?? 0) * k,
                        source: source, grams: grams, foodRef: f.ref)
    }

    static func food(_ m: Matched, source: Loc) -> FoodItem {
        let portion = m.portionText ?? m.grams.map { "\(Int($0.rounded())) g" } ?? ""
        return FoodItem(name: Loc(same: m.name), quantity: Loc(same: portion),
                        kcal: (m.calories ?? 0).rounded(), protein: (m.proteinG ?? 0).rounded(),
                        carbs: (m.carbsG ?? 0).rounded(), fat: (m.fatG ?? 0).rounded(),
                        source: source, grams: m.grams, foodRef: m.foodRef, confidence: m.confidence)
    }
}

extension ClientStore {
    private var api: APIClient { APIClient.shared }

    private func fail(_ error: Error) {
        toast.show((error as? LocalizedError)?.errorDescription ?? CL.somethingWrong(lang))
    }

    /// Loads (or refreshes) the whole account: Today, food, messages, progress and plan.
    @MainActor
    func loadLive() async {
        guard live else { return }
        do {
            async let todayAnswer: LiveAPI.Today = api.get("/api/me/today")
            async let foodAnswer: LiveAPI.Nutrition = api.get("/api/me/nutrition/today")
            async let threadAnswer: LiveAPI.Thread = api.get("/api/me/thread")
            async let progressAnswer: LiveAPI.Progress = api.get("/api/me/progress")
            async let accountAnswer: LiveAPI.Account = api.get("/api/me/account")
            let (t, n, th, p, a) = try await (todayAnswer, foodAnswer, threadAnswer, progressAnswer, accountAnswer)
            apply(t)
            apply(n, yesterday: false)
            apply(th)
            apply(p)
            apply(a)
            loadError = nil
            loaded = true
            if let yesterday = Self.dayBefore(n.today) {
                let y: LiveAPI.Nutrition? = try? await api.get("/api/me/nutrition/today?day=\(yesterday)")
                if let y { apply(y, yesterday: true) }
            }
        } catch {
            if !loaded { loadError = (error as? LocalizedError)?.errorDescription ?? CL.somethingWrong(lang) }
        }
    }

    static func dayBefore(_ ymd: String) -> String? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: ymd) else { return nil }
        return f.string(from: d.addingTimeInterval(-86_400))
    }

    // MARK: Applying answers

    private func apply(_ t: LiveAPI.Today) {
        coachPerson = ClientPerson(name: t.coach.name, first: t.coach.first, photoURL: t.coach.photoUrl)
        mePerson = ClientPerson(name: t.client.name, first: t.client.first, photoURL: t.client.photoUrl)
        settings.coachName = t.client.name
        let hour = Calendar.current.component(.hour, from: Date())
        let first = t.client.first
        greeting = hour < 12 ? Loc("Morning, \(first)", "Buenos días, \(first)")
            : hour < 18 ? Loc("Afternoon, \(first)", "Buenas tardes, \(first)") : Loc("Evening, \(first)", "Buenas noches, \(first)")
        var streakEN = t.streak == 1 ? "1-day streak" : "\(t.streak)-day streak"
        var streakES = t.streak == 1 ? "Racha de 1 día" : "Racha de \(t.streak) días"
        if let p = t.program {
            streakEN += " · Week \(p.week) of \(p.weeks)"
            streakES += " · Semana \(p.week) de \(p.weeks)"
        }
        streakText = Loc(streakEN, streakES)
        streakDays = t.streak
        workoutsDone = t.workoutsDone
        weekDone = t.week.done
        weekPlanned = t.week.planned
        paymentProblem = t.paymentProblem
        checkInSent = t.checkin.doneThisWeek
        if let w = t.weight {
            weight = w.current
            weightDraft = w.current
        }
        goalWeight = t.client.targetWeight
        let goal = t.client.goal ?? ""
        goalText = goal.isEmpty
            ? Loc("Coached by \(t.coach.name)", "Con el coach \(t.coach.name)")
            : Loc("\(goal) · coached by \(t.coach.name)", "\(goal) · con el coach \(t.coach.name)")
        lastCoachMessage = t.coachNote.map { Loc(same: $0.text) }

        // Today's workout, or the next one.
        let slot = t.today ?? t.next
        let newID = slot?.assignmentId
        if newID != workoutAssignmentID {
            // A different workout: start fresh (its sets load when it's opened).
            workoutAssignmentID = newID
            workout = []
            sets = []
            swapped = [:]
            currentExercise = 0
            workoutStarted = false
            startDate = nil
            endDate = nil
        }
        hasWorkout = slot != nil
        workoutDone = slot?.status == "completed"
        if let slot {
            workoutTitle = Loc(same: slot.workout.name)
            var en = slot.workout.count == 1 ? "1 exercise" : "\(slot.workout.count) exercises"
            var es = slot.workout.count == 1 ? "1 ejercicio" : "\(slot.workout.count) ejercicios"
            if let m = slot.workout.estMinutes, m > 0 {
                en += " · about \(m) minutes"
                es += " · unos \(m) minutos"
            }
            workoutMeta = Loc(en, es)
            workoutDay = t.today == nil ? LiveAPI.day(slot.date, utc: true, weekday: true) : nil
            let note = slot.note ?? (t.today != nil ? t.coachNote?.text : nil)
            workoutNote = note.map { Loc(same: "\($0) — \(t.coach.first ?? t.coach.name)") }
        } else {
            workoutTitle = Loc("Rest day", "Día de descanso")
            workoutMeta = Loc("Nothing scheduled. Your coach will add your next workout.", "Nada programado. Tu coach agregará tu próximo entrenamiento.")
            workoutDay = nil
            workoutNote = nil
        }
    }

    private func apply(_ n: LiveAPI.Nutrition, yesterday: Bool) {
        var meals: [Meal: [FoodItem]] = [:]
        for e in n.entries {
            let items = e.items ?? []
            let quantity: Loc
            if items.count == 1, let portion = items[0].portionText ?? items[0].grams.map({ "\(Int($0.rounded())) g" }) {
                quantity = Loc(same: portion)
            } else if items.count > 1 {
                quantity = Loc("\(items.count) foods", "\(items.count) alimentos")
            } else {
                quantity = Loc(same: "")
            }
            let item = FoodItem(name: Loc(same: e.title ?? items.first?.name ?? "Food"), quantity: quantity,
                                kcal: e.totals?.calories ?? 0, protein: e.totals?.proteinG ?? 0,
                                carbs: e.totals?.carbsG ?? 0, fat: e.totals?.fatG ?? 0, entryID: e.id)
            meals[LiveAPI.meal(e.meal), default: []].append(item)
        }
        if yesterday {
            mealsYesterdayBase = meals
            return
        }
        mealsTodayBase = meals
        addedFoods = [:]
        hideNumbers = n.hideNumbers ?? false
        nutritionNote = n.coachNote
        if !hideNumbers, let t = n.targets, let kcal = t.calories, kcal > 0 {
            targets = MacroTargets(kcal: kcal, protein: t.proteinG ?? 0, carbs: t.carbsG ?? 0, fat: t.fatG ?? 0)
        } else {
            targets = nil
        }
        habitList = (n.habits ?? []).map { h in
            let streak = h.streak ?? 0
            return Habit(id: h.id, title: Loc(same: h.title), detail: streak > 1 ? Loc("\(streak)-day streak", "Racha de \(streak) días") : nil)
        }
        habits = Dictionary(uniqueKeysWithValues: (n.habits ?? []).map { ($0.id, $0.done) })
        favoriteFoods = (n.favorites ?? []).map { f in
            FoodItem(name: Loc(same: f.title), quantity: Loc(same: ""), kcal: 0, protein: 0, carbs: 0, fat: 0, entryID: f.id)
        }
        photoLogging = n.features?.photo ?? false
        voiceLogging = n.features?.voice ?? false
    }

    private func apply(_ th: LiveAPI.Thread) {
        if let c = th.coach, !c.name.isEmpty {
            coachPerson.name = c.name
            coachPerson.photoURL = c.photoUrl
        }
        voiceNotes = th.features?.voiceNotes ?? false
        let known = Set(chatBase.compactMap(\.serverID))
        chatBase = th.messages.map { m in
            var message = ChatMessage(fromMe: m.from == "me", text: Loc(same: m.body ?? ""), time: LiveAPI.time(m.at))
            message.serverID = m.id
            if let v = m.voice {
                message.isVoice = true
                message.seconds = Int((v.durationS ?? 0).rounded())
                message.duration = VoiceMessageRow.clock(message.seconds ?? 0)
            }
            return message
        }
        // Messages sent from this phone are now in the thread.
        let serverIDs = Set(chatBase.compactMap(\.serverID))
        chatExtra.removeAll { $0.serverID.map(serverIDs.contains) ?? false }
        let fresh = chatBase.filter { !$0.fromMe && !known.contains($0.serverID ?? "") }
        if !known.isEmpty && !fresh.isEmpty && tab != .coach { readCoach = false }
        if let lastCoach = chatBase.last(where: { !$0.fromMe }) { lastCoachMessage = lastCoach.text }
    }

    private func apply(_ p: LiveAPI.Progress) {
        workoutsDone = p.workoutsDone
        weightPoints = p.weights.map(\.value)
        if let first = p.weights.first {
            weightStart = Loc("Since \(LiveAPI.day(first.date).en)", "Desde el \(LiveAPI.day(first.date).es)")
        }
        if let last = p.weights.last { weight = last.value; weightDraft = last.value }
        if let change = p.weightChange, change != 0 {
            let text = "\(change > 0 ? "+" : "−")\(Fmt.oneDecimal(abs(change))) lb"
            weightChangeText = Loc("\(text) since you started", "\(text) desde que empezaste")
        } else {
            weightChangeText = Loc("Log your weight to see your trend", "Registra tu peso para ver tu tendencia")
        }
        records = p.bests.map { b in
            let value = b.weight.map { "\(Fmt.trimmed($0)) lb" + (b.reps.map { " × \($0)" } ?? "") } ?? (b.reps.map { "\($0) reps" } ?? "")
            return ClientRecord(name: Loc(same: b.name), value: value, date: Loc(same: ""))
        }
        let latest = p.measurements.first
        measures = [latest?.waist ?? 0, latest?.hips ?? 0, latest?.chest ?? 0, latest?.arm ?? 0]
        measureDraft = measures.map { $0 > 0 ? $0 : 30 }
        progressPhotos = p.photos.map { ProgressPhotoItem(id: $0.id, url: $0.url, date: LiveAPI.day($0.takenAt)) }
    }

    private func apply(_ a: LiveAPI.Account) {
        mePerson.photoURL = a.client.photoUrl
        coachPerson.photoURL = a.coach.photoUrl
        if let plan = a.plan {
            let price = plan.priceCents > 0 ? Fmt.money(plan.priceCents / 100) : ""
            let per = plan.interval == "month" ? "/mo" : plan.interval == "week" ? "/wk" : ""
            let perES = plan.interval == "month" ? "/mes" : plan.interval == "week" ? "/sem" : ""
            planLine = price.isEmpty ? Loc(same: plan.name) : Loc("\(plan.name) · \(price)\(per)", "\(plan.name) · \(price)\(perES)")
        } else {
            planLine = Loc("No plan yet", "Aún sin plan")
        }
        if let sub = a.subscription, let end = sub.currentPeriodEnd {
            let d = LiveAPI.day(end)
            paidLine = sub.cancelAtPeriodEnd == true ? Loc("Ends \(d.en)", "Termina el \(d.es)") : Loc("Renews \(d.en)", "Se renueva el \(d.es)")
        } else {
            switch a.client.payStatus {
            case "paid": paidLine = Loc("Paid", "Pagado")
            case "failed": paidLine = Loc("Last payment didn’t go through", "El último pago no pasó")
            case "due": paidLine = Loc("Payment due", "Pago pendiente")
            default: paidLine = Loc("Your coach handles billing", "Tu coach se encarga del cobro")
            }
        }
    }

    // MARK: Workout

    func loadWorkoutThenStart() {
        guard let id = workoutAssignmentID, !workoutLoading else {
            if workoutAssignmentID == nil { toast.show(CLT.noWorkoutToday(lang)) }
            return
        }
        workoutLoading = true
        showQuickLog = false
        Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.workoutLoading = false }
            do {
                let d: LiveAPI.WorkoutDetail = try await self.api.get("/api/me/workouts/\(id)")
                self.useWorkout(d)
                guard !self.workout.isEmpty else {
                    self.toast.show(CLT.emptyWorkout(self.lang))
                    return
                }
                self.startWorkout()
            } catch {
                self.fail(error)
            }
        }
    }

    private func useWorkout(_ d: LiveAPI.WorkoutDetail) {
        workoutTitle = Loc(same: d.workout.name)
        workout = d.workout.exercises.map { ex in
            let first = ex.sets.first
            let reps = Int(first?.reps.value ?? 10)
            let weight = first?.weight.value ?? 0
            let timed = ex.sets.contains { Self.isTimedTarget($0.target) }
            let target = ex.sets.count > 1 ? "\(ex.sets.count) × \(first?.target ?? "")" : (first?.target ?? "")
            let cue = ex.notes?.isEmpty == false ? ex.notes! : (ex.howTo?.lines.first ?? "")
            var item = WorkoutExercise(name: Loc(same: ex.name), target: Loc(same: target), rest: Int(first?.rest?.value ?? 60),
                                       cue: Loc(same: cue), sets: ex.sets.count, weight: weight, reps: reps, isTimed: timed,
                                       last: Loc(same: ""), swaps: [])
            item.serverID = ex.exerciseId
            item.setTargets = ex.sets.map { SetEntry(weight: $0.weight.value ?? weight, reps: Int($0.reps.value ?? Double(reps))) }
            return item
        }
        sets = workout.map { $0.setTargets ?? Array(repeating: SetEntry(weight: $0.weight, reps: $0.reps), count: $0.sets) }
        bestWeight = [:]
        currentExercise = 0
        swapped = [:]
        workoutDone = d.assignment.status == "completed"
    }

    /// "40s", "30 sec", "1 min" are timed sets; "10", "8-10", "10 × 55 lb" are reps.
    static func isTimedTarget(_ target: String) -> Bool {
        let t = target.lowercased()
        if t.contains("lb") || t.contains("kg") || t.contains("rep") { return false }
        return t.contains("sec") || t.contains("min") || t.hasSuffix("s")
    }

    func saveWorkoutLive() {
        guard let id = workoutAssignmentID, !savingWorkout else { return }
        savingWorkout = true
        let soreScale = [1, 4, 7, 10]
        let payload: [String: Any] = [
            "sets": workout.enumerated().compactMap { pair -> [String: Any]? in
                guard let exID = pair.element.serverID, let logged = sets[safe: pair.offset] else { return nil }
                return ["exerciseId": exID, "sets": logged.map { ["weight": $0.weight, "reps": $0.reps, "done": $0.done] as [String: Any] }]
            },
            "rpe": min(10, max(1, effort)),
            "soreness": soreScale[safe: soreness] ?? 1
        ]
        Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.savingWorkout = false }
            do {
                let _: LiveAPI.Completed = try await self.api.post("/api/me/workouts/\(id)/complete", payload)
                self.restToken += 1
                self.restEndsAt = nil
                self.endDate = Date()
                self.showFinishSheet = false
                withAnimation(.snappy) { self.workoutDone = true }
                self.voice.speak(CLT.savedSayLive(self.mePerson.first)(self.lang))
                await self.loadLive()
            } catch {
                self.fail(error)
            }
        }
    }

    // MARK: Food

    private var logSource: String {
        switch logMode {
        case .photo: return "photo"
        case .voice: return "voice"
        case .barcode: return "barcode"
        case .search: return "search"
        }
    }

    @MainActor
    func searchFoodsLive(_ query: String) async {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2 else {
            foodSearchResults = []
            return
        }
        searchingFoods = true
        defer { searchingFoods = false }
        do {
            let encoded = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
            let r: LiveAPI.FoodResults = try await api.get("/api/foods/search?q=\(encoded)")
            guard q == foodQuery.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
            foodSearchResults = r.results.map { LiveAPI.food($0, source: ClientData.fromSearch) }
        } catch {
            foodSearchResults = []
        }
    }

    @MainActor
    func barcodeLive(_ code: String) async -> BarcodeLookup.Result {
        do {
            let r: LiveAPI.BarcodeAnswer = try await api.get("/api/foods/barcode/\(code)")
            return .found(LiveAPI.food(r.food, source: Loc("Barcode · Open Food Facts", "Código · Open Food Facts")))
        } catch let e as APIClient.APIError where e.status == 404 || e.status == 400 {
            return .notFound
        } catch {
            return .failed
        }
    }

    func analyzePhotoLive(_ image: UIImage, token: Int) {
        pendingPhotoToken = nil
        Task { @MainActor [weak self] in
            let jpeg = await Task.detached(priority: .userInitiated) { image.jpegForUpload(maxSide: 1600, quality: 0.8) }.value
            guard let self, token == self.logToken else { return }
            guard let jpeg else {
                self.photoReadFailed(CLT.photoUnreadable(self.lang))
                return
            }
            do {
                let r: LiveAPI.PhotoReading = try await self.api.upload("/api/me/food-photo", field: "photo", file: jpeg, filename: "meal.jpg", mimeType: "image/jpeg", timeout: 90)
                guard token == self.logToken else { return }
                self.pendingPhotoToken = r.photoToken
                let foods = r.items.map { LiveAPI.food($0, source: CLT.fromPhotoAssist) }
                if foods.isEmpty { self.photoReadFailed(CLT.notFoodPhoto(self.lang)) } else { self.showReviewLive(foods) }
            } catch {
                guard token == self.logToken else { return }
                self.photoReadFailed((error as? LocalizedError)?.errorDescription ?? CLT.notFoodPhoto(self.lang))
            }
        }
    }

    private func photoReadFailed(_ message: String) {
        toast.show(message)
        withAnimation(.snappy) {
            foodPhoto = nil
            logStage = .photo
        }
    }

    func matchFoodText(_ text: String, token: Int) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let r: LiveAPI.Matches = try await self.api.post("/api/me/food-text", ["text": text, "source": "voice", "transcribed": false])
                guard token == self.logToken else { return }
                self.showReviewLive(r.items.map { LiveAPI.food($0, source: CLT.fromVoiceAssist) })
            } catch {
                guard token == self.logToken else { return }
                self.fail(error)
                withAnimation(.snappy) { self.logStage = .voice }
            }
        }
    }

    private func showReviewLive(_ foods: [FoodItem]) {
        withAnimation(.snappy) {
            review = foods.map { ReviewItem(food: $0) }
            logStage = .review
        }
    }

    func saveReviewedFoodsLive() {
        let foods = review.map { $0.food.scaled($0.multiplier) }
        let meal = reviewMeal
        let byVoice = logMode == .voice
        var body: [String: Any] = [
            "meal": LiveAPI.serverMeal(meal),
            "source": logSource,
            "items": foods.map { f -> [String: Any] in
                var item: [String: Any] = ["name": f.name.en]
                if let g = f.grams { item["grams"] = (g * 10).rounded() / 10 }
                if !f.quantity.en.isEmpty { item["portionText"] = f.quantity.en }
                if let ref = f.foodRef { item["foodRef"] = ref }
                if let c = f.confidence { item["confidence"] = c }
                if !hideNumbers {
                    item["calories"] = (f.kcal * 10).rounded() / 10
                    item["proteinG"] = (f.protein * 10).rounded() / 10
                    item["carbsG"] = (f.carbs * 10).rounded() / 10
                    item["fatG"] = (f.fat * 10).rounded() / 10
                }
                return item
            }
        ]
        if logMode == .photo, let photo = pendingPhotoToken { body["photoToken"] = photo }
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let _: APIClient.Empty = try await self.api.post("/api/me/food-entries", body)
                self.pendingPhotoToken = nil
                self.review = []
                self.showFoodLogger = false
                self.foodDay = .today
                self.tab = .food
                self.foodPath = []
                let mealName = meal.name(self.lang).lowercased()
                self.toast.show(CLT.addedTo(mealName)(self.lang))
                if byVoice { self.voice.speak(CLT.addedTo(mealName)(self.lang)) }
                await self.loadLive()
            } catch {
                self.fail(error)
            }
        }
    }

    func logFavoriteLive(_ food: FoodItem) {
        guard let id = food.entryID else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let _: APIClient.Empty = try await self.api.post("/api/me/food-entries", ["meal": "snack", "source": "favorite", "favoriteId": id])
                self.toast.show(CLT.addedToSnacks(food.name(self.lang))(self.lang))
                await self.loadLive()
            } catch {
                self.fail(error)
            }
        }
    }

    /// Removes a logged food (the whole entry it was saved in).
    func deleteFood(_ food: FoodItem) {
        guard live, let id = food.entryID else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let _: APIClient.Empty = try await self.api.delete("/api/me/food-entries/\(id)")
                self.toast.show(CLT.foodRemoved(self.lang))
                await self.loadLive()
            } catch {
                self.fail(error)
            }
        }
    }

    func toggleHabitLive(_ habit: Habit, on: Bool) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let _: APIClient.Empty = try await self.api.post("/api/me/habits/\(habit.id)/check")
                if on { self.toast.show(CLT.habitDone(habit.title(self.lang))(self.lang)) }
            } catch {
                withAnimation(.snappy) { self.habits[habit.id] = !on }
                self.fail(error)
            }
        }
    }

    // MARK: Progress

    func saveWeightLive() {
        let value = (weightDraft * 10).rounded() / 10
        showWeightSheet = false
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let _: APIClient.Empty = try await self.api.post("/api/me/measurements", ["weight": value])
                self.weight = value
                self.toast.show(CLT.weightSaved(Fmt.oneDecimal(value))(self.lang))
                await self.loadLive()
            } catch {
                self.fail(error)
            }
        }
    }

    func saveMeasurementsLive() {
        let keys = ["waist", "hips", "chest", "arm"]
        var body: [String: Any] = [:]
        for (i, key) in keys.enumerated() { if let v = measureDraft[safe: i], v > 0 { body[key] = v } }
        showMeasureSheet = false
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let _: APIClient.Empty = try await self.api.post("/api/me/measurements", body)
                self.toast.show(CLT.measurementsSaved(self.lang))
                await self.loadLive()
            } catch {
                self.fail(error)
            }
        }
    }

    func addProgressPhoto(_ image: UIImage) {
        Task { @MainActor [weak self] in
            let jpeg = await Task.detached(priority: .userInitiated) { image.jpegForUpload(maxSide: 1600, quality: 0.82) }.value
            guard let self else { return }
            guard let jpeg else {
                self.toast.show(CLT.photoUnreadable(self.lang))
                return
            }
            do {
                let r: LiveAPI.ProgressPhotoSaved = try await self.api.upload("/api/me/photos", field: "photo", file: jpeg, filename: "progress.jpg", mimeType: "image/jpeg", fields: ["pose": "front"])
                PhotoCache.shared.store(image, for: r.photo.url)
                withAnimation(.snappy) {
                    self.progressPhotos.insert(ProgressPhotoItem(id: r.photo.id, url: r.photo.url, date: LiveAPI.day(r.photo.takenAt)), at: 0)
                }
                self.toast.show(CLT.photoAddedLive(self.coachPerson.first)(self.lang))
            } catch {
                self.fail(error)
            }
        }
    }

    func deleteProgressPhoto(_ photo: ProgressPhotoItem) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let _: APIClient.Empty = try await self.api.delete("/api/me/photos/\(photo.id)")
                withAnimation(.snappy) { self.progressPhotos.removeAll { $0.id == photo.id } }
                self.toast.show(CLT.photoDeleted(self.lang))
            } catch {
                self.fail(error)
            }
        }
    }

    // MARK: Coach chat

    func sendChatLive(_ text: String) {
        var message = ChatMessage(fromMe: true, text: Loc(same: text), time: CLT.sending)
        let localID = message.id
        message.serverID = nil
        withAnimation(.snappy) { chatExtra.append(message) }
        chatInput = ""
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let r: LiveAPI.MessageSent = try await self.api.post("/api/me/messages", ["body": text])
                if let i = self.chatExtra.firstIndex(where: { $0.id == localID }) {
                    self.chatExtra[i].serverID = r.message.id
                    self.chatExtra[i].time = CLT.delivered
                }
            } catch {
                self.chatExtra.removeAll { $0.id == localID }
                if self.chatInput.isEmpty { self.chatInput = text }
                self.fail(error)
            }
        }
    }

    func deliverVoiceMessageLive(_ recording: VoiceNoteRecorder.Recording) {
        guard voiceNotes else {
            toast.show(CLT.voiceNotesPro(lang))
            return
        }
        let seconds = max(1, Int(recording.seconds.rounded()))
        var message = ChatMessage(fromMe: true, text: Loc(same: recording.transcript), time: CLT.sending, isVoice: true,
                                  duration: VoiceMessageRow.clock(seconds))
        message.audioURL = recording.url
        message.seconds = seconds
        let localID = message.id
        withAnimation(.snappy) { chatExtra.append(message) }
        Haptics.tap()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let data = try Data(contentsOf: recording.url)
                var fields = ["durationMs": String(Int(recording.seconds * 1000))]
                if !recording.transcript.isEmpty { fields["hint"] = String(recording.transcript.prefix(500)) }
                let r: LiveAPI.MessageSent = try await self.api.upload("/api/me/voice-notes", field: "audio", file: data, filename: "voice.m4a", mimeType: "audio/mp4", fields: fields, timeout: 90)
                if let i = self.chatExtra.firstIndex(where: { $0.id == localID }) {
                    self.chatExtra[i].serverID = r.message.id
                    self.chatExtra[i].time = CLT.delivered
                    if let body = r.message.body, !body.isEmpty { self.chatExtra[i].text = Loc(same: body) }
                }
                self.toast.show(CLT.voiceNoteSent(self.lang))
            } catch {
                self.chatExtra.removeAll { $0.id == localID }
                self.fail(error)
            }
        }
    }

    /// A playable file for a voice message: the recording on this phone, or a copy from the server.
    @MainActor
    func voiceMessageURL(_ message: ChatMessage) async -> URL? {
        if let local = message.audioURL, FileManager.default.fileExists(atPath: local.path) { return local }
        guard live, let serverID = message.serverID else { return nil }
        let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("voice-notes", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        for ext in ["wav", "m4a", "mp3"] {
            let file = folder.appendingPathComponent("\(serverID).\(ext)")
            if FileManager.default.fileExists(atPath: file.path) { return file }
        }
        do {
            let link: LiveAPI.AudioLink = try await api.get("/api/me/messages/\(serverID)/audio?format=wav")
            guard let url = api.absoluteURL(link.url) else { return nil }
            let (data, response) = try await URLSession.shared.data(from: url)
            guard (response as? HTTPURLResponse)?.statusCode == 200, let ext = CoachStore.audioExtension(data) else { return nil }
            let saved = folder.appendingPathComponent("\(serverID).\(ext)")
            try data.write(to: saved, options: .atomic)
            return saved
        } catch {
            return nil
        }
    }

    /// New messages from the coach while the chat is open.
    @MainActor
    func refreshThread() async {
        guard live else { return }
        if let th: LiveAPI.Thread = try? await api.get("/api/me/thread") { apply(th) }
    }

    // MARK: Check-in

    func sendCheckInLive() {
        guard !sendingCheckIn else { return }
        let five = [2, 4, 6, 8, 10]
        let nutrition = [9, 6, 3]
        var body: [String: Any] = [
            "sleepHours": checkInSleep,
            "energy": five[safe: checkInAnswers["energy"] ?? 2] ?? 6,
            "stress": five[safe: checkInAnswers["stress"] ?? 2] ?? 6,
            "soreness": five[safe: checkInAnswers["sore"] ?? 1] ?? 4,
            "mood": five[safe: checkInMood] ?? 6,
            "nutrition": nutrition[safe: nutritionAnswer] ?? 6,
            "text": checkInNote.trimmingCharacters(in: .whitespacesAndNewlines)
        ]
        if weight > 0 { body["weight"] = weight }
        sendingCheckIn = true
        Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.sendingCheckIn = false }
            do {
                let _: APIClient.Empty = try await self.api.post("/api/me/checkins", body)
                withAnimation(.snappy) { self.checkInSent = true }
                self.checkInNote = ""
                self.voice.speak(CLT.checkInSentSayLive(self.coachPerson.first)(self.lang))
            } catch {
                self.fail(error)
            }
        }
    }

    // MARK: Me

    func changeProfilePhoto(_ image: UIImage) {
        pendingProfilePhoto = image
        uploadingPhoto = true
        Task { @MainActor [weak self] in
            let jpeg = await Task.detached(priority: .userInitiated) { image.jpegForUpload(maxSide: 640, quality: 0.85) }.value
            guard let self else { return }
            defer {
                self.uploadingPhoto = false
                self.pendingProfilePhoto = nil
            }
            guard let jpeg else {
                self.toast.show(CLT.photoUnreadable(self.lang))
                return
            }
            do {
                let r: LiveAPI.PhotoSaved = try await self.api.upload("/api/account/photo", field: "photo", file: jpeg, filename: "photo.jpg", mimeType: "image/jpeg")
                if let url = r.photoUrl { PhotoCache.shared.store(image, for: url) }
                self.mePerson.photoURL = r.photoUrl
                self.toast.show(CLT.profilePhotoSaved(self.coachPerson.first)(self.lang))
            } catch {
                self.fail(error)
            }
        }
    }

    func removeProfilePhoto() {
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let _: APIClient.Empty = try await self.api.delete("/api/account/photo")
                self.mePerson.photoURL = nil
                self.toast.show(CLT.profilePhotoRemoved(self.lang))
            } catch {
                self.fail(error)
            }
        }
    }

    /// Everything the client logged, as a file to save or share.
    @MainActor
    func exportData() async -> URL? {
        do {
            let data = try await api.getData("/api/me/export")
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("my-onejump-data.json")
            try data.write(to: file, options: .atomic)
            return file
        } catch {
            fail(error)
            return nil
        }
    }

    /// Deletes the client's account for good. Returns true when it's gone.
    @MainActor
    func deleteAccount() async -> Bool {
        do {
            let _: APIClient.Empty = try await api.post("/api/me/delete-account", ["confirm": "DELETE"])
            await api.logOut()
            settings.signOut()
            return true
        } catch {
            fail(error)
            return false
        }
    }

    @MainActor
    func logOut() async {
        stopListening()
        voice.stopSpeaking()
        await api.logOut()
        settings.signOut()
    }
}
