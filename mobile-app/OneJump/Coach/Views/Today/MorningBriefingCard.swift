import SwiftUI

/// The morning briefing. Tap play and Assist reads it aloud, in the same voice it uses everywhere.
struct MorningBriefingCard: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Button {
                    store.toggleBriefing()
                } label: {
                    Image(systemName: store.briefingPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Palette.deep)
                        .frame(width: 52, height: 52)
                        .background(Palette.volt, in: Circle())
                        .shadow(color: Palette.volt.opacity(0.5), radius: 10, x: 0, y: 4)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(store.briefingPlaying ? CT.briefPause(lang) : CT.briefPlay(lang))

                TitleSub(CT.briefing(lang), sub: subtitle)

                if store.briefingPlaying {
                    VoiceWave()
                }
            }

            if store.briefingLine >= 0 {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(CoachData.briefing.enumerated()), id: \.offset) { pair in
                        line(pair.element(lang), index: pair.offset)
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .card()
        .animation(.easeOut(duration: 0.25), value: store.briefingLine)
    }

    private var subtitle: String {
        let total = CoachData.briefing.count
        if store.briefingPlaying {
            return CT.briefPlaying(min(store.briefingLine + 1, total), total)(lang)
        }
        return store.briefingLine >= total ? CT.briefDone(lang) : CT.briefIdle(lang)
    }

    private func line(_ text: String, index: Int) -> some View {
        let isCurrent = index == store.briefingLine
        let isPast = index < store.briefingLine
        return HStack(alignment: .top, spacing: 10) {
            Capsule()
                .fill(isCurrent ? Palette.assistInk : (isPast ? Palette.line2 : Palette.line))
                .frame(width: 3)
            Text(text)
                .font(isCurrent ? OJFont.bodyMedium : OJFont.body)
                .foregroundStyle(isCurrent ? Palette.ink : Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 2)
    }
}
