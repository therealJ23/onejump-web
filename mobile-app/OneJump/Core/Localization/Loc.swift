import SwiftUI

/// A piece of text in every language the app supports.
///
/// Write `Loc("Today", "Hoy")` for text that changes with the language, or a plain
/// string literal (`"152.4 lb"`) for text that is the same in every language
/// (names, numbers). Read it with the current language: `text(lang)`.
struct Loc: Hashable, ExpressibleByStringLiteral {
    let en: String
    let es: String

    init(_ en: String, _ es: String) {
        self.en = en
        self.es = es
    }

    /// Same text in every language.
    init(same text: String) {
        self.en = text
        self.es = text
    }

    init(stringLiteral value: String) {
        self.init(same: value)
    }

    /// The text in the given language (falls back to English).
    func callAsFunction(_ lang: AppLanguage) -> String {
        lang == .spanish ? es : en
    }

    /// Text with the first letter lowercased, in both languages ("Draft a reminder" → "draft a reminder").
    var lowercasedFirst: Loc {
        Loc(Self.lowerFirst(en), Self.lowerFirst(es))
    }

    static func lowerFirst(_ s: String) -> String {
        guard let first = s.first else { return s }
        return first.lowercased() + s.dropFirst()
    }
}

// MARK: - Current language in the SwiftUI environment

private struct AppLanguageKey: EnvironmentKey {
    static let defaultValue: AppLanguage = .english
}

extension EnvironmentValues {
    /// The language the app is showing. Set once at the root from `AppSettings`.
    var lang: AppLanguage {
        get { self[AppLanguageKey.self] }
        set { self[AppLanguageKey.self] = newValue }
    }
}
