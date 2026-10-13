import SwiftUI

/// Big title at the top of a tab ("Clients", "Inbox").
struct ScreenHeader<Trailing: View>: View {
    var eyebrow: String?
    let title: String
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                if let eyebrow { Eyebrow(eyebrow) }
                Text(title)
                    .font(OJFont.h1)
                    .tracking(-0.8)
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            trailing()
        }
        .padding(.top, 8)
    }
}

extension ScreenHeader where Trailing == EmptyView {
    init(eyebrow: String? = nil, title: String) {
        self.eyebrow = eyebrow
        self.title = title
        self.trailing = { EmptyView() }
    }
}

/// Section title with an optional link on the right.
struct SectionHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Text(title)
                .font(OJFont.h2)
                .tracking(-0.3)
                .foregroundStyle(Palette.ink)
            Spacer(minLength: 0)
            trailing()
        }
        .padding(.top, 6)
    }
}

extension SectionHeader where Trailing == EmptyView {
    init(_ title: String) {
        self.title = title
        self.trailing = { EmptyView() }
    }
}

extension SectionHeader where Trailing == AnyView {
    /// Section title with a muted note on the right.
    init(_ title: String, note: String) {
        self.title = title
        self.trailing = { AnyView(SubText(note)) }
    }

    /// Section title with a link button on the right.
    init(_ title: String, link: String, action: @escaping () -> Void) {
        self.title = title
        self.trailing = { AnyView(LinkButton(link, action: action)) }
    }
}

/// Card shown when a list is empty or everything is done.
struct EmptyStateCard: View {
    var systemImage: String = "checkmark"
    let title: String
    var message: String?

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Palette.good)
                .frame(width: 40, height: 40)
                .background(Palette.goodTint, in: Circle())
            Text(title).font(OJFont.title).foregroundStyle(Palette.ink)
            if let message { SubText(message).multilineTextAlignment(.center) }
        }
        .frame(maxWidth: .infinity)
        .card(padding: 20)
    }
}

/// Standard screen scroll container: background color, padding, spacing.
struct ScreenScroll<Content: View>: View {
    var spacing: CGFloat = 14
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: spacing) {
                content()
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .defaultScrollAnchor(Self.launchAnchor)
        .statusBarBackdrop()
        .background(Palette.bg.ignoresSafeArea())
    }

    /// Previews and screenshots can start a screen scrolled: launch with -ojScroll bottom (or center).
    private static var launchAnchor: UnitPoint? {
        switch UserDefaults.standard.string(forKey: "ojScroll") {
        case "bottom": return .bottom
        case "center": return .center
        default: return nil
        }
    }
}

extension View {
    /// A soft blurred band behind the status bar, so content scrolling under it stays readable
    /// on screens that hide the navigation bar.
    func statusBarBackdrop() -> some View {
        safeAreaInset(edge: .top, spacing: 0) {
            Color.clear
                .frame(height: 0)
                .background(.bar)
        }
    }

    /// Inline navigation title styled for the app, used on pushed screens.
    func ojNavigationTitle(_ title: String) -> some View {
        navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarRole(.editor)
            .toolbarBackground(Palette.bg, for: .navigationBar)
    }
}
