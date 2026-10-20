import AVKit
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

// Programs, workouts and the exercise library for the coach's real business:
// create and delete programs, add workouts and fill them from the library, add your own
// exercises with a photo or video, and delete exercises.

// MARK: - New program

struct NewProgramSheet: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var weeks = 4
    @State private var days = 3
    @State private var level = "Beginner"
    @State private var details = ""
    @FocusState private var nameFocused: Bool

    var body: some View {
        NavigationStack {
            ScreenScroll {
                VStack(alignment: .leading, spacing: 6) {
                    Eyebrow(TT.programName(lang))
                    TextField(TT.programNamePlaceholder(lang), text: $name)
                        .font(.archivo(17, .semibold))
                        .padding(.horizontal, 14)
                        .frame(height: 50)
                        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
                        .focused($nameFocused)
                        .submitLabel(.done)
                }
                VStack(spacing: 14) {
                    HStack {
                        TitleSub(TT.weeks(lang))
                        ValueStepper(value: "\(weeks)", minWidth: 44, decreaseLabel: TT.weeks(lang), increaseLabel: TT.weeks(lang),
                                     onDecrease: { weeks = max(1, weeks - 1) }, onIncrease: { weeks = min(52, weeks + 1) })
                    }
                    RowDivider()
                    HStack {
                        TitleSub(TT.daysPerWeek(lang))
                        ValueStepper(value: "\(days)", minWidth: 44, decreaseLabel: TT.daysPerWeek(lang), increaseLabel: TT.daysPerWeek(lang),
                                     onDecrease: { days = max(1, days - 1) }, onIncrease: { days = min(7, days + 1) })
                    }
                    RowDivider()
                    VStack(alignment: .leading, spacing: 8) {
                        TitleSub(TT.level(lang))
                        Picker(TT.level(lang), selection: $level) {
                            ForEach(TT.levels, id: \.value) { option in
                                Text(option.label(lang)).tag(option.value)
                            }
                        }
                        .pickerStyle(.segmented)
                    }
                }
                .card()
                VStack(alignment: .leading, spacing: 6) {
                    Eyebrow(TT.description(lang))
                    TextBox(label: TT.description(lang), text: $details, minHeight: 80)
                }
                Button {
                    Task {
                        if await store.createProgram(name: name, weeks: weeks, days: days, level: level, description: details) { dismiss() }
                    }
                } label: {
                    Text(store.trainingBusy.contains("newProgram") ? TT.creating(lang) : TT.createProgram(lang))
                }
                .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
                .disabled(store.trainingBusy.contains("newProgram"))
            }
            .ojNavigationTitle(TT.newProgram(lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(TT.cancel(lang)) { dismiss() }
                }
            }
            .onAppear { nameFocused = true }
        }
    }
}

// MARK: - One program (live)

struct LiveProgramDetailView: View {
    let programID: String
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var confirmDelete = false

    var body: some View {
        let summary = store.data.programs.first { $0.id == programID }
        let detail = store.programDetails[programID]
        let name = detail?.program.name ?? summary?.name(lang) ?? ""

        ScreenScroll {
            VStack(alignment: .leading, spacing: 6) {
                Text(name).font(OJFont.h3).foregroundStyle(Palette.ink)
                HStack(spacing: 8) {
                    if let summary {
                        SubText(summary.meta(lang))
                        Pill(summary.tag(lang), tone: summary.tone)
                    }
                }
                if let note = detail?.program.description, !note.isEmpty {
                    SubText(note).padding(.top, 2)
                }
            }

            SectionHeader(TT.workouts(lang), link: TT.addWorkout(lang)) {
                Task { await store.addWorkout(to: programID) }
            }
            if let detail {
                if detail.program.workouts.isEmpty {
                    EmptyStateCard(systemImage: "dumbbell", title: TT.noWorkouts(lang), message: TT.noWorkoutsBody(lang))
                } else {
                    ListCard {
                        DividedRows(detail.program.workouts) { w in
                            Button {
                                store.push(.workout(w.id))
                            } label: {
                                HStack(spacing: 12) {
                                    IconTile(systemName: "dumbbell")
                                    TitleSub(w.name, sub: TT.workoutMeta(w.exercises, w.sets, w.estMinutes)(lang))
                                    Image(systemName: "chevron.right").foregroundStyle(Palette.muted)
                                }
                                .rowPadding()
                            }
                            .buttonStyle(.row)
                        }
                    }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 20)
            }

            SectionHeader(CT.onProgram(lang))
            let clients = detail?.clients ?? []
            if clients.isEmpty {
                EmptyStateCard(systemImage: "person.badge.plus", title: CT.nobodyYet(lang), message: CT.assignToStart(lang))
            } else {
                ListCard {
                    DividedRows(clients) { c in
                        Button {
                            store.push(.client(c.id))
                        } label: {
                            let known = store.allClients.first { $0.id == c.id }
                            HStack(spacing: 12) {
                                Avatar(initials: known?.initials ?? String(c.name.prefix(1)), color: known?.avatarColor ?? Palette.surface3, size: 36)
                                TitleSub(c.name)
                            }
                            .rowPadding()
                        }
                        .buttonStyle(.row)
                    }
                }
            }

            Button {
                store.send(CL.assignProgramAsk(name)(lang))
            } label: {
                Label {
                    Text(CL.assignWithAssist(lang))
                } icon: {
                    AssistMark(size: 18, color: Palette.deep)
                }
            }
            .buttonStyle(.oj(.volt, fullWidth: true))

            Button(role: .destructive) {
                confirmDelete = true
            } label: {
                Label(TT.deleteProgram(lang), systemImage: "trash")
            }
            .buttonStyle(.oj(.danger, fullWidth: true))
            .disabled(store.trainingBusy.contains(programID))
        }
        .ojNavigationTitle(CT.program(lang))
        .task { await store.loadProgram(programID) }
        .refreshable { await store.loadProgram(programID) }
        .confirmationDialog(TT.deleteProgramAsk(name)(lang), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(TT.deleteProgram(lang), role: .destructive) {
                Task { await store.deleteProgram(programID, name: name) }
            }
            Button(TT.cancel(lang), role: .cancel) {}
        } message: {
            Text(TT.deleteProgramBody(lang))
        }
    }
}

// MARK: - One workout (live editor)

struct LiveWorkoutEditorView: View {
    let workoutID: String
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var name = ""
    @State private var blocks: [EditableBlock] = []
    @State private var loaded = false
    @State private var dirty = false
    @State private var picking = false
    @State private var confirmDelete = false

    var body: some View {
        let detail = store.workoutDetails[workoutID]
        ScreenScroll {
            if !loaded {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Eyebrow(TT.workoutName(lang))
                    TextField(TT.workoutName(lang), text: $name)
                        .font(.archivo(17, .semibold))
                        .padding(.horizontal, 14)
                        .frame(height: 50)
                        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
                        .onChange(of: name) { _, _ in dirty = true }
                    if let program = detail?.program {
                        SubText(program.name)
                    }
                }

                let rows = editorRows
                if rows.isEmpty {
                    EmptyStateCard(systemImage: "dumbbell", title: TT.noExercises(lang), message: TT.noExercisesBody(lang))
                } else {
                    ForEach(rows) { row in
                        itemCard(row.item, blockID: row.blockID, number: row.number)
                    }
                }

                Button {
                    picking = true
                } label: {
                    Label(TT.addExercise(lang), systemImage: "plus")
                }
                .buttonStyle(.oj(.ghost, fullWidth: true))

                Button {
                    let program = detail?.program?.name ?? ""
                    store.send(TT.buildWorkoutAsk(name, program)(lang))
                } label: {
                    Label {
                        Text(TT.buildWithAssist(lang))
                    } icon: {
                        AssistMark(size: 18, color: Palette.deep)
                    }
                }
                .buttonStyle(.oj(.volt, fullWidth: true))

                Button(role: .destructive) {
                    confirmDelete = true
                } label: {
                    Label(TT.deleteWorkout(lang), systemImage: "trash")
                }
                .buttonStyle(.oj(.danger, fullWidth: true))
            }
        }
        .ojNavigationTitle(name.isEmpty ? CT.exercise(lang) : name)
        .safeAreaInset(edge: .bottom) {
            if dirty {
                Button {
                    Task {
                        if await store.saveWorkout(workoutID, name: name, blocks: blocks) { dirty = false }
                    }
                } label: {
                    Text(store.trainingBusy.contains(workoutID) ? TT.saving(lang) : TT.save(lang))
                }
                .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
                .disabled(store.trainingBusy.contains(workoutID))
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: dirty)
        .task {
            if store.workoutDetails[workoutID] == nil || !loaded { await store.loadWorkout(workoutID) }
            if let d = store.workoutDetails[workoutID], !loaded {
                name = d.workout.name
                blocks = d.editableBlocks
                loaded = true
                DispatchQueue.main.async { dirty = false }
            }
        }
        .sheet(isPresented: $picking) {
            ExercisePickerSheet { exercise in
                let item = EditableItem(id: "i_" + UUID().uuidString.prefix(8).lowercased(), exerciseID: exercise.id, name: exercise.name(.english),
                                        setCount: 3, reps: "10", rest: "60", tempo: "", notes: "")
                withAnimation(.snappy) {
                    blocks.append(EditableBlock(id: "b_" + UUID().uuidString.prefix(8).lowercased(), kind: "single", items: [item]))
                }
                dirty = true
            }
            .environment(store)
        }
        .confirmationDialog(TT.deleteWorkoutAsk(name)(lang), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(TT.deleteWorkout(lang), role: .destructive) {
                Task { await store.deleteWorkout(workoutID, programID: detail?.workout.programId) }
            }
            Button(TT.cancel(lang), role: .cancel) {}
        }
    }

    private struct EditorRow: Identifiable {
        let blockID: String
        let item: EditableItem
        let number: Int
        var id: String { item.id }
    }

    private var editorRows: [EditorRow] {
        var out: [EditorRow] = []
        for b in blocks {
            for it in b.items { out.append(EditorRow(blockID: b.id, item: it, number: out.count + 1)) }
        }
        return out
    }

    private func binding(_ itemID: String, blockID: String) -> Binding<EditableItem>? {
        guard let b = blocks.firstIndex(where: { $0.id == blockID }), let i = blocks[b].items.firstIndex(where: { $0.id == itemID }) else { return nil }
        return Binding(
            get: { blocks[safe: b]?.items[safe: i] ?? EditableItem(id: itemID, exerciseID: "", name: "", setCount: 1, reps: "", rest: "", tempo: "", notes: "") },
            set: { newValue in
                guard blocks.indices.contains(b), blocks[b].items.indices.contains(i) else { return }
                blocks[b].items[i] = newValue
                dirty = true
            }
        )
    }

    @ViewBuilder
    private func itemCard(_ item: EditableItem, blockID: String, number: Int) -> some View {
        if let bound = binding(item.id, blockID: blockID) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Text("\(number)")
                        .font(.archivo(13, .heavy))
                        .frame(width: 28, height: 28)
                        .background(Palette.surface3, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                    Text(item.name).font(OJFont.title).foregroundStyle(Palette.ink)
                    Spacer(minLength: 0)
                    Button {
                        withAnimation(.snappy) {
                            if let b = blocks.firstIndex(where: { $0.id == blockID }) {
                                blocks[b].items.removeAll { $0.id == item.id }
                                if blocks[b].items.isEmpty { blocks.remove(at: b) }
                            }
                        }
                        dirty = true
                    } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Palette.crit)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(TT.remove(lang))
                }
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Eyebrow(TT.sets(lang))
                        ValueStepper(value: "\(item.setCount)", minWidth: 30, decreaseLabel: TT.fewer(lang), increaseLabel: TT.more(lang),
                                     onDecrease: { bound.wrappedValue.setCount = max(1, item.setCount - 1) },
                                     onIncrease: { bound.wrappedValue.setCount = min(12, item.setCount + 1) })
                    }
                    Spacer(minLength: 0)
                    field(TT.reps(lang), text: bound.reps, width: 72)
                    field(TT.rest(lang), text: bound.rest, width: 72, numeric: true)
                }
            }
            .card(padding: 12)
        }
    }

    private func field(_ label: String, text: Binding<String>, width: CGFloat, numeric: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow(label)
            TextField(label, text: text)
                .font(.archivo(16, .bold))
                .multilineTextAlignment(.center)
                .keyboardType(numeric ? .numberPad : .numbersAndPunctuation)
                .frame(width: width, height: 38)
                .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
        }
    }
}

/// Pick one exercise from the library (search + muscle group).
struct ExercisePickerSheet: View {
    let onPick: (LibraryExercise) -> Void
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    @State private var group: MuscleGroup = .all

    var body: some View {
        NavigationStack {
            ScreenScroll {
                SearchField(placeholder: CT.searchExercises(lang), text: $search)
                ChipScroller {
                    ForEach(MuscleGroup.allCases, id: \.self) { g in
                        Chip(label: g.label(lang), isOn: group == g) { withAnimation(.snappy) { group = g } }
                    }
                }
                ListCard {
                    DividedRows(filtered) { exercise in
                        Button {
                            onPick(exercise)
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                IconTile(systemName: exercise.mediaType == "video" ? "play.rectangle.fill" : exercise.mediaType == "image" ? "photo" : "dumbbell")
                                TitleSub(exercise.name(lang), sub: "\(exercise.group.label(lang)) · \(exercise.equipment(lang))")
                                Image(systemName: "plus.circle.fill").foregroundStyle(Palette.good)
                            }
                            .rowPadding()
                        }
                        .buttonStyle(.row)
                    }
                }
            }
            .ojNavigationTitle(TT.pickExercise(lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(TT.cancel(lang)) { dismiss() } }
            }
        }
    }

    private var filtered: [LibraryExercise] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return store.data.library.filter { x in
            (group == .all || x.group == group) && (q.isEmpty || x.name(lang).lowercased().contains(q) || x.equipment(lang).lowercased().contains(q))
        }
    }
}

// MARK: - Photos and videos

/// A video from the photo library, copied somewhere the app can read it.
struct PickedMovie: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let ext = received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension
            let copy = FileManager.default.temporaryDirectory.appendingPathComponent("oj-pick-\(UUID().uuidString).\(ext)")
            try FileManager.default.copyItem(at: received.file, to: copy)
            return PickedMovie(url: copy)
        }
    }
}

extension PhotosPickerItem {
    /// The photo or video the coach picked.
    func loadMedia() async -> PickedMedia? {
        if supportedContentTypes.contains(where: { $0.conforms(to: .movie) || $0.conforms(to: .video) }) {
            if let movie = try? await loadTransferable(type: PickedMovie.self) { return .video(movie.url) }
            return nil
        }
        if let data = try? await loadTransferable(type: Data.self), let image = UIImage(data: data) { return .image(image) }
        return nil
    }
}

/// Shows an exercise's own photo or video.
struct ExerciseMediaView: View {
    let mediaType: String?
    let url: URL?
    @State private var player: AVPlayer?

    var body: some View {
        Group {
            if mediaType == "video", let url {
                VideoPlayer(player: player)
                    .onAppear {
                        if player == nil { player = AVPlayer(url: url) }
                    }
                    .onDisappear { player?.pause() }
            } else if mediaType == "image", let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image): image.resizable().scaledToFill()
                    case .failure: Image(systemName: "photo").font(.system(size: 28)).foregroundStyle(Palette.muted)
                    default: ProgressView()
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(16 / 9, contentMode: .fit)
        .background(Palette.surface2)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
    }
}

/// A local preview of the photo or video picked before uploading.
struct PickedMediaPreview: View {
    let media: PickedMedia
    @Environment(\.lang) private var lang

    var body: some View {
        switch media {
        case .image(let image):
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity)
                .frame(height: 190)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        case .video(let url):
            VideoPlayer(player: AVPlayer(url: url))
                .frame(maxWidth: .infinity)
                .frame(height: 190)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }
}

// MARK: - New exercise

struct AddExerciseSheet: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var group: MuscleGroup = .legs
    @State private var equipment = ""
    @State private var level = "Beginner"
    @State private var cues = ""
    @State private var pickerItem: PhotosPickerItem?
    @State private var media: PickedMedia?
    @State private var loadingMedia = false

    var body: some View {
        NavigationStack {
            ScreenScroll {
                VStack(alignment: .leading, spacing: 6) {
                    Eyebrow(TT.exerciseName(lang))
                    TextField(TT.exerciseNamePlaceholder(lang), text: $name)
                        .font(.archivo(17, .semibold))
                        .padding(.horizontal, 14)
                        .frame(height: 50)
                        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
                }

                VStack(alignment: .leading, spacing: 10) {
                    Eyebrow(TT.photoOrVideo(lang))
                    if let media {
                        PickedMediaPreview(media: media)
                    }
                    PhotosPicker(selection: $pickerItem, matching: .any(of: [.images, .videos])) {
                        Label(loadingMedia ? (CL.loadingPage(lang)) : (media == nil ? TT.addPhotoOrVideo(lang) : TT.changePhotoOrVideo(lang)),
                              systemImage: media == nil ? "photo.badge.plus" : "arrow.triangle.2.circlepath")
                    }
                    .buttonStyle(.oj(.ghost, fullWidth: true))
                    .disabled(loadingMedia)
                }

                VStack(alignment: .leading, spacing: 10) {
                    Eyebrow(TT.muscleGroup(lang))
                    Picker(TT.muscleGroup(lang), selection: $group) {
                        ForEach(MuscleGroup.allCases.filter { $0 != .all }, id: \.self) { g in
                            Text(g.label(lang)).tag(g)
                        }
                    }
                    .pickerStyle(.segmented)
                    Eyebrow(TT.level(lang)).padding(.top, 4)
                    Picker(TT.level(lang), selection: $level) {
                        ForEach(TT.levels, id: \.value) { option in Text(option.label(lang)).tag(option.value) }
                    }
                    .pickerStyle(.segmented)
                    Eyebrow(TT.equipment(lang)).padding(.top, 4)
                    TextField(TT.equipmentPlaceholder(lang), text: $equipment)
                        .font(.archivo(16))
                        .padding(.horizontal, 12)
                        .frame(height: 44)
                        .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    ChipScroller {
                        ForEach(TT.equipmentChoices, id: \.self) { choice in
                            Chip(label: choice(lang), isOn: equipment == choice(lang)) { equipment = choice(lang) }
                        }
                    }
                }
                .card()

                VStack(alignment: .leading, spacing: 6) {
                    Eyebrow(TT.instructions(lang))
                    TextBox(label: TT.instructions(lang), text: $cues, minHeight: 90)
                }

                Button {
                    Task {
                        if await store.createExercise(name: name, group: group, equipment: equipment, level: level, instructions: cues, media: media) { dismiss() }
                    }
                } label: {
                    Text(busyLabel)
                }
                .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
                .disabled(store.trainingBusy.contains("newExercise") || loadingMedia)
            }
            .ojNavigationTitle(TT.newExercise(lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(TT.cancel(lang)) { dismiss() } }
            }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                loadingMedia = true
                Task {
                    let picked = await item.loadMedia()
                    loadingMedia = false
                    if let picked { withAnimation(.snappy) { media = picked } } else { store.toast.show(TT.couldntReadMedia(lang)) }
                }
            }
        }
    }

    private var busyLabel: String {
        guard store.trainingBusy.contains("newExercise") else { return TT.addExerciseButton(lang) }
        return media?.isVideo == true ? TT.preparingVideo(lang) : TT.uploading(lang)
    }
}

// MARK: - One exercise (live)

struct LiveExerciseDetailView: View {
    let exerciseID: String
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var confirmDelete = false
    @State private var pickerItem: PhotosPickerItem?

    var body: some View {
        let row = store.data.library.first { $0.id == exerciseID }
        let detail = store.exerciseDetails[exerciseID]
        let name = detail?.name ?? row?.name(lang) ?? ""
        let custom = detail?.custom ?? row?.custom ?? false
        let cues = detail?.howTo?.items ?? row?.howTo?.map { $0(lang) } ?? []
        let mediaURL = detail?.mediaUrl.flatMap { APIClient.shared.absoluteURL($0) }
        let uploading = store.trainingBusy.contains("media:" + exerciseID)

        ScreenScroll {
            if let type = detail?.mediaType, mediaURL != nil {
                ExerciseMediaView(mediaType: type, url: mediaURL)
                    .id(mediaURL)
            } else if let link = detail?.videoUrl, let url = URL(string: link) {
                Link(destination: url) {
                    VideoPlaceholder(label: CT.playDemo(lang)) {}
                        .allowsHitTesting(false)
                }
            } else if custom {
                EmptyStateCard(systemImage: "photo.on.rectangle", title: TT.noMedia(lang), message: nil)
            } else {
                VideoPlaceholder(label: CT.playDemo(lang)) { store.toast.show(CT.toastDemo(lang)) }
            }

            if custom {
                HStack(spacing: 8) {
                    PhotosPicker(selection: $pickerItem, matching: .any(of: [.images, .videos])) {
                        Label(uploading ? TT.uploading(lang) : (detail?.mediaType == nil ? TT.addPhotoOrVideo(lang) : TT.changePhotoOrVideo(lang)), systemImage: "photo.badge.plus")
                    }
                    .buttonStyle(.oj(.ghost, size: .small, fullWidth: true))
                    .disabled(uploading)
                    if detail?.mediaType != nil {
                        Button {
                            Task { await store.removeMedia(from: exerciseID) }
                        } label: {
                            Image(systemName: "xmark")
                        }
                        .buttonStyle(.oj(.ghost, size: .small))
                        .accessibilityLabel(TT.removeMedia(lang))
                    }
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(name).font(OJFont.h3).foregroundStyle(Palette.ink)
                    if custom { Pill(TT.yours(lang), tone: .good) }
                }
                SubText([detail?.muscle ?? row?.group.label(lang), detail?.equipment ?? row?.equipment(lang), detail?.level].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
            }

            if !cues.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Eyebrow(CT.howTo(lang))
                    ForEach(cues, id: \.self) { cue in
                        HStack(alignment: .top, spacing: 10) {
                            Circle().fill(Palette.assistInk).frame(width: 6, height: 6).padding(.top, 7)
                            Text(cue).font(OJFont.body).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .card()
            }

            if let alts = detail?.alternatives, !alts.isEmpty {
                ListCard {
                    VStack(alignment: .leading, spacing: 4) {
                        Eyebrow(CT.alternatives(lang))
                        SubText(CT.alternativesBody(lang))
                    }
                    .rowPadding()
                    ForEach(alts, id: \.id) { alt in
                        RowDivider()
                        Button {
                            store.push(.exercise(alt.id))
                        } label: {
                            HStack {
                                Text(alt.name).font(OJFont.title).foregroundStyle(Palette.ink)
                                Spacer()
                                Pill(CT.swapReady(lang), tone: .good)
                            }
                            .rowPadding()
                        }
                        .buttonStyle(.row)
                    }
                }
            }

            Button(role: .destructive) {
                confirmDelete = true
            } label: {
                Label(TT.deleteExercise(lang), systemImage: "trash")
            }
            .buttonStyle(.oj(.danger, fullWidth: true))
            .disabled(store.trainingBusy.contains(exerciseID))
        }
        .ojNavigationTitle(CT.exercise(lang))
        .task { await store.loadExercise(exerciseID) }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                if let media = await item.loadMedia() {
                    if await store.uploadMedia(media, to: exerciseID) != nil { store.toast.show(TT.mediaSaved(lang)) }
                } else {
                    store.toast.show(TT.couldntReadMedia(lang))
                }
                pickerItem = nil
            }
        }
        .confirmationDialog(TT.deleteExerciseAsk(name)(lang), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(TT.deleteExercise(lang), role: .destructive) {
                Task { await store.deleteExercise(exerciseID) }
            }
            Button(TT.cancel(lang), role: .cancel) {}
        } message: {
            Text(custom ? TT.deleteOwnBody(lang) : TT.deleteSharedBody(lang))
        }
    }
}
