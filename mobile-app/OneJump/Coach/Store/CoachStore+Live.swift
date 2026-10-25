import SwiftUI
import UIKit

/// The signed-in coach's real business: loading it from the server and sending every action
/// through the same API the web app uses. Screens never call the server themselves.
extension CoachStore {

    private var api: APIClient { APIClient.shared }

    // MARK: - Loading

    /// Loads (or reloads) everything the screens show.
    @MainActor
    func refresh() async {
        guard live else { return }
        do {
            let dto: LiveCoachDTO = try await api.get("/api/mobile/coach", timeout: 45)
            var snapshot = CoachSnapshot(live: dto, keepingSuggestions: CoachSnapshot.liveSuggestions)
            // Today's briefing (loaded separately) stays; a new day starts fresh.
            if let day = briefingDay, Calendar.current.isDateInToday(day) { snapshot.briefing = data.briefing }
            withAnimation(.snappy) {
                data = snapshot
                resetLocalState()
                extraClients = []
                loadState = .ready
            }
            settings.coachName = snapshot.me.name
            lastLoaded = Date()
            // Things sent from this phone are now in the server's data.
            extraThreadMessages = [:]
            if let link = pendingLink {
                pendingLink = nil
                open(link: link)
            }
            // The briefing and its voice get ready in the background, so play starts right away.
            Task { @MainActor [weak self] in await self?.prepareBriefing() }
            // Assist gets ready too: speech recognition expects these names, the server primes
            // the AI, and Assist's common lines are fetched so they play without waiting.
            updateSpeechHints()
            Task { @MainActor [weak self] in await self?.warmAssist() }
            voice.prefetch([AVT.listeningSay(lang), CL.wontDoIt(lang)])
        } catch {
            if (error as? APIClient.APIError)?.isLoggedOut == true { return }
            if loadState == .ready {
                showError(error)
            } else {
                loadState = .failed((error as? LocalizedError)?.errorDescription ?? CL.somethingWrong(lang))
            }
        }
    }

    /// Reloads if the data is more than a minute old (the app came back to the front).
    @MainActor
    func refreshIfStale() async {
        guard live, loadState == .ready else { return }
        if let last = lastLoaded, Date().timeIntervalSince(last) < 60 { return }
        await refresh()
    }

    @MainActor
    func loadDetail(_ clientID: String) async {
        guard live else { return }
        do {
            let dto: LiveClientDetailDTO = try await api.get("/api/mobile/coach/clients/\(clientID)")
            details[clientID] = dto.detail
        } catch {
            showError(error)
        }
    }

    @MainActor
    func loadThread(_ clientID: String) async {
        guard live else { return }
        do {
            let dto: LiveThreadDTO = try await api.get("/api/mobile/coach/threads/\(clientID)")
            liveThreads[clientID] = dto.messagesForApp
            extraThreadMessages[clientID] = []
        } catch {
            showError(error)
        }
    }

    /// Opens a check-in: Assist writes its summary and reply the first time (a few seconds).
    @MainActor
    func loadCheckIn(_ id: String) async {
        guard live else { return }
        do {
            let dto: CheckInDTO = try await api.get("/api/mobile/coach/checkins/\(id)", timeout: 60)
            data.checkIns[id] = dto.report
        } catch {
            showError(error)
        }
    }

    @MainActor
    func loadBriefing(quiet: Bool = false) async {
        guard live, !briefingLoading else { return }
        if !quiet { withAnimation(.snappy) { briefingLoading = true } }
        defer { withAnimation(.snappy) { briefingLoading = false } }
        do {
            let dto: BriefingDTO = try await api.get("/api/briefing/today", timeout: 60)
            data.briefing = dto.briefing.lines.map { Loc(same: $0) }
            briefingDay = Date()
        } catch {
            if !quiet { showError(error) }
        }
    }

    // MARK: - Drafts

    @MainActor
    func approveDraft(_ id: String, insightID: String, text: String?) async {
        do {
            let _: APIClient.OK = try await api.post("/api/insights/\(insightID)/approve", text.map { ["text": $0] as [String: Any] } ?? [:])
        } catch {
            withAnimation(.snappy) { queueState[id] = .pending }
            showError(error)
        }
    }

    @MainActor
    func undoDraft(insightID: String) async {
        do {
            let _: APIClient.OK = try await api.post("/api/insights/\(insightID)/undo")
            toast.show(CL.undone(lang))
        } catch {
            showError(error)
        }
    }

    // MARK: - Messages and check-ins

    @MainActor
    func sendMessage(_ text: String, to clientID: String, localID: UUID) async {
        do {
            let _: APIClient.Empty = try await api.post("/api/threads/\(clientID)/messages", ["body": text])
        } catch {
            extraThreadMessages[clientID]?.removeAll { $0.id == localID }
            threadReply = text
            showError(error)
        }
    }

    /// Uploads a recorded voice message; the server writes out what was said.
    @MainActor
    func uploadVoiceMessage(_ recording: VoiceNoteRecorder.Recording, to clientID: String, localID: UUID) async {
        struct Sent: Decodable {
            struct Message: Decodable { let id: String; let body: String? }
            let message: Message
        }
        do {
            let data = try Data(contentsOf: recording.url)
            let r: Sent = try await api.upload("/api/threads/\(clientID)/voice-notes", field: "audio", file: data, filename: "voice.m4a", mimeType: "audio/mp4",
                                               fields: ["durationMs": String(Int(recording.seconds * 1000))], timeout: 90)
            if let i = extraThreadMessages[clientID]?.firstIndex(where: { $0.id == localID }) {
                extraThreadMessages[clientID]?[i].serverID = r.message.id
                extraThreadMessages[clientID]?[i].pending = false
                if let body = r.message.body, !body.isEmpty { extraThreadMessages[clientID]?[i].text = Loc(same: body) }
            }
            toast.show(SharedText.voiceMessageSent(lang))
        } catch {
            extraThreadMessages[clientID]?.removeAll { $0.id == localID }
            showError(error)
        }
    }

    @MainActor
    func replyToCheckIn(_ id: String) async {
        guard let report = checkInReport(id) else { return }
        guard let insight = report.insightID else {
            toast.show(CL.assistStillWriting(lang))
            await loadCheckIn(id)
            return
        }
        let text = checkInDraft(id).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        sendingCheckIn.insert(id)
        defer { sendingCheckIn.remove(id) }
        do {
            let _: APIClient.OK = try await api.post("/api/checkins/\(id)/reply", ["insightId": insight, "text": text])
            withAnimation(.snappy) { checkInState[id] = .sent }
            toast.show(CT.replySentTo(client(report.clientID).first)(lang))
        } catch {
            showError(error)
        }
    }

    @MainActor
    func applyCheckInAction(_ action: CheckInAction, checkInID: String) async {
        do {
            let r: APIClient.OK = try await api.post("/api/checkins/\(checkInID)/actions/\(action.id)/apply")
            if let message = r.message, !message.isEmpty, message != "Nothing to change." { toast.show(message) }
        } catch {
            actionsDone.remove(checkInID + ":" + action.id)
            showError(error)
        }
    }

    @MainActor
    func remindMissing() async {
        let ids = data.missingCheckIns.map(\.clientID)
        guard !ids.isEmpty else { return }
        do {
            let _: APIClient.OK = try await api.post("/api/checkins/remind", ["clientIds": ids])
        } catch {
            nudgedMissing = false
            showError(error)
        }
    }

    // MARK: - Clients, leads, payments, automations

    @MainActor
    func saveNote(_ text: String, for clientID: String) async {
        do {
            let _: APIClient.Empty = try await api.post("/api/clients/\(clientID)/notes", ["body": text])
            await loadDetail(clientID)
            notes[clientID] = [] // now part of the loaded page
        } catch {
            notes[clientID]?.removeAll { $0.text.en == text }
            showError(error)
        }
    }

    @MainActor
    func addClient(name: String, email: String, mode: String) async {
        do {
            let r: NewClientResponse = try await api.post("/api/clients", ["name": name, "email": email, "mode": mode, "sendInvite": true])
            let first = name.components(separatedBy: " ").first ?? name
            if r.emailed == true {
                toast.show(CT.inviteSent(first)(lang))
            } else if let link = r.inviteLink {
                // Email isn't set up yet: the coach sends the link themselves.
                UIPasteboard.general.string = link
                toast.show(CL.inviteLinkCopied(first)(lang))
            } else {
                toast.show(CL.clientAdded(first)(lang))
            }
            await refresh()
        } catch {
            showError(error)
        }
    }

    @MainActor
    func setLeadStage(_ id: String, _ stage: String) async {
        do {
            let _: APIClient.Empty = try await api.patch("/api/leads/\(id)", ["stage": stage])
        } catch {
            withAnimation(.snappy) { leadStage[id] = .new }
            showError(error)
        }
    }

    @MainActor
    func sendPaymentReminder(paymentID: String) async {
        do {
            let _: APIClient.OK = try await api.post("/api/payments/\(paymentID)/remind")
        } catch {
            remindedPayments.remove(paymentID)
            showError(error)
        }
    }

    @MainActor
    func saveAutomation(_ id: String, on: Bool) async {
        do {
            let _: APIClient.Empty = try await api.patch("/api/automations/\(id)", ["enabled": on])
        } catch {
            automations[id] = !on
            showError(error)
        }
    }

    // MARK: - Assist builds a nutrition plan

    /// Asks Assist for a starting plan for one client, from what the coach typed or said.
    @MainActor
    func buildNutritionPlan(for clientID: String) async {
        let request = (planRequests[clientID] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        planBuilding.insert(clientID)
        defer { planBuilding.remove(clientID) }
        if !live {
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            planDrafts[clientID] = NutritionDraftResponse.sample(for: client(clientID), lang: lang)
            return
        }
        do {
            let r: NutritionDraftResponse = try await api.post("/api/clients/\(clientID)/nutrition-plan/assist", ["request": request, "lang": lang == .spanish ? "es" : "en"], timeout: 90)
            withAnimation(.snappy) { planDrafts[clientID] = r }
            planNeedsReview.remove(clientID)
        } catch {
            showError(error)
        }
    }

    /// Saves the plan as the coach left it: targets, the chosen habits and (optionally) the meal plan.
    @MainActor
    func saveNutritionPlan(for clientID: String, draft: NutritionDraft, habits: [String], includeMealPlan: Bool, confirmLowTarget: Bool = false) async {
        let first = client(clientID).first
        if !live {
            planDrafts[clientID] = nil
            toast.show(CL.planSaved(first)(lang))
            return
        }
        planSaving.insert(clientID)
        defer { planSaving.remove(clientID) }
        do {
            let body = draft.body(habits: habits, includeMealPlan: includeMealPlan, confirmLowTarget: confirmLowTarget)
            let _: APIClient.Empty = try await api.post("/api/clients/\(clientID)/nutrition-plan/apply-draft", body)
            withAnimation(.snappy) { planDrafts[clientID] = nil }
            planRequests[clientID] = nil
            planNeedsReview.remove(clientID)
            toast.show(CL.planSaved(first)(lang))
            await loadDetail(clientID)
        } catch {
            if (error as? APIClient.APIError)?.code == "low_target" { planNeedsReview.insert(clientID) }
            showError(error)
        }
    }

    // MARK: - Signing out

    @MainActor
    func logOut() async {
        endVoiceMode()
        voice.stopSpeaking()
        voice.stopListening()
        await api.logOut()
        settings.signOut()
    }
}

extension NutritionDraftResponse {
    /// The demo's plan (no server), shaped like Assist's.
    static func sample(for c: CoachClient, lang: AppLanguage) -> NutritionDraftResponse {
        let es = lang == .spanish
        let day = { (label: String, a: String, b: String) in
            NutritionDraft.Day(label: label, meals: [
                .init(meal: "breakfast", items: [es ? "2 huevos + 1 tostada integral" : "2 eggs + 1 slice whole-grain toast"]),
                .init(meal: "lunch", items: [es ? "Bowl de arroz con \(a) y vegetales" : "Rice bowl with \(a) and vegetables"]),
                .init(meal: "snack", items: [es ? "Una fruta + un puñado de nueces" : "A piece of fruit + a handful of nuts"]),
                .init(meal: "dinner", items: [es ? "\(b) con papas y ensalada" : "\(b) with potatoes and salad"])
            ])
        }
        let draft = NutritionDraft(
            summary: es ? "Plan inicial para \(c.first): unas 2,100 kcal y 150 g de proteína al día, según su peso, estatura, edad y actividad. Revisa y ajusta lo que quieras."
                        : "Starting plan for \(c.first): about 2,100 kcal and 150 g protein a day, from their weight, height, age and activity. Review and adjust anything.",
            approach: "targets", calories: 2100, proteinG: 150, carbsG: 220, fatG: 70,
            habits: es ? ["Proteína en cada comida", "Vegetales en almuerzo y cena", "8 vasos de agua al día"] : ["Protein at every meal", "Vegetables at lunch and dinner", "8 glasses of water a day"],
            mealPlan: NutritionDraft.MealPlan(name: es ? "Plan de \(c.first)" : "\(c.first)’s plan", days: [
                day(es ? "Día 1" : "Day 1", es ? "pollo" : "chicken", es ? "Pescado" : "Fish"),
                day(es ? "Día 2" : "Day 2", es ? "pescado" : "fish", es ? "Huevos" : "Eggs"),
                day(es ? "Día 3" : "Day 3", es ? "pollo" : "chicken", es ? "Carne magra" : "Lean beef")
            ]),
            coachNote: es ? "¡\(c.first), aquí está tu plan para empezar! Lo importante es la constancia." : "\(c.first), here’s your plan to get started! Consistency beats perfection.",
            needsProfessional: false, professionalReason: nil
        )
        return NutritionDraftResponse(draft: draft, notes: [], scopeReminder: es ? "En algunos estados, los planes de comidas personalizados requieren licencia de nutricionista." : "In some states, individualized meal plans require a dietitian license. Check your state’s rules, or refer to a registered dietitian.", estimate: nil)
    }
}
