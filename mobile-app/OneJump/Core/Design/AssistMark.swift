import SwiftUI

// The jump arc: the mark that means "Assist did this".
// Drawn on a 24 × 24 grid, the same as the prototype's SVG icon.

private func arcPoint(_ x: CGFloat, _ y: CGFloat, in rect: CGRect) -> CGPoint {
    let s = min(rect.width, rect.height) / 24
    let ox = rect.midX - 12 * s
    let oy = rect.midY - 12 * s
    return CGPoint(x: ox + x * s, y: oy + y * s)
}

/// The curved line of the jump arc.
struct JumpArcShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: arcPoint(3.5, 17, in: rect))
        path.addCurve(
            to: arcPoint(20.5, 17, in: rect),
            control1: arcPoint(7.6, 6.2, in: rect),
            control2: arcPoint(16.4, 6.2, in: rect)
        )
        return path
    }
}

/// The two dots at the ends of the jump arc.
struct JumpArcDotsShape: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 24
        let r = 2.2 * s
        var path = Path()
        for c in [arcPoint(3.5, 17, in: rect), arcPoint(20.5, 17, in: rect)] {
            path.addEllipse(in: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
        }
        return path
    }
}

/// The Assist mark at any size and color.
struct AssistMark: View {
    var size: CGFloat = 18
    var color: Color = Palette.assistInk

    var body: some View {
        ZStack {
            JumpArcShape()
                .stroke(color, style: StrokeStyle(lineWidth: max(1.4, size * 0.09), lineCap: .round))
            JumpArcDotsShape()
                .fill(color)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// "ASSIST DRAFT"-style label with the jump arc in front.
struct AssistLabel: View {
    let text: String
    var color: Color = Palette.assistInk

    init(_ text: String, color: Color = Palette.assistInk) {
        self.text = text
        self.color = color
    }

    var body: some View {
        HStack(spacing: 6) {
            AssistMark(size: 15, color: color)
            Text(text)
                .font(OJFont.caption)
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundStyle(color)
        }
    }
}
