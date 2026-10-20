import SwiftUI

/// The exercise library: search, filter by muscle group, open one to see cues and swaps.
struct ExerciseLibraryView: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var deleting: LibraryExercise?

    var body: some View {
        @Bindable var store = store
        ScreenScroll {
            SearchField(placeholder: CT.searchExercises(lang), text: $store.librarySearch)
            ChipScroller {
                ForEach(MuscleGroup.allCases, id: \.self) { group in
                    Chip(label: group.label(lang), isOn: store.libraryFilter == group) {
                        withAnimation(.snappy) { store.libraryFilter = group }
                    }
                }
            }
            if store.live {
                Button {
                    store.showAddExercise = true
                } label: {
                    Label(TT.addOwnExercise(lang), systemImage: "plus")
                }
                .buttonStyle(.oj(.primary, fullWidth: true))
            }
            ListCard {
                DividedRows(filtered) { exercise in
                    Button {
                        store.push(.exercise(exercise.id))
                    } label: {
                        HStack(spacing: 12) {
                            IconTile(systemName: exercise.mediaType == "video" ? "play.rectangle.fill" : exercise.mediaType == "image" ? "photo" : "play.rectangle")
                            TitleSub(exercise.name(lang), sub: "\(exercise.group.label(lang)) · \(exercise.equipment(lang))")
                            if exercise.custom { Pill(TT.yours(lang), tone: .good) }
                            Image(systemName: "chevron.right").foregroundStyle(Palette.muted)
                        }
                        .rowPadding()
                    }
                    .buttonStyle(.row)
                    .contextMenu {
                        if store.live {
                            Button(role: .destructive) {
                                deleting = exercise
                            } label: {
                                Label(TT.deleteExercise(lang), systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
        .ojNavigationTitle(CT.library(lang))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    if store.live { store.showAddExercise = true } else { store.toast.show(CT.toastPickExercise(lang)) }
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(CT.addOwnExercise(lang))
            }
        }
        .sheet(isPresented: $store.showAddExercise) {
            AddExerciseSheet().environment(store)
        }
        .confirmationDialog(TT.deleteExerciseAsk(deleting?.name(lang) ?? "")(lang),
                            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible) {
            Button(TT.deleteExercise(lang), role: .destructive) {
                if let e = deleting { Task { await store.deleteExercise(e.id) } }
                deleting = nil
            }
            Button(TT.cancel(lang), role: .cancel) { deleting = nil }
        } message: {
            Text(deleting?.custom == true ? TT.deleteOwnBody(lang) : TT.deleteSharedBody(lang))
        }
    }

    private var filtered: [LibraryExercise] {
        let query = store.librarySearch.trimmingCharacters(in: .whitespaces).lowercased()
        return store.data.library.filter { x in
            (store.libraryFilter == .all || x.group == store.libraryFilter)
                && (query.isEmpty || x.name(lang).lowercased().contains(query))
        }
    }
}

/// One exercise: demo video, how-to cues and swap-ready alternatives.
struct ExerciseDetailView: View {
    let exerciseID: String
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        if store.live {
            LiveExerciseDetailView(exerciseID: exerciseID)
        } else {
            sample
        }
    }

    @ViewBuilder
    private var sample: some View {
        let exercise = store.data.library.first { $0.id == exerciseID } ?? store.data.library.first ?? CoachData.library[0]
        let cues = exercise.howTo ?? CoachData.cues[exercise.group] ?? []
        let alternatives = exercise.alternatives ?? (CoachData.alternatives[exercise.group] ?? []).filter { $0 != exercise.name }

        ScreenScroll {
            VideoPlaceholder(label: CT.playDemo(lang)) { store.toast.show(CT.toastDemo(lang)) }

            VStack(alignment: .leading, spacing: 4) {
                Text(exercise.name(lang)).font(OJFont.h3).foregroundStyle(Palette.ink)
                SubText("\(exercise.group.label(lang)) · \(exercise.equipment(lang))")
            }

            VStack(alignment: .leading, spacing: 10) {
                Eyebrow(CT.howTo(lang))
                ForEach(cues, id: \.self) { cue in
                    HStack(alignment: .top, spacing: 10) {
                        Circle().fill(Palette.assistInk).frame(width: 6, height: 6).padding(.top, 7)
                        Text(cue(lang)).font(OJFont.body).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .card()

            ListCard {
                VStack(alignment: .leading, spacing: 4) {
                    Eyebrow(CT.alternatives(lang))
                    SubText(CT.alternativesBody(lang))
                }
                .rowPadding()
                ForEach(alternatives, id: \.self) { alt in
                    RowDivider()
                    HStack {
                        Text(alt(lang)).font(OJFont.title)
                        Spacer()
                        Pill(CT.swapReady(lang), tone: .good)
                    }
                    .rowPadding()
                }
            }

            Button(CT.addToWorkout(lang)) { store.toast.show(CT.toastAddedWorkout(lang)) }
                .buttonStyle(.oj(.primary, fullWidth: true))
        }
        .ojNavigationTitle(CT.exercise(lang))
    }
}

/// Striped 16:9 box with a play button, standing in for a how-to video.
struct VideoPlaceholder: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                StripedFill()
                Image(systemName: "play.fill")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(Palette.deep.opacity(0.85), in: Circle())
            }
            .aspectRatio(16 / 9, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
