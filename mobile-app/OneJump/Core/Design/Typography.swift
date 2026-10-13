import SwiftUI
import CoreText

/// Registers the Archivo font files that ship inside the app.
/// Called once at launch. If a file is missing, SwiftUI falls back to the system font.
enum FontRegistrar {
    static func registerBundledFonts() {
        let urls = Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? []
        for url in urls {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}

extension Font {
    /// Archivo at a size and weight. Scales with the user's Dynamic Type setting.
    static func archivo(_ size: CGFloat, _ weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(archivoName(for: weight), size: size, relativeTo: style)
    }

    private static func archivoName(for weight: Font.Weight) -> String {
        switch weight {
        case .black, .heavy: return "Archivo-ExtraBold"
        case .bold: return "Archivo-Bold"
        case .semibold: return "Archivo-SemiBold"
        case .medium: return "Archivo-Medium"
        default: return "Archivo-Regular"
        }
    }
}

/// The text styles used across both apps (sizes from the prototype).
enum OJFont {
    static let display = Font.archivo(44, .heavy, relativeTo: .largeTitle)
    static let h1 = Font.archivo(32, .heavy, relativeTo: .largeTitle)
    static let h2 = Font.archivo(20, .bold, relativeTo: .title3)
    static let h3 = Font.archivo(24, .bold, relativeTo: .title2)
    static let stat = Font.archivo(20, .heavy, relativeTo: .title3)
    static let title = Font.archivo(15, .semibold, relativeTo: .body)
    static let body = Font.archivo(15, .regular, relativeTo: .body)
    static let bodyMedium = Font.archivo(15, .medium, relativeTo: .body)
    static let sub = Font.archivo(13, .regular, relativeTo: .subheadline)
    static let subStrong = Font.archivo(13, .semibold, relativeTo: .subheadline)
    static let eyebrow = Font.archivo(12, .semibold, relativeTo: .caption)
    static let caption = Font.archivo(11, .semibold, relativeTo: .caption2)
    static let button = Font.archivo(15, .semibold, relativeTo: .body)
    static let buttonLarge = Font.archivo(17, .semibold, relativeTo: .body)
}

// MARK: - Small text helpers

/// Small uppercase label above a section ("TODAY’S WORKOUT").
struct Eyebrow: View {
    let text: String
    var color: Color = Palette.muted

    init(_ text: String, color: Color = Palette.muted) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text)
            .font(OJFont.eyebrow)
            .tracking(1)
            .textCase(.uppercase)
            .foregroundStyle(color)
    }
}

/// Muted secondary text.
struct SubText: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(OJFont.sub)
            .foregroundStyle(Palette.muted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A strong row title with an optional muted line under it.
struct TitleSub: View {
    let title: String
    var sub: String?
    var lineLimit: Int?

    init(_ title: String, sub: String? = nil, lineLimit: Int? = nil) {
        self.title = title
        self.sub = sub
        self.lineLimit = lineLimit
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(OJFont.title)
                .foregroundStyle(Palette.ink)
            if let sub, !sub.isEmpty {
                Text(sub)
                    .font(OJFont.sub)
                    .foregroundStyle(Palette.muted)
                    .lineLimit(lineLimit)
                    .fixedSize(horizontal: false, vertical: lineLimit == nil)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
