import SwiftUI

/// Moon / sun button that flips between light and dark mode.
struct ThemeToggleButton: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.colorScheme) private var scheme
    @Environment(\.lang) private var lang

    var body: some View {
        CircleIconButton(
            systemName: scheme == .dark ? "sun.max" : "moon",
            label: SharedText.switchTheme(lang)
        ) {
            settings.appearance = scheme == .dark ? .light : .dark
        }
    }
}

/// "EN" / "ES" button that switches between the two full languages.
struct LanguageToggleButton: View {
    let current: AppLanguage
    let onToggle: () -> Void
    @Environment(\.lang) private var lang

    var body: some View {
        Button(action: onToggle) {
            Text(current.code)
                .font(.archivo(13, .heavy))
                .foregroundStyle(Palette.ink)
                .frame(width: 44, height: 44)
                .background(Palette.surface, in: Circle())
                .overlay(Circle().strokeBorder(Palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(SharedText.language(lang))
    }
}
