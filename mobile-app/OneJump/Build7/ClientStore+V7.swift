import SwiftUI

// Build 7 actions for the client app: photos, videos and GIFs to the coach, and reactions.
extension ClientStore {
    @MainActor
    func sendMedia(_ media: OutgoingMedia) async {
        guard live else { return }
        toast.show(lang == .spanish ? "Enviando…" : "Sending…")
        do {
            _ = try await MediaPrep.send(media, mediaPath: "/api/me/messages/media", gifPath: "/api/me/messages/gif")
            await refreshThread()
        } catch {
            toast.show((error as? APIError)?.message ?? (lang == .spanish ? "No se pudo enviar." : "Couldn’t send that."))
        }
    }

    @MainActor
    func react(_ emoji: String?, to message: ChatMessage) async {
        guard live, let id = message.serverID else { return }
        do {
            let _: ReactResponse = try await APIClient.shared.post("/api/me/messages/\(id)/react", ["emoji": emoji.map { $0 as Any } ?? NSNull()])
            await refreshThread()
        } catch {
            toast.show((error as? APIError)?.message ?? "Couldn’t react.")
        }
    }
}
