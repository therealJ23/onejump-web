import SwiftUI
import UIKit

enum CoachTab: Hashable {
    case today, clients, assist, inbox, more
}

/// Every screen you can push inside a coach tab.
enum CoachRoute: Hashable {
    case client(String)
    case thread(String)
    case checkIn(String)
    case payments, leads, programs, workoutBuilder, library, nutrition, automations, settings, billing
    case program(String)
    case exercise(String)
}

enum InboxSegment: Hashable { case messages, checkIns }

enum ClientDetailTab: Hashable { case overview, program, food, progress, notes }

enum ListenMode { case question, confirm, dictation }

/// Is the coach's real business on screen yet?
enum LoadState: Equatable { case loading, ready, failed(String) }

/// Name, initials and color for anyone in the inbox (clients and leads).
struct PersonInfo {
    let name: String
    let initials: String
    let avatar: UInt32
    let sub: Loc
}

/// All state and actions for the coach app.
/// Views read from it and call its methods; nothing else changes the data.
///
/// Two modes, same screens:
///  - demo (`live == false`): Alex Rivera's sample business, nothing leaves the phone;
///  - live: the signed-in coach's real business from the server. Actions call the same API the
///    web app uses (see CoachStore+Live.swift), so both stay in sync.
@Observable
final class CoachStore {
    let settings: AppSettings
    let toast = ToastCenter()
    /// Signed in to the real server (false = the demo with sample data).
    let live: Bool
    /// Everything the screens show.
    var data: CoachSnapshot
    var loadState: LoadState
    @ObservationIgnored var lastLoaded: Date?
    @ObservationIgnored var pendingLink: String?

    var voice: VoiceService { settings.voice }
    var lang: AppLanguage { settings.language }

    // MARK: Navigation
    var tab: CoachTab = .today
    var todayPath: [CoachRoute] = []
    var clientsPath: [CoachRoute] = []
    var assistPath: [CoachRoute] = []
    var inboxPath: [CoachRoute] = []
    var morePath: [CoachRoute] = []
    var inboxSegment: InboxSegment = .messages
    var clientDetailTab: ClientDetailTab = .overview
    var showAddClient = false

    // MARK: Clients
    var extraClients: [CoachClient] = []
    var clientFilter: ClientFilter = .all
    var clientSearch = ""
    var notes: [String: [ClientNote]] = [:]
    /// Live client pages, loaded when opened.
    var details: [String: ClientDetailData] = [:]

    // MARK: Needs-you queue
    var queueState: [String: QueueState] = [:]
    var editedDrafts: [String: String] = [:]
    var lastQueueAction: (id: String, state: QueueState)?
    var queueExitEdge: Edge = .trailing
    @ObservationIgnored var queueBusy = false

    // MARK: Morning briefing
    var briefingPlaying = false
    var briefingLine = -1
    var briefingLoading = false
    @ObservationIgnored var briefingToken = 0

    // MARK: Assist
    var assistMessages: [AssistMessage] = []
    var askText = ""
    var thinking = false
    var pendingIndex: Int?
    var hint = ""
    var voiceOn = true
    var listenMode: ListenMode?
    @ObservationIgnored var reviewSkip: Set<String> = []
    @ObservationIgnored var sampleIndex = 0

    // MARK: Messages
    var extraThreadMessages: [String: [ThreadMessage]] = [:]
    /// Live conversations, loaded when opened.
    var liveThreads: [String: [ThreadMessage]] = [:]
    var readThreads: Set<String> = []
    var usedSuggestion: Set<String> = []
    var replyFromSuggestion: Set<String> = []
    var showOriginal: Set<String> = []
    var threadReply = ""
    var recordingVoiceNote = false
    @ObservationIgnored var autoReplied: Set<String> = []

    // MARK: Check-ins
    var checkInState: [String: CheckInState] = [:]
    var checkInDrafts: [String: String] = [:]
    var actionsDone: Set<String> = []
    var nudgedMissing = false
    var sendingCheckIn: Set<String> = []

    // MARK: Business and settings
    var leadStage: [String: LeadStage] = [:]
    var paymentReminderSent = false
    var remindedPayments: Set<String> = []
    var selectedPlan = "pro"
    var autoTranslate = true
    var automations: [String: Bool] = [:]
    var notificationsOn: [String: Bool] = ["briefing": true, "checkins": true, "messages": true, "payments": true]
    var assistTone: AssistTone = .friendly
    var builderSets: [Int] = CoachData.builderWorkout.map(\.sets)
    var libraryFilter: MuscleGroup = .all
    var librarySearch = ""
    var revenueSelection = 5
    var adherenceSelection = 7

    // MARK: Nutrition plans (Assist builds one for a client)
    var planRequests: [String: String] = [:]
    var planDrafts: [String: NutritionDraftResponse] = [:]
    var planBuilding: Set<String> = []
    var planSaving: Set<String> = []
    var planNeedsReview: Set<String> = []

    init(settings: AppSettings, live: Bool = false) {
        self.settings = settings
        self.live = live
        if live {
            data = .empty(name: settings.coachName)
            loadState = .loading
        } else {
            data = .sample
            loadState = .ready
        }
        resetLocalState()
        // Launch argument used for previews and screenshots: -ojOpen "inbox" or "client:maya"
        let link = UserDefaults.standard.string(forKey: "ojOpen")
        if live {
            pendingLink = link // opened once the business has loaded (CoachRootView starts the load)
        } else if let link {
            open(link: link)
        }
    }

    /// Matches the screens' local state (what's pending, open, enabled) to the data.
    func resetLocalState() {
        var states: [String: QueueState] = [:]
        for item in data.queue { states[item.id] = queueState[item.id] == .skipped ? .skipped : .pending }
        queueState = states
        var open: [String: CheckInState] = [:]
        for id in data.checkInOrder { open[id] = checkInState[id] ?? .open }
        checkInState = open
        leadStage = Dictionary(uniqueKeysWithValues: data.leads.map { ($0.id, $0.stage) })
        automations = data.automationOn
        revenueSelection = max(0, data.revenue.count - 1)
        adherenceSelection = max(0, data.adherence.count - 1)
    }

    /// Opens a screen from a short link like "today", "inbox", "client:maya" or "thread:lucas".
    /// Ready for push notifications and universal links later.
    func open(link: String) {
        let parts = link.split(separator: ":", maxSplits: 1).map(String.init)
        var id = parts.count > 1 ? parts[1] : ""
        // Screenshots of the live screens: "client:first", "thread:first", "checkIn:first".
        if id == "first" {
            switch parts.first ?? "" {
            case "client": id = data.clients.first?.id ?? ""
            case "thread": id = data.threadOrder.first ?? ""
            case "checkIn": id = data.checkInOrder.first ?? ""
            default: break
            }
        }
        switch parts.first ?? "" {
        case "today": go(.today)
        case "clients": go(.clients)
        case "assist": go(.assist)
        case "inbox": go(.inbox)
        case "checkins": openInbox(.checkIns)
        case "more": go(.more)
        case "client": go(.clients); push(.client(id))
        case "food", "plan":
            let clientID = id.isEmpty || id == "first" ? (data.clients.first?.id ?? "") : id
            go(.clients); push(.client(clientID)); clientDetailTab = .food
            // Screenshots of the plan builder: "plan:" opens the Food tab with Assist's draft.
            if parts.first == "plan" { Task { @MainActor [weak self] in await self?.buildNutritionPlan(for: clientID) } }
        case "thread": go(.inbox); openThread(id)
        case "checkIn": openInbox(.checkIns); push(.checkIn(id))
        case "payments": go(.more); push(.payments)
        case "leads": go(.more); push(.leads)
        case "programs": go(.more); push(.programs)
        case "builder": go(.more); push(.workoutBuilder)
        case "library": go(.more); push(.library)
        case "nutrition": go(.more); push(.nutrition)
        case "automations": go(.more); push(.automations)
        case "settings": go(.more); push(.settings)
        case "billing": go(.more); push(.billing)
        case "ask": send(id)
        default: break
        }
    }

    // MARK: - Lookups

    var me: CoachMe { data.me }
    var allClients: [CoachClient] { data.clients + extraClients }

    func client(_ id: String) -> CoachClient {
        allClients.first { $0.id == id } ?? allClients.first ?? CoachData.clients[0]
    }

    func person(_ id: String) -> PersonInfo {
        if let lead = data.leadPeople[id] {
            return PersonInfo(name: lead.name, initials: lead.initials, avatar: lead.avatar, sub: lead.sub)
        }
        let c = client(id)
        return PersonInfo(name: c.name, initials: c.initials, avatar: c.avatar, sub: programLabel(for: c))
    }

    func programLabel(for c: CoachClient) -> Loc {
        if let label = c.programLabel { return label }
        return CT.weekOfProgram(data.programName(c.programID), c.week, c.weeks)
    }

    func queueItem(_ id: String) -> QueueItem? { data.queue.first { $0.id == id } }

    /// A client's page: the live one once loaded, otherwise the sample (demo) or a placeholder.
    func detail(_ clientID: String) -> ClientDetailData {
        if let d = details[clientID] { return d }
        let c = client(clientID)
        if !live { return .sample(for: c) }
        var d = ClientDetailData.placeholder(for: c)
        d.loaded = false
        return d
    }

    /// One check-in (live ids are check-in ids; the sample uses the client's id).
    func checkInReport(_ id: String) -> CheckInReport? {
        data.checkIns[id] ?? (live ? nil : CoachData.checkIns["maya"])
    }

    // MARK: - Counts (badges)

    var pendingQueue: [QueueItem] {
        data.queue.filter { (queueState[$0.id] ?? .pending).isWaiting }
    }

    var sentCount: Int { data.queue.filter { queueState[$0.id] == .sent }.count }
    var skippedCount: Int { data.queue.filter { queueState[$0.id] == .skipped }.count }

    var unreadCount: Int {
        data.threadOrder.filter { (data.threads[$0]?.unread ?? false) && !readThreads.contains($0) }.count
    }

    var openCheckInCount: Int {
        data.checkInOrder.filter { checkInState[$0] != .sent }.count
    }

    var newLeadCount: Int {
        data.leads.filter { leadStage[$0.id] == .new }.count
    }

    // MARK: - Navigation

    func go(_ tab: CoachTab) {
        self.tab = tab
        switch tab {
        case .today: todayPath = []
        case .clients: clientsPath = []
        case .assist: assistPath = []
        case .inbox: inboxPath = []
        case .more: morePath = []
        }
    }

    /// Opens a screen on top of the current tab.
    func push(_ route: CoachRoute) {
        if case .client(let id) = route {
            clientDetailTab = .overview
            if live { Task { @MainActor [weak self] in await self?.loadDetail(id) } }
        }
        if case .thread = route { threadReply = ""; recordingVoiceNote = false }
        if case .checkIn(let id) = route, live { Task { @MainActor [weak self] in await self?.loadCheckIn(id) } }
        switch tab {
        case .today: todayPath.append(route)
        case .clients: clientsPath.append(route)
        case .assist: assistPath.append(route)
        case .inbox: inboxPath.append(route)
        case .more: morePath.append(route)
        }
    }

    func openInbox(_ segment: InboxSegment) {
        inboxSegment = segment
        go(.inbox)
    }

    // MARK: - Language

    /// Switches the whole coach app (text, voice and listening) to another language.
    func setLanguage(_ language: AppLanguage) {
        guard language.isFullySupported else {
            toast.show(SharedText.langSoon(lang))
            return
        }
        guard language != lang else { return }
        stopBriefing()
        voice.stopSpeaking()
        voice.stopListening()
        listenMode = nil
        assistMessages = []
        pendingIndex = nil
        thinking = false
        hint = ""
        editedDrafts = [:]
        checkInDrafts = [:]
        threadReply = ""
        settings.language = language
        after(0.05) { [weak self] in
            guard let self else { return }
            self.toast.show(SharedText.appLanguageToast(self.lang))
        }
    }

    // MARK: - Needs-you queue

    func draft(for id: String) -> String {
        if let edited = editedDrafts[id] { return edited }
        return queueItem(id)?.draft(lang) ?? ""
    }

    /// Sends or skips the current draft; the card slides away and the next one comes in.
    /// Live: "send" approves the draft on the server (it goes to the client); "skip" only hides it
    /// on this phone, so it's still waiting on the web and comes back next time.
    func queueAction(_ id: String, to state: QueueState) {
        guard !queueBusy else { return }
        queueBusy = true
        queueExitEdge = state == .sent ? .trailing : .leading
        let item = queueItem(id)
        let first = client(item?.clientID ?? id).first
        let text = editedDrafts[id]
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            withAnimation(.spring(duration: 0.4, bounce: 0.15)) {
                self.queueState[id] = state
                self.lastQueueAction = (id, state)
            }
            if state == .sent {
                self.toast.show(CT.sentTo(first)(self.lang))
                if self.live, let insight = item?.insightID {
                    Task { @MainActor [weak self] in await self?.approveDraft(id, insightID: insight, text: text) }
                }
            } else {
                Haptics.tap()
            }
            after(0.45) { [weak self] in self?.queueBusy = false }
        }
    }

    func toggleEditing(_ id: String) {
        let current = queueState[id] ?? .pending
        if current == .editing {
            queueState[id] = .pending
        } else {
            if editedDrafts[id] == nil { editedDrafts[id] = draft(for: id) }
            queueState[id] = .editing
        }
    }

    func undoLastQueueAction() {
        guard let last = lastQueueAction else { return }
        queueExitEdge = .leading
        withAnimation(.spring(duration: 0.4, bounce: 0.15)) {
            queueState[last.id] = .pending
            lastQueueAction = nil
        }
        if live, last.state == .sent, let insight = queueItem(last.id)?.insightID {
            Task { @MainActor [weak self] in await self?.undoDraft(insightID: insight) }
        }
    }

    func reviewSkippedDrafts() {
        withAnimation(.spring(duration: 0.4)) {
            for (id, state) in queueState where state == .skipped {
                queueState[id] = .pending
            }
            lastQueueAction = nil
        }
    }

    // MARK: - Morning briefing (spoken in Assist's voice)

    func toggleBriefing() {
        if briefingPlaying {
            stopBriefing()
            return
        }
        if live && data.briefing.isEmpty {
            Task { @MainActor [weak self] in
                guard let self else { return }
                await self.loadBriefing()
                if !self.data.briefing.isEmpty { self.toggleBriefing() }
            }
            return
        }
        guard !data.briefing.isEmpty else { return }
        voice.stopListening()
        briefingToken += 1
        let token = briefingToken
        let total = data.briefing.count
        let start = (briefingLine < 0 || briefingLine >= total) ? 0 : briefingLine
        briefingPlaying = true
        playBriefingLine(start, token: token)
    }

    private func playBriefingLine(_ index: Int, token: Int) {
        guard token == briefingToken else { return }
        let lines = data.briefing
        guard index < lines.count else {
            briefingPlaying = false
            briefingLine = lines.count
            return
        }
        withAnimation(.easeOut(duration: 0.2)) { briefingLine = index }
        var text = lines[index](lang)
        // The live briefing already starts with "Good morning" and ends with "Have a great day."
        if !live {
            if index == 0 { text = CT.briefIntro(lang) + text }
            if index == lines.count - 1 { text += CT.briefOutro(lang) }
        }
        voice.speak(text) { [weak self] in
            after(0.25) { self?.playBriefingLine(index + 1, token: token) }
        }
    }

    func stopBriefing() {
        guard briefingPlaying else { return }
        briefingToken += 1
        voice.stopSpeaking()
        briefingPlaying = false
    }

    // MARK: - Messages

    func threadMessages(_ id: String) -> [ThreadMessage] {
        let base = liveThreads[id] ?? data.threads[id]?.messages ?? []
        return base + (extraThreadMessages[id] ?? [])
    }

    func openThread(_ id: String) {
        readThreads.insert(id)
        push(.thread(id))
        if live { Task { @MainActor [weak self] in await self?.loadThread(id) } }
    }

    func useSuggestion(in id: String) {
        guard let suggestion = data.threads[id]?.suggestion else { return }
        threadReply = suggestion(lang)
        usedSuggestion.insert(id)
        replyFromSuggestion.insert(id)
    }

    func sendReply(in id: String) {
        let text = threadReply.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let thread = data.threads[id]
        var message = ThreadMessage(fromMe: true, text: Loc(same: text), time: CT.now)
        if thread?.isForeign == true {
            message.sentInTheirLanguage = true
            if replyFromSuggestion.contains(id) { message.outgoingTranslation = thread?.suggestionOut }
        }
        withAnimation(.snappy) {
            extraThreadMessages[id, default: []].append(message)
        }
        threadReply = ""
        if live {
            let sentID = message.id
            Task { @MainActor [weak self] in await self?.sendMessage(text, to: id, localID: sentID) }
            return
        }
        if let reply = thread?.autoReply, !autoReplied.contains(id) {
            autoReplied.insert(id)
            after(2.2) { [weak self] in
                withAnimation(.snappy) { self?.extraThreadMessages[id, default: []].append(reply) }
            }
        }
    }

    /// Demo: records a pretend voice note. Live: the mic dictates into the message box instead.
    func toggleVoiceNote(in id: String) {
        if live {
            dictate(into: { [weak self] text in
                guard let self else { return }
                self.threadReply = [self.threadReply, text].filter { !$0.isEmpty }.joined(separator: " ")
            })
            return
        }
        if recordingVoiceNote {
            recordingVoiceNote = false
            let note = ThreadMessage(fromMe: true, text: CT.voiceNote, time: CT.now, isVoice: true)
            withAnimation(.snappy) { extraThreadMessages[id, default: []].append(note) }
            toast.show(CT.voiceNoteSent(lang))
        } else {
            recordingVoiceNote = true
        }
    }

    /// Listens once and hands back what was said (empty if nothing).
    func dictate(into deliver: @escaping (String) -> Void) {
        if voice.isListening, listenMode == .dictation {
            voice.stopListening()
            listenMode = nil
            return
        }
        stopBriefing()
        listenMode = .dictation
        voice.listen(fallback: "") { [weak self] heard in
            self?.listenMode = nil
            if !heard.isEmpty { deliver(heard) }
        }
    }

    func toggleOriginal(_ key: String) {
        if showOriginal.contains(key) { showOriginal.remove(key) } else { showOriginal.insert(key) }
    }

    // MARK: - Check-ins

    func checkInDraft(_ id: String) -> String {
        checkInDrafts[id] ?? checkInReport(id)?.draft(lang) ?? ""
    }

    func sendCheckInReply(_ id: String) {
        guard live else {
            withAnimation(.snappy) { checkInState[id] = .sent }
            toast.show(CT.replySentTo(client(id).first)(lang))
            return
        }
        Task { @MainActor [weak self] in await self?.replyToCheckIn(id) }
    }

    func applyAction(_ action: CheckInAction, for checkInID: String) {
        withAnimation(.snappy) { _ = actionsDone.insert(checkInID + ":" + action.id) }
        toast.show(CT.actionDone(action.title)(lang))
        if live { Task { @MainActor [weak self] in await self?.applyCheckInAction(action, checkInID: checkInID) } }
    }

    func nudgeMissingCheckIns() {
        withAnimation(.snappy) { nudgedMissing = true }
        toast.show(live ? CL.remindersSent(data.missingCheckIns.count)(lang) : CT.reminderSentToast(lang))
        if live { Task { @MainActor [weak self] in await self?.remindMissing() } }
    }

    // MARK: - Clients

    func addNote(_ text: String, for clientID: String) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        withAnimation(.snappy) {
            notes[clientID, default: []].insert(ClientNote(date: CT.todayShort, text: Loc(same: clean)), at: 0)
        }
        toast.show(CT.noteSaved(lang))
        if live { Task { @MainActor [weak self] in await self?.saveNote(clean, for: clientID) } }
    }

    enum InvitePackage: String, CaseIterable { case online, hybrid, inPerson }

    /// Adds an invited client. Returns false if the name or email is missing.
    @discardableResult
    func invite(name: String, email: String, package: InvitePackage) -> Bool {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let emailOK = cleanEmail.range(of: #"^\S+@\S+\.\S+$"#, options: .regularExpression) != nil
        guard !cleanName.isEmpty, emailOK else { return false }
        let parts = cleanName.split(separator: " ").map(String.init)
        let first = parts.first ?? cleanName
        let initials = (String(first.prefix(1)) + (parts.count > 1 ? String(parts[1].prefix(1)) : "")).uppercased()
        let packageLabel: Loc
        switch package {
        case .online: packageLabel = CT.pkgOnline
        case .hybrid: packageLabel = CT.pkgHybrid
        case .inPerson: packageLabel = CT.pkgInPerson
        }
        let newClient = CoachClient(
            id: "new\(extraClients.count + 1)", name: cleanName, first: first, initials: initials,
            avatar: CoachData.inviteColors[extraClients.count % CoachData.inviteColors.count],
            programID: "gfs", week: 0, weeks: 8, kind: .invited, tone: .info, adherence: nil, trainedThisWeek: false,
            programLabel: CT.invitedLabel(packageLabel), goal: "—", package: packageLabel, since: CT.todayShort,
            weight: "—", weightChange: "—", weightTotal: CT.noData, streak: "0", spark: [16, 16],
            insight: CT.waitingInvite(first), suggest: CT.resendInvite, next: "—", billing: "—", nutritionNote: "—",
            noLogs: true, filters: [.new]
        )
        if live {
            let mode: String
            switch package {
            case .online: mode = "Online"
            case .hybrid: mode = "Hybrid"
            case .inPerson: mode = "In person"
            }
            Task { @MainActor [weak self] in await self?.addClient(name: cleanName, email: cleanEmail, mode: mode) }
            return true
        }
        withAnimation(.snappy) { extraClients.append(newClient) }
        toast.show(CT.inviteSent(first)(lang))
        return true
    }

    // MARK: - Leads and payments

    func sendLeadReply(_ lead: Lead) {
        withAnimation(.snappy) { leadStage[lead.id] = .replied }
        let first = lead.name.components(separatedBy: " ").first ?? lead.name
        if live {
            // Leads write in from Instagram, the booking page and so on: copy the reply to paste there.
            UIPasteboard.general.string = lead.draft(lang)
            toast.show(CL.leadReplyCopied(first)(lang))
            Task { @MainActor [weak self] in await self?.setLeadStage(lead.id, "contacted") }
            return
        }
        toast.show(CT.sentTo(first)(lang))
    }

    func bookLeadCall(_ lead: Lead) {
        withAnimation(.snappy) { leadStage[lead.id] = .booked }
        if live {
            toast.show(CL.callBooked(lang))
            Task { @MainActor [weak self] in await self?.setLeadStage(lead.id, "consult") }
            return
        }
        toast.show(CT.bookingSent(lang))
    }

    var bookingLink: String {
        live ? (data.me.bookingURL.hasPrefix("http") ? data.me.bookingURL : "https://" + data.me.bookingURL) : "https://onejumpfit.com/alex"
    }

    func copyBookingLink() {
        UIPasteboard.general.string = bookingLink
        toast.show(CT.linkCopied(lang))
    }

    /// Demo: the sample's one overdue invoice.
    func sendPaymentReminder() {
        withAnimation(.snappy) {
            paymentReminderSent = true
            queueState["sofia"] = .sent
        }
        toast.show(CT.reminderSentToSofia(lang))
    }

    /// Live: the card-update reminder for one failed payment.
    func remindPayment(_ item: PaymentAttention) {
        withAnimation(.snappy) { _ = remindedPayments.insert(item.id) }
        toast.show(CL.reminderSentTo(item.name.components(separatedBy: " ").first ?? item.name)(lang))
        Task { @MainActor [weak self] in await self?.sendPaymentReminder(paymentID: item.id) }
    }

    func setAutomation(_ id: String, on: Bool) {
        automations[id] = on
        if live { Task { @MainActor [weak self] in await self?.saveAutomation(id, on: on) } }
    }

    /// Shows an error from the server in plain words.
    func showError(_ error: Error) {
        toast.show((error as? LocalizedError)?.errorDescription ?? CL.somethingWrong(lang))
    }
}
