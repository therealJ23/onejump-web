import SwiftUI
import UIKit

/// Assist: the AI copilot. It answers out loud, drafts work, and asks for a spoken
/// "yes" before anything is sent. In the preview the answers are canned; in production
/// `reply(to:)` calls the OneJump server, which calls Claude with the coach's data.
extension CoachStore {

    // MARK: - Talking to Assist

    /// Sends a question (typed or spoken). A "yes"/"no" answers the pending card instead.
    func send(_ text: String) {
        let question = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, !thinking else { return }
        stopBriefing()

        if let pending = pendingIndex, let answer = YesNo.parse(question) {
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
        withAnimation(.snappy) {
            assistMessages.append(AssistMessage(fromMe: true, text: question))
            thinking = true
        }
        askText = ""
        pendingIndex = nil
        hint = ""
        if tab != .assist { go(.assist) }
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
        if let card = message.card, card.isOpen {
            pendingIndex = index
            let spoken = [message.say, card.ask].compactMap { $0 }.joined(separator: " ")
            voice.speak(spoken) { [weak self] in self?.askListen(index) }
        } else {
            voice.speak(message.say ?? message.text)
        }
    }

    /// Listens for "yes" or "no" to the card at `index`.
    func askListen(_ index: Int, force: Bool = false) {
        guard (force || pendingIndex == index), voiceOn else { return }
        pendingIndex = index
        listenMode = .confirm
        voice.listen(fallback: CoachData.sampleConfirm(lang)) { [weak self] heard in
            guard let self else { return }
            self.listenMode = nil
            guard self.pendingIndex == index else { return }
            if heard.isEmpty {
                self.pendingIndex = nil
                self.hint = CT.noCatchConfirm(self.lang)
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
        let next = CoachData.queue.first { item in
            (queueState[item.id] ?? .pending).isWaiting && !reviewSkip.contains(item.id)
        }
        guard let item = next else {
            pushAssistant(AssistMessage(fromMe: false, text: CT.allDoneSay(lang)))
            return
        }
        let c = client(item.id)
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
        withAnimation(.snappy) { assistMessages[index].card?.done = true }
        pendingIndex = nil
        hint = ""

        switch card.kind {
        case .lead:
            leadStage["jenna"] = .replied
        case .post:
            UIPasteboard.general.string = message.quote
        case .queueItem:
            if let id = card.queueID {
                withAnimation(.snappy) { queueState[id] = .sent }
            }
        case .queue, .program, .client:
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
                after(0.25) { [weak self] in self?.reviewNext() }
            }
        }

        if !voiceOn {
            if card.kind != .queue { toast.show(card.doneText) }
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
        let samples = CoachData.sampleVoiceQuestions
        let sample = samples[sampleIndex % samples.count](lang)
        sampleIndex += 1
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

    // MARK: - Answers

    /// Picks an answer for the question. (Production: ask the server.)
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
