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
