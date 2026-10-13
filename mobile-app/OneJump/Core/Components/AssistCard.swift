import SwiftUI

/// The light-volt box that holds anything Assist wrote (insights, drafts, summaries).
struct AssistCard<Content: View>: View {
    let label: String
    var systemImage: String?
    var padding: CGFloat = 14
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let systemImage {
                Label(label, systemImage: systemImage)
                    .font(OJFont.caption)
                    .tracking(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.assistInk)
            } else {
                AssistLabel(label)
            }
            content()
        }
        .padding(padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.assistSoft, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Palette.assistLine, lineWidth: 1)
        )
    }
}

/// Body text inside an `AssistCard`.
struct DraftText: View {
    let text: String
    var muted = false

    init(_ text: String, muted: Bool = false) {
        self.text = text
        self.muted = muted
    }

    var body: some View {
        Text(text)
            .font(OJFont.body)
            .lineSpacing(3)
            .foregroundStyle(muted ? Palette.muted : Palette.ink)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
