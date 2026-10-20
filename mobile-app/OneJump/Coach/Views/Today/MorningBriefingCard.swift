import SwiftUI

/// The morning briefing. Tap play: the button glows and Assist reads the day one short line at a
/// time. The card never changes size: each line slides in where the last one was.
struct MorningBriefingCard: View {
    @Environment(CoachStore.self) private var store
    @Environment(\.lang) private var lang

    /// Room for about three lines of text, so the card stays the same size.
    private let lineArea: CGFloat = 70

    var body: some View {
        let active = store.briefingPlaying || store.briefingLoading
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Button {
                    Haptics.tap()
                    store.toggleBriefing()
                } label: {
                    GlowingPlayButton(active: active, playing: store.briefingPlaying)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(store.briefingPlaying ? CT.briefPause(lang) : CT.briefPlay(lang))

                VStack(alignment: .leading, spacing: 2) {
                    Text(CT.briefing(lang)).font(OJFont.title).foregroundStyle(Palette.ink)
                    Text(subtitle)
                        .font(OJFont.sub)
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                        .contentTransition(.opacity)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if store.briefingPlaying {
                    VoiceWave()
                        .transition(.opacity)
                }
            }

            lineView
                .frame(height: lineArea, alignment: .topLeading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .clipped()

            progress
        }
        .card()
        .task { await store.prepareBriefing() }
    }

    /// The one line being read (or a short teaser when nothing is playing).
    private var lineView: some View {
        let lines = store.data.briefing
        let index = store.briefingLine
        let showing = (store.briefingPlaying || (index >= 0 && index < lines.count)) ? lines[safe: index].map { $0(lang) } : nil
        return ZStack(alignment: .topLeading) {
            if let showing {
                Text(showing)
                    .font(.archivo(16, .medium))
                    .foregroundStyle(Palette.ink)
                    .lineLimit(3)
                    .minimumScaleFactor(0.85)
                    .fixedSize(horizontal: false, vertical: true)
                    .id(index)
                    .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                            removal: .move(edge: .leading).combined(with: .opacity)))
            } else {
                Text(teaser)
                    .font(OJFont.body)
                    .foregroundStyle(Palette.muted)
                    .lineLimit(3)
                    .id(-1)
                    .transition(.opacity)
            }
        }
        .animation(.spring(duration: 0.45, bounce: 0.12), value: index)
        .animation(.snappy, value: store.briefingPlaying)
    }

    /// One small segment per line; the current one fills in.
    private var progress: some View {
        let total = max(store.data.briefing.count, 1)
        let current = store.briefingLine
        return HStack(spacing: 4) {
            ForEach(0..<total, id: \.self) { i in
                Capsule()
                    .fill(i < current || (i == current && store.briefingPlaying) ? Palette.assistInk : Palette.line2)
                    .frame(height: 3)
            }
        }
        .opacity(store.data.briefing.isEmpty ? 0 : 1)
        .animation(.easeOut(duration: 0.3), value: current)
    }

    private var teaser: String {
        if store.briefingLoading { return CL.briefLoading(lang) }
        let total = store.data.briefing.count
        if total > 0 && store.briefingLine >= total { return CT.briefDone(lang) }
        return store.live ? CL.briefIdle(store.pendingQueue.count + store.openCheckInCount)(lang) : CT.briefIdle(lang)
    }

    private var subtitle: String {
        let total = store.data.briefing.count
        if store.briefingLoading { return CL.briefLoading(lang) }
        if store.briefingPlaying { return CT.briefPlaying(min(store.briefingLine + 1, total), total)(lang) }
        if total > 0 && store.briefingLine >= total { return CT.briefDone(lang) }
        return total > 0 ? CT.briefPlay(lang) : (store.live ? CL.briefLoading(lang) : CT.briefPlay(lang))
    }
}

/// The volt play button. While the briefing plays (or gets ready) it glows and pulses.
private struct GlowingPlayButton: View {
    let active: Bool
    let playing: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: !active)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let pulse = active ? 0.5 + 0.5 * sin(t * 4) : 0
            ZStack {
                if active {
                    Circle()
                        .fill(Palette.volt.opacity(0.35 + 0.25 * pulse))
                        .frame(width: 52 + 18 * pulse, height: 52 + 18 * pulse)
                        .blur(radius: 8)
                    Circle()
                        .stroke(Palette.volt.opacity(0.7 - 0.4 * pulse), lineWidth: 2)
                        .frame(width: 58 + 10 * pulse, height: 58 + 10 * pulse)
                }
                Image(systemName: playing ? "pause.fill" : "play.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Palette.deep)
                    .frame(width: 52, height: 52)
                    .background(Palette.volt, in: Circle())
                    .shadow(color: Palette.volt.opacity(active ? 0.95 : 0.5), radius: active ? 16 + 8 * pulse : 10, x: 0, y: active ? 0 : 4)
                    .contentTransition(.symbolEffect(.replace))
            }
            .frame(width: 64, height: 64)
        }
    }
}
