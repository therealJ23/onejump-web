import Charts
import SwiftUI

// The five tabs on a client's page.

// MARK: - Overview

struct ClientOverviewTab: View {
    let client: CoachClient
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let extras = CoachData.extras[client.id]
        let isNew = client.kind.isNew
        let habits = extras?.habits ?? CoachData.defaultHabits
        let activity = isNew ? CoachData.newClientActivity : (extras?.activity ?? CoachData.defaultActivity)

        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                StatTile(value: client.adherence.map { "\($0)%" } ?? "—", label: CT.adherence(lang), note: CT.last2Weeks(lang), noteColor: Palette.muted, labelFirst: true)
                StatTile(value: client.weight, label: CT.weight(lang), note: client.weightChange(lang), noteColor: Palette.muted, labelFirst: true)
                StatTile(value: client.streak, label: CT.streak(lang), note: CT.days(lang), noteColor: Palette.muted, labelFirst: true)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(CT.weight8(lang)).font(OJFont.title)
                    Spacer()
                    SubText(client.weightTotal(lang))
                }
                Sparkline(values: client.spark)
                    .frame(height: 70)
            }
            .card()

            AssistCard(label: CT.assistInsight(lang)) {
                DraftText(client.insight(lang))
                Button(client.suggest(lang)) { suggestedAction() }
                    .buttonStyle(.oj(.volt, size: .small))
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(CT.dailyHabits(lang)).font(OJFont.title)
                    Spacer()
                    SubText(CT.thisWeek(lang))
                }
                ForEach(habits) { habit in
                    let on = habit.on && !isNew
                    HStack(spacing: 10) {
                        Image(systemName: on ? "checkmark" : "minus")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(on ? Color.white : Palette.muted)
                            .frame(width: 24, height: 24)
                            .background(on ? Palette.good : Palette.surface3, in: Circle())
                        Text(habit.title(lang)).font(OJFont.body)
                        Spacer()
                        SubText(isNew ? CoachData.startsTomorrow(lang) : habit.value(lang))
                    }
                    .padding(.vertical, 6)
                }
            }
            .card()

            VStack(alignment: .leading, spacing: 4) {
                Text(CT.recentActivity(lang)).font(OJFont.title)
                ForEach(activity) { line in
                    HStack(alignment: .top, spacing: 10) {
                        Text(line.date(lang))
                            .font(.archivo(12, .bold))
                            .foregroundStyle(Palette.muted)
                            .frame(width: 52, alignment: .leading)
                        Text(line.text(lang)).font(.archivo(14))
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 6)
                }
            }
            .card()

            ListCard {
                infoRow("calendar", CT.nextSession(lang), client.next(lang))
                RowDivider()
                infoRow("creditcard", CT.billing(lang), client.billing(lang))
                RowDivider()
                infoRow("dollarsign.circle", CT.lifetimeValue(lang), CT.paidSoFar(CoachData.lifetimeValue[client.id] ?? "$0")(lang))
            }
        }
    }

    private func infoRow(_ icon: String, _ title: String, _ sub: String) -> some View {
        HStack(spacing: 12) {
            IconTile(systemName: icon)
            TitleSub(title, sub: sub)
        }
        .rowPadding()
    }

    /// The button under Assist's insight does the next sensible thing.
    private func suggestedAction() {
        if client.id == "maya" {
            store.push(.checkIn("maya"))
        } else if CoachData.queue.contains(where: { $0.id == client.id }) {
            store.go(.today)
        } else {
            store.toast.show(CT.draftAdded(lang))
        }
    }
}

/// Tiny weight trend line.
struct Sparkline: View {
    let values: [Double]

    var body: some View {
        Chart {
            ForEach(Array(values.enumerated()), id: \.offset) { pair in
                LineMark(x: .value("Week", pair.offset), y: .value("Trend", -pair.element))
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(Palette.chart)
                    .lineStyle(StrokeStyle(lineWidth: 2.6, lineCap: .round))
                AreaMark(x: .value("Week", pair.offset), yStart: .value("Base", -32), yEnd: .value("Trend", -pair.element))
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(LinearGradient(colors: [Palette.chart.opacity(0.18), Palette.chart.opacity(0)], startPoint: .top, endPoint: .bottom))
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartYScale(domain: -32...0)
        .accessibilityHidden(true)
    }
}

// MARK: - Program

struct ClientProgramTab: View {
    let client: CoachClient
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(CT.currentProgram(lang))
                Text(CoachData.programName(client.programID)(lang)).font(.archivo(18, .bold))
                SubText(client.week > 0 ? CT.weekOf(client.week, client.weeks)(lang) : CT.startsSoon(lang))
                ProgressBar(value: client.weeks > 0 ? Double(client.week) / Double(client.weeks) : 0)
                    .padding(.top, 6)
            }
            .card()

            ListCard {
                DividedRows(Array(0..<3)) { i in
                    weekRow(i)
                }
            }

            Button {
                store.send(CT.buildNew(client.first)(lang))
            } label: {
                Label {
                    Text(CT.adjustProgram(lang))
                } icon: {
                    AssistMark(size: 18, color: Palette.ink)
                }
            }
            .buttonStyle(.oj(.ghost, fullWidth: true))
        }
    }

    private func weekRow(_ i: Int) -> some View {
        let label: String
        let tone: Tone
        let meta: String
        if client.kind == .paused {
            label = CT.pausedLabel(lang); tone = .muted; meta = CT.min45(lang)
        } else if client.kind.isNew {
            label = CT.startsSoon(lang); tone = .info; meta = CT.min45(lang)
        } else if i == 0 {
            label = client.trainedThisWeek ? CT.doneDay(lang) : CT.missed(lang)
            tone = client.trainedThisWeek ? .good : .crit
            meta = CT.exMeta(lang)
        } else {
            label = CT.upcoming(lang); tone = .muted; meta = CT.exMeta(lang)
        }
        return HStack(spacing: 12) {
            Text(CT.weekDays[i](lang))
                .font(.archivo(13, .bold))
                .foregroundStyle(Palette.muted)
                .frame(width: 40, alignment: .leading)
            TitleSub(CT.weekWorkouts[i](lang), sub: meta)
            Pill(label, tone: tone)
        }
        .rowPadding()
    }
}

// MARK: - Food

struct ClientFoodTab: View {
    let client: CoachClient
    @Environment(\.lang) private var lang

    private struct Macro: Identifiable {
        let id = UUID()
        let label: String
        let now: Int
        let target: Int
        let unit: String
        var warn = false
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(CT.todayShort(lang)).font(OJFont.title)
                    Spacer()
                    SubText(client.noLogs ? CT.nothingLogged(lang) : CT.logged3(lang))
                }
                ForEach(macros) { m in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(m.label).font(.archivo(14, .semibold))
                            Spacer()
                            SubText("\(Fmt.grouped(m.now)) / \(Fmt.grouped(m.target)) \(m.unit)")
                        }
                        ProgressBar(value: Double(m.now) / Double(m.target), tint: m.warn ? Palette.warn : Palette.chart)
                    }
                }
            }
            .card()

            AssistCard(label: CT.nutritionWeek(lang)) {
                DraftText(client.nutritionNote(lang))
            }
        }
    }

    private var macros: [Macro] {
        if client.noLogs {
            return [
                Macro(label: CT.calories(lang), now: 0, target: 2400, unit: "kcal"),
                Macro(label: CT.protein(lang), now: 0, target: 180, unit: "g"),
                Macro(label: CT.carbs(lang), now: 0, target: 260, unit: "g"),
                Macro(label: CT.fat(lang), now: 0, target: 75, unit: "g")
            ]
        }
        if client.lowProtein {
            return [
                Macro(label: CT.calories(lang), now: 1540, target: 1750, unit: "kcal"),
                Macro(label: CT.protein(lang), now: 92, target: 135, unit: "g", warn: true),
                Macro(label: CT.carbs(lang), now: 190, target: 190, unit: "g"),
                Macro(label: CT.fat(lang), now: 54, target: 60, unit: "g")
            ]
        }
        return [
            Macro(label: CT.calories(lang), now: 1620, target: 2000, unit: "kcal"),
            Macro(label: CT.protein(lang), now: 118, target: 140, unit: "g"),
            Macro(label: CT.carbs(lang), now: 160, target: 200, unit: "g"),
            Macro(label: CT.fat(lang), now: 52, target: 65, unit: "g")
        ]
    }
}

// MARK: - Progress

struct ClientProgressTab: View {
    let client: CoachClient
    @Environment(\.lang) private var lang

    var body: some View {
        let extras = CoachData.extras[client.id]
        let isNew = client.kind.isNew
        let bests = isNew ? [] : (extras?.bests ?? CoachData.defaultBests)
        let measures = extras?.measures ?? CoachData.defaultMeasures
        let history = isNew ? CoachData.newClientCheckInHistory : (extras?.checkInHistory ?? CoachData.defaultCheckInHistory)

        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(CT.personalBests(lang)).font(OJFont.title)
                if bests.isEmpty {
                    SubText(CT.noData(lang))
                }
                ForEach(bests) { pb in
                    HStack(spacing: 10) {
                        Image(systemName: "trophy.fill")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 24, height: 24)
                            .background(Palette.good, in: Circle())
                        Text(pb.name(lang)).font(OJFont.body)
                        Spacer()
                        Text(pb.value).font(.archivo(15, .bold))
                        SubText(pb.date(lang)).frame(width: 54, alignment: .trailing)
                    }
                    .padding(.vertical, 6)
                }
            }
            .card()

            VStack(alignment: .leading, spacing: 10) {
                Text(CT.measurements(lang)).font(OJFont.title)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(measures) { m in
                        StatTile(value: m.value, label: m.name(lang), note: m.change(lang), noteColor: Palette.muted, labelFirst: true, valueSize: 18)
                    }
                }
            }
            .card()

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(CT.progressPhotos(lang)).font(OJFont.title)
                    Spacer()
                    Pill(CT.privateLabel(lang), tone: .muted)
                }
                if isNew {
                    SubText(CT.noPhotos(lang))
                } else {
                    HStack(spacing: 8) {
                        ForEach(CoachData.photoDates, id: \.self) { date in
                            PhotoPlaceholder(label: date(lang), locked: true)
                        }
                    }
                }
            }
            .card()

            ListCard {
                DividedRows(history) { row in
                    HStack {
                        TitleSub(CT.checkInRow(row.week)(lang), sub: row.date(lang))
                        Pill(row.label(lang), tone: row.tone)
                    }
                    .rowPadding()
                }
            }
        }
    }
}

/// Striped box that stands in for a private progress photo.
struct PhotoPlaceholder: View {
    let label: String
    var locked = true
    var dashed = false
    var systemImage: String?

    var body: some View {
        Color.clear
        .aspectRatio(3 / 4, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .overlay {
            VStack(spacing: 4) {
                Image(systemName: systemImage ?? (locked ? "lock.fill" : "camera"))
                    .font(.system(size: 15, weight: .semibold))
                Text(label).font(.archivo(12, .semibold)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(Palette.muted)
        }
        .background {
            if dashed {
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Palette.surface)
            } else {
                StripedFill()
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(dashed ? Palette.line2 : Palette.line, style: StrokeStyle(lineWidth: dashed ? 2 : 1, dash: dashed ? [6, 4] : []))
        )
    }
}

/// Diagonal stripes for photo and video placeholders.
struct StripedFill: View {
    var body: some View {
        Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Palette.surface2))
            var x: CGFloat = -size.height
            while x < size.width {
                var path = Path()
                path.move(to: CGPoint(x: x, y: size.height))
                path.addLine(to: CGPoint(x: x + size.height, y: 0))
                context.stroke(path, with: .color(Palette.surface3), lineWidth: 6)
                x += 16
            }
        }
    }
}

// MARK: - Notes

struct ClientNotesTab: View {
    let client: CoachClient
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var draft = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                TextField(CT.addNote(lang), text: $draft)
                    .font(OJFont.body)
                    .padding(.horizontal, 14)
                    .frame(height: 46)
                    .background(Palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
                    .submitLabel(.done)
                    .onSubmit(save)
                Button(CT.add(lang), action: save)
                    .buttonStyle(.oj(.primary))
            }
            ListCard {
                DividedRows((store.notes[client.id] ?? []) + CoachData.defaultNotes) { note in
                    HStack(alignment: .top, spacing: 10) {
                        Text(note.date(lang))
                            .font(.archivo(12, .bold))
                            .foregroundStyle(Palette.muted)
                            .frame(width: 52, alignment: .leading)
                        Text(note.text(lang)).font(OJFont.body)
                        Spacer(minLength: 0)
                    }
                    .rowPadding()
                }
            }
            SubText(CT.notesPrivate(lang))
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
    }

    private func save() {
        store.addNote(draft, for: client.id)
        draft = ""
    }
}
