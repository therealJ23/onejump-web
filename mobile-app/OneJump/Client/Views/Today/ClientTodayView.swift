import SwiftUI

/// Today for the client: the workout, a note from the coach, check-in, habits, food and sessions.
struct ClientTodayView: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        ScreenScroll {
            header
            workoutCard
            if !store.checkInSent {
                Button { store.openCheckIn() } label: {
                    HStack(spacing: 12) {
                        IconTile(systemName: "list.clipboard", tone: .assist)
                        TitleSub(CLT.checkInCard(lang), sub: CLT.checkInCardSub(lang))
                        Pill(CLT.start(lang), tone: .warn)
                    }
                    .card()
                }
                .buttonStyle(.plain)
            }
            habitsCard
            foodCard
            ListCard {
                HStack(spacing: 12) {
                    IconTile(systemName: "video")
                    TitleSub(store.slotLabel(store.booked), sub: CLT.videoWithAlex(lang))
                    Button(CLT.reschedule(lang)) { store.push(.book) }
                        .buttonStyle(.oj(.ghost, size: .small))
                }
                .rowPadding()
                RowDivider()
                Button { store.go(.coach) } label: {
                    HStack(spacing: 12) {
                        Avatar(initials: "AR", color: Palette.volt, size: 36)
                        TitleSub("Alex", sub: ClientData.chat.last(where: { !$0.fromMe })?.text(lang), lineLimit: 1)
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
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScreenHeader(eyebrow: CLT.date(lang), title: CLT.hello(lang)) {
                HStack(spacing: 8) {
                    ThemeToggleButton()
                    Button { store.push(.me) } label: {
                        Avatar(initials: "MC", color: Color(hex: 0xCFE0C3))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(CLT.profile(lang))
                }
            }
            Label(CLT.streakLine(lang), systemImage: "flame.fill")
                .font(.archivo(14, .semibold))
                .foregroundStyle(Palette.ink)
                .labelStyle(StreakLabelStyle())
        }
    }

    private var workoutCard: some View {
        let total = store.allSets.count
        let status: String = store.workoutDone ? CLT.doneLabel(lang)
            : (store.workoutStarted ? CLT.setsOf(store.setsDone, total)(lang) : CLT.notStarted(lang))
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Eyebrow(CLT.todaysWorkout(lang), color: Palette.volt)
                Spacer()
                Text(status).font(OJFont.sub).foregroundStyle(Palette.bone.opacity(0.75))
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(CLT.workoutName(lang)).font(.archivo(34, .heavy)).tracking(-1)
                Text(CLT.workoutMeta(lang)).font(OJFont.sub).foregroundStyle(Palette.bone.opacity(0.75))
            }
            HStack(alignment: .top, spacing: 10) {
                Avatar(initials: "AR", color: Palette.volt, size: 28)
                Text(CLT.coachNote(lang)).font(.archivo(14)).fixedSize(horizontal: false, vertical: true)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            if store.workoutDone {
                HStack(spacing: 10) {
                    Pill(CLT.doneLabel(lang), tone: .ai)
                    Text(summary).font(OJFont.sub).foregroundStyle(Palette.bone.opacity(0.75))
                }
            } else {
                Button { store.startWorkout() } label: {
                    Label(store.workoutStarted ? CLT.continueWorkout(lang) : CLT.startWorkout(lang), systemImage: "play.fill")
                }
                .buttonStyle(.oj(.volt, size: .large, fullWidth: true))
            }
        }
        .heroCard()
    }

    private var summary: String {
        let minutes = max(1, Int(((store.endDate ?? Date()).timeIntervalSince(store.startDate ?? Date()) / 60).rounded()))
        return CLT.workoutSummary(minutes, Fmt.grouped(Int(store.volume)), store.setsDone)(lang)
    }

    private var habitsCard: some View {
        let done = ClientData.habits.filter { store.habits[$0.id] ?? false }.count
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(CLT.habitsToday(lang)).font(OJFont.title)
                Spacer()
                Pill(CLT.nOfT(done, ClientData.habits.count)(lang), tone: done == ClientData.habits.count ? .good : .muted)
            }
            .padding(.bottom, 4)
            DividedRows(ClientData.habits) { habit in
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
                        TitleSub(habit.title(lang), sub: habit.id == "water" ? CLT.waterHabit(Fmt.trimmed(store.water))(lang) : habit.detail.map { $0(lang) })
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
                CalorieRing(eaten: totals.kcal, target: ClientData.kcalTarget, size: 92)
                VStack(alignment: .leading, spacing: 8) {
                    Text(CLT.foodToday(lang)).font(OJFont.title)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(CLT.protein(lang)).font(.archivo(13))
                            Spacer()
                            SubText("\(Int(totals.protein.rounded())) / \(Int(ClientData.proteinTarget)) g")
                        }
                        ProgressBar(value: totals.protein / ClientData.proteinTarget, tint: Palette.progressGreen)
                    }
                    SubText(CLT.foodsLogged(totals.count, Int(totals.protein.rounded()))(lang))
                }
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
