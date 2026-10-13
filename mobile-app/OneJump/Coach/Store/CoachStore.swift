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

enum ListenMode { case question, confirm }

/// Name, initials and color for anyone in the inbox (clients and leads).
struct PersonInfo {
    let name: String
    let initials: String
    let avatar: UInt32
    let sub: Loc
}

/// All state and actions for the coach app.
/// Views read from it and call its methods; nothing else changes the data.
@Observable
final class CoachStore {
    let settings: AppSettings
    let toast = ToastCenter()

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

    // MARK: Needs-you queue
    var queueState: [String: QueueState] = Dictionary(uniqueKeysWithValues: CoachData.queue.map { ($0.id, QueueState.pending) })
    var editedDrafts: [String: String] = [:]
    var lastQueueAction: (id: String, state: QueueState)?
    var queueExitEdge: Edge = .trailing
    @ObservationIgnored var queueBusy = false

    // MARK: Morning briefing
    var briefingPlaying = false
    var briefingLine = -1
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
    var readThreads: Set<String> = []
    var usedSuggestion: Set<String> = []
    var replyFromSuggestion: Set<String> = []
    var showOriginal: Set<String> = []
    var threadReply = ""
    var recordingVoiceNote = false
    @ObservationIgnored var autoReplied: Set<String> = []

    // MARK: Check-ins
    var checkInState: [String: CheckInState] = Dictionary(uniqueKeysWithValues: CoachData.checkInOrder.map { ($0, CheckInState.open) })
    var checkInDrafts: [String: String] = [:]
    var actionsDone: Set<String> = []
    var nudgedMissing = false

    // MARK: Business and settings
    var leadStage: [String: LeadStage] = CoachData.initialLeadStages
    var paymentReminderSent = false
    var selectedPlan = "pro"
    var autoTranslate = true
    var automations: [String: Bool] = CoachData.initialAutomations
    var notificationsOn: [String: Bool] = ["briefing": true, "checkins": true, "messages": true, "payments": true]
    var assistTone: AssistTone = .friendly
    var builderSets: [Int] = CoachData.builderWorkout.map(\.sets)
    var libraryFilter: MuscleGroup = .all
    var librarySearch = ""
    var revenueSelection = 5
    var adherenceSelection = 7

    init(settings: AppSettings) {
        self.settings = settings
        // Launch argument used for previews and screenshots: -ojOpen "inbox" or "client:maya"
        if let link = UserDefaults.standard.string(forKey: "ojOpen") {
            open(link: link)
        }
    }

    /// Opens a screen from a short link like "today", "inbox", "client:maya" or "thread:lucas".
    /// Ready for push notifications and universal links later.
    func open(link: String) {
        let parts = link.split(separator: ":", maxSplits: 1).map(String.init)
        let id = parts.count > 1 ? parts[1] : ""
        switch parts.first ?? "" {
        case "today": go(.today)
        case "clients": go(.clients)
        case "assist": go(.assist)
        case "inbox": go(.inbox)
        case "checkins": openInbox(.checkIns)
        case "more": go(.more)
        case "client": go(.clients); push(.client(id))
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

    var allClients: [CoachClient] { CoachData.clients + extraClients }

    func client(_ id: String) -> CoachClient {
        allClients.first { $0.id == id } ?? CoachData.clients[0]
    }

    func person(_ id: String) -> PersonInfo {
        if let lead = CoachData.leadPeople[id] {
            return PersonInfo(name: lead.name, initials: lead.initials, avatar: lead.avatar, sub: lead.sub)
        }
        let c = client(id)
        return PersonInfo(name: c.name, initials: c.initials, avatar: c.avatar, sub: programLabel(for: c))
    }

    func programLabel(for c: CoachClient) -> Loc {
        if let label = c.programLabel { return label }
        return CT.weekOfProgram(CoachData.programName(c.programID), c.week, c.weeks)
    }

    // MARK: - Counts (badges)

    var pendingQueue: [QueueItem] {
        CoachData.queue.filter { (queueState[$0.id] ?? .pending).isWaiting }
    }

    var sentCount: Int { CoachData.queue.filter { queueState[$0.id] == .sent }.count }
    var skippedCount: Int { CoachData.queue.filter { queueState[$0.id] == .skipped }.count }

    var unreadCount: Int {
        CoachData.threadOrder.filter { (CoachData.threads[$0]?.unread ?? false) && !readThreads.contains($0) }.count
    }

    var openCheckInCount: Int {
        CoachData.checkInOrder.filter { checkInState[$0] != .sent }.count
    }

    var newLeadCount: Int {
        CoachData.leads.filter { leadStage[$0.id] == .new }.count
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
        if case .client = route { clientDetailTab = .overview }
        if case .thread = route { threadReply = ""; recordingVoiceNote = false }
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
        return CoachData.queue.first { $0.id == id }?.draft(lang) ?? ""
    }

    /// Sends or skips the current draft; the card slides away and the next one comes in.
    func queueAction(_ id: String, to state: QueueState) {
        guard !queueBusy else { return }
        queueBusy = true
        queueExitEdge = state == .sent ? .trailing : .leading
        let first = client(id).first
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            withAnimation(.spring(duration: 0.4, bounce: 0.15)) {
                self.queueState[id] = state
                self.lastQueueAction = (id, state)
            }
            if state == .sent {
                self.toast.show(CT.sentTo(first)(self.lang))
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
        voice.stopListening()
        briefingToken += 1
        let token = briefingToken
        let total = CoachData.briefing.count
        let start = (briefingLine < 0 || briefingLine >= total) ? 0 : briefingLine
        briefingPlaying = true
        playBriefingLine(start, token: token)
    }

    private func playBriefingLine(_ index: Int, token: Int) {
        guard token == briefingToken else { return }
        let lines = CoachData.briefing
        guard index < lines.count else {
            briefingPlaying = false
            briefingLine = lines.count
            return
        }
        withAnimation(.easeOut(duration: 0.2)) { briefingLine = index }
        var text = lines[index](lang)
        if index == 0 { text = CT.briefIntro(lang) + text }
        if index == lines.count - 1 { text += CT.briefOutro(lang) }
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
        (CoachData.threads[id]?.messages ?? []) + (extraThreadMessages[id] ?? [])
    }

    func openThread(_ id: String) {
        readThreads.insert(id)
        push(.thread(id))
    }

    func useSuggestion(in id: String) {
        guard let suggestion = CoachData.threads[id]?.suggestion else { return }
        threadReply = suggestion(lang)
        usedSuggestion.insert(id)
        replyFromSuggestion.insert(id)
    }

    func sendReply(in id: String) {
        let text = threadReply.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let thread = CoachData.threads[id]
        var message = ThreadMessage(fromMe: true, text: Loc(same: text), time: CT.now)
        if thread?.isForeign == true {
            message.sentInTheirLanguage = true
            if replyFromSuggestion.contains(id) { message.outgoingTranslation = thread?.suggestionOut }
        }
        withAnimation(.snappy) {
            extraThreadMessages[id, default: []].append(message)
        }
        threadReply = ""
        if let reply = thread?.autoReply, !autoReplied.contains(id) {
            autoReplied.insert(id)
            after(2.2) { [weak self] in
                withAnimation(.snappy) { self?.extraThreadMessages[id, default: []].append(reply) }
            }
        }
    }

    func toggleVoiceNote(in id: String) {
        if recordingVoiceNote {
            recordingVoiceNote = false
            let note = ThreadMessage(fromMe: true, text: CT.voiceNote, time: CT.now, isVoice: true)
            withAnimation(.snappy) { extraThreadMessages[id, default: []].append(note) }
            toast.show(CT.voiceNoteSent(lang))
        } else {
            recordingVoiceNote = true
        }
    }

    func toggleOriginal(_ key: String) {
        if showOriginal.contains(key) { showOriginal.remove(key) } else { showOriginal.insert(key) }
    }

    // MARK: - Check-ins

    func checkInDraft(_ id: String) -> String {
        checkInDrafts[id] ?? CoachData.checkIns[id]?.draft(lang) ?? ""
    }

    func sendCheckInReply(_ id: String) {
        withAnimation(.snappy) { checkInState[id] = .sent }
        toast.show(CT.replySentTo(client(id).first)(lang))
    }

    func applyAction(_ action: CheckInAction, for checkInID: String) {
        withAnimation(.snappy) { _ = actionsDone.insert(checkInID + ":" + action.id) }
        toast.show(CT.actionDone(action.title)(lang))
    }

    func nudgeMissingCheckIns() {
        withAnimation(.snappy) { nudgedMissing = true }
        toast.show(CT.reminderSentToast(lang))
    }

    // MARK: - Clients

    func addNote(_ text: String, for clientID: String) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        withAnimation(.snappy) {
            notes[clientID, default: []].insert(ClientNote(date: CT.todayShort, text: Loc(same: clean)), at: 0)
        }
        toast.show(CT.noteSaved(lang))
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
        withAnimation(.snappy) { extraClients.append(newClient) }
        toast.show(CT.inviteSent(first)(lang))
        return true
    }

    // MARK: - Leads and payments

    func sendLeadReply(_ lead: Lead) {
        withAnimation(.snappy) { leadStage[lead.id] = .replied }
        toast.show(CT.sentTo(lead.name.components(separatedBy: " ").first ?? lead.name)(lang))
    }

    func bookLeadCall(_ lead: Lead) {
        withAnimation(.snappy) { leadStage[lead.id] = .booked }
        toast.show(CT.bookingSent(lang))
    }

    func copyBookingLink() {
        UIPasteboard.general.string = "https://onejumpfit.com/alex"
        toast.show(CT.linkCopied(lang))
    }

    func sendPaymentReminder() {
        withAnimation(.snappy) {
            paymentReminderSent = true
            queueState["sofia"] = .sent
        }
        toast.show(CT.reminderSentToSofia(lang))
    }
}
