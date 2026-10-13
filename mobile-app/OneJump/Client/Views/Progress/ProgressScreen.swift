import Charts
import SwiftUI

/// Progress: weight trend with the goal line, stats, personal bests, measurements and private photos.
struct ProgressScreen: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        @Bindable var store = store
        ScreenScroll {
            ScreenHeader(eyebrow: CLT.sinceAug(lang), title: CLT.progress(lang))
            weightCard
            HStack(spacing: 10) {
                StatTile(value: "22", label: CLT.workouts(lang))
                StatTile(value: "18", label: CLT.dayStreak(lang))
                StatTile(value: CLT.sixOfSix(lang), label: CLT.checkIns(lang))
            }

            SectionHeader(CLT.personalBests(lang))
            ListCard {
                DividedRows(ClientData.records) { record in
                    HStack(spacing: 12) {
                        IconTile(systemName: "trophy")
                        TitleSub(record.name(lang), sub: record.date(lang))
                        Text(record.value).font(OJFont.title)
                        if record.isNew { Pill(CLT.newPill(lang), tone: .ai) }
                    }
                    .rowPadding()
                }
            }

            SectionHeader(CLT.measurements(lang), link: CLT.update(lang)) {
                store.measureDraft = store.measures
                store.showMeasureSheet = true
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(Array(store.measures.enumerated()), id: \.offset) { pair in
                    StatTile(
                        value: "\(Fmt.oneDecimal(pair.element)) in",
                        label: ClientData.measureNames[pair.offset](lang),
                        note: ClientData.measureChanges[pair.offset](lang),
                        labelFirst: true
                    )
                }
            }

            SectionHeader(title: CLT.progressPhotos(lang)) {
                Pill(CLT.onlyYouAndAlex(lang), tone: .muted)
            }
            HStack(spacing: 8) {
                Button { store.addProgressPhoto() } label: {
                    PhotoPlaceholder(label: CLT.add(lang), locked: false, dashed: true, systemImage: "camera")
                }
                .buttonStyle(.plain)
                ForEach(0..<min(store.newPhotos, 1), id: \.self) { _ in
                    PhotoPlaceholder(label: CLT.todayShort(lang))
                }
                ForEach(Array(ClientData.photoDates.prefix(store.newPhotos > 0 ? 2 : 3)), id: \.self) { date in
                    PhotoPlaceholder(label: date(lang))
                }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $store.showMeasureSheet) {
            MeasurementsSheet()
                .environment(store)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private var weightCard: some View {
        @Bindable var store = store
        let series = ClientData.weight[store.weightRange] ?? ClientData.weight[.threeMonths]!
        let values = series.values.enumerated().map { (index: $0.offset, value: $0.element) }

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    SubText(CLT.weight(lang))
                    Text("\(Fmt.oneDecimal(store.weight)) lb").font(.archivo(38, .heavy)).tracking(-1)
                    Text(CLT.lostSince(lang)).font(.archivo(12, .bold)).foregroundStyle(Palette.good)
                }
                Spacer()
                SegmentedBar(
                    options: [
                        SegmentOption(value: WeightRange.oneMonth, label: "1M"),
                        SegmentOption(value: WeightRange.threeMonths, label: "3M"),
                        SegmentOption(value: WeightRange.all, label: CLT.allRange(lang))
                    ],
                    selection: $store.weightRange,
                    compact: true
                )
                .frame(width: 160)
            }
            Chart {
                RuleMark(y: .value("Goal", ClientData.goalWeight))
                    .foregroundStyle(Palette.line2)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                ForEach(values, id: \.index) { point in
                    LineMark(x: .value("Week", point.index), y: .value("Weight", point.value))
                        .interpolationMethod(.catmullRom)
                        .foregroundStyle(Palette.chart)
                        .lineStyle(StrokeStyle(lineWidth: 2.6, lineCap: .round))
                    AreaMark(x: .value("Week", point.index), yStart: .value("Base", 144), yEnd: .value("Weight", point.value))
                        .interpolationMethod(.catmullRom)
                        .foregroundStyle(LinearGradient(colors: [Palette.chart.opacity(0.18), Palette.chart.opacity(0)], startPoint: .top, endPoint: .bottom))
                }
            }
            .chartYScale(domain: 144...160)
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(position: .trailing, values: [145, 150, 155, 160]) { value in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5))
                    AxisValueLabel {
                        if let v = value.as(Int.self) { Text("\(v)").font(.archivo(10)) }
                    }
                }
            }
            .frame(height: 130)
            .animation(.snappy, value: store.weightRange)
            HStack {
                SubText(series.start(lang))
                Spacer()
                SubText(CLT.goalLine(lang))
            }
        }
        .card()
    }
}

/// Update waist, hips, chest and arm.
struct MeasurementsSheet: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(CLT.updateMeasurements(lang)).font(OJFont.h2).padding(.top, 24)
            ForEach(store.measureDraft.indices, id: \.self) { i in
                HStack {
                    Text(ClientData.measureNames[i](lang)).font(OJFont.title)
                    Spacer()
                    ValueStepper(
                        value: "\(Fmt.trimmed(store.measureDraft[i])) in",
                        decreaseLabel: CLT.less(lang),
                        increaseLabel: CLT.more(lang),
                        onDecrease: { store.measureDraft[i] = max(1, store.measureDraft[i] - 0.25) },
                        onIncrease: { store.measureDraft[i] += 0.25 }
                    )
                }
            }
            Spacer(minLength: 0)
            Button(CLT.saveMeasurements(lang)) { store.saveMeasurements() }
                .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
        }
        .padding(20)
        .background(Palette.surface.ignoresSafeArea())
    }
}
