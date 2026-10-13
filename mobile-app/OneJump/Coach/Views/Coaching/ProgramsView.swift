import SwiftUI

/// All programs, plus a button to have Assist build a new one.
struct ProgramsView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        ScreenScroll {
            Button {
                store.send(CoachData.suggestions[2](lang))
            } label: {
                Label {
                    Text(CT.buildWithAssist(lang))
                } icon: {
                    AssistMark(size: 18, color: Palette.deep)
                }
            }
            .buttonStyle(.oj(.volt, fullWidth: true))

            ForEach(CoachData.programs) { program in
                Button {
                    store.push(.program(program.id))
                } label: {
                    HStack(spacing: 12) {
                        switch program.kind {
                        case .assistDraft: AssistTile()
                        case .active: IconTile(systemName: "square.stack.3d.up")
                        case .template: IconTile(systemName: "dumbbell")
                        }
                        TitleSub(CoachData.programName(program.id)(lang), sub: program.meta(lang))
                        Pill(program.tag(lang), tone: program.tone)
                    }
                    .card()
                }
                .buttonStyle(.plain)
            }
        }
        .ojNavigationTitle(CT.programs(lang))
    }
}

/// One program: its workouts, who is on it and recent logs.
struct ProgramDetailView: View {
    let programID: String
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let program = CoachData.programs.first { $0.id == programID } ?? CoachData.programs[1]
        let clients = CoachData.clients.filter { $0.programID == program.id }

        ScreenScroll {
            VStack(alignment: .leading, spacing: 6) {
                Text(CoachData.programName(program.id)(lang)).font(OJFont.h3).foregroundStyle(Palette.ink)
                HStack(spacing: 8) {
                    SubText(program.meta(lang))
                    Pill(program.tag(lang), tone: program.tone)
                }
            }

            SectionHeader(CT.workoutsWeek1(lang), link: CT.addWorkout(lang)) {
                store.toast.show(CT.toastPickExercise(lang))
            }
            ListCard {
                DividedRows(CoachData.programWorkouts) { workout in
                    Button {
                        store.push(.workoutBuilder)
                    } label: {
                        HStack(spacing: 12) {
                            IconTile(systemName: "dumbbell")
                            TitleSub(workout.name(lang), sub: workout.meta(lang))
                            Image(systemName: "chevron.right").foregroundStyle(Palette.muted)
                        }
                        .rowPadding()
                    }
                    .buttonStyle(.row)
                }
            }

            SectionHeader(CT.onProgram(lang))
            if clients.isEmpty {
                EmptyStateCard(systemImage: "person.badge.plus", title: CT.nobodyYet(lang), message: CT.assignToStart(lang))
            } else {
                ListCard {
                    DividedRows(clients) { c in
                        Button {
                            store.push(.client(c.id))
                        } label: {
                            HStack(spacing: 12) {
                                Avatar(initials: c.initials, color: c.avatarColor, size: 36)
                                TitleSub(c.name, sub: c.week > 0 ? CT.weekOf(c.week, c.weeks)(lang) : CT.startsSoon(lang))
                            }
                            .rowPadding()
                        }
                        .buttonStyle(.row)
                    }
                }
            }

            SectionHeader(CT.recentWorkouts(lang))
            ListCard {
                DividedRows(CoachData.programLogs) { log in
                    HStack(spacing: 10) {
                        Text(log.date(lang)).font(.archivo(12, .bold)).foregroundStyle(Palette.muted).frame(width: 44, alignment: .leading)
                        Text(log.text(lang)).font(.archivo(14))
                        Spacer(minLength: 0)
                    }
                    .rowPadding()
                }
            }

            HStack(spacing: 8) {
                Button(CT.assignClient(lang)) { store.toast.show(CT.toastAssign(lang)) }
                    .buttonStyle(.oj(.primary, fullWidth: true))
                Button(CT.archive(lang)) { store.toast.show(CT.toastArchived(lang)) }
                    .buttonStyle(.oj(.ghost))
            }
        }
        .ojNavigationTitle(CT.program(lang))
    }
}

/// Lower Body A, drafted by Assist around Maya's knee. Change sets with the steppers.
struct WorkoutBuilderView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        ScreenScroll {
            HStack {
                SubText(CT.workoutSub(lang))
                Spacer()
                Pill(CT.assistDraft(lang), tone: .ai)
            }
            ForEach(Array(CoachData.builderWorkout.enumerated()), id: \.element.id) { pair in
                exerciseRow(pair.element, index: pair.offset)
            }
            Button {
                store.toast.show(CT.toastPickExercise(lang))
            } label: {
                Label(CT.addExercise(lang), systemImage: "plus")
            }
            .buttonStyle(.oj(.ghost, fullWidth: true))

            AssistCard(label: CT.whyLooks(lang)) {
                DraftText(CT.whyBody(lang))
            }
            Button(CT.assignMaya(lang)) { store.toast.show(CT.toastAssignedMaya(lang)) }
                .buttonStyle(.oj(.primary, fullWidth: true))
        }
        .ojNavigationTitle(CT.lowerA(lang))
    }

    private func exerciseRow(_ exercise: BuilderExercise, index: Int) -> some View {
        let sets = store.builderSets[safe: index] ?? exercise.sets
        return HStack(spacing: 12) {
            Text("\(index + 1)")
                .font(.archivo(13, .heavy))
                .frame(width: 28, height: 28)
                .background(Palette.surface3, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            TitleSub(exercise.name(lang), sub: CT.repsRest(exercise.reps(lang), exercise.rest(lang))(lang))
            ValueStepper(
                value: CT.setsN(sets)(lang),
                minWidth: 66,
                decreaseLabel: CT.fewerSets(lang),
                increaseLabel: CT.moreSets(lang),
                onDecrease: { store.builderSets[index] = max(1, sets - 1) },
                onIncrease: { store.builderSets[index] = min(8, sets + 1) }
            )
        }
        .card(padding: 12)
    }
}
