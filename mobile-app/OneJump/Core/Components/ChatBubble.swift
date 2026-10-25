import SwiftUI

/// A chat bubble. Mine are dark on the right; theirs are white on the left.
struct ChatBubble<Content: View>: View {
    let fromMe: Bool
    var faded = false
    @ViewBuilder var content: () -> Content

    var body: some View {
        HStack(spacing: 0) {
            if fromMe { Spacer(minLength: 52) }
            VStack(alignment: .leading, spacing: 4) {
                content()
            }
            .font(OJFont.body)
            .lineSpacing(2)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .foregroundStyle(fromMe ? Palette.onPrimary : Palette.ink)
            .background(fromMe ? Palette.primary : Palette.surface, in: shape)
            .overlay(shape.stroke(fromMe ? Color.clear : Palette.line, lineWidth: 1))
            .opacity(faded ? 0.6 : 1)
            if !fromMe { Spacer(minLength: 52) }
        }
        .frame(maxWidth: .infinity, alignment: fromMe ? .trailing : .leading)
    }

    private var shape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: 20,
            bottomLeadingRadius: fromMe ? 20 : 6,
            bottomTrailingRadius: fromMe ? 6 : 20,
            topTrailingRadius: 20,
            style: .continuous
        )
    }
}

/// Small time under a message ("9:42 PM").
struct BubbleTime: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.archivo(11, .regular, relativeTo: .caption2))
            .opacity(0.65)
    }
}

/// A voice note inside a bubble: play icon, waveform and length.
struct VoiceNoteRow: View {
    let label: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "play.fill").font(.system(size: 13, weight: .bold))
            HStack(spacing: 2) {
                ForEach([6, 12, 18, 9, 15, 7, 13, 17, 8, 11], id: \.self) { h in
                    Capsule().frame(width: 3, height: CGFloat(h)).opacity(0.75)
                }
            }
            Text(label).font(.archivo(14, .semibold))
        }
    }
}

/// The round mic / send buttons in a message composer.
struct ComposerButton: View {
    let systemName: String
    let label: String
    var style: Style = .plain
    let action: () -> Void

    enum Style { case plain, send, recording }

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(foreground)
                .frame(width: 44, height: 44)
                .background(background, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var foreground: Color {
        switch style {
        case .plain: return Palette.ink
        case .send: return Palette.onPrimary
        case .recording: return .white
        }
    }

    private var background: Color {
        switch style {
        case .plain: return Palette.surface2
        case .send: return Palette.primary
        case .recording: return Palette.crit
        }
    }
}

/// The glass bar at the bottom of a chat with a text field and buttons.
struct ComposerBar<Field: View, Buttons: View>: View {
    @ViewBuilder var field: () -> Field
    @ViewBuilder var buttons: () -> Buttons

    var body: some View {
        HStack(spacing: 8) {
            field()
                .frame(maxWidth: .infinity, alignment: .leading)
            buttons()
        }
        .padding(7)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
        .shadow(color: Palette.shadow, radius: 14, x: 0, y: 6)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }
}

/// A playable voice message inside a bubble: play/pause, a waveform that fills as it plays,
/// and its length. `audio` gives the file or link when it's first played.
struct VoiceMessageRow: View {
    let id: String
    let seconds: Int
    let fromMe: Bool
    let audio: () async -> URL?
    @Environment(\.lang) private var lang
    private let heights: [CGFloat] = [6, 12, 18, 9, 15, 7, 13, 17, 8, 11, 16, 6, 10, 14, 7, 12]

    var body: some View {
        let player = VoiceNotePlayer.shared
        let playing = player.playingID == id
        let loading = player.loadingID == id
        let progress = playing ? player.progress : 0
        Button {
            Haptics.tick()
            player.toggle(id: id, url: audio)
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    Circle().fill(fromMe ? Palette.onPrimary.opacity(0.18) : Palette.surface2)
                    if loading {
                        ProgressView().controlSize(.small).tint(fromMe ? Palette.onPrimary : Palette.ink)
                    } else {
                        Image(systemName: playing ? "pause.fill" : "play.fill").font(.system(size: 13, weight: .bold))
                    }
                }
                .frame(width: 34, height: 34)
                HStack(spacing: 2) {
                    ForEach(Array(heights.enumerated()), id: \.offset) { pair in
                        Capsule()
                            .frame(width: 3, height: pair.element)
                            .opacity(Double(pair.offset) / Double(heights.count) < progress ? 1 : 0.45)
                    }
                }
                Text(VoiceMessageRow.clock(playing ? Int((Double(seconds) * progress).rounded()) : seconds))
                    .font(.archivo(13, .semibold))
                    .monospacedDigit()
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(playing ? SharedText.pauseVoiceMessage(lang) : SharedText.playVoiceMessage(VoiceMessageRow.clock(seconds))(lang))
    }

    static func clock(_ s: Int) -> String { "\(max(0, s) / 60):" + String(format: "%02d", max(0, s) % 60) }
}

/// The composer while a voice message is recording: a red dot, the time and a live level bar.
struct RecordingStrip: View {
    @Environment(\.lang) private var lang

    var body: some View {
        let recorder = VoiceNoteRecorder.shared
        HStack(spacing: 8) {
            ListeningDot()
            Text(VoiceMessageRow.clock(Int(recorder.elapsed)))
                .font(.archivo(15, .bold))
                .monospacedDigit()
                .foregroundStyle(Palette.crit)
            GeometryReader { geo in
                Capsule().fill(Palette.surface2)
                    .overlay(alignment: .leading) {
                        Capsule().fill(Palette.crit.opacity(0.7))
                            .frame(width: max(6, geo.size.width * CGFloat(recorder.level)))
                    }
            }
            .frame(height: 6)
            .animation(.linear(duration: 0.1), value: recorder.level)
            Text(recorder.transcript.isEmpty ? SharedText.recordingHint(lang) : recorder.transcript)
                .font(.archivo(12))
                .foregroundStyle(Palette.muted)
                .lineLimit(1)
                .frame(maxWidth: 140, alignment: .leading)
        }
        .padding(.horizontal, 10)
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(SharedText.recordingVoiceMessage(lang))
    }
}
