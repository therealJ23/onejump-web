import SwiftUI

// MARK: - Segmented bar

struct SegmentOption<Value: Hashable>: Identifiable {
    let value: Value
    let label: String
    var systemImage: String?
    var badge: Int = 0

    var id: Value { value }
}

/// Rounded segmented control with a sliding highlight.
struct SegmentedBar<Value: Hashable>: View {
    let options: [SegmentOption<Value>]
    @Binding var selection: Value
    var compact = false

    @Namespace private var highlight

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options) { option in
                segment(option)
            }
        }
        .padding(4)
        .background(Palette.surface3, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func segment(_ option: SegmentOption<Value>) -> some View {
        let isOn = option.value == selection
        return Button {
            withAnimation(.snappy(duration: 0.25)) { selection = option.value }
        } label: {
            HStack(spacing: 6) {
                if let icon = option.systemImage {
                    Image(systemName: icon).font(.system(size: 12, weight: .semibold))
                }
                Text(option.label)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if option.badge > 0 {
                    Text("\(option.badge)")
                        .font(.archivo(11, .heavy))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .frame(minHeight: 18)
                        .background(Palette.crit, in: Capsule())
                }
            }
            .font(.archivo(compact ? 13 : 14, .semibold))
            .foregroundStyle(isOn ? Palette.ink : Palette.muted)
            .frame(maxWidth: .infinity)
            .frame(height: compact ? 32 : 36)
            .background {
                if isOn {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Palette.surface)
                        .shadow(color: Palette.shadow.opacity(0.3), radius: 4, x: 0, y: 2)
                        .matchedGeometryEffect(id: "segment", in: highlight)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

// MARK: - Chips

/// A rounded filter or quick-pick chip.
struct Chip: View {
    let label: String
    var isOn = false
    var systemImage: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemImage {
                    Image(systemName: systemImage).font(.system(size: 12, weight: .bold))
                }
                Text(label).lineLimit(1)
            }
            .font(.archivo(14, .semibold))
            .padding(.horizontal, 14)
            .frame(height: 36)
            .foregroundStyle(isOn ? Palette.onPrimary : Palette.ink)
            .background(isOn ? Palette.primary : Palette.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(isOn ? Color.clear : Palette.line2, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/// Chips that scroll sideways, edge to edge.
struct ChipScroller<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) { content() }
                .padding(.horizontal, 16)
        }
        .padding(.horizontal, -16)
    }
}

// MARK: - Steppers

/// Minus / value / plus.
struct ValueStepper: View {
    let value: String
    var minWidth: CGFloat = 74
    var decreaseLabel: String
    var increaseLabel: String
    var enabled = true
    let onDecrease: () -> Void
    let onIncrease: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            stepButton("minus", label: decreaseLabel, action: onDecrease)
            Text(value)
                .font(.archivo(16, .bold))
                .monospacedDigit()
                .frame(minWidth: minWidth)
                .contentTransition(.numericText())
            stepButton("plus", label: increaseLabel, action: onIncrease)
        }
        .opacity(enabled ? 1 : 0.4)
        .disabled(!enabled)
    }

    private func stepButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.snappy) { action() }
            Haptics.tick()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Palette.ink)
                .frame(width: 38, height: 38)
                .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Switch

/// The app's on/off switch (green when on).
struct OJToggle: View {
    let title: String
    var subtitle: String?
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            TitleSub(title, sub: subtitle)
        }
        .tint(Palette.good)
    }
}

// MARK: - Search field

struct SearchField: View {
    let placeholder: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Palette.muted)
            TextField(placeholder, text: $text)
                .font(.archivo(16))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(SharedText.close.en)
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 48)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
    }
}

/// Multi-line text box (drafts, notes).
struct TextBox: View {
    let label: String
    @Binding var text: String
    var placeholder: String = ""
    var minHeight: CGFloat = 96

    var body: some View {
        TextField(placeholder, text: $text, axis: .vertical)
            .font(OJFont.body)
            .lineLimit(4...12)
            .padding(12)
            .frame(minHeight: minHeight, alignment: .topLeading)
            .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.line2, lineWidth: 1))
            .accessibilityLabel(label)
    }
}
