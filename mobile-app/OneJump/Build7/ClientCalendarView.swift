import SwiftUI

/// The client's month: workouts (done, missed, coming up), sessions with the coach and check-ins.
/// Tap a day to see it; a coming workout can be moved to another day if the coach allows it.
struct ClientCalendarView: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var anchor = Calendar.current.startOfDay(for: Date())
    @State private var month: ClientMonth?
    @State private var selected = ISO.ymd(Date())
    @State private var errorText: String?
    @State private var moving: ClientMonth.W?
    private var es: Bool { lang == .spanish }

    var body: some View {
        ScreenScroll {
            HStack {
                Text(anchor.formatted(.dateTime.month(.wide).year())).font(.archivo(24, .heavy)).tracking(-0.6).foregroundStyle(Palette.ink)
                Spacer()
                CircleIconButton(systemName: "chevron.left", label: es ? "Mes anterior" : "Previous month") { shift(-1) }
                CircleIconButton(systemName: "chevron.right", label: es ? "Mes siguiente" : "Next month") { shift(1) }
            }
            if !store.live {
                SubText(es ? "Tu calendario aparece aquí cuando tu coach te invita." : "Your calendar shows here once your coach invites you.")
            }
            grid.card(padding: 12)
            HStack(spacing: 14) {
                legendDot(Palette.good, es ? "Hecho" : "Done")
                legendDot(Palette.deep, es ? "Planeado" : "Planned")
                legendDot(Palette.crit, es ? "Perdido" : "Missed")
                legendDot(Color(hex: 0x3A86C8), es ? "Sesión" : "Session")
            }
            dayDetail
            if let errorText { SubText(errorText, color: Palette.crit) }
        }
        .ojNavigationTitle(es ? "Calendario" : "Calendar")
        .task(id: ISO.ymd(anchor).prefix(7)) { await load() }
        .refreshable { await load() }
        .sheet(item: $moving) { w in
            MoveWorkoutSheet(workout: w, from: ISO.fromYMD(selected) ?? Date()) { await load(); await store.loadLive() }
                .presentationDetents([.medium])
        }
    }

    private func shift(_ dir: Int) {
        anchor = Calendar.current.date(byAdding: .month, value: dir, to: anchor) ?? anchor
    }

    private func legendDot(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 4) { Circle().fill(c).frame(width: 7, height: 7); Text(t).font(.archivo(11, .semibold)).foregroundStyle(Palette.muted) }
    }

    private var grid: some View {
        let cal = Calendar.current
        let start = cal.date(from: cal.dateComponents([.year, .month], from: anchor)) ?? anchor
        let lead = (cal.component(.weekday, from: start) + 5) % 7
        let count = cal.range(of: .day, in: .month, for: start)?.count ?? 30
        let cells: [Date?] = Array(repeating: nil, count: lead) + (0..<count).map { cal.date(byAdding: .day, value: $0, to: start) }
        let letters = es ? ["L", "M", "X", "J", "V", "S", "D"] : ["M", "T", "W", "T", "F", "S", "S"]
        return VStack(spacing: 6) {
            HStack { ForEach(letters.indices, id: \.self) { i in Text(letters[i]).font(.archivo(11, .bold)).foregroundStyle(Palette.muted).frame(maxWidth: .infinity) } }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: 4) {
                ForEach(cells.indices, id: \.self) { i in
                    if let d = cells[i] { cell(d) } else { Color.clear.frame(height: 46) }
                }
            }
        }
    }

    private func cell(_ d: Date) -> some View {
        let key = ISO.ymd(d)
        let day = month?.days[key]
        let isToday = key == (month?.today ?? ISO.ymd(Date()))
        let isSel = key == selected
        return Button { withAnimation(.snappy) { selected = key } } label: {
            VStack(spacing: 3) {
                Text(d.formatted(.dateTime.day()))
                    .font(.archivo(14, isToday ? .heavy : .semibold))
                    .foregroundStyle(isSel ? Palette.bone : Palette.ink)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(isSel ? Palette.deep : isToday ? Palette.assistSoft : Color.clear))
                HStack(spacing: 2) {
                    ForEach(Array((day?.workouts ?? []).prefix(2).enumerated()), id: \.offset) { w in Circle().fill(color(w.element.state)).frame(width: 6, height: 6) }
                    if !(day?.sessions ?? []).isEmpty { Circle().fill(Color(hex: 0x3A86C8)).frame(width: 6, height: 6) }
                }
                .frame(height: 6)
            }
            .frame(maxWidth: .infinity, minHeight: 46)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(d.formatted(date: .complete, time: .omitted)))
    }

    private func color(_ state: String) -> Color {
        switch state {
        case "done": return Palette.good
        case "missed": return Palette.crit
        default: return Palette.deep
        }
    }

    @ViewBuilder
    private var dayDetail: some View {
        let day = month?.days[selected]
        let date = ISO.fromYMD(selected) ?? Date()
        SectionHeader(date.formatted(.dateTime.weekday(.wide).day().month(.wide)))
        if (day?.workouts ?? []).isEmpty && (day?.sessions ?? []).isEmpty && !(day?.checkin ?? false) {
            EmptyStateCard(systemImage: "leaf", title: es ? "Día libre" : "Rest day", message: es ? "Nada planeado este día." : "Nothing planned this day.")
        }
        ForEach(day?.workouts ?? [], id: \.self) { w in
            HStack(spacing: 12) {
                IconTile(systemName: w.state == "done" ? "checkmark" : "dumbbell.fill", size: 44)
                TitleSub(w.name, sub: [w.exercises.map { es ? "\($0) ejercicios" : "\($0) exercises" }, w.estMinutes.map { "\($0) min" }].compactMap { $0 }.joined(separator: " · "))
                Spacer(minLength: 0)
                if w.state == "planned" && (month?.canReschedule ?? false) {
                    Button(es ? "Mover" : "Move") { moving = w }.buttonStyle(.oj(.ghost, size: .small))
                } else {
                    Pill(stateLabel(w.state), tone: w.state == "done" ? .good : w.state == "missed" ? .crit : .muted)
                }
            }
            .card(padding: 12)
        }
        ForEach(day?.sessions ?? [], id: \.self) { s in
            HStack(spacing: 12) {
                IconTile(systemName: s.type == "call" ? "phone.fill" : "figure.strengthtraining.traditional", size: 44)
                TitleSub(s.title, sub: (ISO.date(s.start)?.formatted(date: .omitted, time: .shortened) ?? "") + (s.location.map { " · \($0)" } ?? ""))
            }
            .card(padding: 12)
        }
        if day?.checkin == true {
            HStack(spacing: 12) {
                IconTile(systemName: "list.clipboard", tone: .assist, size: 44)
                TitleSub(es ? "Check-in semanal" : "Weekly check-in")
            }
            .card(padding: 12)
        }
    }

    private func stateLabel(_ s: String) -> String {
        switch s {
        case "done": return es ? "Hecho" : "Done"
        case "missed": return es ? "Perdido" : "Missed"
        case "today": return es ? "Hoy" : "Today"
        default: return es ? "Planeado" : "Planned"
        }
    }

    @MainActor
    private func load() async {
        guard store.live else { return }
        do {
            month = try await APIClient.shared.get("/api/me/calendar?month=\(ISO.ymd(anchor).prefix(7))")
            errorText = nil
        } catch { errorText = (error as? APIError)?.message ?? error.localizedDescription }
    }
}

extension ClientMonth.W: Identifiable { var id: String { assignmentId } }

/// Pick a new day for a coming workout.
struct MoveWorkoutSheet: View {
    let workout: ClientMonth.W
    let from: Date
    let onDone: () async -> Void
    @Environment(\.lang) private var lang
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                TitleSub(workout.name, sub: lang == .spanish ? "¿A qué día lo mueves?" : "Which day should it move to?")
                DatePicker("", selection: $date, in: Calendar.current.startOfDay(for: Date())..., displayedComponents: .date)
                    .datePickerStyle(.graphical)
                if let errorText { SubText(errorText, color: Palette.crit) }
            }
            .padding(16)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(lang == .spanish ? "Cancelar" : "Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(lang == .spanish ? "Mover" : "Move") { Task { await move() } } }
            }
        }
        .onAppear { date = max(from, Calendar.current.startOfDay(for: Date())) }
    }

    @MainActor
    private func move() async {
        do {
            let _: OKResponse = try await APIClient.shared.patch("/api/me/assignments/\(workout.assignmentId)", ["date": ISO.ymd(date)])
            await onDone()
            dismiss()
        } catch { errorText = (error as? APIError)?.message ?? error.localizedDescription }
    }
}

/// This week as 7 days under the greeting on Today: tap to open the month.
struct ClientWeekStrip: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var month: ClientMonth?

    var body: some View {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let monday = cal.date(byAdding: .day, value: -((cal.component(.weekday, from: today) + 5) % 7), to: today) ?? today
        let days = (0..<7).compactMap { cal.date(byAdding: .day, value: $0, to: monday) }
        Button { store.push(.calendar) } label: {
            HStack(spacing: 4) {
                ForEach(days, id: \.self) { d in
                    let key = ISO.ymd(d)
                    let isToday = cal.isDate(d, inSameDayAs: today)
                    let w = month?.days[key]?.workouts.first
                    VStack(spacing: 5) {
                        Text(d.formatted(.dateTime.weekday(.narrow))).font(.archivo(11, .bold)).foregroundStyle(isToday ? Palette.bone.opacity(0.8) : Palette.muted)
                        Text(d.formatted(.dateTime.day())).font(.archivo(15, .heavy)).foregroundStyle(isToday ? Palette.bone : Palette.ink)
                        ZStack {
                            if w?.state == "done" {
                                Image(systemName: "checkmark").font(.system(size: 8, weight: .heavy)).foregroundStyle(.white)
                                    .frame(width: 14, height: 14).background(Circle().fill(Palette.good))
                            } else if w != nil {
                                Circle().fill(isToday ? Palette.volt : Palette.deep).frame(width: 6, height: 6)
                            }
                        }
                        .frame(height: 14)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(isToday ? Palette.deep : Color.clear))
                }
            }
            .padding(6)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(lang == .spanish ? "Esta semana. Abre el calendario." : "This week. Opens your calendar."))
        .task(id: store.workoutDone) {
            guard store.live else { return }
            month = try? await APIClient.shared.get("/api/me/calendar?month=\(ISO.ymd(today).prefix(7))")
        }
    }
}
