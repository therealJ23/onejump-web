import SwiftUI

/// The coach's Calendar tab: a 3-day timeline (like Google Calendar) or the month, with sessions,
/// check-in calls, consultations, blocked time, client workouts due, and open time Assist found.
struct CoachCalendarScreen: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    enum Mode: Hashable { case threeDay, month }
    @State private var mode: Mode = .threeDay
    @State private var anchor = Calendar.current.startOfDay(for: Date())
    @State private var range: CalRange?
    @State private var loading = false
    @State private var errorText: String?
    @State private var editing: EventDraft?

    private let hourHeight: CGFloat = 56
    private let firstHour = 6, lastHour = 22
    private var es: Bool { lang == .spanish }

    var body: some View {
        VStack(spacing: 0) {
            header
            if mode == .threeDay { threeDay } else { month }
        }
        .background(Palette.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .task(id: "\(mode)-\(ISO.ymd(anchor))") { await load() }
        .refreshable { await load() }
        .sheet(item: $editing) { draft in
            EventEditorSheet(draft: draft) { await load() }
                .environment(store)
                .presentationDetents([.large])
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Text(anchor.formatted(.dateTime.month(.wide)))
                    .font(.archivo(28, .heavy)).tracking(-0.8)
                    .foregroundStyle(Palette.ink)
                Spacer()
                CircleIconButton(systemName: "chevron.left", label: es ? "Antes" : "Earlier") { shift(-1) }
                CircleIconButton(systemName: "chevron.right", label: es ? "Después" : "Later") { shift(1) }
                Menu {
                    Button { store.push(.moreMenu) } label: { Label(es ? "Más" : "More", systemImage: "square.grid.2x2") }
                    Button { anchor = Calendar.current.startOfDay(for: Date()) } label: { Label(es ? "Hoy" : "Today", systemImage: "calendar.badge.clock") }
                } label: {
                    Image(systemName: "ellipsis").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                        .frame(width: 40, height: 40).background(Circle().fill(Palette.surface))
                }
            }
            SegmentedBar(options: [SegmentOption(value: Mode.threeDay, label: es ? "3 días" : "3 days"), SegmentOption(value: Mode.month, label: es ? "Mes" : "Month")], selection: $mode)
            if !store.live {
                SubText(es ? "Tu calendario aparece aquí con una cuenta real." : "Your calendar shows here with a real account.")
            }
            if let errorText { SubText(errorText, color: Palette.crit) }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    private func shift(_ dir: Int) {
        let cal = Calendar.current
        anchor = mode == .threeDay ? cal.date(byAdding: .day, value: 3 * dir, to: anchor)! : cal.date(byAdding: .month, value: dir, to: anchor)!
    }

    // MARK: 3 days

    private var days: [Date] { (0..<3).map { Calendar.current.date(byAdding: .day, value: $0, to: anchor)! } }

    private var threeDay: some View {
        GeometryReader { geo in
            threeDayBody(colWidth: max(60, (geo.size.width - 52 - 8) / 3))
        }
    }

    private func threeDayBody(colWidth: CGFloat) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Color.clear.frame(width: 52)
                ForEach(days, id: \.self) { d in
                    let today = Calendar.current.isDateInToday(d)
                    VStack(spacing: 3) {
                        Text(d.formatted(.dateTime.weekday(.abbreviated)).uppercased()).font(.archivo(11, .bold)).foregroundStyle(today ? Palette.ink : Palette.muted)
                        Text(d.formatted(.dateTime.day()))
                            .font(.archivo(17, .heavy))
                            .foregroundStyle(today ? Palette.bone : Palette.ink)
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(today ? Palette.deep : Color.clear))
                        let due = range?.workoutsDue[ISO.ymd(d)] ?? 0
                        Label(due > 0 ? "\(due)" : "–", systemImage: "dumbbell.fill")
                            .font(.archivo(10.5, .bold))
                            .foregroundStyle(Palette.good)
                            .padding(.horizontal, 6).frame(height: 20)
                            .background(Capsule().fill(Palette.goodTint))
                            .opacity(due > 0 ? 1 : 0.35)
                            .accessibilityLabel(Text(es ? "\(due) entrenamientos" : "\(due) workouts due"))
                    }
                    .frame(width: colWidth)
                    .contentShape(Rectangle())
                    .onTapGesture { newEvent(on: d, hour: 9) }
                }
            }
            .padding(.bottom, 6)
            Divider().overlay(Palette.line)
            ScrollViewReader { proxy in
                ScrollView {
                    ZStack(alignment: .topLeading) {
                        // hour lines
                        VStack(spacing: 0) {
                            ForEach(firstHour..<lastHour, id: \.self) { h in
                                HStack(alignment: .top, spacing: 6) {
                                    Text(hourLabel(h)).font(.archivo(10, .semibold)).foregroundStyle(Palette.muted)
                                        .frame(width: 46, alignment: .trailing).offset(y: -6)
                                    Rectangle().fill(Palette.line).frame(height: 1)
                                }
                                .frame(height: hourHeight, alignment: .top)
                                .id(h)
                            }
                        }
                        // open slots (Assist) and events
                        ForEach(Array(days.enumerated()), id: \.offset) { pair in
                            let x = 52 + CGFloat(pair.offset) * colWidth
                            ForEach(slots(on: pair.element), id: \.self) { slot in
                                if let s = ISO.date(slot.start), let e = ISO.date(slot.end) {
                                    openSlot(s, e).frame(width: colWidth - 4, height: height(s, e)).offset(x: x + 2, y: y(s))
                                        .onTapGesture { newEvent(at: s) }
                                }
                            }
                            ForEach(events(on: pair.element)) { ev in
                                eventBlock(ev).frame(width: colWidth - 4, height: max(24, height(ev.start, ev.end))).offset(x: x + 2, y: y(ev.start))
                                    .onTapGesture { editing = EventDraft(event: ev) }
                            }
                        }
                        nowLine(colWidth: colWidth)
                    }
                    .frame(height: CGFloat(lastHour - firstHour) * hourHeight + 120, alignment: .top)
                    .padding(.top, 8)
                }
                .onAppear { proxy.scrollTo(max(firstHour, Calendar.current.component(.hour, from: Date()) - 1), anchor: .top) }
            }
        }
        .overlay(alignment: .bottomTrailing) { addButton }
    }

    private var addButton: some View {
        Button { newEvent(on: anchor, hour: 9) } label: {
            Image(systemName: "plus").font(.system(size: 24, weight: .bold)).foregroundStyle(Palette.bone)
                .frame(width: 58, height: 58)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Palette.deep))
                .shadow(color: Palette.shadow, radius: 12, x: 0, y: 6)
        }
        .padding(20)
        .accessibilityLabel(Text(es ? "Nuevo evento" : "New event"))
    }

    private func y(_ d: Date) -> CGFloat {
        let c = Calendar.current.dateComponents([.hour, .minute], from: d)
        return (CGFloat((c.hour ?? 0) - firstHour) + CGFloat(c.minute ?? 0) / 60) * hourHeight
    }
    private func height(_ s: Date, _ e: Date) -> CGFloat { CGFloat(e.timeIntervalSince(s) / 3600) * hourHeight - 3 }
    private func hourLabel(_ h: Int) -> String { h == 12 ? "12 PM" : h < 12 ? "\(h) AM" : "\(h - 12) PM" }

    private func events(on day: Date) -> [CalEvent] {
        (range?.events ?? []).filter { Calendar.current.isDate($0.start, inSameDayAs: day) }
    }
    private func slots(on day: Date) -> [CalSlot] {
        (range?.openSlots ?? []).filter { ISO.date($0.start).map { Calendar.current.isDate($0, inSameDayAs: day) } ?? false }
    }

    private func eventBlock(_ ev: CalEvent) -> some View {
        let style = EventStyle(type: ev.type)
        return VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                if let icon = style.icon { Image(systemName: icon).font(.system(size: 10, weight: .bold)) }
                Text(ev.client.map { "\($0.name.components(separatedBy: " ").first ?? $0.name)" } ?? ev.title)
                    .font(.archivo(11.5, .bold)).lineLimit(1)
            }
            if height(ev.start, ev.end) > 40 {
                Text(ev.start.formatted(date: .omitted, time: .shortened) + (ev.location.map { " · \($0)" } ?? ""))
                    .font(.archivo(10.5)).opacity(0.75).lineLimit(1)
            }
            if height(ev.start, ev.end) > 64, let c = ev.client {
                Avatar(initials: String(c.name.prefix(1)), color: Palette.stone, size: 20, photoURL: c.photoUrl)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 7).padding(.vertical, 5)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .foregroundStyle(style.fg)
        .background(style.bg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(alignment: .leading) {
            if let bar = style.bar { Rectangle().fill(bar).frame(width: 3).clipShape(RoundedRectangle(cornerRadius: 2)) }
        }
        .accessibilityElement(children: .combine)
    }

    private func openSlot(_ s: Date, _ e: Date) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) { AssistMark(size: 12); Text(es ? "Libre" : "Free").font(.archivo(11, .bold)) }
            if height(s, e) > 40 { Text(es ? "Toca para agendar" : "Tap to book").font(.archivo(10)).opacity(0.8) }
            Spacer(minLength: 0)
        }
        .foregroundStyle(Palette.assistInk)
        .padding(6)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Palette.assistSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Palette.assistLine, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
    }

    @ViewBuilder
    private func nowLine(colWidth: CGFloat) -> some View {
        if let i = days.firstIndex(where: { Calendar.current.isDateInToday($0) }) {
            let now = Date()
            let h = Calendar.current.component(.hour, from: now)
            if h >= firstHour && h < lastHour {
                HStack(spacing: 0) {
                    Circle().fill(Color.red).frame(width: 9, height: 9)
                    Rectangle().fill(Color.red).frame(width: colWidth, height: 2)
                }
                .offset(x: 52 + CGFloat(i) * colWidth - 4, y: y(now) - 4)
            }
        }
    }

    // MARK: Month

    private var month: some View {
        let cal = Calendar.current
        let start = cal.date(from: cal.dateComponents([.year, .month], from: anchor))!
        let lead = (cal.component(.weekday, from: start) + 5) % 7 // Monday first
        let count = cal.range(of: .day, in: .month, for: start)?.count ?? 30
        let cells: [Date?] = Array(repeating: nil, count: lead) + (0..<count).map { cal.date(byAdding: .day, value: $0, to: start) }
        return ScrollView {
            VStack(spacing: 8) {
                HStack { ForEach(["M", "T", "W", "T", "F", "S", "S"].indices, id: \.self) { i in Text(["M", "T", "W", "T", "F", "S", "S"][i]).font(.archivo(11, .bold)).foregroundStyle(Palette.muted).frame(maxWidth: .infinity) } }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 6) {
                    ForEach(Array(cells.enumerated()), id: \.offset) { pair in
                        if let d = pair.element {
                            let evs = events(on: d)
                            let today = cal.isDateInToday(d)
                            Button {
                                anchor = d
                                mode = .threeDay
                            } label: {
                                VStack(spacing: 4) {
                                    Text(d.formatted(.dateTime.day())).font(.archivo(14, today ? .heavy : .semibold))
                                        .foregroundStyle(today ? Palette.bone : Palette.ink)
                                        .frame(width: 30, height: 30)
                                        .background(Circle().fill(today ? Palette.deep : Color.clear))
                                    HStack(spacing: 2) {
                                        ForEach(Array(evs.prefix(3).enumerated()), id: \.offset) { e in
                                            Circle().fill(EventStyle(type: e.element.type).dot).frame(width: 6, height: 6)
                                        }
                                    }
                                    .frame(height: 6)
                                }
                                .frame(maxWidth: .infinity, minHeight: 48)
                            }
                            .buttonStyle(.plain)
                        } else {
                            Color.clear.frame(height: 48)
                        }
                    }
                }
                .card(padding: 12)
                legend
                if let next = (range?.events ?? []).first(where: { $0.end > Date() }) {
                    SectionHeader(es ? "Lo próximo" : "Up next")
                    Button { editing = EventDraft(event: next) } label: {
                        HStack(spacing: 12) {
                            IconTile(systemName: EventStyle(type: next.type).icon ?? "calendar", size: 40)
                            TitleSub(next.client?.name ?? next.title, sub: next.start.formatted(date: .abbreviated, time: .shortened))
                        }
                        .card()
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 120)
        }
    }

    private var legend: some View {
        HStack(spacing: 12) {
            ForEach(["session", "call", "consult", "block"], id: \.self) { t in
                HStack(spacing: 4) {
                    Circle().fill(EventStyle(type: t).dot).frame(width: 7, height: 7)
                    Text(EventStyle.name(t, es: es)).font(.archivo(11, .semibold)).foregroundStyle(Palette.muted)
                }
            }
        }
    }

    // MARK: Data

    @MainActor
    private func load() async {
        guard store.live else { return }
        let cal = Calendar.current
        let from: Date, to: Date
        if mode == .threeDay {
            from = anchor; to = cal.date(byAdding: .day, value: 2, to: anchor)!
        } else {
            from = cal.date(from: cal.dateComponents([.year, .month], from: anchor))!
            to = cal.date(byAdding: DateComponents(month: 1, day: -1), to: from)!
        }
        loading = true
        defer { loading = false }
        do {
            range = try await APIClient.shared.get("/api/calendar?from=\(ISO.ymd(from))&to=\(ISO.ymd(to))")
            errorText = nil
        } catch {
            errorText = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func newEvent(on day: Date, hour: Int) {
        let start = Calendar.current.date(bySettingHour: hour, minute: 0, second: 0, of: day) ?? day
        newEvent(at: start)
    }
    private func newEvent(at start: Date) {
        guard store.live else { return }
        editing = EventDraft(start: start)
    }
}

/// Colors and icons per event type.
struct EventStyle {
    let type: String
    var bg: Color {
        switch type {
        case "session": return Palette.deep
        case "call": return Color(hex: 0xDCEBFA)
        case "consult": return Color(hex: 0xFCEBCB)
        default: return Palette.surface3
        }
    }
    var fg: Color {
        switch type {
        case "session": return Palette.bone
        case "call": return Color(hex: 0x174C79)
        case "consult": return Color(hex: 0x7A4E08)
        default: return Palette.muted
        }
    }
    var bar: Color? {
        switch type {
        case "call": return Color(hex: 0x3A86C8)
        case "consult": return Color(hex: 0xD69628)
        default: return nil
        }
    }
    var dot: Color {
        switch type {
        case "session": return Palette.deep
        case "call": return Color(hex: 0x3A86C8)
        case "consult": return Color(hex: 0xD69628)
        default: return Palette.stone
        }
    }
    var icon: String? {
        switch type {
        case "session": return "figure.strengthtraining.traditional"
        case "call": return "phone.fill"
        case "consult": return "person.badge.plus"
        default: return "clock"
        }
    }
    static func name(_ t: String, es: Bool) -> String {
        switch t {
        case "session": return es ? "Sesión" : "Session"
        case "call": return es ? "Llamada" : "Call"
        case "consult": return es ? "Consulta" : "Consult"
        default: return es ? "Ocupado" : "Busy"
        }
    }
}

/// A new event or one being edited.
struct EventDraft: Identifiable {
    var id: String
    var eventID: String?
    var type = "session"
    var title = ""
    var start: Date
    var minutes = 60
    var clientID: String?
    var location = ""
    var notes = ""

    init(start: Date) {
        id = UUID().uuidString
        self.start = start
    }
    init(event: CalEvent) {
        id = event.id
        eventID = event.id
        type = event.type
        title = event.title
        start = event.start
        minutes = max(15, Int(event.end.timeIntervalSince(event.start) / 60))
        clientID = event.client?.id
        location = event.location ?? ""
        notes = event.notes ?? ""
    }
}

/// Add or change an event: type, client, time, length, place and notes.
struct EventEditorSheet: View {
    @State var draft: EventDraft
    let onSaved: () async -> Void
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @Environment(\.dismiss) private var dismiss
    @State private var saving = false
    @State private var errorText: String?
    private var es: Bool { lang == .spanish }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(es ? "Tipo" : "Type", selection: $draft.type) {
                        ForEach(["session", "call", "consult", "block"], id: \.self) { Text(EventStyle.name($0, es: es)).tag($0) }
                    }
                    if draft.type != "block" {
                        Picker(es ? "Cliente" : "Client", selection: $draft.clientID) {
                            Text(es ? "Ninguno" : "None").tag(String?.none)
                            ForEach(store.allClients, id: \.id) { c in Text(c.name).tag(Optional(c.id)) }
                        }
                    }
                    TextField(es ? "Título (opcional)" : "Title (optional)", text: $draft.title)
                }
                Section {
                    DatePicker(es ? "Empieza" : "Starts", selection: $draft.start, displayedComponents: [.date, .hourAndMinute])
                    Stepper(value: $draft.minutes, in: 15...480, step: 15) {
                        Text(es ? "Duración: \(draft.minutes) min" : "Length: \(draft.minutes) min")
                    }
                    TextField(es ? "Lugar o enlace" : "Place or link", text: $draft.location)
                }
                Section(es ? "Notas" : "Notes") {
                    TextField(es ? "Notas" : "Notes", text: $draft.notes, axis: .vertical).lineLimit(3...6)
                }
                if let errorText { Text(errorText).foregroundStyle(Palette.crit) }
                if draft.eventID != nil {
                    Section {
                        Button(role: .destructive) { Task { await cancelEvent() } } label: { Text(es ? "Cancelar evento" : "Cancel event") }
                    }
                }
            }
            .navigationTitle(draft.eventID == nil ? (es ? "Nuevo evento" : "New event") : (es ? "Editar evento" : "Edit event"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(es ? "Cerrar" : "Close") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(es ? "Guardar" : "Save") { Task { await save() } }.disabled(saving)
                }
            }
        }
    }

    @MainActor
    private func save() async {
        saving = true
        defer { saving = false }
        let end = draft.start.addingTimeInterval(TimeInterval(draft.minutes * 60))
        var body: [String: Any] = ["type": draft.type, "start": ISO.string(draft.start), "end": ISO.string(end)]
        body["title"] = draft.title
        body["location"] = draft.location.isEmpty ? NSNull() : draft.location
        body["notes"] = draft.notes.isEmpty ? NSNull() : draft.notes
        body["clientId"] = draft.type == "block" ? NSNull() : (draft.clientID.map { $0 as Any } ?? NSNull())
        do {
            if let id = draft.eventID {
                let _: CalEventResponse = try await APIClient.shared.patch("/api/calendar/\(id)", body)
            } else {
                let _: CalEventResponse = try await APIClient.shared.post("/api/calendar", body)
            }
            await onSaved()
            dismiss()
        } catch {
            errorText = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    @MainActor
    private func cancelEvent() async {
        guard let id = draft.eventID else { return }
        do {
            let _: OKResponse = try await APIClient.shared.delete("/api/calendar/\(id)")
            await onSaved()
            dismiss()
        } catch {
            errorText = (error as? APIError)?.message ?? error.localizedDescription
        }
    }
}
