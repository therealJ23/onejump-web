import AVFoundation
import SwiftUI
import UIKit

// MARK: - What the server sends for programs, workouts and exercises

/// GET /api/programs/:id
struct ProgramDetailDTO: Decodable {
    struct Program: Decodable {
        let id: String
        let name: String
        let weeks: Int
        let daysPerWeek: Int
        var level: String?
        var description: String?
        var source: String?
        let workouts: [Workout]
    }
    struct Workout: Decodable, Identifiable {
        let id: String
        let name: String
        var day: Int?
        var week: Int?
        var estMinutes: Int?
        let exercises: Int
        let sets: Int
    }
    struct Client: Decodable, Identifiable { let id: String; let name: String }
    let program: Program
    let clients: [Client]
}

/// GET /api/workouts/:id
struct WorkoutDTO: Decodable {
    struct SetDTO: Decodable { var reps: String?; var load: String?; var rpe: String?; var rest: String? }
    struct Item: Decodable { var id: String?; let exerciseId: String; var tempo: String?; var notes: String?; let sets: [SetDTO] }
    struct Block: Decodable { var id: String?; let kind: String; let items: [Item] }
    struct Workout: Decodable { let id: String; let name: String; var programId: String?; var day: Int?; let blocks: [Block]; var estMinutes: Int? }
    struct Ex: Decodable { let id: String; var name: String?; var equipment: String? }
    struct Program: Decodable { let id: String; let name: String }
    let workout: Workout
    var program: Program?
    let exercises: [String: Ex]
}

/// A list of strings that also accepts one string with line breaks (exercise cues).
struct StringList: Decodable {
    let items: [String]
    init(from decoder: Decoder) throws {
        if let list = try? [String](from: decoder) {
            items = list
        } else if let one = try? String(from: decoder) {
            items = one.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        } else {
            items = []
        }
    }
}

/// GET /api/exercises/:id
struct ExerciseDetailDTO: Decodable {
    struct Alt: Decodable { let id: String; let name: String }
    struct Exercise: Decodable {
        let id: String
        let name: String
        var muscle: String?
        var equipment: String?
        var level: String?
        var pattern: String?
        let custom: Bool
        var videoUrl: String?
        var howTo: StringList?
        var mediaType: String?
        var mediaUrl: String?
        var alternatives: [Alt]?
    }
    let exercise: Exercise
}

private struct ProgramCreated: Decodable { struct P: Decodable { let id: String; let name: String }; let program: P }
private struct WorkoutCreated: Decodable { struct W: Decodable { let id: String }; let workout: W }
private struct ExerciseSaved: Decodable { let exercise: ExerciseDetailDTO.Exercise }

// MARK: - Editing a workout on the phone

/// One exercise in the workout editor: its sets (kept as the server had them) and an easy
/// "how many sets, how many reps" view on top.
struct EditableItem: Identifiable, Equatable {
    var id: String
    var exerciseID: String
    var name: String
    var setCount: Int
    var reps: String
    var rest: String
    var tempo: String
    var notes: String
}

struct EditableBlock: Identifiable, Equatable {
    var id: String
    var kind: String
    var items: [EditableItem]
}

extension WorkoutDTO {
    /// The workout as the editor shows it.
    var editableBlocks: [EditableBlock] {
        workout.blocks.map { b in
            EditableBlock(id: b.id ?? UUID().uuidString, kind: b.kind, items: b.items.map { it in
                EditableItem(
                    id: it.id ?? UUID().uuidString, exerciseID: it.exerciseId,
                    name: exercises[it.exerciseId]?.name ?? TT.removedExercise.en,
                    setCount: max(1, it.sets.count), reps: it.sets.first?.reps ?? "10", rest: it.sets.first?.rest ?? "60",
                    tempo: it.tempo ?? "", notes: it.notes ?? ""
                )
            })
        }
    }
}

extension Array where Element == EditableBlock {
    /// What PUT /api/workouts/:id expects.
    var json: [[String: Any]] {
        filter { !$0.items.isEmpty }.map { b in
            [
                "id": b.id, "kind": b.items.count > 1 ? b.kind : "single",
                "items": b.items.map { it -> [String: Any] in
                    let set: [String: Any] = ["reps": it.reps, "load": "", "rpe": "", "rest": it.rest]
                    return ["id": it.id, "exerciseId": it.exerciseID, "tempo": it.tempo, "notes": it.notes,
                            "sets": [[String: Any]](repeating: set, count: Swift.max(1, Swift.min(12, it.setCount)))]
                }
            ]
        }
    }
}

// MARK: - A photo or video the coach picked

enum PickedMedia {
    case image(UIImage)
    case video(URL)

    var isVideo: Bool { if case .video = self { return true } else { return false } }

    /// The bytes to upload: a JPEG (at most 1600 px), or the video re-encoded as MP4
    /// (medium quality, at most 90 seconds) so it uploads quickly.
    func prepared() async throws -> (data: Data, filename: String, mime: String) {
        switch self {
        case .image(let image):
            let scaled = image.scaledDown(maxSide: 1600)
            guard let data = scaled.jpegData(compressionQuality: 0.82) else { throw MediaError.unreadable }
            return (data, "photo.jpg", "image/jpeg")
        case .video(let url):
            let out = FileManager.default.temporaryDirectory.appendingPathComponent("oj-\(UUID().uuidString).mp4")
            let asset = AVURLAsset(url: url)
            guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetMediumQuality) else { throw MediaError.unreadable }
            let duration = try await asset.load(.duration)
            export.outputURL = out
            export.outputFileType = .mp4
            export.shouldOptimizeForNetworkUse = true
            if duration.seconds > 90 {
                export.timeRange = CMTimeRange(start: .zero, duration: CMTime(seconds: 90, preferredTimescale: 600))
            }
            await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
                export.exportAsynchronously { done.resume() }
            }
            guard export.status == .completed, let data = try? Data(contentsOf: out) else { throw MediaError.unreadable }
            try? FileManager.default.removeItem(at: out)
            if data.count > 48 * 1024 * 1024 { throw MediaError.tooBig }
            return (data, "video.mp4", "video/mp4")
        }
    }

    enum MediaError: Error { case unreadable, tooBig }
}

extension UIImage {
    func scaledDown(maxSide: CGFloat) -> UIImage {
        let longest = max(size.width, size.height)
        guard longest > maxSide, longest > 0 else { return self }
        let scale = maxSide / longest
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }
}

// MARK: - Store actions

extension CoachStore {
    private var api: APIClient { APIClient.shared }

    /// Closes the screen on top of the current tab.
    func popRoute() {
        switch tab {
        case .today: if !todayPath.isEmpty { todayPath.removeLast() }
        case .clients: if !clientsPath.isEmpty { clientsPath.removeLast() }
        case .assist: if !assistPath.isEmpty { assistPath.removeLast() }
        case .inbox: if !inboxPath.isEmpty { inboxPath.removeLast() }
        case .more: if !morePath.isEmpty { morePath.removeLast() }
        }
    }

    // MARK: Programs

    @MainActor
    func createProgram(name: String, weeks: Int, days: Int, level: String, description: String) async -> Bool {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { toast.show(TT.emptyName(lang)); return false }
        trainingBusy.insert("newProgram")
        defer { trainingBusy.remove("newProgram") }
        do {
            var body: [String: Any] = ["name": clean, "weeks": weeks, "daysPerWeek": days, "level": level]
            let note = description.trimmingCharacters(in: .whitespacesAndNewlines)
            if !note.isEmpty { body["description"] = note }
            let r: ProgramCreated = try await api.post("/api/programs", body)
            toast.show(TT.programCreated(r.program.name)(lang))
            await refresh()
            push(.program(r.program.id))
            await loadProgram(r.program.id)
            return true
        } catch {
            showError(error)
            return false
        }
    }

    @MainActor
    func loadProgram(_ id: String) async {
        guard live else { return }
        do {
            programDetails[id] = try await api.get("/api/programs/\(id)")
        } catch {
            showError(error)
        }
    }

    @MainActor
    func deleteProgram(_ id: String, name: String) async {
        trainingBusy.insert(id)
        defer { trainingBusy.remove(id) }
        do {
            let _: APIClient.OK = try await api.delete("/api/programs/\(id)")
            toast.show(TT.programDeleted(name)(lang))
            programDetails[id] = nil
            if case .program(id)? = currentRoute { popRoute() }
            await refresh()
        } catch {
            showError(error)
        }
    }

    /// Adds the next training day to a program and opens it.
    @MainActor
    func addWorkout(to programID: String) async {
        trainingBusy.insert("addWorkout")
        defer { trainingBusy.remove("addWorkout") }
        do {
            let r: WorkoutCreated = try await api.post("/api/programs/\(programID)/workouts", [:])
            await loadProgram(programID)
            push(.workout(r.workout.id))
        } catch {
            showError(error)
        }
    }

    // MARK: Workouts

    @MainActor
    func loadWorkout(_ id: String) async {
        guard live else { return }
        do {
            workoutDetails[id] = try await api.get("/api/workouts/\(id)")
        } catch {
            showError(error)
        }
    }

    @MainActor
    func saveWorkout(_ id: String, name: String, blocks: [EditableBlock]) async -> Bool {
        trainingBusy.insert(id)
        defer { trainingBusy.remove(id) }
        do {
            let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
            let r: WorkoutDTO = try await api.put("/api/workouts/\(id)", ["name": clean.isEmpty ? "Workout" : clean, "blocks": blocks.json])
            workoutDetails[id] = r
            toast.show(TT.saved(lang))
            if let programID = r.workout.programId { await loadProgram(programID) }
            return true
        } catch {
            showError(error)
            return false
        }
    }

    @MainActor
    func deleteWorkout(_ id: String, programID: String?) async {
        trainingBusy.insert(id)
        defer { trainingBusy.remove(id) }
        do {
            let _: APIClient.OK = try await api.delete("/api/workouts/\(id)")
            workoutDetails[id] = nil
            if case .workout(id)? = currentRoute { popRoute() }
            if let programID { await loadProgram(programID) }
        } catch {
            showError(error)
        }
    }

    // MARK: Exercise library

    @MainActor
    func loadExercise(_ id: String) async {
        guard live else { return }
        do {
            let r: ExerciseDetailDTO = try await api.get("/api/exercises/\(id)")
            exerciseDetails[id] = r.exercise
        } catch {
            showError(error)
        }
    }

    /// Adds the coach's own exercise, then uploads its photo or video (if they picked one).
    @MainActor
    func createExercise(name: String, group: MuscleGroup, equipment: String, level: String, instructions: String, media: PickedMedia?) async -> Bool {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { toast.show(TT.emptyName(lang)); return false }
        trainingBusy.insert("newExercise")
        defer { trainingBusy.remove("newExercise") }
        let pattern: String
        switch group {
        case .legs: pattern = "squat"
        case .push: pattern = "push"
        case .pull: pattern = "pull"
        case .core, .all: pattern = "core"
        }
        var body: [String: Any] = [
            "name": clean, "muscle": group == .all ? "Full body" : group.label.en, "pattern": pattern, "level": level,
            "equipment": equipment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Bodyweight" : equipment.trimmingCharacters(in: .whitespacesAndNewlines)
        ]
        let cues = instructions.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cues.isEmpty { body["instructions"] = cues }
        do {
            let r: ExerciseSaved = try await api.post("/api/exercises", body)
            var saved = r.exercise
            if let media {
                if let withMedia = await uploadMedia(media, to: saved.id) { saved = withMedia }
            }
            exerciseDetails[saved.id] = saved
            toast.show(TT.exerciseAdded(saved.name)(lang))
            await refresh()
            push(.exercise(saved.id))
            return true
        } catch {
            showError(error)
            return false
        }
    }

    /// Uploads (or replaces) the photo or video of one of the coach's exercises.
    @MainActor
    @discardableResult
    func uploadMedia(_ media: PickedMedia, to exerciseID: String) async -> ExerciseDetailDTO.Exercise? {
        trainingBusy.insert("media:" + exerciseID)
        defer { trainingBusy.remove("media:" + exerciseID) }
        do {
            let file = try await media.prepared()
            let r: ExerciseSaved = try await api.upload("/api/exercises/\(exerciseID)/media", field: "media", file: file.data, filename: file.filename, mimeType: file.mime)
            exerciseDetails[exerciseID] = r.exercise
            if let i = data.library.firstIndex(where: { $0.id == exerciseID }) { data.library[i].mediaType = r.exercise.mediaType }
            return r.exercise
        } catch PickedMedia.MediaError.tooBig {
            toast.show(TT.videoTooBig(lang))
        } catch PickedMedia.MediaError.unreadable {
            toast.show(TT.couldntReadMedia(lang))
        } catch {
            showError(error)
        }
        return nil
    }

    @MainActor
    func removeMedia(from exerciseID: String) async {
        do {
            let _: APIClient.OK = try await api.delete("/api/exercises/\(exerciseID)/media")
            await loadExercise(exerciseID)
            if let i = data.library.firstIndex(where: { $0.id == exerciseID }) { data.library[i].mediaType = nil }
        } catch {
            showError(error)
        }
    }

    @MainActor
    func deleteExercise(_ id: String) async {
        trainingBusy.insert(id)
        defer { trainingBusy.remove(id) }
        do {
            let r: APIClient.OK = try await api.delete("/api/exercises/\(id)")
            withAnimation(.snappy) { data.library.removeAll { $0.id == id } }
            exerciseDetails[id] = nil
            if case .exercise(id)? = currentRoute { popRoute() }
            if let message = r.message { toast.show(lang == .spanish ? CT.done(lang) : message) }
        } catch {
            showError(error)
        }
    }

    /// The screen on top of the current tab, if any.
    var currentRoute: CoachRoute? {
        switch tab {
        case .today: return todayPath.last
        case .clients: return clientsPath.last
        case .assist: return assistPath.last
        case .inbox: return inboxPath.last
        case .more: return morePath.last
        }
    }
}
