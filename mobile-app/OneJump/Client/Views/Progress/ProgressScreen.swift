import Charts
import PhotosUI
import SwiftUI

/// Progress: weight trend with the goal line, stats, personal bests, measurements and private photos.
struct ProgressScreen: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var photoPick: PhotosPickerItem?
    @State private var showCamera = false

    var body: some View {
        @Bindable var store = store
        ScreenScroll {
            ScreenHeader(eyebrow: store.live ? (store.weightStart.map { $0(lang) } ?? CLT.progress(lang)) : CLT.sinceAug(lang), title: CLT.progress(lang))
            if store.live && (store.weightPoints?.count ?? 0) < 2 {
                VStack(alignment: .leading, spacing: 8) {
                    SubText(CLT.weight(lang))
                    Text(store.weight > 0 ? "\(Fmt.oneDecimal(store.weight)) lb" : "—").font(.archivo(38, .heavy)).tracking(-1)
                    SubText(store.weightChangeText(lang))
                    Button(CLT.logWeight(lang)) {
                        store.weightDraft = store.weight > 0 ? store.weight : 150
                        store.showWeightSheet = true
                    }
                    .buttonStyle(.oj(.ghost, size: .small))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card()
            } else {
                weightCard
            }
            HStack(spacing: 10) {
                StatTile(value: "\(store.workoutsDone)", label: CLT.workouts(lang))
                StatTile(value: "\(store.streakDays)", label: CLT.dayStreak(lang))
                if store.live {
                    StatTile(value: CLT.workoutsOf(store.weekDone, store.weekPlanned)(lang), label: CLT.thisWeek(lang))
                } else {
                    StatTile(value: CLT.sixOfSix(lang), label: CLT.checkIns(lang))
                }
            }

            SectionHeader(CLT.personalBests(lang))
            if store.records.isEmpty {
                SubText(CLT.noBests(lang)).padding(.horizontal, 4)
            }
            ListCard {
                DividedRows(store.records) { record in
                    HStack(spacing: 12) {
                        IconTile(systemName: "trophy")
                        TitleSub(record.name(lang), sub: record.date(lang).isEmpty ? nil : record.date(lang))
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
                        value: pair.element > 0 ? "\(Fmt.oneDecimal(pair.element)) in" : "—",
                        label: ClientData.measureNames[pair.offset](lang),
                        note: store.live ? nil : ClientData.measureChanges[pair.offset](lang),
                        labelFirst: true
                    )
                }
            }

            SectionHeader(title: CLT.progressPhotos(lang)) {
                Pill(store.live ? CLT.onlyYouAnd(store.coachPerson.first)(lang) : CLT.onlyYouAndAlex(lang), tone: .muted)
            }
            if store.live {
                livePhotos
            } else {
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
        }
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { if store.live { await store.loadLive() } }
        .onChange(of: photoPick) { _, item in
            guard let item else { return }
            Task { @MainActor in
                defer { photoPick = nil }
                guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
                    store.toast.show(CLT.photoUnreadable(lang))
                    return
                }
                store.addProgressPhoto(image)
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            PhotoCamera { image in
                showCamera = false
                if let image { store.addProgressPhoto(image) }
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $store.showMeasureSheet) {
            MeasurementsSheet()
                .environment(store)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    /// The client's own photos: add from the camera or library, long-press to delete.
    private var livePhotos: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
            Menu {
                if PhotoCamera.isAvailable {
                    Button { showCamera = true } label: { Label(CLT.takePhoto(lang), systemImage: "camera") }
                }
                PhotosPicker(selection: $photoPick, matching: .images) {
                    Label(CLT.choosePhoto(lang), systemImage: "photo.on.rectangle")
                }
            } label: {
                PhotoPlaceholder(label: CLT.add(lang), locked: false, dashed: true, systemImage: "camera")
            }
            ForEach(store.progressPhotos) { photo in
                Color.clear
                    .aspectRatio(3 / 4, contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .overlay { RemotePhoto(path: photo.url) }
                    .overlay(alignment: .bottomLeading) {
                        Text(photo.date(lang))
                            .font(.archivo(11, .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Color.black.opacity(0.45), in: Capsule())
                            .padding(6)
                    }
                    .background(Palette.surface2)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .contextMenu {
                        Button(role: .destructive) { store.deleteProgressPhoto(photo) } label: {
                            Label(CLT.deletePhoto(lang), systemImage: "trash")
                        }
                    }
            }
        }
    }

    private var weightCard: some View {
        @Bindable var store = store
        let series = store.live
            ? WeightSeries(values: store.weightPoints ?? [], start: store.weightStart ?? Loc(same: ""))
            : (ClientData.weight[store.weightRange] ?? ClientData.weight[.threeMonths]!)
        let values = series.values.enumerated().map { (index: $0.offset, value: $0.element) }
        let low = min(series.values.min() ?? 0, store.goalWeight ?? .infinity)
        let high = max(series.values.max() ?? 1, store.goalWeight ?? -.infinity)
        let lower = store.live ? (low - 2).rounded(.down) : 144
        let upper = store.live ? (high + 2).rounded(.up) : 160
        let marks: [Double] = store.live ? Self.marks(lower, upper) : [145, 150, 155, 160]

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    SubText(CLT.weight(lang))
                    Text("\(Fmt.oneDecimal(store.weight)) lb").font(.archivo(38, .heavy)).tracking(-1)
                    Text(store.live ? store.weightChangeText(lang) : CLT.lostSince(lang)).font(.archivo(12, .bold)).foregroundStyle(Palette.good)
                }
                Spacer()
                if store.live {
                    Button(CLT.logWeight(lang)) {
                        store.weightDraft = store.weight
                        store.showWeightSheet = true
                    }
                    .buttonStyle(.oj(.ghost, size: .small))
                } else {
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
            }
            Chart {
                if let goal = store.goalWeight {
                    RuleMark(y: .value("Goal", goal))
                        .foregroundStyle(Palette.line2)
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                }
                ForEach(values, id: \.index) { point in
                    LineMark(x: .value("Week", point.index), y: .value("Weight", point.value))
                        .interpolationMethod(.catmullRom)
                        .foregroundStyle(Palette.chart)
                        .lineStyle(StrokeStyle(lineWidth: 2.6, lineCap: .round))
                    AreaMark(x: .value("Week", point.index), yStart: .value("Base", lower), yEnd: .value("Weight", point.value))
                        .interpolationMethod(.catmullRom)
                        .foregroundStyle(LinearGradient(colors: [Palette.chart.opacity(0.18), Palette.chart.opacity(0)], startPoint: .top, endPoint: .bottom))
                }
            }
            .chartYScale(domain: lower...upper)
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(position: .trailing, values: marks) { value in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5))
                    AxisValueLabel {
                        if let v = value.as(Double.self) { Text("\(Int(v.rounded()))").font(.archivo(10)) }
                    }
                }
            }
            .frame(height: 130)
            .animation(.snappy, value: store.weightRange)
            HStack {
                SubText(series.start(lang))
                Spacer()
                if store.live {
                    if let goal = store.goalWeight { SubText(CLT.goalLineLive(Fmt.trimmed(goal))(lang)) }
                } else {
                    SubText(CLT.goalLine(lang))
                }
            }
        }
        .card()
    }

    /// Four round numbers for the weight axis.
    static func marks(_ lower: Double, _ upper: Double) -> [Double] {
        let step = max(1, ((upper - lower) / 3).rounded())
        return (0...3).map { (lower + Double($0) * step).rounded() }.filter { $0 <= upper }
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
