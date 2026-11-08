import SwiftUI

/// Today for the client: the workout, a note from the coach, check-in, habits, food and sessions.
struct ClientTodayView: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        ScreenScroll {
            header
            if store.live && store.paymentProblem {
                Button { store.push(.me) } label: {
                    HStack(spacing: 12) {
                        IconTile(systemName: "creditcard.trianglebadge.exclamationmark")
                        Text(CLT.paymentProblem(lang)).font(OJFont.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    .card(background: Palette.surface2)
                }
                .buttonStyle(.plain)
            }
            workoutCard
            if !store.checkInSent {
                Button { store.openCheckIn() } label: {
                    HStack(spacing: 12) {
                        IconTile(systemName: "list.clipboard", tone: .assist)
                        TitleSub(store.live ? CLT.weekCheckIn(lang) : CLT.checkInCard(lang), sub: store.live ? CLT.weekCheckInSub(lang) : CLT.checkInCardSub(lang))
                        Pill(CLT.start(lang), tone: .warn)
                    }
                    .card()
                }
                .buttonStyle(.plain)
            }
            if !store.habitList.isEmpty { habitsCard }
            foodCard
            ListCard {
                if !store.live {
                    HStack(spacing: 12) {
                        IconTile(systemName: "video")
                        TitleSub(store.slotLabel(store.booked), sub: CLT.videoWithAlex(lang))
                        Button(CLT.reschedule(lang)) { store.push(.book) }
                            .buttonStyle(.oj(.ghost, size: .small))
                    }
                    .rowPadding()
                    RowDivider()
                }
                Button { store.go(.coach) } label: {
                    HStack(spacing: 12) {
                        Avatar(initials: store.coachPerson.initials, color: Palette.volt, size: 36, photoURL: store.coachPerson.photoURL)
                        TitleSub(store.coachPerson.first.isEmpty ? CLT.yourCoach(lang) : store.coachPerson.first,
                                 sub: lastCoachLine, lineLimit: 1)
                        if !store.readCoach {
                            Circle().fill(Palette.crit).frame(width: 10, height: 10)
                        }
                    }
                    .rowPadding()
                }
                .buttonStyle(.row)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { if store.live { await store.loadLive() } }
    }

    private var lastCoachLine: String? {
        let message: Loc? = store.live ? store.lastCoachMessage : ClientData.chat.last(where: { !$0.fromMe })?.text
        return message.map { $0(lang) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScreenHeader(eyebrow: store.dateLine(lang), title: store.greeting(lang)) {
                HStack(spacing: 8) {
                    ThemeToggleButton()
                    Button { store.push(.me) } label: {
                        Avatar(initials: store.mePerson.initials, color: Color(hex: 0xCFE0C3), photoURL: store.mePerson.photoURL, localImage: store.pendingProfilePhoto)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(CLT.profile(lang))
                }
            }
            if !store.streakText(lang).isEmpty {
                Label(store.streakText(lang), systemImage: "flame.fill")
                    .font(.archivo(14, .semibold))
                    .foregroundStyle(Palette.ink)
                    .labelStyle(StreakLabelStyle())
            }
        }
    }

    private var workoutCard: some View {
        let total = store.allSets.count
        let status: String = store.workoutDone ? CLT.doneLabel(lang)
            : (store.workoutStarted ? CLT.setsOf(store.setsDone, total)(lang) : CLT.notStarted(lang))
        let eyebrow: String = !store.hasWorkout ? CLT.restDay(lang)
            : (store.workoutDay.map { CLT.nextUp($0(lang))(lang) } ?? CLT.todaysWorkout(lang))
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Eyebrow(eyebrow, color: Palette.volt)
                Spacer()
                if store.hasWorkout && (!store.live || store.workoutStarted || store.workoutDone) {
                    Text(status).font(OJFont.sub).foregroundStyle(Palette.bone.opacity(0.75))
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(store.workoutTitle(lang)).font(.archivo(34, .heavy)).tracking(-1)
                Text(store.workoutMeta(lang)).font(OJFont.sub).foregroundStyle(Palette.bone.opacity(0.75))
            }
            if let note = store.workoutNote {
                HStack(alignment: .top, spacing: 10) {
                    Avatar(initials: store.coachPerson.initials, color: Palette.volt, size: 28, photoURL: store.coachPerson.photoURL)
                    Text(note(lang)).font(.archivo(14)).fixedSize(horizontal: false, vertical: true)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            if store.workoutDone {
                HStack(spacing: 10) {
                    Pill(CLT.doneLabel(lang), tone: .ai)
                    if store.startDate != nil {
                        Text(summary).font(OJFont.sub).foregroundStyle(Palette.bone.opacity(0.75))
                    }
                }
            } else if store.hasWorkout {
                Button { store.startWorkout() } label: {
                    HStack(spacing: 8) {
                        if store.workoutLoading { ProgressView().tint(Palette.deep) }
                        Label(store.workoutStarted ? CLT.continueWorkout(lang) : (store.workoutDay != nil ? CLT.startEarly(lang) : CLT.startWorkout(lang)), systemImage: "play.fill")
                    }
                }
                .buttonStyle(.oj(.volt, size: .large, fullWidth: true))
                .disabled(store.workoutLoading)
            }
        }
        .heroCard()
    }

    private var summary: String {
        let minutes = max(1, Int(((store.endDate ?? Date()).timeIntervalSince(store.startDate ?? Date()) / 60).rounded()))
        return CLT.workoutSummary(minutes, Fmt.grouped(Int(store.volume)), store.setsDone)(lang)
    }

    private var habitsCard: some View {
        let done = store.habitList.filter { store.habits[$0.id] ?? false }.count
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(CLT.habitsToday(lang)).font(OJFont.title)
                Spacer()
                Pill(CLT.nOfT(done, store.habitList.count)(lang), tone: done == store.habitList.count ? .good : .muted)
            }
            .padding(.bottom, 4)
            DividedRows(store.habitList) { habit in
                let on = store.habits[habit.id] ?? false
                Button { store.toggleHabit(habit) } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(on ? Color.white : Color.clear)
                            .frame(width: 30, height: 30)
                            .background(on ? Palette.good : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(on ? Color.clear : Palette.line2, lineWidth: 2))
                            .scaleEffect(on ? 1.04 : 1)
                        TitleSub(habit.title(lang), sub: habit.id == "water" && !store.live ? CLT.waterHabit(Fmt.trimmed(store.water))(lang) : habit.detail.map { $0(lang) })
                    }
                    .padding(.vertical, 10)
                }
                .buttonStyle(.row)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .card()
    }

    private var foodCard: some View {
        let totals = store.totals(for: .today)
        return Button { store.go(.food) } label: {
            HStack(spacing: 16) {
                if let targets = store.targets {
                    CalorieRing(eaten: totals.kcal, target: targets.kcal, size: 92)
                } else {
                    IconTile(systemName: "fork.knife", tone: .assist, size: 52)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text(CLT.foodToday(lang)).font(OJFont.title)
                    if let targets = store.targets, targets.protein > 0 {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(CLT.protein(lang)).font(.archivo(13))
                                Spacer()
                                SubText("\(Int(totals.protein.rounded())) / \(Int(targets.protein)) g")
                            }
                            ProgressBar(value: totals.protein / targets.protein, tint: Palette.progressGreen)
                        }
                    }
                    SubText(store.hideNumbers || store.targets == nil
                            ? CLT.foodsCount(totals.count)(lang)
                            : CLT.foodsLogged(totals.count, Int(totals.protein.rounded()))(lang))
                }
                Spacer(minLength: 0)
            }
            .foregroundStyle(Palette.ink)
            .card()
        }
        .buttonStyle(.plain)
    }
}

/// Orange flame + text for the streak line.
private struct StreakLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon.foregroundStyle(Palette.warn)
            configuration.title
        }
    }
}

/// Ring showing calories left for the day.
struct CalorieRing: View {
    let eaten: Double
    let target: Double
    var size: CGFloat = 118
    @Environment(\.lang) private var lang

    var body: some View {
        let progress = min(1, eaten / target)
        let left = max(0, target - eaten)
        ZStack {
            Circle().stroke(Palette.surface3, lineWidth: size * 0.1)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(Palette.progressGreen, style: StrokeStyle(lineWidth: size * 0.1, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.5), value: progress)
            VStack(spacing: 0) {
                Text(Fmt.grouped(Int(left.rounded())))
                    .font(.archivo(size * 0.21, .heavy))
                    .foregroundStyle(Palette.ink)
                    .contentTransition(.numericText())
                Text(CLT.kcalLeft(lang))
                    .font(.archivo(11))
                    .foregroundStyle(Palette.muted)
            }
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .combine)
    }
}
