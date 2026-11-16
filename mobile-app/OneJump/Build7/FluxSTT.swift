import AVFoundation
import Foundation

/// Live speech-to-text with Deepgram Flux, the model built for voice agents: it tells us when the
/// coach has finished their turn (EndOfTurn), so Assist can answer as soon as they stop instead of
/// waiting out a fixed pause. The app never holds the Deepgram key: OneJump's server hands out a
/// token that's only good for two minutes to open the connection.
///
/// Audio goes up as 16 kHz, 16-bit mono PCM in ~80 ms chunks. `send` is called from the audio
/// thread; everything it touches is behind a lock.
final class FluxSTT: NSObject, URLSessionWebSocketDelegate {
    enum Event {
        case partial(String)   // Update / StartOfTurn / TurnResumed
        case startOfTurn(String)
        case endOfTurn(String)
    }

    var onOpen: (() -> Void)?
    var onEvent: ((Event) -> Void)?
    /// The connection failed or closed while it was meant to be open.
    var onClose: (() -> Void)?

    private let request: URLRequest
    private var session: URLSession?
    private var socket: URLSessionWebSocketTask?
    private let lock = NSLock()
    private var open = false
    private var closing = false
    private var converter: AVAudioConverter?
    private var converterInput: AVAudioFormat?
    private let outFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: true)!
    private var pending = Data()
    private let chunkBytes = 2_560 // 80 ms at 16 kHz × 2 bytes

    init?(token: STTTokenResponse) {
        guard token.available, let t = token.token, let base = token.url,
              let url = URL(string: base + "?" + (token.queryString ?? "model=flux-general-en&encoding=linear16&sample_rate=16000")) else { return nil }
        var r = URLRequest(url: url)
        r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization")
        r.timeoutInterval = 10
        request = r
        super.init()
    }

    /// Asks OneJump's server for a token. Nil when live speech isn't set up (the app then uses
    /// the iPhone's own speech recognition).
    static func token(lang: AppLanguage) async -> STTTokenResponse? {
        let r: STTTokenResponse? = try? await APIClient.shared.post("/api/voice/stt-token", ["lang": lang == .spanish ? "es" : "en"], timeout: 9)
        return (r?.available ?? false) ? r : nil
    }

    func connect() {
        let s = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        session = s
        let task = s.webSocketTask(with: request)
        socket = task
        task.resume()
        receive()
    }

    func close() {
        lock.lock()
        let wasOpen = open
        closing = true
        open = false
        lock.unlock()
        if wasOpen, let data = #"{"type":"CloseStream"}"#.data(using: .utf8) {
            socket?.send(.string(String(decoding: data, as: UTF8.self))) { _ in }
        }
        socket?.cancel(with: .normalClosure, reason: nil)
        session?.invalidateAndCancel()
    }

    /// Converts a microphone buffer to 16 kHz PCM and sends it once there's 80 ms of it.
    func send(_ buffer: AVAudioPCMBuffer) {
        lock.lock()
        defer { lock.unlock() }
        guard open, !closing else { return }
        if converterInput != buffer.format {
            converter = AVAudioConverter(from: buffer.format, to: outFormat)
            converterInput = buffer.format
        }
        guard let converter else { return }
        let ratio = outFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio + 32)
        guard let out = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: capacity) else { return }
        var given = false
        var error: NSError?
        converter.convert(to: out, error: &error) { _, status in
            if given { status.pointee = .noDataNow; return nil }
            given = true
            status.pointee = .haveData
            return buffer
        }
        guard error == nil, out.frameLength > 0, let ch = out.int16ChannelData else { return }
        pending.append(Data(bytes: ch[0], count: Int(out.frameLength) * 2))
        if pending.count >= chunkBytes {
            let chunk = pending
            pending = Data()
            socket?.send(.data(chunk)) { _ in }
        }
    }

    private func receive() {
        socket?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let message):
                if case .string(let text) = message { self.handle(text) }
                if case .data(let data) = message { self.handle(String(decoding: data, as: UTF8.self)) }
                self.receive()
            case .failure:
                self.dropped()
            }
        }
    }

    private struct Message: Decodable {
        let type: String
        var event: String?
        var transcript: String?
    }

    private func handle(_ text: String) {
        guard let m = try? JSONDecoder().decode(Message.self, from: Data(text.utf8)) else { return }
        if m.type == "Error" { dropped(); return }
        guard m.type == "TurnInfo", let event = m.event else { return }
        let t = (m.transcript ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let e: Event?
        switch event {
        case "EndOfTurn": e = .endOfTurn(t)
        case "StartOfTurn": e = .startOfTurn(t)
        case "Update", "TurnResumed", "EagerEndOfTurn": e = t.isEmpty ? nil : .partial(t)
        default: e = nil
        }
        if let e { DispatchQueue.main.async { self.onEvent?(e) } }
    }

    private func dropped() {
        lock.lock()
        let notify = !closing
        closing = true
        open = false
        lock.unlock()
        if notify { DispatchQueue.main.async { self.onClose?() } }
    }

    // MARK: URLSessionWebSocketDelegate

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        lock.lock()
        let go = !closing
        open = go
        lock.unlock()
        if go { DispatchQueue.main.async { self.onOpen?() } }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        dropped()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if error != nil { dropped() }
    }
}

/// The Flux connection the audio tap feeds (nil while the iPhone's recognizer is in use).
final class FluxBox {
    private let lock = NSLock()
    private var current: FluxSTT?
    private var muted = false

    func set(_ new: FluxSTT?) {
        lock.lock(); current = new; lock.unlock()
    }
    var stt: FluxSTT? {
        lock.lock(); defer { lock.unlock() }
        return current
    }
    func send(_ buffer: AVAudioPCMBuffer) {
        lock.lock()
        let c = muted ? nil : current
        lock.unlock()
        c?.send(buffer)
    }
    func setMuted(_ on: Bool) {
        lock.lock(); muted = on; lock.unlock()
    }
    var isMuted: Bool {
        lock.lock(); defer { lock.unlock() }
        return muted
    }
}
