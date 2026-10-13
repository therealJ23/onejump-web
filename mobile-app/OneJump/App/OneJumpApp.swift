import SwiftUI

@main
struct OneJumpApp: App {
    @State private var settings = AppSettings()

    init() {
        FontRegistrar.registerBundledFonts()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
                .environment(\.lang, settings.language)
                .preferredColorScheme(settings.appearance.colorScheme)
                .tint(Palette.primary)
        }
    }
}
