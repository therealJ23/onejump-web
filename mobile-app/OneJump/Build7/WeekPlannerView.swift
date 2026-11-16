import SwiftUI

/// A program laid out by week: 7 days, each with its workout picture. Drag a workout onto another
/// day (or use its menu) to move it; the two swap if that day had one. "Copy week" repeats a week.
struct WeekPlannerView: View {
    let programID: String
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var week = 1
    @State private var plan: PlanWeek?
    @State private var errorText: String?
    @State private var copying = false
    @State private var dropTarget: Int?
    private var es: Bool { lang == .spanish }

    var body: some View {
        ScreenScroll {
            if let plan {
                Text(plan.program.name).font(OJFont.h3).foregroundStyle(Palette.ink)
                ChipScroller {
                    ForEach(1...max(1, plan.program.weeks), id: \.self) { w in
                        Chip(label: es ? "Semana \(w)" : "Week \(w)", isOn: week == w) { week = w }
                    }
                }
                SubText(es ? "Arrastra un entrenamiento a otro día para moverlo." : "Drag a workout onto another day to move it.")
                VStack(spacing: 10) {
                    ForEach(plan.days) { d in
                        dayRow(d)
                    }
                }
                Button { copying = true } label: { Label(es ? "Copiar esta semana" : "Copy this week", systemImage: "doc.on.doc") }
                    .buttonStyle(.oj(.ghost, fullWidth: true))
                Button {
                    store.send(es ? "Arma la semana \(week) de \(plan.program.name) para mí" : "Build week \(week) of \(plan.program.name) for me")
                } label: {
                    Label { Text(es ? "Que Assist la arme" : "Have Assist build it") } icon: { AssistMark(size: 18, color: Palette.deep) }
                }
                .buttonStyle(.oj(.volt, fullWidth: true))
            } else if let errorText {
                EmptyStateCard(systemImage: "exclamationmark.triangle", title: errorText)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            }
        }
        .ojNavigationTitle(es ? "Plan semanal" : "Week plan")
        .task(id: week) { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $copying) {
            CopyWeekSheet(programID: programID, from: week, weeks: plan?.program.weeks ?? 1) { await load() }
                .presentationDetents([.medium])
        }
    }

    private func dayName(_ day: Int) -> String {
        let en = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], sp = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
        return (es ? sp : en)[max(0, min(6, day - 1))]
    }

    private func dayRow(_ d: PlanWeek.D) -> some View {
        HStack(spacing: 12) {
            VStack(spacing: 2) {
                Text(dayName(d.day).uppercased()).font(.archivo(11, .heavy)).foregroundStyle(Palette.muted)
                Text("\(d.day)").font(.archivo(18, .heavy)).foregroundStyle(Palette.ink)
            }
            .frame(width: 40)
            if let w = d.workout {
                Button { store.push(.workout(w.id)) } label: {
                    HStack(spacing: 12) {
                        ExerciseThumb(path: w.imageUrl)
                            .frame(width: 58, height: 58)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(w.name).font(OJFont.title).foregroundStyle(Palette.ink).lineLimit(1)
                            Text("\(w.exercises) \(es ? "ejercicios" : "exercises")" + (w.estMinutes.map { " · \($0) min" } ?? ""))
                                .font(OJFont.sub).foregroundStyle(Palette.muted)
                            if w.everyWeek { Pill(es ? "Cada semana" : "Every week", tone: .muted) }
                        }
                        Spacer(minLength: 0)
                        Menu {
                            ForEach(1...7, id: \.self) { day in
                                if day != d.day { Button(es ? "Mover a \(dayName(day))" : "Move to \(dayName(day))") { Task { await move(w.id, to: day) } } }
                            }
                        } label: {
                            Image(systemName: "ellipsis").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.muted).frame(width: 36, height: 36)
                        }
                    }
                }
                .buttonStyle(.plain)
                .draggable(w.id)
            } else {
                HStack {
                    Text(es ? "Descanso" : "Rest day").font(OJFont.sub).foregroundStyle(Palette.muted)
                    Spacer()
                }
                .frame(minHeight: 58)
            }
        }
        .padding(10)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(dropTarget == d.day ? Palette.green : Palette.line, style: StrokeStyle(lineWidth: dropTarget == d.day ? 2 : 1, dash: d.workout == nil ? [5, 4] : [])))
        .dropDestination(for: String.self) { ids, _ in
            guard let id = ids.first else { return false }
            Task { await move(id, to: d.day) }
            return true
        } isTargeted: { on in dropTarget = on ? d.day : (dropTarget == d.day ? nil : dropTarget) }
    }

    @MainActor
    private func load() async {
        guard store.live else { errorText = es ? "Disponible con una cuenta real." : "Available with a real account."; return }
        do {
            plan = try await APIClient.shared.get("/api/programs/\(programID)/plan?week=\(week)")
            errorText = nil
        } catch { errorText = (error as? APIError)?.message ?? error.localizedDescription }
    }

    @MainActor
    private func move(_ workoutID: String, to day: Int) async {
        do {
            let _: ScheduleResponse = try await APIClient.shared.patch("/api/workouts/\(workoutID)/schedule", ["day": day])
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            await load()
            await store.loadProgram(programID)
        } catch {
            store.toast.show((error as? APIError)?.message ?? error.localizedDescription)
        }
    }
}

/// Copy one week's workouts into other weeks.
struct CopyWeekSheet: View {
    let programID: String
    let from: Int
    let weeks: Int
    let onDone: () async -> Void
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @Environment(\.dismiss) private var dismiss
    @State private var targets: Set<Int> = []
    @State private var saving = false
    private var es: Bool { lang == .spanish }

    var body: some View {
        NavigationStack {
            ScreenScroll {
                SubText(es ? "Copia la semana \(from) a:" : "Copy week \(from) to:")
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                    ForEach(1...max(weeks + 4, 4), id: \.self) { w in
                        if w != from {
                            Chip(label: es ? "S\(w)" : "W\(w)", isOn: targets.contains(w)) {
                                if targets.contains(w) { targets.remove(w) } else { targets.insert(w) }
                            }
                        }
                    }
                }
                Button {
                    targets = Set((1...max(weeks, 1)).filter { $0 != from })
                } label: { Text(es ? "Todas las semanas" : "All weeks") }
                    .buttonStyle(.oj(.ghost, fullWidth: true))
            }
            .ojNavigationTitle(es ? "Copiar semana" : "Copy week")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(es ? "Cancelar" : "Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(es ? "Copiar" : "Copy") { Task { await copy() } }.disabled(targets.isEmpty || saving)
                }
            }
        }
    }

    @MainActor
    private func copy() async {
        saving = true
        defer { saving = false }
        do {
            let r: OKResponse = try await APIClient.shared.post("/api/programs/\(programID)/copy-week", ["from": from, "to": targets.sorted()])
            store.toast.show(es ? "Copiado: \(r.created ?? 0) entrenamientos" : "Copied \(r.created ?? 0) workouts")
            await onDone()
            await store.loadProgram(programID)
            dismiss()
        } catch {
            store.toast.show((error as? APIError)?.message ?? error.localizedDescription)
        }
    }
}
