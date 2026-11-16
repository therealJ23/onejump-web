import SwiftUI

// Build 7 actions for the coach app: chat media and reactions, the approve-all queue, time saved.
extension CoachStore {
    // MARK: - Chat

    @MainActor
    func sendMedia(_ media: OutgoingMedia, to clientID: String) async {
        guard live else { toast.show(lang == .spanish ? "Disponible con una cuenta real." : "Available with a real account."); return }
        toast.show(lang == .spanish ? "Enviando…" : "Sending…")
        do {
            _ = try await MediaPrep.send(media, mediaPath: "/api/threads/\(clientID)/media", gifPath: "/api/threads/\(clientID)/gif")
            await loadThread(clientID)
        } catch {
            toast.show((error as? APIError)?.message ?? (lang == .spanish ? "No se pudo enviar." : "Couldn’t send that."))
        }
    }

    @MainActor
    func react(_ emoji: String?, to message: ThreadMessage, in clientID: String) async {
        guard live, let id = message.serverID else { return }
        do {
            let _: ReactResponse = try await APIClient.shared.post("/api/threads/\(clientID)/messages/\(id)/react", ["emoji": emoji.map { $0 as Any } ?? NSNull()])
            await loadThread(clientID)
        } catch {
            toast.show((error as? APIError)?.message ?? "Couldn’t react.")
        }
    }

    /// The client's profile photo for a thread header and bubbles.
    func clientPhoto(_ id: String) -> String? {
        allClients.first { $0.id == id }?.photoURL
    }
}

/// Reaction emoji the coach already put on a message.
extension ThreadMessage {
    var myReaction: String? { reactions.first { $0.mine }?.emoji }
}
extension ChatMessage {
    var myReaction: String? { reactions.first { $0.mine }?.emoji }
}
