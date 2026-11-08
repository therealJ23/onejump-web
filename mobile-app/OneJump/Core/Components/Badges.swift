import SwiftUI
import UIKit

/// A small rounded status label ("At risk", "New").
struct Pill: View {
    let text: String
    var tone: Tone = .muted

    init(_ text: String, tone: Tone = .muted) {
        self.text = text
        self.tone = tone
    }

    var body: some View {
        Text(text)
            .font(.archivo(12, .semibold, relativeTo: .caption))
            .lineLimit(1)
            .padding(.horizontal, 10)
            .frame(minHeight: 24)
            .foregroundStyle(tone.foreground)
            .background(tone.background, in: Capsule())
            .overlay {
                if tone == .ai {
                    Capsule().strokeBorder(Palette.assistLine, lineWidth: 1)
                }
            }
            .fixedSize()
    }
}

/// Red count bubble ("4").
struct CountBadge: View {
    let count: Int
    var large = false

    var body: some View {
        Text("\(count)")
            .font(.archivo(large ? 14 : 11, .heavy))
            .foregroundStyle(.white)
            .padding(.horizontal, large ? 8 : 5)
            .frame(minWidth: large ? 28 : 18, minHeight: large ? 28 : 18)
            .background(Palette.crit, in: Capsule())
            .contentTransition(.numericText())
            .animation(.snappy, value: count)
    }
}

/// A circle with someone's profile photo, or their initials when there's no photo (or while it loads).
struct Avatar: View {
    let initials: String
    var color: Color = Palette.stone
    var size: CGFloat = 44
    /// A signed photo link from the server ("/files/…" or a full URL).
    var photoURL: String? = nil
    /// A photo picked on this phone that hasn't finished uploading yet.
    var localImage: UIImage? = nil

    var body: some View {
        ZStack {
            Text(initials)
                .font(.archivo(size * 0.34, .bold))
                .foregroundStyle(Palette.deep)
            if let localImage {
                Image(uiImage: localImage).resizable().scaledToFill()
            } else if let photoURL, !photoURL.isEmpty {
                RemotePhoto(path: photoURL)
            }
        }
        .frame(width: size, height: size)
        .background(color, in: Circle())
        .clipShape(Circle())
        .accessibilityHidden(true)
    }
}

/// Photos already downloaded this session, by address without the signature (signed links
/// change every time the server sends them; the photo behind them doesn't).
final class PhotoCache: @unchecked Sendable {
    static let shared = PhotoCache()
    private let cache = NSCache<NSString, UIImage>()

    static func key(_ path: String) -> String { path.components(separatedBy: "?").first ?? path }
    func image(_ path: String) -> UIImage? { cache.object(forKey: Self.key(path) as NSString) }
    func store(_ image: UIImage, for path: String) { cache.setObject(image, forKey: Self.key(path) as NSString) }
}

/// A private photo from the server (profile and progress photos), filling its frame.
struct RemotePhoto: View {
    let path: String
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Color.clear
            }
        }
        .task(id: PhotoCache.key(path)) { await load() }
    }

    @MainActor
    private func load() async {
        if let cached = PhotoCache.shared.image(path) {
            image = cached
            return
        }
        image = nil
        guard let url = APIClient.shared.absoluteURL(path) else { return }
        guard let result = try? await URLSession.shared.data(from: url),
              (result.1 as? HTTPURLResponse)?.statusCode == 200,
              let loaded = UIImage(data: result.0) else { return }
        PhotoCache.shared.store(loaded, for: path)
        image = loaded
    }
}

/// A soft rounded square with an icon in it.
struct IconTile: View {
    let systemName: String
    var tone: IconTone = .plain
    var size: CGFloat = 40

    enum IconTone { case plain, assist, volt }

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(foreground)
            .frame(width: size, height: size)
            .background(background, in: RoundedRectangle(cornerRadius: size * 0.32, style: .continuous))
            .accessibilityHidden(true)
    }

    private var foreground: Color {
        switch tone {
        case .plain: return Palette.ink
        case .assist: return Palette.assistInk
        case .volt: return Palette.deep
        }
    }

    private var background: Color {
        switch tone {
        case .plain: return Palette.surface2
        case .assist: return Palette.assistSoft
        case .volt: return Palette.volt
        }
    }
}

/// Same as `IconTile` but shows the Assist jump arc.
struct AssistTile: View {
    var size: CGFloat = 40

    var body: some View {
        AssistMark(size: size * 0.55, color: Palette.assistInk)
            .frame(width: size, height: size)
            .background(Palette.assistSoft, in: RoundedRectangle(cornerRadius: size * 0.32, style: .continuous))
    }
}

/// A green chip that says something is done ("Sent to Jenna").
struct DoneChip: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Label(text, systemImage: "checkmark")
            .font(.archivo(13, .semibold))
            .foregroundStyle(Palette.good)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Palette.goodTint, in: Capsule())
    }
}
