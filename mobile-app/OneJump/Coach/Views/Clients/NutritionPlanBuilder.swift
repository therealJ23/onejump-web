import SwiftUI

/// Client → Food: Assist builds a starting nutrition plan from the client's details and what the
/// coach typed or said. It's a draft only the coach sees; nothing reaches the client until
/// "Use this plan". The server holds the safety lines (never below resting needs, no numbers for
/// medical topics), so the numbers here are always a safe starting point the coach can change.
struct NutritionPlanBuilder: View {
    let client: CoachClient
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var edited: NutritionDraft?
    @State private var chosenHabits: Set<String> = []
    @State private var includeMealPlan = true
    @State private var reviewedTarget = false
    @FocusState private var typing: Bool

    var body: some View {
        Group {
            if let response = store.planDrafts[client.id], let draft = edited {
                draftCard(response, draft)
            } else {
                requestCard
            }
        }
        .onAppear { syncDraft() }
        .onChange(of: store.planDrafts[client.id]?.draft) { _, _ in syncDraft() }
    }

    /// Takes a fresh copy of Assist's draft for editing.
    private func syncDraft() {
        guard let response = store.planDrafts[client.id] else { edited = nil; return }
        edited = response.draft
        chosenHabits = Set(response.draft.habits)
        includeMealPlan = response.draft.mealPlan != nil
        reviewedTarget = false
    }

    // MARK: Ask

    private var requestCard: some View {
        let building = store.planBuilding.contains(client.id)
        let listening = store.listenMode == .dictation && store.voice.isListening
        return AssistCard(label: CL.buildTitle(lang)) {
            SubText(CL.buildSub(client.first)(lang))
            HStack(alignment: .top, spacing: 8) {
                TextField(CL.buildPlaceholder(lang), text: requestBinding, axis: .vertical)
                    .font(OJFont.body)
                    .lineLimit(2...6)
                    .focused($typing)
                    .padding(12)
                    .background(Palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
                Button {
                    typing = false
                    store.dictate { heard in
                        let current = store.planRequests[client.id] ?? ""
                        store.planRequests[client.id] = [current, heard].filter { !$0.isEmpty }.joined(separator: " ")
                    }
                } label: {
                    Image(systemName: listening ? "stop.fill" : "mic.fill")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(listening ? Color.white : Palette.ink)
                        .frame(width: 46, height: 46)
                        .background(listening ? Palette.crit : Palette.surface, in: Circle())
                        .overlay(Circle().strokeBorder(Palette.line2, lineWidth: listening ? 0 : 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(CL.talk(lang))
            }
            if listening {
                SubText(store.voice.heard.isEmpty ? CT.listening(lang) : "“\(store.voice.heard)”")
            }
            Button {
                typing = false
                Task { await store.buildNutritionPlan(for: client.id) }
            } label: {
                HStack(spacing: 8) {
                    if building { ProgressView().tint(Palette.deep) } else { AssistMark(size: 18, color: Palette.deep) }
                    Text(building ? CL.building(lang) : CL.buildButton(lang))
                }
            }
            .buttonStyle(.oj(.volt, fullWidth: true))
            .disabled(building)
        }
    }

    private var requestBinding: Binding<String> {
        Binding(
            get: { store.planRequests[client.id] ?? "" },
            set: { store.planRequests[client.id] = $0 }
        )
    }

    // MARK: The draft

    private func draftCard(_ response: NutritionDraftResponse, _ draft: NutritionDraft) -> some View {
        let saving = store.planSaving.contains(client.id)
        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                Pill(CL.draftOnlyYou(lang), tone: .ai)
                Spacer()
                Pill(CL.approach(draft.approach)(lang), tone: .info)
            }
            DraftText(draft.summary)

            if draft.needsProfessional {
                warning((draft.professionalReason.map { $0 + " " } ?? "") + CL.seeDietitian(lang), tone: .crit)
            }
            ForEach(response.notes, id: \.self) { note in
                SubText("• " + note)
            }

            if draft.calories != nil {
                HStack(spacing: 8) {
                    numberField(CL.caloriesShort(lang), "kcal", \.calories)
                    numberField(CL.proteinShort(lang), "g", \.proteinG)
                    numberField(CL.carbsShort(lang), "g", \.carbsG)
                    numberField(CL.fatShort(lang), "g", \.fatG)
                }
                if let rmr = response.estimate?.rmr {
                    SubText(lang == .spanish
                            ? "Necesidades en reposo: unas \(Fmt.grouped(rmr)) kcal. Assist nunca baja de ahí."
                            : "Resting needs: about \(Fmt.grouped(rmr)) kcal. Assist never goes below that.")
                }
            }

            if !draft.habits.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Eyebrow(CL.dailyHabits(lang))
                    ForEach(draft.habits, id: \.self) { habit in
                        Toggle(isOn: habitBinding(habit)) {
                            Text(habit).font(OJFont.body).foregroundStyle(Palette.ink)
                        }
                        .tint(Palette.good)
                    }
                }
            }

            if let plan = draft.mealPlan {
                VStack(alignment: .leading, spacing: 8) {
                    Toggle(isOn: $includeMealPlan) {
                        TitleSub(CL.includeMealPlan(lang), sub: CL.mealPlanDays(plan.name, plan.days.count)(lang))
                    }
                    .tint(Palette.good)
                    if includeMealPlan {
                        ForEach(Array(plan.days.enumerated()), id: \.offset) { pair in
                            dayCard(pair.element)
                        }
                    }
                }
                if let reminder = response.scopeReminder {
                    warning(reminder, tone: .warn)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(CL.noteForClient(lang))
                TextField("", text: noteBinding, axis: .vertical)
                    .font(OJFont.body)
                    .lineLimit(2...5)
                    .padding(12)
                    .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
            }

            if store.planNeedsReview.contains(client.id) {
                Toggle(isOn: $reviewedTarget) {
                    Text(CL.reviewedTarget(lang)).font(.archivo(14, .semibold)).foregroundStyle(Palette.crit)
                }
                .tint(Palette.crit)
            }

            VStack(spacing: 8) {
                Button {
                    guard let current = edited else { return }
                    let habits = current.habits.filter { chosenHabits.contains($0) }
                    Task {
                        await store.saveNutritionPlan(for: client.id, draft: current, habits: habits,
                                                      includeMealPlan: includeMealPlan && current.mealPlan != nil,
                                                      confirmLowTarget: reviewedTarget)
                    }
                } label: {
                    HStack(spacing: 8) {
                        if saving { ProgressView().tint(Palette.onPrimary) } else { Image(systemName: "checkmark") }
                        Text(saving ? CL.saving(lang) : CL.usePlan(lang))
                    }
                }
                .buttonStyle(.oj(.primary, fullWidth: true))
                .disabled(saving || (store.planNeedsReview.contains(client.id) && !reviewedTarget))

                HStack(spacing: 8) {
                    Button {
                        Task { await store.buildNutritionPlan(for: client.id) }
                    } label: {
                        Label(CL.tryAgainPlan(lang), systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.oj(.ghost, fullWidth: true))
                    .disabled(store.planBuilding.contains(client.id))
                    Button(CL.discard(lang)) {
                        withAnimation(.snappy) { store.planDrafts[client.id] = nil }
                    }
                    .buttonStyle(.oj(.ghost))
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.assistSoft, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Palette.assistLine, lineWidth: 1))
    }

    private func warning(_ text: String, tone: Tone) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(tone.foreground)
            Text(text).font(.archivo(13)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tone == .crit ? Palette.critTint : Palette.warnTint, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func numberField(_ label: String, _ unit: String, _ key: WritableKeyPath<NutritionDraft, Int?>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(label) (\(unit))").font(.archivo(11, .semibold)).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
            TextField("0", value: numberBinding(key), format: .number)
                .keyboardType(.numberPad)
                .font(.archivo(17, .heavy))
                .padding(.horizontal, 10)
                .frame(height: 42)
                .background(Palette.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func dayCard(_ day: NutritionDraft.Day) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(day.label).font(OJFont.title).foregroundStyle(Palette.ink)
            ForEach(Array(day.meals.enumerated()), id: \.offset) { pair in
                HStack(alignment: .top, spacing: 8) {
                    Text(mealName(pair.element.meal))
                        .font(.archivo(12, .bold))
                        .foregroundStyle(Palette.muted)
                        .frame(width: 74, alignment: .leading)
                    Text(pair.element.items.joined(separator: "; "))
                        .font(.archivo(14))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func mealName(_ key: String) -> String {
        switch key {
        case "breakfast": return CL.breakfast(lang)
        case "lunch": return CL.lunch(lang)
        case "dinner": return CL.dinner(lang)
        default: return CL.snack(lang)
        }
    }

    private func numberBinding(_ key: WritableKeyPath<NutritionDraft, Int?>) -> Binding<Int> {
        Binding(
            get: { edited?[keyPath: key] ?? 0 },
            set: { edited?[keyPath: key] = max(0, $0) }
        )
    }

    private func habitBinding(_ habit: String) -> Binding<Bool> {
        Binding(
            get: { chosenHabits.contains(habit) },
            set: { on in if on { chosenHabits.insert(habit) } else { chosenHabits.remove(habit) } }
        )
    }

    private var noteBinding: Binding<String> {
        Binding(
            get: { edited?.coachNote ?? "" },
            set: { edited?.coachNote = $0 }
        )
    }
}
