import SwiftUI

/// The app's button looks: primary (dark), ghost (outline), volt (Assist), danger.
struct OJButtonStyle: ButtonStyle {
    enum Kind { case primary, ghost, volt, danger, onHero }
    enum Size { case small, regular, large }

    var kind: Kind = .primary
    var size: Size = .regular
    var fullWidth: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(font)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .padding(.horizontal, size == .small ? 14 : 16)
            .frame(height: height)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .foregroundStyle(foreground)
            .background(background, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(kind == .ghost ? Palette.line : Color.clear, lineWidth: 1)
            )
            .shadow(color: kind == .volt ? Color(hex: 0x8DB80F).opacity(0.45) : .clear, radius: 10, x: 0, y: 5)
            .contentShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.92 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private var font: Font {
        switch size {
        case .small: return .archivo(14, .semibold)
        case .regular: return OJFont.button
        case .large: return OJFont.buttonLarge
        }
    }

    private var height: CGFloat {
        switch size {
        case .small: return 38
        case .regular: return 46
        case .large: return 56
        }
    }

    private var radius: CGFloat {
        switch size {
        case .small: return 12
        case .regular: return 15
        case .large: return 18
        }
    }

    private var foreground: Color {
        switch kind {
        case .primary: return Palette.onPrimary
        case .ghost: return Palette.ink
        case .volt: return Palette.deep
        case .danger: return Palette.crit
        case .onHero: return Palette.bone
        }
    }

    private var background: Color {
        switch kind {
        case .primary: return Palette.primary
        case .ghost: return Palette.surface2
        case .volt: return Palette.volt
        case .danger: return Palette.critTint
        case .onHero: return Color.white.opacity(0.12)
        }
    }
}

extension ButtonStyle where Self == OJButtonStyle {
    static func oj(_ kind: OJButtonStyle.Kind = .primary, size: OJButtonStyle.Size = .regular, fullWidth: Bool = false) -> OJButtonStyle {
        OJButtonStyle(kind: kind, size: size, fullWidth: fullWidth)
    }
}

/// A round icon button (theme switch, add, close…).
struct CircleIconButton: View {
    let systemName: String
    let label: String
    var size: CGFloat = 44
    var style: Style = .plain
    let action: () -> Void

    enum Style { case plain, soft, volt }

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(style == .volt ? Palette.deep : Palette.ink)
                .frame(width: size, height: size)
                .background(background, in: Circle())
                .overlay(Circle().strokeBorder(style == .plain ? Palette.line : Color.clear, lineWidth: 1))
                .shadow(color: style == .plain ? Palette.shadow.opacity(0.3) : .clear, radius: 8, x: 0, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var background: Color {
        switch style {
        case .plain: return Palette.surface
        case .soft: return Palette.surface2
        case .volt: return Palette.volt
        }
    }
}

/// A text-only link button ("Undo", "Payments").
struct LinkButton: View {
    let title: String
    let action: () -> Void

    init(_ title: String, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    var body: some View {
        Button(title, action: action)
            .font(.archivo(14, .semibold))
            .foregroundStyle(Palette.link)
            .buttonStyle(.plain)
            .padding(.vertical, 6)
    }
}

/// Makes a whole row tappable without changing its look.
struct RowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

extension ButtonStyle where Self == RowButtonStyle {
    static var row: RowButtonStyle { RowButtonStyle() }
}
