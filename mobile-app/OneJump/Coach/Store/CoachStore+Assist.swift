import SwiftUI
import UIKit

/// Assist: the AI copilot. It answers out loud, drafts work, and asks for a spoken
/// "yes" before anything is sent.
///  - Demo: canned answers (below), nothing leaves the phone.
///  - Live: every question goes to the OneJump server, which asks Claude with the coach's own
///    data. When Assist prepares something (a message, a check-in reply, a nutrition plan…) it
///    reads it back and waits for a yes or no; the server decides what the answer was, and
///    anything with health details is never read aloud and needs a tap.
extension CoachStore {

    // MARK: - Talking to Assist

    /// Sends a question (typed or spoken). A "yes"/"no" answers the pending card instead.
    func send(_ text: String) {
        let question = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, !thinking else { return }
        stopBriefing()

        let pendingCard = pendingIndex.flatMap { assistMessages[safe: $0]?.card }
        // Demo cards (and the Needs-you review) answer yes/no right here; live proposals ask the server.
        if let pending = pendingIndex, pendingCard?.kind != .proposal, let answer = YesNo.parse(question) {
            voice.stopSpeaking()
            voice.stopListening()
            listenMode = nil
            assistMessages.append(AssistMessage(fromMe: true, text: question))
            askText = ""
            if answer == .yes { confirmCard(pending) } else { dismissCard(pending) }
            return
        }

        voice.stopSpeaking()
        voice.stopListening()
        listenMode = nil
        let history = assistHistory()
        let proposalID = pendingCard?.isOpen == true ? pendingCard?.proposalID : nil
        withAnimation(.snappy) {
            assistMessages.append(AssistMessage(fromMe: true, text: question))
            thinking = true
        }
        askText = ""
        pendingIndex = nil
        hint = ""
        if tab != .assist { go(.assist) }

        if live {
            Task { @MainActor [weak self] in await self?.askServer(question, history: history, proposalID: proposalID) }
            return
        }
        after(1.1) { [weak self] in
            guard let self else { return }
            let answer = self.reply(to: question)
            withAnimation(.snappy) { self.thinking = false }
            self.pushAssistant(answer)
        }
    }

    func pushAssistant(_ message: AssistMessage) {
        withAnimation(.snappy) { assistMessages.append(message) }
        let index = assistMessages.count - 1
        after(0.06) { [weak self] in self?.afterReply(index) }
    }

    /// Reads the answer aloud. If it has an action, asks for a yes/no and listens.
    private func afterReply(_ index: Int) {
        guard let message = assistMessages[safe: index], voiceOn else { return }
        if let card = message.card, card.isOpen, card.kind != .proposal || card.voiceOK {
            pendingIndex = index
            let spoken = [message.say, card.ask.isEmpty ? nil : card.ask].compactMap { $0 }.joined(separator: " ")
            voice.speak(spoken) { [weak self] in self?.askListen(index) }
        } else {
            voice.speak(message.say ?? message.text)
        }
    }

    /// Listens for "yes" or "no" to the card at `index`.
    func askListen(_ index: Int, force: Bool = false) {
        guard (force || pendingIndex == index), voiceOn else { return }
        // Screenshot runs (fixture data) don't open the microphone on their own: the speech
        // permission prompt would cover the screen. A tap on the mic still works.
        if Fixtures.isOn && !force { return }
        pendingIndex = index
        listenMode = .confirm
        let isProposal = assistMessages[safe: index]?.card?.kind == .proposal
        voice.listen(fallback: live ? "" : CoachData.sampleConfirm(lang)) { [weak self] heard in
            guard let self else { return }
            self.listenMode = nil
            guard self.pendingIndex == index else { return }
            if heard.isEmpty {
                self.hint = CT.noCatchConfirm(self.lang)
                if !isProposal { self.pendingIndex = nil }
                return
            }
            if isProposal {
                // The server decides: a clear yes or no approves or cancels; anything else is a new question.
                self.send(heard)
                return
            }
            withAnimation(.snappy) { self.assistMessages.append(AssistMessage(fromMe: true, text: heard)) }
            switch YesNo.parse(heard) {
            case .yes?: self.confirmCard(index)
            case .no?: self.dismissCard(index)
            case nil:
                self.voice.speak(CT.yesOrNo(self.lang)) { [weak self] in self?.askListen(index) }
            }
        }
    }

    /// Goes through the Needs-you drafts one by one, out loud.
    func reviewNext() {
        let next = data.queue.first { item in
            (queueState[item.id] ?? .pending).isWaiting && !reviewSkip.contains(item.id)
        }
        guard let item = next else {
            pushAssistant(AssistMessage(fromMe: false, text: CT.allDoneSay(lang)))
            return
        }
        let c = client(item.clientID)
        let draftText = draft(for: item.id)
        let card = ActionCard(
            kind: .queueItem, queueID: item.id,
            label: CT.sendThisTo(c.first)(lang), sub: CT.queueItemSub(lang), button: CT.sendButton(lang),
            doneText: CT.sentTo(c.first)(lang), ask: CT.queueItemAsk(c.first, draftText)(lang),
            doneSay: CT.sentSay(lang), noSay: CT.keepSay(lang)
        )
        pushAssistant(AssistMessage(
            fromMe: false,
            text: CT.messageTo(c.first, item.reason(lang).lowercased())(lang),
            quote: draftText,
            card: card
        ))
    }

    /// The user accepted the action ("yes", or tapped the button).
    func confirmCard(_ index: Int) {
        guard let message = assistMessages[safe: index], let card = message.card, !card.done else { return }
        voice.stopListening()
        listenMode = nil
        pendingIndex = nil
        hint = ""

        if card.kind == .proposal, let id = card.proposalID {
            withAnimation(.snappy) {
                assistMessages[index].card?.done = true
                assistMessages[index].card?.doneText = CL.working(lang)
            }
            Task { @MainActor [weak self] in await self?.confirmProposal(at: index, id: id) }
            return
        }

        withAnimation(.snappy) { assistMessages[index].card?.done = true }
        switch card.kind {
        case .lead:
            leadStage["jenna"] = .replied
        case .post:
            UIPasteboard.general.string = message.quote
        case .queueItem:
            if let id = card.queueID { queueAction(id, to: .sent) }
        case .queue, .program, .client, .proposal:
            break
        }

        let voiceOn = self.voiceOn
        let then: () -> Void = { [weak self] in
            guard let self else { return }
            if card.kind == .queue {
                if voiceOn {
                    self.reviewSkip = []
                    self.reviewNext()
                } else {
                    after(0.6) { [weak self] in self?.go(.today) }
                }
            }
            if card.kind == .queueItem && voiceOn {
                after(0.6) { [weak self] in self?.reviewNext() }
            }
        }

        if !voiceOn {
            if card.kind != .queue && card.kind != .queueItem { toast.show(card.doneText) }
            then()
            return
        }
        voice.speak(card.doneSay) { then() }
    }

    /// The user said no (or tapped "Not now").
    func dismissCard(_ index: Int) {
        guard let card = assistMessages[safe: index]?.card else { return }
        voice.stopListening()
        listenMode = nil
        withAnimation(.snappy) { assistMessages[index].card?.dismissed = true }
        pendingIndex = nil
        hint = ""
        if card.kind == .proposal, let id = card.proposalID {
            Task { @MainActor [weak self] in await self?.cancelProposal(id) }
            if voiceOn { voice.speak(CL.wontDoIt(lang)) }
            return
        }
        if card.kind == .queueItem, let id = card.queueID { reviewSkip.insert(id) }
        let then: () -> Void = { [weak self] in
            guard let self else { return }
            if card.kind == .queueItem && self.voiceOn { self.reviewNext() }
        }
        if voiceOn {
            voice.speak(card.noSay) { then() }
        } else {
            then()
        }
    }

    /// The big volt orb: talk to Assist.
    func tapOrb() {
        stopBriefing()
        if tab != .assist || !assistPath.isEmpty { go(.assist) }
        if voice.isSpeaking { voice.stopSpeaking() }
        if voice.isListening {
            voice.stopListening()
            listenMode = nil
            return
        }
        if thinking { return }
        if let pending = pendingIndex {
            askListen(pending, force: true)
            return
        }
        hint = ""
        listenMode = .question
        var sample = ""
        if !live {
            let samples = CoachData.sampleVoiceQuestions
            sample = samples[sampleIndex % samples.count](lang)
            sampleIndex += 1
        }
        voice.listen(fallback: sample) { [weak self] text in
            guard let self else { return }
            self.listenMode = nil
            if text.isEmpty {
                self.hint = CT.noCatch(self.lang)
            } else {
                self.send(text)
            }
        }
    }

    func toggleVoice() {
        voiceOn.toggle()
        if !voiceOn {
            voice.stopSpeaking()
            voice.stopListening()
            listenMode = nil
        }
        pendingIndex = nil
        hint = ""
        toast.show(voiceOn ? CT.voiceOnToast(lang) : CT.voiceOffToast(lang))
    }

    func newChat() {
        voice.stopSpeaking()
        voice.stopListening()
        listenMode = nil
        withAnimation(.snappy) {
            assistMessages = []
            thinking = false
            pendingIndex = nil
        }
    }

    /// The last turns, so follow-ups like "what about her?" work.
    func assistHistory() -> [[String: String]] {
        let turns = assistMessages.filter { !$0.text.isEmpty }.suffix(12)
        return turns.map { ["role": $0.fromMe ? "user" : "assistant", "text": String($0.text.prefix(1500))] }
    }

    // MARK: - Live answers

    @MainActor
    func askServer(_ question: String, history: [[String: String]], proposalID: String?) async {
        var body: [String: Any] = ["question": question, "voice": voiceOn, "history": history, "lang": lang == .spanish ? "es" : "en"]
        if let proposalID { body["pendingProposalId"] = proposalID }
        do {
            let r: AskResponse = try await APIClient.shared.post("/api/assist/ask", body, timeout: 90)
            withAnimation(.snappy) { thinking = false }
            if let d = r.decided { markProposal(d.id, confirmed: d.confirmed, message: d.message) }
            if r.action == "briefing" {
                pushAssistant(AssistMessage(fromMe: false, text: CL.startingBriefing(lang), say: ""))
                go(.today)
                after(0.4) { [weak self] in self?.toggleBriefing() }
                return
            }
            pushAssistant(message(from: r))
            if r.decided?.confirmed == true { Task { @MainActor [weak self] in await self?.refresh() } }
        } catch {
            withAnimation(.snappy) { thinking = false }
            let text = (error as? LocalizedError)?.errorDescription ?? CL.somethingWrong(lang)
            pushAssistant(AssistMessage(fromMe: false, text: text, say: voiceOn ? text : nil))
        }
    }

    /// Assist's answer as a chat line, with a card for anything it prepared.
    private func message(from r: AskResponse) -> AssistMessage {
        let text = (r.answerText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        var m = AssistMessage(fromMe: false, text: text.isEmpty ? (r.proposals?.isEmpty == false ? CL.hereItIs(lang) : (r.spokenText ?? "")) : text)
        m.say = r.spokenText
        if let p = r.proposals?.last {
            m.card = proposalCard(p, awaiting: r.awaiting == p.id)
            m.quote = quote(for: p)
        }
        return m
    }

    private func quote(for p: ProposalDTO) -> String? {
        switch p.type {
        case "send_message", "reply_checkin", "add_note": return p.payload.text
        case "send_reminders": return p.payload.template
        default: return nil
        }
    }

    private func proposalCard(_ p: ProposalDTO, awaiting: Bool) -> ActionCard {
        let d = p.payload
        let person = d.clientName ?? d.name ?? ""
        let first = person.components(separatedBy: " ").first ?? person
        let label: String, button: String
        var details: [String] = []
        switch p.type {
        case "send_message":
            label = CL.messageTo(person)(lang); button = CL.confirmSend(lang)
        case "reply_checkin":
            label = CL.replyToCheckIn(first)(lang); button = CL.confirmSend(lang)
        case "add_note":
            label = CL.noteFor(first)(lang); button = CL.saveNote(lang)
        case "create_lead":
            label = CL.newLead(d.name ?? "")(lang); button = CL.addLead(lang)
            if let goal = d.goal, !goal.isEmpty { details.append(goal) }
        case "send_reminders":
            let n = d.recipients?.count ?? 0
            label = CL.reminderTo(n)(lang); button = CL.sendAll(n)(lang)
            if let names = d.recipients, !names.isEmpty { details.append(names.joined(separator: ", ")) }
        case "assign_program":
            label = CL.startOn(first, d.programName ?? "")(lang); button = CL.startProgram(lang)
            if let w = d.weeks, let days = d.daysPerWeek { details.append(CL.programMeta(w, days)(lang)) }
        case "nutrition_plan":
            label = CL.planFor(first)(lang); button = CL.usePlan(lang)
            if let draft = d.draft {
                if !draft.summary.isEmpty { details.append(draft.summary) }
                if let cal = draft.calories, let protein = draft.proteinG {
                    details.append(CL.macroLine(cal, protein, draft.carbsG ?? 0, draft.fatG ?? 0)(lang))
                }
                if !draft.habits.isEmpty { details.append("• " + draft.habits.joined(separator: "\n• ")) }
                if let plan = draft.mealPlan { details.append(CL.mealPlanDays(plan.name, plan.days.count)(lang)) }
                if draft.needsProfessional { details.append(CL.seeDietitian(lang)) }
            }
            details.append(contentsOf: d.notes ?? [])
            if let reminder = d.scopeReminder { details.append(reminder) }
        default:
            label = p.summary; button = CL.confirm(lang)
        }
        let voiceOK = awaiting && d.voiceOk != false
        return ActionCard(
            kind: .proposal, queueID: nil,
            label: label, sub: voiceOK ? CL.sayYesOrTap(lang) : CL.tapToConfirm(lang), button: button,
            doneText: "", ask: "", doneSay: "", noSay: "",
            proposalID: p.id, voiceOK: voiceOK, details: details
        )
    }

    /// The server says a proposal was approved or cancelled (by a spoken or typed yes/no).
    private func markProposal(_ id: String, confirmed: Bool, message: String?) {
        guard let index = assistMessages.lastIndex(where: { $0.card?.proposalID == id }) else { return }
        withAnimation(.snappy) {
            if confirmed {
                assistMessages[index].card?.done = true
                assistMessages[index].card?.doneText = message ?? CT.done(lang)
            } else {
                assistMessages[index].card?.dismissed = true
            }
        }
        if pendingIndex == index { pendingIndex = nil }
    }

    @MainActor
    func confirmProposal(at index: Int, id: String) async {
        do {
            let r: APIClient.OK = try await APIClient.shared.post("/api/assist/proposals/\(id)/confirm", timeout: 60)
            let done = r.message ?? CT.done(lang)
            withAnimation(.snappy) { assistMessages[index].card?.doneText = done }
            if voiceOn { voice.speak(CL.doneSay(done)(lang)) } else { toast.show(done) }
            await refresh()
        } catch {
            withAnimation(.snappy) {
                assistMessages[index].card?.done = false
                assistMessages[index].card?.dismissed = true
            }
            let text = (error as? LocalizedError)?.errorDescription ?? CL.somethingWrong(lang)
            pushAssistant(AssistMessage(fromMe: false, text: text, say: voiceOn ? text : nil))
        }
    }

    @MainActor
    func cancelProposal(_ id: String) async {
        let _: APIClient.Empty? = try? await APIClient.shared.post("/api/assist/proposals/\(id)/cancel")
    }

    // MARK: - Answers (demo)

    /// Picks an answer for the question.
    func reply(to question: String) -> AssistMessage {
        var message = rawReply(question)
        if message.say == nil { message.say = message.text }
        return message
    }

    private func rawReply(_ question: String) -> AssistMessage {
        let q = question.lowercased().folding(options: .diacriticInsensitive, locale: nil)
        let named = allClients.first { q.contains($0.first.lowercased()) }

        func matches(_ pattern: String) -> Bool {
            q.range(of: pattern, options: .regularExpression) != nil
        }

        if let c = named, matches(#"(program|block|bloque|workout|entren|plan|adjust|ajust|rutina|week|semana)"#) {
            return programReply(for: c)
        }
        if matches(#"(business|negocio|month|\bmes\b|money|dinero|revenue|ingreso|paid|pago|income|mrr|payment|\bmake\b|gane)"#) {
            return resolve(CoachData.replyBusiness)
        }
        if matches(#"(post|spots|lugares|cupos|promo|instagram|caption|market|publica)"#) {
            return resolve(CoachData.replyPost)
        }
        if let c = named {
            return clientReply(for: c)
        }
        if matches(#"(lead|prospect|prospecto|sign up|new client|interesad)"#) {
            return resolve(CoachData.replyLeads)
        }
        if matches(#"(who|quien|today|hoy|need|necesit|risk|riesgo|slipping|atras|urgent|priority|priorid)"#) {
            return resolve(CoachData.replyToday)
        }
        return resolve(CoachData.replyHelp)
    }

    /// Turns a canned answer into a chat message in the current language.
    private func resolve(_ template: AssistTemplate) -> AssistMessage {
        let l = lang
        var message = AssistMessage(fromMe: false, text: template.text(l))
        message.points = template.points.map { (bold: $0.bold(l), text: $0.text(l)) }
        message.table = template.table.map { (week: $0.week(l), sets: $0.sets(l), intensity: $0.intensity(l)) }
        message.quote = template.quote.map { $0(l) }
        message.foot = template.foot.map { $0(l) }
        message.say = template.say(l)
        if let card = template.card {
            message.card = ActionCard(
                kind: card.kind, queueID: nil,
                label: card.label(l), sub: card.sub(l), button: card.button(l), doneText: card.doneText(l),
                ask: card.ask(l), doneSay: card.doneSay(l), noSay: CT.leaveIt(l)
            )
        }
        return message
    }

    private func programReply(for c: CoachClient) -> AssistMessage {
        if c.id == "maya" { return resolve(CoachData.replyMayaProgram) }
        let l = lang
        var message = AssistMessage(fromMe: false, text: CT.programText(c.first, c.goal)(l))
        let adherence = c.adherence.map { "\($0)%" } ?? CT.noData(l)
        message.points = [
            (bold: CT.programSchedule(l), text: CT.programScheduleText(c.first)(l)),
            (bold: CT.programProgression(l), text: CT.programProgressionText(l)),
            (bold: CT.programAdherence(l), text: CT.programAdherenceText(c.first, adherence)(l))
        ]
        message.table = [
            (week: CT.weekN(1)(l), sets: "3 × 10", intensity: "RPE 7"),
            (week: CT.weekN(2)(l), sets: "4 × 8", intensity: "RPE 7.5"),
            (week: CT.weekN(3)(l), sets: "4 × 6", intensity: "RPE 8.5"),
            (week: CT.weekN(4)(l), sets: CT.deload(l), intensity: "RPE 6")
        ]
        message.say = CT.programSay(c.first)(l)
        message.card = ActionCard(
            kind: .program, queueID: nil,
            label: CT.programLabel(c.first)(l), sub: CT.programSub(l), button: CT.addDraft(l),
            doneText: CT.addedDraft(l), ask: CT.programAsk(c.first)(l), doneSay: CT.programDoneSay(l), noSay: CT.leaveIt(l)
        )
        return message
    }

    private func clientReply(for c: CoachClient) -> AssistMessage {
        let l = lang
        let status = c.kind.label(l).lowercased()
        let adherence = c.adherence.map { CT.clientAdherence($0)(l) } ?? "."
        var message = AssistMessage(fromMe: false, text: "\(c.name): \(status)\(adherence)")
        let weightLine = c.weight == "—" ? CT.noData(l) + "." : "\(c.weight) lb (\(c.weightTotal(l)))."
        message.points = [
            (bold: CT.whatsHappening(l), text: c.insight(l)),
            (bold: CT.weightPoint(l), text: weightLine),
            (bold: CT.nextStep(l), text: c.suggest(l) + ".")
        ]
        message.say = "\(c.first): \(status). \(c.insight(l))"
        message.card = ActionCard(
            kind: .client, queueID: nil,
            label: c.suggest(l), sub: CT.putInQueue(l), button: CT.createDraft(l), doneText: CT.draftAdded(l),
            ask: CT.clientAsk(c.suggest)(l), doneSay: CT.clientDoneSay(l), noSay: CT.leaveIt(l)
        )
        return message
    }
}
