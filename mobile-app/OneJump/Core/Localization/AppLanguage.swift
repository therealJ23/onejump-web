import Foundation

/// Languages the app knows about.
///
/// English and Spanish are complete (every screen, Assist's voice and listening).
/// The others are listed so coaches and clients can see what is coming; in the real
/// app the server translates messages into them.
enum AppLanguage: String, CaseIterable, Identifiable, Codable {
    case english = "en"
    case spanish = "es"
    case portuguese = "pt"
    case french = "fr"
    case haitianCreole = "ht"

    var id: String { rawValue }

    /// Short code shown in the language list (EN, ES…).
    var code: String { rawValue.uppercased() }

    /// The language's name written in that language.
    var nativeName: String {
        switch self {
        case .english: return "English"
        case .spanish: return "Español"
        case .portuguese: return "Português"
        case .french: return "Français"
        case .haitianCreole: return "Kreyòl ayisyen"
        }
    }

    /// True when the whole app (text, voice, listening) works in this language.
    var isFullySupported: Bool { self == .english || self == .spanish }

    /// Locale used for the spoken voice and for speech recognition.
    var speechLocaleIdentifier: String {
        switch self {
        case .english: return "en-US"
        case .spanish: return "es-US"
        case .portuguese: return "pt-BR"
        case .french: return "fr-FR"
        case .haitianCreole: return "fr-FR"
        }
    }

    var locale: Locale { Locale(identifier: speechLocaleIdentifier) }
}
