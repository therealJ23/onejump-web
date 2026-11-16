import SwiftUI
import PhotosUI
import AVKit
import ImageIO
import UniformTypeIdentifiers

// Chat photos, videos and GIFs, emoji reactions, and the + menu that sends them.
// Shared by the coach's thread and the client's chat with their coach.

// MARK: - Showing media

/// A photo, GIF or video inside a bubble.
struct AttachmentView: View {
    let attachment: ChatAttachment
    var maxWidth: CGFloat = 240
    @State private var playing = false

    var body: some View {
        let height = maxWidth / attachment.aspect
        Group {
            switch attachment.kind {
            case "gif":
                AnimatedGIFView(path: attachment.url ?? "")
                    .overlay(alignment: .bottomLeading) { badge("GIF") }
            case "video":
                Button { playing = true } label: {
                    ZStack {
                        LinearGradient(colors: [Palette.green, Palette.deep], startPoint: .topLeading, endPoint: .bottomTrailing)
                        Image(systemName: "play.fill")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(Palette.deep)
                            .frame(width: 48, height: 48)
                            .background(Circle().fill(Palette.bone.opacity(0.9)))
                    }
                    .overlay(alignment: .bottomLeading) { badge("▶ \(VoiceMessageRow.clock(attachment.durationS ?? 0))") }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Play video"))
                .sheet(isPresented: $playing) {
                    if let url = APIClient.shared.absoluteURL(attachment.url ?? "") {
                        VideoPlayer(player: AVPlayer(url: url)).ignoresSafeArea()
                    }
                }
            default:
                RemotePhoto(path: attachment.url ?? "")
                    .background(Palette.surface3)
                    .accessibilityLabel(Text("Photo"))
            }
        }
        .frame(width: maxWidth, height: min(height, 320))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func badge(_ text: String) -> some View {
        Text(text)
            .font(.archivo(10, .heavy))
            .foregroundStyle(.white)
            .padding(.horizontal, 6).padding(.vertical, 3)
            .background(Color.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .padding(8)
    }
}

/// An animated GIF (UIImage can animate frames built with ImageIO).
struct AnimatedGIFView: UIViewRepresentable {
    let path: String

    func makeUIView(context: Context) -> UIImageView {
        let v = UIImageView()
        v.contentMode = .scaleAspectFill
        v.clipsToBounds = true
        v.backgroundColor = UIColor(Palette.surface3)
        v.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        v.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        load(into: v)
        return v
    }

    func updateUIView(_ v: UIImageView, context: Context) {
        if v.accessibilityIdentifier != path { load(into: v) }
    }

    private func load(into v: UIImageView) {
        v.accessibilityIdentifier = path
        if let cached = GIFCache.shared.object(forKey: path as NSString) { v.image = cached; return }
        guard let url = APIClient.shared.absoluteURL(path) else { return }
        Task {
            guard let (data, _) = try? await URLSession.shared.data(from: url), let img = Self.animated(data) else { return }
            GIFCache.shared.setObject(img, forKey: path as NSString)
            await MainActor.run { if v.accessibilityIdentifier == path { v.image = img } }
        }
    }

    static func animated(_ data: Data) -> UIImage? {
        guard let src = CGImageSourceCreateWithData(data as CFData, nil) else { return UIImage(data: data) }
        let count = CGImageSourceGetCount(src)
        if count <= 1 { return UIImage(data: data) }
        var frames: [UIImage] = []
        var total: Double = 0
        for i in 0..<min(count, 120) {
            guard let cg = CGImageSourceCreateImageAtIndex(src, i, nil) else { continue }
            frames.append(UIImage(cgImage: cg))
            let props = CGImageSourceCopyPropertiesAtIndex(src, i, nil) as? [CFString: Any]
            let gif = props?[kCGImagePropertyGIFDictionary] as? [CFString: Any]
            let delay = (gif?[kCGImagePropertyGIFUnclampedDelayTime] as? Double) ?? (gif?[kCGImagePropertyGIFDelayTime] as? Double) ?? 0.08
            total += max(0.02, delay)
        }
        return UIImage.animatedImage(with: frames, duration: total)
    }
}

final class GIFCache {
    static let shared: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 60
        return c
    }()
}

/// Reactions under a bubble: "🔥 2  💪".
struct ReactionChipsRow: View {
    let reactions: [ChatReaction]
    var body: some View {
        if !reactions.isEmpty {
            HStack(spacing: 4) {
                ForEach(reactions, id: \.emoji) { r in
                    HStack(spacing: 2) {
                        Text(r.emoji).font(.system(size: 13))
                        if r.count > 1 { Text("\(r.count)").font(.archivo(11, .semibold)).foregroundStyle(Palette.muted) }
                    }
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(Capsule().fill(Palette.surface))
                    .overlay(Capsule().strokeBorder(r.mine ? Palette.green : Palette.line, lineWidth: 1))
                }
            }
            .accessibilityElement(children: .combine)
        }
    }
}

/// Long-press menu on a message: react with one of the quick emojis, or remove yours.
struct ReactionMenu: View {
    let mine: String?
    let onPick: (String?) -> Void
    var body: some View {
        ForEach(Reactions.quick, id: \.self) { e in
            Button { onPick(e) } label: { Text(e == mine ? "\(e)  ✓" : e) }
        }
        if mine != nil {
            Button(role: .destructive) { onPick(nil) } label: { Label("Remove reaction", systemImage: "xmark") }
        }
    }
}

// MARK: - Sending media

/// What the + menu hands back to the screen that sends it.
enum OutgoingMedia {
    case photo(Data, width: Int, height: Int)
    case video(URL, seconds: Int)
    case gif(GifItem)
}

// Videos from the library use PickedMovie (LiveTrainingViews.swift).

enum MediaPrep {
    /// A JPEG no bigger than 2048 px on its long side (location data isn't kept: it's re-encoded).
    static func jpeg(_ image: UIImage) -> (Data, Int, Int)? {
        let maxSide: CGFloat = 2048
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        let size = CGSize(width: floor(image.size.width * scale), height: floor(image.size.height * scale))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let out = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let data = out.jpegData(compressionQuality: 0.82) else { return nil }
        return (data, Int(size.width), Int(size.height))
    }

    static func seconds(of url: URL) async -> Int {
        let asset = AVURLAsset(url: url)
        let d = (try? await asset.load(.duration)) ?? .zero
        return Int(CMTimeGetSeconds(d).rounded())
    }

    /// Sends a photo, video or GIF to a chat endpoint pair (".../media" and ".../gif").
    static func send(_ media: OutgoingMedia, mediaPath: String, gifPath: String) async throws -> SentMessageResponse {
        switch media {
        case .photo(let data, let w, let h):
            return try await APIClient.shared.upload(mediaPath, field: "media", file: data, filename: "photo.jpg", mimeType: "image/jpeg", fields: ["width": "\(w)", "height": "\(h)"])
        case .video(let url, let seconds):
            let data = try Data(contentsOf: url)
            if data.count > 60 * 1024 * 1024 { throw APIError(status: 413, message: "That video is too big (60 MB max). Trim it and try again.") }
            let mov = url.pathExtension.lowercased() == "mov"
            return try await APIClient.shared.upload(mediaPath, field: "media", file: data, filename: mov ? "video.mov" : "video.mp4", mimeType: mov ? "video/quicktime" : "video/mp4", fields: ["durationS": "\(seconds)"], timeout: 300)
        case .gif(let g):
            var gif: [String: Any] = ["id": g.id, "url": g.url, "title": g.title ?? ""]
            if let p = g.previewUrl { gif["previewUrl"] = p }
            if let w = g.width { gif["width"] = w }
            if let h = g.height { gif["height"] = h }
            return try await APIClient.shared.post(gifPath, ["gif": gif])
        }
    }
}

/// The + button in a chat composer: photo or video, camera, or a GIF.
struct AttachMenuButton: View {
    let onMedia: (OutgoingMedia) -> Void
    @Environment(\.lang) private var lang
    @State private var showPhotos = false
    @State private var showCamera = false
    @State private var showGifs = false
    @State private var picked: PhotosPickerItem?

    var body: some View {
        Menu {
            Button { showPhotos = true } label: { Label(lang == .spanish ? "Foto o video" : "Photo or video", systemImage: "photo.on.rectangle") }
            Button { showCamera = true } label: { Label(lang == .spanish ? "Cámara" : "Camera", systemImage: "camera") }
            Button { showGifs = true } label: { Label("GIF", systemImage: "face.smiling") }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Palette.ink)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Palette.surface))
                .overlay(Circle().strokeBorder(Palette.line2, lineWidth: 1))
        }
        .accessibilityLabel(Text(lang == .spanish ? "Enviar foto, video o GIF" : "Send a photo, video or GIF"))
        .photosPicker(isPresented: $showPhotos, selection: $picked, matching: .any(of: [.images, .videos]))
        .onChange(of: picked) { _, item in
            guard let item else { return }
            picked = nil
            Task { await load(item) }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { result in
                showCamera = false
                if let result { onMedia(result) }
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $showGifs) {
            GifPickerView { gif in
                showGifs = false
                onMedia(.gif(gif))
            }
            .presentationDetents([.medium, .large])
        }
    }

    @MainActor
    private func load(_ item: PhotosPickerItem) async {
        if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
            if let movie = try? await item.loadTransferable(type: PickedMovie.self) {
                onMedia(.video(movie.url, seconds: await MediaPrep.seconds(of: movie.url)))
            }
            return
        }
        if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data), let jpeg = MediaPrep.jpeg(image) {
            onMedia(.photo(jpeg.0, width: jpeg.1, height: jpeg.2))
        }
    }
}

/// The camera: a photo or a video of up to 3 minutes.
struct CameraPicker: UIViewControllerRepresentable {
    let done: (OutgoingMedia?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        p.mediaTypes = [UTType.image.identifier, UTType.movie.identifier]
        p.videoMaximumDuration = 180
        p.videoQuality = .typeHigh
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let done: (OutgoingMedia?) -> Void
        init(done: @escaping (OutgoingMedia?) -> Void) { self.done = done }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let url = info[.mediaURL] as? URL {
                let copy = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).mov")
                try? FileManager.default.copyItem(at: url, to: copy)
                Task { @MainActor in self.done(.video(copy, seconds: await MediaPrep.seconds(of: copy))) }
                return
            }
            if let image = info[.originalImage] as? UIImage, let jpeg = MediaPrep.jpeg(image) {
                done(.photo(jpeg.0, width: jpeg.1, height: jpeg.2))
            } else {
                done(nil)
            }
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { done(nil) }
    }
}

/// GIF search (GIPHY, through the OneJump server).
struct GifPickerView: View {
    let onPick: (GifItem) -> Void
    @Environment(\.lang) private var lang
    @State private var query = ""
    @State private var items: [GifItem] = []
    @State private var available = true
    @State private var loading = false
    @State private var errorText: String?
    private let chips = ["Let's go", "Gym", "Strong", "Tired", "Thank you", "Yes!", "Party"]

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                TextField(lang == .spanish ? "Buscar GIFs" : "Search GIFs", text: $query)
                    .font(.archivo(15))
                    .submitLabel(.search)
                    .onSubmit { Task { await search() } }
            }
            .padding(.horizontal, 14)
            .frame(height: 44)
            .background(Palette.surface2, in: Capsule())
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(chips, id: \.self) { c in
                        Button { query = c; Task { await search() } } label: {
                            Text(c).font(.archivo(13, .semibold))
                                .padding(.horizontal, 12).frame(height: 32)
                                .background(Capsule().fill(query == c ? Palette.deep : Palette.surface))
                                .foregroundStyle(query == c ? Palette.bone : Palette.ink)
                                .overlay(Capsule().strokeBorder(Palette.line2, lineWidth: query == c ? 0 : 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            if !available {
                EmptyStateCard(systemImage: "face.smiling", title: lang == .spanish ? "Los GIFs aún no están activados." : "GIFs aren’t set up yet.")
                Spacer()
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        ForEach(items) { g in
                            Button { onPick(g) } label: {
                                AnimatedGIFView(path: g.previewUrl ?? g.url)
                                    .frame(height: 104)
                                    .frame(maxWidth: .infinity)
                                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(Text(g.title ?? "GIF"))
                        }
                    }
                    if loading { ProgressView().padding() }
                    if let errorText { SubText(errorText) }
                }
                Text("Powered by GIPHY").font(.archivo(11, .semibold)).foregroundStyle(Palette.muted)
            }
        }
        .padding(16)
        .background(Palette.bg.ignoresSafeArea())
        .task { await search() }
    }

    @MainActor
    private func search() async {
        loading = true
        defer { loading = false }
        let q = query.trimmingCharacters(in: .whitespaces).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        do {
            let r: GifResponse = try await APIClient.shared.get("/api/gifs?q=\(q)&lang=\(lang == .spanish ? "es" : "en")")
            available = r.available
            items = r.items
            errorText = r.error
        } catch {
            errorText = (error as? APIError)?.message ?? error.localizedDescription
        }
    }
}
