import SwiftUI

/// A small number tile ("$1,972 · Monthly revenue").
struct StatTile: View {
    let value: String
    let label: String
    var note: String?
    var noteColor: Color = Palette.good
    /// Prototype KPIs put the label on top; plain stats put the number first.
    var labelFirst = false
    var valueSize: CGFloat = 20

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            if labelFirst {
                Text(label).font(OJFont.sub).foregroundStyle(Palette.muted).lineLimit(2)
                valueText
            } else {
                valueText
                Text(label).font(OJFont.sub).foregroundStyle(Palette.muted).lineLimit(2)
            }
            if let note {
                Text(note).font(.archivo(12, .bold)).foregroundStyle(noteColor).lineLimit(1)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    private var valueText: some View {
        Text(value)
            .font(.archivo(valueSize, .heavy, relativeTo: .title3))
            .foregroundStyle(Palette.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

/// A rounded progress bar.
struct ProgressBar: View {
    var value: Double
    var tint: Color = Palette.chart
    var height: CGFloat = 8

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.surface3)
                Capsule()
                    .fill(tint)
                    .frame(width: max(0, min(1, value)) * geo.size.width)
            }
        }
        .frame(height: height)
        .animation(.easeOut(duration: 0.4), value: value)
        .accessibilityElement()
        .accessibilityValue("\(Int((max(0, min(1, value)) * 100).rounded())) %")
    }
}

/// Animated bars shown while Assist is speaking.
struct VoiceWave: View {
    var color: Color = Palette.assistInk
    var bars = 5

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            HStack(alignment: .center, spacing: 3) {
                ForEach(0..<bars, id: \.self) { i in
                    let phase = t * 6 + Double(i) * 0.9
                    Capsule()
                        .fill(color)
                        .frame(width: 3, height: 6 + 12 * abs(sin(phase)))
                }
            }
            .frame(height: 20)
        }
        .accessibilityHidden(true)
    }
}

/// A pulsing dot that means "listening".
struct ListeningDot: View {
    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            Circle()
                .fill(Palette.volt)
                .frame(width: 12, height: 12)
                .overlay(Circle().stroke(Palette.volt.opacity(0.35), lineWidth: 4))
                .scaleEffect(1 + 0.12 * sin(t * 6))
        }
        .frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }
}

/// The dashed volt bar that shows what the app heard while listening.
struct ListenBar: View {
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            ListeningDot()
            Text(text)
                .font(.archivo(14, .semibold))
                .foregroundStyle(Palette.assistInk)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
        .background(Palette.assistSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Palette.assistLine, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
        )
    }
}

/// The glowing volt orb used for voice (Assist and voice logging).
struct VoiceOrb: View {
    var active: Bool
    var size: CGFloat = 136
    var showsArc = true

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: !active)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let pulse = active ? 1 + 0.06 * sin(t * 5.5) : 1
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [Color(hex: 0xF6FFC9), Palette.volt, Color(hex: 0x86AE0C)],
                            center: UnitPoint(x: 0.34, y: 0.28),
                            startRadius: 0,
                            endRadius: size * 0.75
                        )
                    )
                    .shadow(color: Palette.volt.opacity(active ? 0.6 : 0.4), radius: active ? 40 : 28)
                if showsArc {
                    AssistMark(size: size * 0.42, color: Palette.deep)
                } else {
                    Image(systemName: "mic.fill")
                        .font(.system(size: size * 0.34, weight: .semibold))
                        .foregroundStyle(Palette.deep)
                }
            }
            .frame(width: size, height: size)
            .padding(size * 0.09)
            .background(Circle().fill(Palette.assistSoft))
            .scaleEffect(pulse)
        }
    }
}
