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

/// Which demo app is showing (the sample business or the sample client).
enum AppRole: String, Codable {
    case coach, client
}

/// Settings shared by the whole app: language, light/dark mode, who is signed in and which
/// demo is open. Saved on the device so they survive a restart.
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

    /// The demo app that's open (nil = none). Signed-in coaches don't use it.
    var role: AppRole? {
        didSet { UserDefaults.standard.set(role?.rawValue, forKey: Keys.role) }
    }

    /// A coach is signed in to their real account (the session cookie is kept by the system).
    var signedIn: Bool {
        didSet { UserDefaults.standard.set(signedIn, forKey: Keys.signedIn) }
    }

    /// The demo picker is showing (instead of the login screen).
    var demo: Bool {
        didSet { UserDefaults.standard.set(demo, forKey: Keys.demo) }
    }

    /// The signed-in coach's name, shown while their business loads.
    var coachName: String {
        didSet { UserDefaults.standard.set(coachName, forKey: Keys.coachName) }
    }

    /// One shared voice so the coach and client apps sound the same.
    let voice = VoiceService()

    private enum Keys {
        static let language = "oj.language"
        static let appearance = "oj.appearance"
        static let role = "oj.role"
        static let signedIn = "oj.signedIn"
        static let demo = "oj.demo"
        static let coachName = "oj.coachName"
    }

    init() {
        let defaults = UserDefaults.standard
        let savedLanguage = defaults.string(forKey: Keys.language).flatMap(AppLanguage.init(rawValue:))
        let deviceSpanish = Locale.preferredLanguages.first?.hasPrefix("es") ?? false
        language = savedLanguage ?? (deviceSpanish ? .spanish : .english)
        appearance = defaults.string(forKey: Keys.appearance).flatMap(Appearance.init(rawValue:)) ?? .system
        role = defaults.string(forKey: Keys.role).flatMap(AppRole.init(rawValue:))
        signedIn = defaults.bool(forKey: Keys.signedIn)
        demo = defaults.bool(forKey: Keys.demo)
        coachName = defaults.string(forKey: Keys.coachName) ?? ""
        voice.language = language
    }

    /// After a successful login.
    func signIn(name: String) {
        coachName = name
        role = nil
        demo = false
        signedIn = true
    }

    /// Back to the login screen (logged out, or the session ended).
    func signOut() {
        voice.remoteVoice = nil
        signedIn = false
        role = nil
        demo = false
    }

    /// Leaves the demo for the login screen.
    func exitDemo() {
        role = nil
        demo = false
    }
}
