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
            if !store.data.activeClientsSeries.isEmpty { ActiveClientsChartCard() }
            PackageBarsCard()
            RetentionRadarCard()
        }
    }

    private var kpis: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(store.data.kpis) { kpi in
                let tile = StatTile(value: kpi.value, label: kpi.label(lang), note: kpi.note(lang), noteColor: kpi.noteMuted ? Palette.muted : Palette.good, labelFirst: true)
                if let target = kpi.target {
                    Button {
                        switch target {
                        case "payments": store.push(.payments)
                        case "clients": store.go(.clients)
                        case "checkins": store.openInbox(.checkIns)
                        default: break
                        }
                    } label: { tile }
                    .buttonStyle(.plain)
                } else {
                    // Not tappable, but drawn at full strength (a disabled button looks greyed out).
                    tile
                }
            }
        }
    }
}

// MARK: - Revenue (bars, tap to see a month)

struct RevenueChartCard: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let points = store.data.revenue
        let top = max(100, (points.map(\.value).max() ?? 0))
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
            .chartYScale(domain: 0...Int(Double(top) * 1.18))
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
            .opacity(points.allSatisfy { $0.value == 0 } ? 0.4 : 1)
            SubText(points.allSatisfy { $0.value == 0 } ? CL.noRevenueYet(lang) : CT.revenueNote(lang))
        }
        .card()
    }
}

// MARK: - Adherence (line, tap a week)

struct AdherenceChartCard: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let points = store.data.adherence
        let known = points.compactMap(\.pct)
        let selected = min(max(store.adherenceSelection, 0), max(points.count - 1, 0))
        let low = Double(max(0, (known.min() ?? 70) - 8)), high = Double(min(100, (known.max() ?? 92) + 5))
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(CT.adherenceChart(lang)).font(OJFont.title).foregroundStyle(Palette.ink)
                Spacer()
                if let point = points[safe: selected] {
                    Text(store.live ? CL.adherenceWeek(point.label(lang), point.pct)(lang) : CT.adherenceSelected(selected + 1, point.pct ?? 0)(lang))
                        .font(OJFont.title)
                        .foregroundStyle(Palette.ink)
                        .contentTransition(.numericText())
                }
            }
            if known.isEmpty {
                SubText(CL.noAdherenceYet(lang))
            } else {
                Chart {
                    ForEach(points) { point in
                        if let pct = point.pct {
                            LineMark(
                                x: .value("Week", point.id + 1),
                                y: .value("Adherence", Double(pct))
                            )
                            .interpolationMethod(.catmullRom)
                            .foregroundStyle(Palette.chart)
                            .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))

                            PointMark(
                                x: .value("Week", point.id + 1),
                                y: .value("Adherence", Double(pct))
                            )
                            .foregroundStyle(point.id == selected ? Palette.chartSelected : Palette.chart)
                            .symbolSize(point.id == selected ? 140 : 36)
                        }
                    }
                }
                .chartXScale(domain: 1...max(2, points.count))
                .chartYScale(domain: low...max(high, low + 10))
                .chartXAxis(.hidden)
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        AxisValueLabel {
                            if let v = value.as(Double.self) {
                                Text("\(Int(v))%").font(.archivo(11, .semibold))
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
                                    let index = min(max(Int(week.rounded()) - 1, 0), points.count - 1)
                                    withAnimation(.snappy) { store.adherenceSelection = index }
                                    Haptics.tick()
                                }
                            }
                    }
                }
                .frame(height: 150)
                HStack {
                    SubText(points.first?.label(lang) ?? CT.eightWeeksAgo(lang))
                    Spacer()
                    SubText(CT.thisWeekCap(lang))
                }
            }
            SubText(CT.adherenceNote(lang))
        }
        .card()
    }
}

// MARK: - Active clients (line by month)

struct ActiveClientsChartCard: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let points = store.data.activeClientsSeries
        let change = (points.last?.count ?? 0) - (points.first?.count ?? 0)
        let top = max(4, (points.map(\.count).max() ?? 0) + 2)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(CL.activeClientsChart(lang)).font(OJFont.title).foregroundStyle(Palette.ink)
                Spacer()
                SubText(CL.activeClientsNote(change)(lang))
            }
            Chart(points) { point in
                AreaMark(x: .value("Month", point.label(lang)), y: .value("Clients", point.count))
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(LinearGradient(colors: [Palette.chart.opacity(0.22), Palette.chart.opacity(0)], startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("Month", point.label(lang)), y: .value("Clients", point.count))
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(Palette.chart)
                    .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                PointMark(x: .value("Month", point.label(lang)), y: .value("Clients", point.count))
                    .foregroundStyle(point.id == points.count - 1 ? Palette.chartSelected : Palette.chart)
                    .symbolSize(point.id == points.count - 1 ? 110 : 30)
                    .annotation(position: .top, spacing: 4) {
                        if point.id == points.count - 1 {
                            Text("\(point.count)").font(.archivo(12, .bold)).foregroundStyle(Palette.ink)
                        }
                    }
            }
            .chartYScale(domain: 0...top)
            .chartYAxis(.hidden)
            .chartXAxis {
                AxisMarks { _ in AxisValueLabel().font(.archivo(11, .semibold)) }
            }
            .frame(height: 140)
        }
        .card()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(CL.activeClientsChart(lang)): \(points.last?.count ?? 0)")
    }
}

// MARK: - Revenue by package (horizontal bars)

struct PackageBarsCard: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let packages = store.data.packages.filter { $0.value > 0 }
        let maxValue = Double(max(1, packages.map(\.value).max() ?? 1))
        VStack(alignment: .leading, spacing: 14) {
            Text(CT.packageChart(lang)).font(OJFont.title).foregroundStyle(Palette.ink)
            if packages.isEmpty { SubText(CL.noPackagesYet(lang)) }
            ForEach(packages) { pkg in
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
                if !store.data.radar.isEmpty {
                    Pill(store.live ? CT.atRisk2(lang).replacingOccurrences(of: "2", with: "\(store.data.radar.count)") : CT.atRisk2(lang), tone: .crit)
                }
            }
            .padding(.bottom, 4)
            if store.data.radar.isEmpty { SubText(CL.noRadar(lang)) }
            DividedRows(store.data.radar) { entry in
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
