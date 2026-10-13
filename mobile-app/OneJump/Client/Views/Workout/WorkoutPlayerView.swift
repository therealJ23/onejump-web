import SwiftUI

/// The workout player: one exercise at a time, log sets by tapping or by voice,
/// rest timer, swaps when equipment is busy, and a summary at the end.
struct WorkoutPlayerView: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        @Bindable var store = store
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    progressSegments
                    if store.workoutDone {
                        WorkoutDoneView()
                    } else {
                        ExercisePlayer()
                    }
                }
                .padding(16)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            .background(Palette.bg.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { store.closeWorkout() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel(CLT.closeWorkout(lang))
                }
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text(CLT.workoutName(lang)).font(OJFont.title)
                        ElapsedLabel()
                    }
                }
                if !store.workoutDone {
                    ToolbarItem(placement: .confirmationAction) {
                        Button { store.showFinishSheet = true } label: { Image(systemName: "checkmark") }
                            .accessibilityLabel(CLT.finishWorkout(lang))
                    }
                }
            }
            .toolbarBackground(Palette.bg, for: .navigationBar)
        }
        .sheet(isPresented: $store.showFinishSheet) {
            FinishWorkoutSheet()
                .environment(store)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private var progressSegments: some View {
        HStack(spacing: 4) {
            ForEach(ClientData.workout.indices, id: \.self) { i in
                Capsule()
                    .fill(store.isExerciseDone(i) ? Palette.progressGreen : (i == store.currentExercise ? Palette.primary : Palette.surface3))
                    .frame(height: 5)
            }
        }
        .accessibilityHidden(true)
    }
}

/// "12:04 · 7 of 17 sets", ticking every second.
private struct ElapsedLabel: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let end = store.endDate ?? context.date
            let seconds = Int(end.timeIntervalSince(store.startDate ?? end))
            Text("\(Fmt.clock(seconds)) · \(CLT.setsOf(store.setsDone, store.allSets.count)(lang))")
                .font(.archivo(12))
                .foregroundStyle(Palette.muted)
                .monospacedDigit()
        }
    }
}

// MARK: - Current exercise

private struct ExercisePlayer: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let index = store.currentExercise
        let exercise = ClientData.workout[index]
        let complete = store.activeSetIndex == nil

        VStack(alignment: .leading, spacing: 14) {
            RestBar()

            VideoPlaceholder(label: CLT.playHowTo(lang)) { store.toast.show(CLT.videoHere(lang)) }

            VStack(alignment: .leading, spacing: 4) {
                Eyebrow(CLT.exerciseOf(index + 1, ClientData.workout.count)(lang))
                Text(store.exerciseName(index)(lang)).font(OJFont.h3).foregroundStyle(Palette.ink)
                SubText(CLT.exerciseLine(exercise.target(lang), "\(exercise.rest) \(CLT.secUnit(lang))", exercise.last(lang))(lang))
                Text(exercise.cue(lang))
                    .font(OJFont.body)
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
            }

            ChipScroller {
                SubText(CLT.equipmentBusy(lang))
                ForEach(Array(exercise.swaps.enumerated()), id: \.offset) { pair in
                    Chip(label: pair.element(lang), isOn: store.swapped[index] == pair.offset, systemImage: "arrow.left.arrow.right") {
                        store.swap(to: pair.offset)
                    }
                }
            }

            ForEach(Array(store.sets[index].enumerated()), id: \.offset) { pair in
                SetRow(setIndex: pair.offset, entry: pair.element, isActive: pair.offset == store.activeSetIndex)
            }

            if complete {
                Button(nextLabel) { store.goToNextExercise() }
                    .buttonStyle(.oj(.volt, size: .large, fullWidth: true))
            }

            ListCard {
                DividedRows(Array(ClientData.workout.indices)) { i in
                    exerciseRow(i)
                }
            }
        }
    }

    private var nextLabel: String {
        let current = store.currentExercise
        let indices = ClientData.workout.indices
        if let next = indices.first(where: { $0 > current && !store.isExerciseDone($0) }) {
            return CLT.nextExercise(store.exerciseName(next)(lang))(lang)
        }
        if let open = indices.first(where: { !store.isExerciseDone($0) }) {
            return CLT.backTo(store.exerciseName(open)(lang))(lang)
        }
        return CLT.finishWorkout(lang)
    }

    private func exerciseRow(_ i: Int) -> some View {
        let ex = ClientData.workout[i]
        let done = store.sets[i].filter(\.done).count
        let isCurrent = i == store.currentExercise
        return Button {
            withAnimation(.snappy) { store.currentExercise = i }
        } label: {
            HStack(spacing: 12) {
                Text("\(i + 1)")
                    .font(.archivo(13, .heavy))
                    .frame(width: 28, height: 28)
                    .background(Palette.surface3, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.exerciseName(i)(lang))
                        .font(OJFont.title)
                        .foregroundStyle(isCurrent ? Palette.good : Palette.ink)
                    SubText(CLT.exerciseMeta(ex.target(lang), done, ex.sets)(lang))
                }
                Spacer(minLength: 0)
                if store.isExerciseDone(i) {
                    Pill(CLT.doneLabel(lang), tone: .good)
                }
            }
            .rowPadding()
        }
        .buttonStyle(.row)
    }
}

/// Dark bar with the rest countdown.
private struct RestBar: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { context in
            let remaining = Int((store.restEndsAt?.timeIntervalSince(context.date) ?? 0).rounded(.up))
            if remaining > 0 {
                HStack(spacing: 12) {
                    Image(systemName: "timer").font(.system(size: 18, weight: .semibold))
                    Text(Fmt.clock(remaining))
                        .font(.archivo(26, .heavy))
                        .foregroundStyle(Palette.volt)
                        .monospacedDigit()
                        .frame(minWidth: 64, alignment: .leading)
                    Text(CLT.restNext((store.activeSetIndex ?? 0) + 1)(lang))
                        .font(OJFont.sub)
                        .foregroundStyle(Palette.bone.opacity(0.75))
                    Spacer(minLength: 0)
                    Button(CLT.skip(lang)) { store.skipRest() }
                        .buttonStyle(.oj(.onHero, size: .small))
                }
                .foregroundStyle(Palette.bone)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Palette.hero, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }
}

/// One set: done (green), active (steppers + log), or still to do.
private struct SetRow: View {
    let setIndex: Int
    let entry: SetEntry
    let isActive: Bool
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    private var exercise: WorkoutExercise { ClientData.workout[store.currentExercise] }

    var body: some View {
        if isActive {
            active
        } else {
            HStack(spacing: 10) {
                Group {
                    if entry.done {
                        Image(systemName: "checkmark").font(.system(size: 12, weight: .bold))
                    } else {
                        Text("\(setIndex + 1)").font(.archivo(13, .heavy))
                    }
                }
                .foregroundStyle(entry.done ? Color.white : Palette.ink)
                .frame(width: 28, height: 28)
                .background(entry.done ? Palette.good : Palette.surface3, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                Text(CLT.setN(setIndex + 1)(lang))
                    .font(OJFont.body)
                    .foregroundStyle(entry.done ? Palette.ink : Palette.muted)
                Spacer()
                Text(valueLabel).font(.archivo(15, entry.done ? .bold : .regular)).foregroundStyle(entry.done ? Palette.ink : Palette.muted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(entry.done ? Palette.goodTint : Palette.surface2, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    private var valueLabel: String {
        exercise.isTimed ? "\(entry.reps) \(CLT.secUnit(lang))" : "\(Fmt.trimmed(entry.weight)) lb × \(entry.reps)"
    }

    private var active: some View {
        let listening = store.listenMode == .set
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                HStack(spacing: 10) {
                    Text("\(setIndex + 1)")
                        .font(.archivo(13, .heavy))
                        .frame(width: 28, height: 28)
                        .background(Palette.surface3, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                    Text(CLT.setN(setIndex + 1)(lang)).font(OJFont.title)
                }
                Spacer()
                SubText(CLT.target(exercise.target(lang))(lang))
            }
            HStack {
                ValueStepper(
                    value: exercise.weight > 0 ? "\(Fmt.trimmed(entry.weight)) lb" : CLT.bodyweight(lang),
                    decreaseLabel: CLT.lessWeight(lang),
                    increaseLabel: CLT.moreWeight(lang),
                    enabled: exercise.weight > 0,
                    onDecrease: { store.adjust(set: setIndex, weight: -2.5) },
                    onIncrease: { store.adjust(set: setIndex, weight: 2.5) }
                )
                Spacer(minLength: 4)
                ValueStepper(
                    value: "\(entry.reps) \(exercise.isTimed ? CLT.secUnit(lang) : CLT.repsUnit(lang))",
                    minWidth: 62,
                    decreaseLabel: CLT.fewerReps(lang),
                    increaseLabel: CLT.moreReps(lang),
                    onDecrease: { store.adjust(set: setIndex, reps: exercise.isTimed ? -5 : -1) },
                    onIncrease: { store.adjust(set: setIndex, reps: exercise.isTimed ? 5 : 1) }
                )
            }
            if listening {
                ListenBar(text: store.voice.heard.isEmpty ? CLT.listeningSet(lang) : "“\(store.voice.heard)”")
            }
            HStack(spacing: 8) {
                Button {
                    store.logSet(setIndex)
                    store.toast.show(CLT.setLogged(setIndex + 1)(lang))
                } label: {
                    Label(CLT.logSet(lang), systemImage: "checkmark")
                }
                .buttonStyle(.oj(.primary, fullWidth: true))
                Button { store.logSetByVoice() } label: {
                    Label(CLT.sayIt(lang), systemImage: "mic.fill")
                }
                .buttonStyle(.oj(.volt))
                .accessibilityLabel(CLT.sayItLabel(lang))
            }
            SubText(CLT.trySaying(example)(lang))
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
        .padding(14)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.primary, lineWidth: 2))
        .shadow(color: Palette.shadow.opacity(0.4), radius: 10, x: 0, y: 5)
    }

    private var example: String {
        exercise.isTimed
            ? CLT.secondsExample(entry.reps)(lang)
            : CLT.voiceExample(entry.reps, Fmt.trimmed(entry.weight))(lang)
    }
}
