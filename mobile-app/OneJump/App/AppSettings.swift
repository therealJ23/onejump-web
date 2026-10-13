import SwiftUI

enum Appearance: String, CaseIterable, Codable {
    case light, dark, system

    var colorScheme: ColorScheme? {
        switch self {
        case .light: return .light
        case .dark: return .dark
        case .system: return nil
        }
    }
}

/// Which app is showing. In the real app the login decides this.
enum AppRole: String, Codable {
    case coach, client
}

/// Settings shared by the whole app: language, light/dark mode and which app is open.
/// Saved on the device so they survive a restart.
@Observable
final class AppSettings {
    var language: AppLanguage {
        didSet {
            UserDefaults.standard.set(language.rawValue, forKey: Keys.language)
            voice.language = language
        }
    }

    var appearance: Appearance {
        didSet { UserDefaults.standard.set(appearance.rawValue, forKey: Keys.appearance) }
    }

    var role: AppRole? {
        didSet { UserDefaults.standard.set(role?.rawValue, forKey: Keys.role) }
    }

    /// One shared voice so the coach and client apps sound the same.
    let voice = VoiceService()

    private enum Keys {
        static let language = "oj.language"
        static let appearance = "oj.appearance"
        static let role = "oj.role"
    }

    init() {
        let defaults = UserDefaults.standard
        let savedLanguage = defaults.string(forKey: Keys.language).flatMap(AppLanguage.init(rawValue:))
        let deviceSpanish = Locale.preferredLanguages.first?.hasPrefix("es") ?? false
        language = savedLanguage ?? (deviceSpanish ? .spanish : .english)
        appearance = defaults.string(forKey: Keys.appearance).flatMap(Appearance.init(rawValue:)) ?? .system
        role = defaults.string(forKey: Keys.role).flatMap(AppRole.init(rawValue:))
        voice.language = language
    }
}
