import AVKit
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

// Programs, workouts and the exercise library for the coach's real business:
// create and delete programs, add workouts and fill them from the library, add your own
// exercises with a demo video (picked or recorded), and delete exercises.

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

            Button { store.push(.planner(programID)) } label: {
                HStack(spacing: 12) {
                    IconTile(systemName: "calendar", size: 40)
                    TitleSub(lang == .spanish ? "Planear por semana" : "Plan by week",
                             sub: lang == .spanish ? "Mueve días y copia una semana entera" : "Move days and copy a whole week")
                    Image(systemName: "chevron.right").foregroundStyle(Palette.muted)
                }
                .card(padding: 12)
            }
            .buttonStyle(.plain)

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
                    ForEach(["warmup", "main", "cooldown"], id: \.self) { section in
                        let inSection = rows.filter { $0.section == section }
                        if !inSection.isEmpty {
                            SectionHeader(Self.sectionName(section, lang))
                            ForEach(inSection) { row in
                                itemCard(row.item, blockID: row.blockID, number: row.number)
                            }
                        }
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
        let section: String
        var id: String { item.id }
    }

    private var editorRows: [EditorRow] {
        var out: [EditorRow] = []
        for section in ["warmup", "main", "cooldown"] {
            for b in blocks where b.section == section {
                for it in b.items { out.append(EditorRow(blockID: b.id, item: it, number: out.count + 1, section: section)) }
            }
        }
        return out
    }

    static func sectionName(_ s: String, _ lang: AppLanguage) -> String {
        switch s {
        case "warmup": return lang == .spanish ? "Calentamiento" : "Warm-up"
        case "cooldown": return lang == .spanish ? "Enfriamiento" : "Cool-down"
        default: return lang == .spanish ? "Principal" : "Main"
        }
    }

    /// Moves an exercise to another section.
    private func move(_ itemID: String, from blockID: String, to section: String) {
        guard let b = blocks.firstIndex(where: { $0.id == blockID }), let i = blocks[b].items.firstIndex(where: { $0.id == itemID }) else { return }
        withAnimation(.snappy) {
            let item = blocks[b].items.remove(at: i)
            if blocks[b].items.isEmpty { blocks.remove(at: b) }
            blocks.append(EditableBlock(id: "b_" + UUID().uuidString.prefix(8).lowercased(), kind: "single", items: [item], section: section))
        }
        dirty = true
    }

    /// Joins an exercise with the one after it as a superset, or splits it back out.
    private func toggleSuperset(_ blockID: String) {
        guard let b = blocks.firstIndex(where: { $0.id == blockID }) else { return }
        withAnimation(.snappy) {
            if blocks[b].items.count > 1 {
                let rest = blocks[b].items.dropFirst().map { EditableBlock(id: "b_" + UUID().uuidString.prefix(8).lowercased(), kind: "single", items: [$0], section: blocks[b].section) }
                blocks[b].items = [blocks[b].items[0]]
                blocks[b].kind = "single"
                blocks.insert(contentsOf: rest, at: b + 1)
            } else if let next = blocks.indices.first(where: { $0 > b && blocks[$0].section == blocks[b].section }) {
                blocks[b].items.append(contentsOf: blocks[next].items)
                blocks[b].kind = "superset"
                blocks.remove(at: next)
            }
        }
        dirty = true
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
                    let pic = store.data.library.first { $0.id == item.exerciseID }?.imageURL
                    ExerciseThumb(path: pic)
                        .frame(width: 52, height: 52)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(alignment: .topLeading) {
                            Text("\(number)")
                                .font(.archivo(11, .heavy))
                                .foregroundStyle(Palette.bone)
                                .frame(width: 20, height: 20)
                                .background(Circle().fill(Palette.deep))
                                .offset(x: -6, y: -6)
                        }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.name).font(OJFont.title).foregroundStyle(Palette.ink)
                        let block = blocks.first { $0.id == blockID }
                        HStack(spacing: 6) {
                            Menu {
                                ForEach(["warmup", "main", "cooldown"], id: \.self) { sec in
                                    Button(Self.sectionName(sec, lang)) { move(item.id, from: blockID, to: sec) }
                                }
                            } label: {
                                Label(Self.sectionName(block?.section ?? "main", lang), systemImage: "chevron.up.chevron.down")
                                    .font(.archivo(11.5, .semibold)).foregroundStyle(Palette.muted)
                                    .padding(.horizontal, 8).frame(height: 24)
                                    .background(Capsule().fill(Palette.surface2))
                            }
                            Button { toggleSuperset(blockID) } label: {
                                Label((block?.items.count ?? 1) > 1 ? (lang == .spanish ? "Superserie" : "Superset") : (lang == .spanish ? "Unir" : "Link"), systemImage: "link")
                                    .font(.archivo(11.5, .semibold))
                                    .foregroundStyle((block?.items.count ?? 1) > 1 ? Palette.deep : Palette.muted)
                                    .padding(.horizontal, 8).frame(height: 24)
                                    .background(Capsule().fill((block?.items.count ?? 1) > 1 ? Palette.volt : Palette.surface2))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(Text(lang == .spanish ? "Superserie con el siguiente" : "Superset with the next one"))
                        }
                    }
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

/// Pick exercises from the library as a picture grid: tap several, then "Add". Search and muscle groups filter.
struct ExercisePickerSheet: View {
    let onPick: (LibraryExercise) -> Void
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    @State private var group: MuscleGroup = .all
    @State private var chosen: [String] = []

    var body: some View {
        NavigationStack {
            ScreenScroll {
                SearchField(placeholder: CT.searchExercises(lang), text: $search)
                ChipScroller {
                    ForEach(MuscleGroup.allCases, id: \.self) { g in
                        Chip(label: g.label(lang), isOn: group == g) { withAnimation(.snappy) { group = g } }
                    }
                }
                if filtered.isEmpty {
                    EmptyStateCard(systemImage: "magnifyingglass", title: lang == .spanish ? "Nada con ese nombre" : "No exercise by that name")
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(filtered) { exercise in
                        tile(exercise)
                    }
                }
            }
            .ojNavigationTitle(TT.pickExercise(lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(TT.cancel(lang)) { dismiss() } }
            }
            .safeAreaInset(edge: .bottom) {
                if !chosen.isEmpty {
                    Button {
                        let byID = Dictionary(store.data.library.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
                        for id in chosen { if let x = byID[id] { onPick(x) } }
                        dismiss()
                    } label: {
                        Text(lang == .spanish ? "Añadir \(chosen.count)" : "Add \(chosen.count)")
                    }
                    .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.snappy, value: chosen)
        }
    }

    private func tile(_ exercise: LibraryExercise) -> some View {
        let n = chosen.firstIndex(of: exercise.id).map { $0 + 1 }
        return Button {
            if let i = chosen.firstIndex(of: exercise.id) { chosen.remove(at: i) } else { chosen.append(exercise.id) }
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                ZStack(alignment: .topTrailing) {
                    ExerciseThumb(path: exercise.imageURL, systemImage: exercise.mediaType == "video" ? "play.rectangle.fill" : "dumbbell")
                        .frame(height: 104)
                        .frame(maxWidth: .infinity)
                        .clipped()
                    Group {
                        if let n {
                            Text("\(n)").font(.archivo(13, .heavy)).foregroundStyle(Palette.deep)
                                .frame(width: 28, height: 28).background(Circle().fill(Palette.volt))
                        } else {
                            Image(systemName: "plus").font(.system(size: 13, weight: .bold)).foregroundStyle(Palette.ink)
                                .frame(width: 28, height: 28).background(Circle().fill(Palette.surface.opacity(0.92)))
                        }
                    }
                    .padding(8)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(exercise.name(lang)).font(.archivo(13.5, .bold)).foregroundStyle(Palette.ink).lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(exercise.group.label(lang)) · \(exercise.equipment(lang))").font(.archivo(11.5)).foregroundStyle(Palette.muted).lineLimit(1)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(n != nil ? Palette.green : Palette.line, lineWidth: n != nil ? 2 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(exercise.name(lang)))
        .accessibilityAddTraits(n != nil ? .isSelected : [])
    }

    private var filtered: [LibraryExercise] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return store.data.library.filter { x in
            (group == .all || x.group == group) && (q.isEmpty || x.name(lang).lowercased().contains(q) || x.equipment(lang).lowercased().contains(q))
        }
    }
}

/// An exercise's picture, or an icon while there isn't one.
struct ExerciseThumb: View {
    let path: String?
    var systemImage = "dumbbell"
    var body: some View {
        ZStack {
            Palette.surface3
            if let path, !path.isEmpty {
                RemotePhoto(path: path)
            } else {
                Image(systemName: systemImage).font(.system(size: 26, weight: .semibold)).foregroundStyle(Palette.muted)
            }
        }
    }
}

// MARK: - Demo videos

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
    /// The video the coach picked (exercises take videos only).
    func loadMedia() async -> PickedMedia? {
        if let movie = try? await loadTransferable(type: PickedMovie.self) { return .video(movie.url) }
        return nil
    }
}

/// Records a demo video with the camera (up to 90 seconds).
struct VideoRecorder: UIViewControllerRepresentable {
    let onDone: (URL?) -> Void

    static var isAvailable: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
            && (UIImagePickerController.availableMediaTypes(for: .camera) ?? []).contains(UTType.movie.identifier)
    }

    func makeCoordinator() -> Coordinator { Coordinator(onDone: onDone) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.mediaTypes = [UTType.movie.identifier]
        picker.cameraCaptureMode = .video
        picker.videoMaximumDuration = 90
        picker.videoQuality = .typeHigh
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onDone: (URL?) -> Void
        init(onDone: @escaping (URL?) -> Void) { self.onDone = onDone }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            guard let recorded = info[.mediaURL] as? URL else { onDone(nil); return }
            // The camera's file is temporary: keep a copy the app can read later.
            let copy = FileManager.default.temporaryDirectory.appendingPathComponent("oj-rec-\(UUID().uuidString).\(recorded.pathExtension.isEmpty ? "mov" : recorded.pathExtension)")
            do { try FileManager.default.copyItem(at: recorded, to: copy); onDone(copy) } catch { onDone(recorded) }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onDone(nil) }
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

/// A local preview of the video picked or recorded before uploading.
struct PickedMediaPreview: View {
    let media: PickedMedia

    var body: some View {
        switch media {
        case .video(let url):
            VideoPlayer(player: AVPlayer(url: url))
                .frame(maxWidth: .infinity)
                .frame(height: 190)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }
}

/// "Record a video" and "Pick a video" side by side (exercises take videos only).
struct VideoChoiceButtons: View {
    @Binding var pickerItem: PhotosPickerItem?
    let hasVideo: Bool
    let busy: Bool
    var small = false
    let onRecorded: (URL) -> Void
    @Environment(\.lang) private var lang
    @State private var recording = false

    var body: some View {
        HStack(spacing: 8) {
            if VideoRecorder.isAvailable {
                Button {
                    recording = true
                } label: {
                    Label(TT.recordVideo(lang), systemImage: "video.fill")
                }
                .buttonStyle(.oj(.ghost, size: small ? .small : .regular, fullWidth: true))
                .disabled(busy)
            }
            PhotosPicker(selection: $pickerItem, matching: .videos) {
                Label(busy ? TT.uploading(lang) : (hasVideo ? TT.changePhotoOrVideo(lang) : TT.addPhotoOrVideo(lang)),
                      systemImage: hasVideo ? "arrow.triangle.2.circlepath" : "film")
            }
            .buttonStyle(.oj(.ghost, size: small ? .small : .regular, fullWidth: true))
            .disabled(busy)
        }
        .fullScreenCover(isPresented: $recording) {
            VideoRecorder { url in
                recording = false
                if let url { onRecorded(url) }
            }
            .ignoresSafeArea()
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
                    } else {
                        SubText(TT.videoOnlyNote(lang))
                    }
                    VideoChoiceButtons(pickerItem: $pickerItem, hasVideo: media != nil, busy: loadingMedia) { url in
                        withAnimation(.snappy) { media = .video(url) }
                    }
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
                EmptyStateCard(systemImage: "video", title: TT.noMedia(lang), message: TT.videoOnlyNote(lang))
            } else {
                VideoPlaceholder(label: CT.playDemo(lang)) { store.toast.show(CT.toastDemo(lang)) }
            }

            if custom {
                HStack(spacing: 8) {
                    VideoChoiceButtons(pickerItem: $pickerItem, hasVideo: detail?.mediaType == "video", busy: uploading, small: true) { url in
                        Task {
                            if await store.uploadMedia(.video(url), to: exerciseID) != nil { store.toast.show(TT.mediaSaved(lang)) }
                        }
                    }
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
