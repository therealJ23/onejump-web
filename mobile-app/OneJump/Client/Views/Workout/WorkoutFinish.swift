import SwiftUI

/// "How did it go?" — effort and soreness before saving the workout.
struct FinishWorkoutSheet: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let left = store.allSets.count - store.setsDone

        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(CLT.howDidItGo(lang)).font(OJFont.h2).padding(.top, 20)
                Text(CLT.howHard(lang)).font(OJFont.title)
                ScaleRow(
                    options: [6, 7, 8, 9, 10].map { $0 == 10 ? CLT.max10(lang) : "\($0)" },
                    selected: store.effort - 6
                ) { store.effort = $0 + 6 }
                Text(CLT.howSore(lang)).font(OJFont.title)
                ScaleRow(options: CLT.soreOptions.map { $0(lang) }, selected: store.soreness) { store.soreness = $0 }
                if left > 0 {
                    SubText(CLT.setsLeft(left)(lang))
                }
                Button(CLT.saveWorkout(lang)) { store.saveWorkout() }
                    .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
            }
            .padding(20)
        }
        .background(Palette.surface.ignoresSafeArea())
    }
}

/// A row of equal buttons where one is picked (effort 6–10, soreness, check-in answers).
struct ScaleRow: View {
    let options: [String]
    let selected: Int
    let onSelect: (Int) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Array(options.enumerated()), id: \.offset) { pair in
                let isOn = pair.offset == selected
                Button {
                    withAnimation(.snappy) { onSelect(pair.offset) }
                    Haptics.tick()
                } label: {
                    Text(pair.element)
                        .font(.archivo(12, .semibold))
                        .lineLimit(2)
                        .minimumScaleFactor(0.75)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 2)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(isOn ? Palette.onPrimary : Palette.ink)
                        .background(isOn ? Palette.primary : Palette.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(isOn ? Color.clear : Palette.line2, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isOn ? .isSelected : [])
            }
        }
    }
}

/// The finish screen: minutes, pounds lifted, sets and any new personal best.
struct WorkoutDoneView: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var appeared = false

    var body: some View {
        let minutes = max(1, Int(((store.endDate ?? Date()).timeIntervalSince(store.startDate ?? Date()) / 60).rounded()))
        VStack(spacing: 16) {
            Image(systemName: "checkmark")
                .font(.system(size: 46, weight: .bold))
                .foregroundStyle(Palette.deep)
                .frame(width: 104, height: 104)
                .background(Palette.volt, in: Circle())
                .shadow(color: Palette.volt.opacity(0.5), radius: 30)
                .scaleEffect(appeared ? 1 : 0.4)
                .opacity(appeared ? 1 : 0)
                .padding(.top, 24)
            VStack(spacing: 6) {
                Text(CLT.workoutDone(lang)).font(OJFont.h1).foregroundStyle(Palette.ink)
                SubText(CLT.niceWork(lang)).multilineTextAlignment(.center)
            }
            HStack(spacing: 10) {
                StatTile(value: "\(minutes)", label: CLT.minutes(lang))
                StatTile(value: Fmt.grouped(Int(store.volume)), label: CLT.lbLifted(lang))
                StatTile(value: "\(store.setsDone)", label: CLT.setsLabel(lang))
            }
            if !store.newBests.isEmpty {
                HStack(spacing: 12) {
                    IconTile(systemName: "trophy.fill", tone: .volt)
                    TitleSub(CLT.newBest(lang), sub: store.newBests.joined(separator: ", "))
                }
                .card()
            }
            Button(CLT.backToToday(lang)) {
                store.closeWorkout()
                store.go(.today)
            }
            .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
        }
        .onAppear {
            withAnimation(.spring(duration: 0.5, bounce: 0.45)) { appeared = true }
        }
    }
}
