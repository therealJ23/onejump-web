import SwiftUI

/// "Ask Assist anything" on Today, like ChatGPT's composer: tap to type, the mic to dictate, the
/// waveform button for a hands-free voice conversation.
struct AskAssistBar: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        HStack(spacing: 10) {
            Button { store.go(.assist) } label: {
                HStack(spacing: 10) {
                    AssistMark(size: 20)
                    Text(lang == .spanish ? "Pregúntale a Assist" : "Ask Assist anything")
                        .font(.archivo(15)).foregroundStyle(Palette.muted)
                    Spacer()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button {
                store.go(.assist)
                store.startVoiceMode(greet: false)
            } label: {
                Image(systemName: "waveform")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Palette.volt)
                    .frame(width: 42, height: 42)
                    .background(Circle().fill(Palette.deep))
            }
            .accessibilityLabel(Text(lang == .spanish ? "Hablar con Assist" : "Talk to Assist"))
        }
        .padding(.leading, 16).padding(.trailing, 7)
        .frame(height: 56)
        .background(Palette.surface, in: Capsule())
        .overlay(Capsule().strokeBorder(Palette.line, lineWidth: 1))
        .shadow(color: Palette.shadow, radius: 10, x: 0, y: 4)
    }
}

/// "6 drafts ready · Review" on Today: opens the approve-all stack.
struct QueueEntryCard: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var count = 0

    var body: some View {
        Group {
            if count > 0 {
                Button { store.push(.queue) } label: {
                    HStack(spacing: 12) {
                        ZStack {
                            Circle().fill(Palette.assistSoft)
                            AssistMark(size: 20)
                        }
                        .frame(width: 44, height: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(lang == .spanish ? "\(count) borradores listos" : "\(count) drafts ready")
                                .font(OJFont.title).foregroundStyle(Palette.ink)
                            Text(lang == .spanish ? "Apruébalos en segundos" : "Approve them in seconds")
                                .font(OJFont.sub).foregroundStyle(Palette.muted)
                        }
                        Spacer()
                        Text(lang == .spanish ? "Revisar" : "Review")
                            .font(.archivo(14, .semibold))
                            .foregroundStyle(Palette.onPrimary)
                            .padding(.horizontal, 14).frame(height: 36)
                            .background(Capsule().fill(Palette.primary))
                    }
                    .card(padding: 12)
                }
                .buttonStyle(.plain)
            }
        }
        .task(id: store.data.minutesSavedLabel) { await load() }
    }

    @MainActor
    private func load() async {
        guard store.live else { return }
        if let r: QueueResponse = try? await APIClient.shared.get("/api/assist/queue") { withAnimation(.snappy) { count = r.count } }
    }
}
