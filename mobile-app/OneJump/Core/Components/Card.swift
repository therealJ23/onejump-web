import SwiftUI

/// The white rounded card used everywhere.
struct CardModifier: ViewModifier {
    var padding: CGFloat
    var background: Color
    var radius: CGFloat

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Palette.line, lineWidth: 1)
            )
            .shadow(color: Palette.shadow.opacity(0.35), radius: 12, x: 0, y: 6)
    }
}

/// The deep green "hero" card at the top of a screen.
struct HeroCardModifier: ViewModifier {
    var padding: CGFloat

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(Palette.bone)
            .background(Palette.hero, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .shadow(color: Palette.shadow, radius: 18, x: 0, y: 12)
    }
}

extension View {
    func card(padding: CGFloat = 16, background: Color = Palette.surface, radius: CGFloat = 22) -> some View {
        modifier(CardModifier(padding: padding, background: background, radius: radius))
    }

    func heroCard(padding: CGFloat = 18) -> some View {
        modifier(HeroCardModifier(padding: padding))
    }
}

/// A card that holds rows separated by thin lines.
struct ListCard<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            content()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Palette.line, lineWidth: 1)
        )
        .shadow(color: Palette.shadow.opacity(0.35), radius: 12, x: 0, y: 6)
    }
}

/// Thin line between rows.
struct RowDivider: View {
    var body: some View {
        Rectangle()
            .fill(Palette.line)
            .frame(height: 1)
    }
}

/// Shows rows with a divider between each one.
struct DividedRows<Data: RandomAccessCollection, Row: View>: View {
    let data: Data
    let row: (Data.Element) -> Row

    init(_ data: Data, @ViewBuilder row: @escaping (Data.Element) -> Row) {
        self.data = data
        self.row = row
    }

    var body: some View {
        ForEach(Array(data.enumerated()), id: \.offset) { pair in
            if pair.offset > 0 { RowDivider() }
            row(pair.element)
        }
    }
}

/// Standard padding for a row inside a `ListCard`.
extension View {
    func rowPadding() -> some View {
        padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
