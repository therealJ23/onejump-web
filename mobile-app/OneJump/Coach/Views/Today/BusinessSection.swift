import Charts
import SwiftUI

/// "Your business": key numbers and charts a coach checks every day.
struct BusinessSection: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(CT.yourBusiness(lang), link: CT.payments(lang)) { store.push(.payments) }
            kpis
            RevenueChartCard()
            AdherenceChartCard()
            PackageBarsCard()
            RetentionRadarCard()
        }
    }

    private var kpis: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            Button { store.push(.payments) } label: {
                StatTile(value: "$1,972", label: CT.kRevenue(lang), note: CT.kRevenueUp(lang), labelFirst: true)
            }
            .buttonStyle(.plain)
            Button { store.go(.clients) } label: {
                StatTile(value: "9", label: CT.kActive(lang), note: CT.kActiveUp(lang), labelFirst: true)
            }
            .buttonStyle(.plain)
            Button { store.openInbox(.checkIns) } label: {
                StatTile(value: CT.k7of9(lang), label: CT.kCheckins(lang), note: CT.k2missing(lang), noteColor: Palette.muted, labelFirst: true)
            }
            .buttonStyle(.plain)
            StatTile(value: "92%", label: CT.kRetention(lang), note: CT.kRetentionUp(lang), labelFirst: true)
        }
    }
}

// MARK: - Revenue (bars, tap to see a month)

struct RevenueChartCard: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let points = CoachData.revenue
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(CT.revenueChart(lang)).font(OJFont.title).foregroundStyle(Palette.ink)
                Spacer()
                SubText(CT.tapBar(lang))
            }
            Chart(points) { point in
                BarMark(
                    x: .value("Month", point.month(lang)),
                    y: .value("Revenue", point.value)
                )
                .foregroundStyle(point.id == store.revenueSelection ? Palette.chartSelected : Palette.chartMuted)
                .cornerRadius(6)
                .annotation(position: .top, spacing: 4) {
                    if point.id == store.revenueSelection {
                        Text(Fmt.money(point.value))
                            .font(.archivo(12, .bold))
                            .foregroundStyle(Palette.ink)
                    }
                }
            }
            .chartYAxis(.hidden)
            .chartYScale(domain: 0...2300)
            .chartXAxis {
                AxisMarks { _ in
                    AxisValueLabel().font(.archivo(11, .semibold))
                }
            }
            .chartOverlay { proxy in
                GeometryReader { geo in
                    Rectangle()
                        .fill(Color.clear)
                        .contentShape(Rectangle())
                        .onTapGesture { location in
                            guard let plotFrame = proxy.plotFrame else { return }
                            let x = location.x - geo[plotFrame].origin.x
                            if let month: String = proxy.value(atX: x),
                               let index = points.firstIndex(where: { $0.month(lang) == month }) {
                                withAnimation(.snappy) { store.revenueSelection = index }
                                Haptics.tick()
                            }
                        }
                }
            }
            .frame(height: 170)
            SubText(CT.revenueNote(lang))
        }
        .card()
    }
}

// MARK: - Adherence (line, tap a week)

struct AdherenceChartCard: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let values = CoachData.adherence
        let selected = min(max(store.adherenceSelection, 0), values.count - 1)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(CT.adherenceChart(lang)).font(OJFont.title).foregroundStyle(Palette.ink)
                Spacer()
                Text(CT.adherenceSelected(selected + 1, values[selected])(lang))
                    .font(OJFont.title)
                    .foregroundStyle(Palette.ink)
                    .contentTransition(.numericText())
            }
            Chart {
                ForEach(Array(values.enumerated()), id: \.offset) { pair in
                    LineMark(
                        x: .value("Week", pair.offset + 1),
                        y: .value("Adherence", pair.element)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(Palette.chart)
                    .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))

                    PointMark(
                        x: .value("Week", pair.offset + 1),
                        y: .value("Adherence", pair.element)
                    )
                    .foregroundStyle(pair.offset == selected ? Palette.chartSelected : Palette.chart)
                    .symbolSize(pair.offset == selected ? 140 : 36)
                }
            }
            .chartXScale(domain: 1...8)
            .chartYScale(domain: 70...92)
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(position: .leading, values: [75, 85]) { value in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    AxisValueLabel {
                        if let v = value.as(Int.self) {
                            Text("\(v)%").font(.archivo(11, .semibold))
                        }
                    }
                }
            }
            .chartOverlay { proxy in
                GeometryReader { geo in
                    Rectangle()
                        .fill(Color.clear)
                        .contentShape(Rectangle())
                        .onTapGesture { location in
                            guard let plotFrame = proxy.plotFrame else { return }
                            let x = location.x - geo[plotFrame].origin.x
                            if let week: Double = proxy.value(atX: x) {
                                let index = min(max(Int(week.rounded()) - 1, 0), values.count - 1)
                                withAnimation(.snappy) { store.adherenceSelection = index }
                                Haptics.tick()
                            }
                        }
                }
            }
            .frame(height: 150)
            HStack {
                SubText(CT.eightWeeksAgo(lang))
                Spacer()
                SubText(CT.thisWeekCap(lang))
            }
            SubText(CT.adherenceNote(lang))
        }
        .card()
    }
}

// MARK: - Revenue by package (horizontal bars)

struct PackageBarsCard: View {
    @Environment(\.lang) private var lang

    var body: some View {
        let maxValue = Double(CoachData.packages.map(\.value).max() ?? 1)
        VStack(alignment: .leading, spacing: 14) {
            Text(CT.packageChart(lang)).font(OJFont.title).foregroundStyle(Palette.ink)
            ForEach(CoachData.packages) { pkg in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(pkg.name(lang)).font(OJFont.bodyMedium)
                        Spacer()
                        Text(pkg.total).font(.archivo(15, .bold))
                    }
                    .foregroundStyle(Palette.ink)
                    ProgressBar(value: Double(pkg.value) / maxValue, tint: Palette.chart, height: 10)
                    SubText(pkg.meta(lang))
                }
                .accessibilityElement(children: .combine)
            }
        }
        .card()
    }
}

// MARK: - Retention radar

struct RetentionRadarCard: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(CT.retentionRadar(lang)).font(OJFont.title).foregroundStyle(Palette.ink)
                Spacer()
                Pill(CT.atRisk2(lang), tone: .crit)
            }
            .padding(.bottom, 4)
            DividedRows(CoachData.radar) { entry in
                let c = store.client(entry.clientID)
                Button {
                    store.push(.client(entry.clientID))
                } label: {
                    HStack(spacing: 12) {
                        Avatar(initials: c.initials, color: c.avatarColor, size: 36)
                        TitleSub(c.name, sub: entry.why(lang))
                        Text("\(entry.score)")
                            .font(.archivo(20, .heavy))
                            .foregroundStyle(Palette.crit)
                    }
                    .rowPadding()
                }
                .buttonStyle(.row)
            }
        }
        .card()
    }
}
