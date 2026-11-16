import SwiftUI

struct SampleProgram: Decodable, Identifiable, Hashable {
    struct Ex: Decodable, Hashable { let name: String; let sets: Int; let reps: String; let imageUrl: String; var hasVideo: Bool? }
    struct W: Decodable, Hashable { let name: String; let day: Int; var minutes: Int?; let exercises: Int; let preview: [Ex] }
    var id: String { key }
    let key: String
    let name: String
    let level: String
    let weeks: Int
    let daysPerWeek: Int
    let description: String
    let imageUrl: String
    let workouts: [W]
}
private struct SamplesResponse: Decodable { let samples: [SampleProgram] }
private struct SampleUsed: Decodable { struct P: Decodable { let id: String; let name: String }; let program: P }

/// "Start from a sample" on Programs: ready-made programs with pictures. Nothing is added until
/// the coach picks one; then it's an ordinary program they can change.
struct SampleProgramsStrip: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var samples: [SampleProgram] = []
    @State private var open: SampleProgram?

    var body: some View {
        Group {
            if !samples.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader(lang == .spanish ? "Empieza con un ejemplo" : "Start from a sample")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(samples) { p in
                                Button { open = p } label: { card(p) }.buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
        .task { await load() }
        .sheet(item: $open) { p in
            SampleProgramSheet(sample: p).environment(store)
        }
    }

    private func card(_ p: SampleProgram) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ExerciseThumb(path: p.workouts.first?.preview.first?.imageUrl ?? p.imageUrl)
                .frame(width: 200, height: 112)
                .clipped()
                .overlay(alignment: .topLeading) {
                    Text(p.level).font(.archivo(10.5, .heavy)).foregroundStyle(Palette.deep)
                        .padding(.horizontal, 8).frame(height: 22).background(Capsule().fill(Palette.volt)).padding(8)
                }
            VStack(alignment: .leading, spacing: 3) {
                Text(p.name).font(.archivo(14, .bold)).foregroundStyle(Palette.ink).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                Text(lang == .spanish ? "\(p.weeks) semanas · \(p.daysPerWeek) días" : "\(p.weeks) weeks · \(p.daysPerWeek) days a week")
                    .font(.archivo(11.5)).foregroundStyle(Palette.muted)
            }
            .padding(10)
            .frame(width: 200, alignment: .leading)
        }
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
    }

    @MainActor
    private func load() async {
        guard store.live, samples.isEmpty else { return }
        if let r: SamplesResponse = try? await APIClient.shared.get("/api/programs/samples") { samples = r.samples }
    }
}

/// One sample: what each day looks like (exercise pictures), then "Use this program".
struct SampleProgramSheet: View {
    let sample: SampleProgram
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @Environment(\.dismiss) private var dismiss
    @State private var saving = false
    private var es: Bool { lang == .spanish }

    var body: some View {
        NavigationStack {
            ScreenScroll {
                Text(sample.name).font(OJFont.h3).foregroundStyle(Palette.ink)
                HStack(spacing: 8) {
                    Pill(sample.level, tone: .ai)
                    Pill(es ? "\(sample.weeks) semanas" : "\(sample.weeks) weeks")
                    Pill(es ? "\(sample.daysPerWeek) días/sem" : "\(sample.daysPerWeek) days/wk")
                }
                SubText(sample.description)
                ForEach(sample.workouts, id: \.self) { w in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(w.name).font(OJFont.title).foregroundStyle(Palette.ink)
                            Spacer()
                            SubText("\(w.exercises) \(es ? "ejercicios" : "exercises")" + (w.minutes.map { " · \($0) min" } ?? ""))
                        }
                        ForEach(w.preview, id: \.self) { e in
                            HStack(spacing: 12) {
                                ExerciseThumb(path: e.imageUrl)
                                    .frame(width: 46, height: 46)
                                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                    .overlay(alignment: .bottomTrailing) {
                                        if e.hasVideo == true {
                                            Image(systemName: "play.fill").font(.system(size: 8, weight: .heavy)).foregroundStyle(.white)
                                                .frame(width: 16, height: 16).background(Circle().fill(Color.black.opacity(0.6))).padding(2)
                                        }
                                    }
                                TitleSub(e.name, sub: "\(e.sets) × \(e.reps)")
                            }
                        }
                    }
                    .card(padding: 14)
                }
                SubText(es ? "Se copia a tus programas y puedes cambiar todo: ejercicios, series, días y tus propios videos." : "It's copied into your programs and you can change everything: exercises, sets, days and your own videos.")
            }
            .ojNavigationTitle(es ? "Ejemplo" : "Sample")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(es ? "Cerrar" : "Close") { dismiss() } } }
            .safeAreaInset(edge: .bottom) {
                Button { Task { await use() } } label: {
                    Text(saving ? (es ? "Copiando…" : "Copying…") : (es ? "Usar este programa" : "Use this program"))
                }
                .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
                .disabled(saving)
                .padding(.horizontal, 16).padding(.bottom, 8)
            }
        }
    }

    @MainActor
    private func use() async {
        saving = true
        defer { saving = false }
        do {
            let r: SampleUsed = try await APIClient.shared.post("/api/programs/samples/\(sample.key)", [:])
            store.toast.show(es ? "\(r.program.name) está en tus programas" : "\(r.program.name) is in your programs")
            await store.refresh()
            dismiss()
            store.push(.program(r.program.id))
        } catch {
            store.toast.show((error as? APIError)?.message ?? error.localizedDescription)
        }
    }
}
