import SwiftUI

/// Short confirmation messages ("Sent to Marcus") that fade away on their own.
@Observable
final class ToastCenter {
    private(set) var message: String?
    private var hideWork: DispatchWorkItem?

    func show(_ text: String) {
        hideWork?.cancel()
        withAnimation(.spring(duration: 0.3)) { message = text }
        Haptics.success()
        let work = DispatchWorkItem { [weak self] in
            withAnimation(.easeOut(duration: 0.25)) { self?.message = nil }
        }
        hideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.6, execute: work)
    }
}

struct ToastView: View {
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark")
                .font(.system(size: 13, weight: .bold))
            Text(text)
                .font(OJFont.title)
                .multilineTextAlignment(.leading)
        }
        .foregroundStyle(Palette.bg)
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(Palette.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: Palette.shadow, radius: 16, x: 0, y: 8)
        .padding(.horizontal, 24)
        .accessibilityAddTraits(.isStaticText)
    }
}

extension View {
    /// Shows the toast above the tab bar.
    func toastOverlay(_ center: ToastCenter, bottomPadding: CGFloat = 90) -> some View {
        overlay(alignment: .bottom) {
            if let message = center.message {
                ToastView(text: message)
                    .padding(.bottom, bottomPadding)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .allowsHitTesting(false)
            }
        }
    }
}
