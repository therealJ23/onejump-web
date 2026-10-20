import AVFoundation
import Foundation
import Speech

/// Hands-free conversation with Assist (voice mode).
///
/// The microphone stays open the whole time. Each time the coach stops talking for a moment,
/// what they said is handed to `onUtterance`. Assist's voice plays through the same audio engine
/// with the iPhone's echo cancellation on, so the app can hear the coach over Assist: when the
/// coach starts talking while Assist speaks, Assist stops right away and listens.
///
/// Speech recognition sessions are short (Apple limits them to about a minute), so a new one
/// starts for every sentence and again every 50 seconds of silence.
final class VoiceConversation {
    /// What was said (one sentence), on the main thread.
    var onUtterance: ((String) -> Void)?
    /// The words heard so far in the current sentence (live transcript), on the main thread.
    var onPartial: ((String) -> Void)?
    /// The coach started talking over Assist (Assist has already stopped), on the main thread.
    var onBargeIn: (() -> Void)?
    /// How loud the microphone is (0…1), about 15 times a second, on the main thread.
    var onLevel: ((Float) -> Void)?
    /// Speaking started or stopped, on the main thread.
    var onSpeaking: ((Bool) -> Void)?

    private(set) var isRunning = false
    private(set) var isSpeaking = false
    private(set) var echoCancellation = false

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let playFormat = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
    private let box = RequestBox()
    private var recognizer: SFSpeechRecognizer?
    private var task: SFSpeechRecognitionTask?
    private var taskToken = 0
    private var speakToken = 0
    private var silenceWork: DispatchWorkItem?
    private var idleWork: DispatchWorkItem?
    private var lastPartial = ""
    /// What Assist is saying right now (to tell its echo apart from the coach).
    private var spokenWords: Set<String> = []
    private var bargedIn = false
    private var tapInstalled = false
    private var lastLevelSent = Date.distantPast
    private var observers: [NSObjectProtocol] = []

    // MARK: Start and stop

    /// Starts listening. Returns false if the microphone or speech recognition isn't available.
    @discardableResult
    func start(language: AppLanguage) -> Bool {
        if isRunning { return true }
        recognizer = SFSpeechRecognizer(locale: language.locale)
        guard let recognizer, recognizer.isAvailable else { return false }
        recognizer.defaultTaskHint = .dictation
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
            try session.setActive(true, options: [])
        } catch {
            return false
        }
        // Echo cancellation: Assist's voice is removed from what the microphone hears.
        do {
            try engine.inputNode.setVoiceProcessingEnabled(true)
            echoCancellation = true
        } catch {
            echoCancellation = false
        }
        if !engine.attachedNodes.contains(player) {
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: playFormat)
        }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { return false }
        if tapInstalled { input.removeTap(onBus: 0) }
        let box = self.box
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            box.append(buffer)
            self?.meter(buffer)
        }
        tapInstalled = true
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            tapInstalled = false
            return false
        }
        isRunning = true
        observe()
        startTask()
        return true
    }

    /// Stops listening and speaking.
    func stop() {
        guard isRunning else { return }
        isRunning = false
        stopSpeaking()
        taskToken += 1
        silenceWork?.cancel()
        idleWork?.cancel()
        box.set(nil)
        task?.cancel()
        task = nil
        if tapInstalled {
            engine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        engine.stop()
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
        lastPartial = ""
    }

    // MARK: Listening

    private func startTask() {
        guard isRunning, let recognizer else { return }
        taskToken += 1
        let token = taskToken
        task?.cancel()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        if #available(iOS 16, *) { request.addsPunctuation = true }
        box.set(request)
        lastPartial = ""
        bargedIn = false
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            let text = result?.bestTranscription.formattedString ?? ""
            let isFinal = result?.isFinal ?? false
            DispatchQueue.main.async {
                guard let self, token == self.taskToken, self.isRunning else { return }
                if !text.isEmpty { self.heard(text, token: token) }
                if isFinal { self.finish(token: token) } else if error != nil { self.startTask() }
            }
        }
        // A quiet minute would end the session on its own; start a fresh one before that.
        idleWork?.cancel()
        let idle = DispatchWorkItem { [weak self] in
            guard let self, token == self.taskToken, self.lastPartial.isEmpty else { return }
            self.startTask()
        }
        idleWork = idle
        DispatchQueue.main.asyncAfter(deadline: .now() + 50, execute: idle)
    }

    private func heard(_ text: String, token: Int) {
        if isSpeaking && !bargedIn {
            // Assist is talking: only real words from the coach count, not Assist's own echo.
            guard isCoachTalking(text) else { return }
            bargedIn = true
            stopSpeaking()
            onBargeIn?()
        }
        let clean = withoutEcho(text)
        guard !clean.isEmpty else { return }
        if clean != lastPartial {
            lastPartial = clean
            onPartial?(clean)
        }
        silenceWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.finish(token: token) }
        silenceWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.1, execute: work)
    }

    /// The sentence is over: hand it on and start listening for the next one.
    private func finish(token: Int) {
        guard token == taskToken else { return }
        silenceWork?.cancel()
        let text = lastPartial.trimmingCharacters(in: .whitespacesAndNewlines)
        box.set(nil)
        startTask()
        onPartial?("")
        if !text.isEmpty { onUtterance?(text) }
    }

    /// Words the coach said that Assist didn't just say (echo that slipped past cancellation).
    private func isCoachTalking(_ text: String) -> Bool {
        let fresh = Self.words(text).filter { !spokenWords.contains($0) }
        // A short "stop", "wait", "yes" or "no" is enough to cut in.
        let triggers: Set<String> = ["stop", "wait", "hold", "pause", "assist", "yes", "yeah", "yep", "no", "nope", "okay", "ok",
                                     "para", "espera", "alto", "pausa", "si", "dale", "claro"]
        if fresh.contains(where: triggers.contains) { return true }
        return fresh.count >= (echoCancellation ? 2 : 3)
    }

    private func withoutEcho(_ text: String) -> String {
        guard !spokenWords.isEmpty else { return text }
        var parts = text.split(separator: " ").map(String.init)
        // Drop Assist's own words heard before the coach started talking.
        while let first = parts.first, spokenWords.contains(Self.normalize(first)), parts.count > 1 {
            parts.removeFirst()
        }
        if parts.count == 1, spokenWords.contains(Self.normalize(parts[0])), isSpeaking { return "" }
        return parts.joined(separator: " ")
    }

    private static func normalize(_ word: String) -> String {
        word.lowercased().folding(options: .diacriticInsensitive, locale: nil).filter { $0.isLetter || $0.isNumber }
    }

    private static func words(_ text: String) -> [String] {
        text.split(whereSeparator: { $0 == " " || $0 == "\n" }).map { normalize(String($0)) }.filter { !$0.isEmpty }
    }

    private func meter(_ buffer: AVAudioPCMBuffer) {
        guard let channel = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
        let n = Int(buffer.frameLength)
        var sum: Float = 0
        for i in stride(from: 0, to: n, by: 4) { sum += channel[i] * channel[i] }
        let rms = sqrt(sum / Float(max(1, n / 4)))
        let level = min(1, max(0, (20 * log10(max(rms, 0.000_01)) + 50) / 40))
        let now = Date()
        guard now.timeIntervalSince(lastLevelSent) > 0.066 else { return }
        lastLevelSent = now
        DispatchQueue.main.async { [weak self] in self?.onLevel?(level) }
    }

    // MARK: Speaking

    private let synthesizer = AVSpeechSynthesizer()
    /// Buffers scheduled and not yet played.
    private var scheduled = 0
    /// More audio for the same answer is still being fetched.
    private var moreComing = false
    private var whenDone: (() -> Void)?

    /// Starts saying something: MP3 (or any audio file) from the server, played through the engine.
    /// Set `moreComing` when the rest of the answer will follow with `playMore`. `completion` runs
    /// when everything has played (not when interrupted). Returns false if the audio can't be played.
    func play(_ audio: Data, text: String, moreComing: Bool = false, completion: (() -> Void)?) -> Bool {
        guard isRunning, let buffer = Self.decode(audio, to: playFormat) else { return false }
        stopSpeaking()
        startSpeaking(text)
        whenDone = completion
        self.moreComing = moreComing
        enqueue(buffer, token: speakToken)
        return true
    }

    /// The rest of the answer (nil when it couldn't be fetched: the answer ends after what played).
    func playMore(_ audio: Data?) {
        guard isRunning, isSpeaking else { return }
        moreComing = false
        if let audio, let buffer = Self.decode(audio, to: playFormat) {
            enqueue(buffer, token: speakToken)
        } else if scheduled == 0 {
            finishSpeaking()
        }
    }

    /// The device's own voice (when the server voice isn't available), through the engine.
    func speakOnDevice(_ text: String, voice: AVSpeechSynthesisVoice?, completion: (() -> Void)?) {
        guard isRunning else { completion?(); return }
        stopSpeaking()
        startSpeaking(text)
        whenDone = completion
        moreComing = true
        let token = speakToken
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 1.02
        let format = playFormat
        var pending: [AVAudioPCMBuffer] = []
        synthesizer.write(utterance) { [weak self] buffer in
            guard let pcm = buffer as? AVAudioPCMBuffer else { return }
            if pcm.frameLength > 0 {
                if let converted = VoiceConversation.convert(pcm, to: format) { pending.append(converted) }
                return
            }
            let all = pending
            DispatchQueue.main.async {
                guard let self, token == self.speakToken, self.isRunning else { return }
                self.moreComing = false
                if all.isEmpty { self.finishSpeaking(); return }
                for b in all { self.enqueue(b, token: token) }
            }
        }
    }

    private func enqueue(_ buffer: AVAudioPCMBuffer, token: Int) {
        scheduled += 1
        player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            DispatchQueue.main.async {
                guard let self, token == self.speakToken else { return }
                self.scheduled = max(0, self.scheduled - 1)
                if self.scheduled == 0 && !self.moreComing { self.finishSpeaking() }
            }
        }
        if !player.isPlaying { player.play() }
    }

    private func finishSpeaking() {
        let done = whenDone
        whenDone = nil
        doneSpeaking()
        done?()
    }

    func stopSpeaking() {
        speakToken += 1
        scheduled = 0
        moreComing = false
        whenDone = nil
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        if engine.attachedNodes.contains(player) { player.stop() }
        if isSpeaking {
            isSpeaking = false
            onSpeaking?(false)
        }
    }

    private func startSpeaking(_ text: String) {
        spokenWords = Set(Self.words(text))
        bargedIn = false
        if !isSpeaking {
            isSpeaking = true
            onSpeaking?(true)
        }
        // Whatever was half-heard before Assist started is dropped.
        lastPartial = ""
        silenceWork?.cancel()
    }

    private func doneSpeaking() {
        guard isSpeaking else { return }
        isSpeaking = false
        onSpeaking?(false)
        // Start a clean sentence so Assist's echo isn't sent as a question.
        if !bargedIn { startTask() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            guard let self, !self.isSpeaking else { return }
            self.spokenWords = []
        }
    }

    // MARK: Audio helpers

    /// MP3 (or any file format) to one PCM buffer in the player's format.
    static func decode(_ data: Data, to format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("oj-say-\(UUID().uuidString).mp3")
        defer { try? FileManager.default.removeItem(at: url) }
        do {
            try data.write(to: url)
            let file = try AVAudioFile(forReading: url)
            let frames = AVAudioFrameCount(file.length)
            guard frames > 0, let source = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: frames) else { return nil }
            try file.read(into: source)
            return convert(source, to: format)
        } catch {
            return nil
        }
    }

    static func convert(_ buffer: AVAudioPCMBuffer, to format: AVAudioFormat) -> AVAudioPCMBuffer? {
        if buffer.format == format { return buffer }
        guard let converter = AVAudioConverter(from: buffer.format, to: format) else { return nil }
        let ratio = format.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1024
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return nil }
        var given = false
        var error: NSError?
        let status = converter.convert(to: out, error: &error) { _, outStatus in
            if given {
                outStatus.pointee = .endOfStream
                return nil
            }
            given = true
            outStatus.pointee = .haveData
            return buffer
        }
        return status == .error ? nil : out
    }

    // MARK: Interruptions (calls, Siri)

    private func observe() {
        guard observers.isEmpty else { return }
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let self, let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            if type == .ended, self.isRunning {
                try? AVAudioSession.sharedInstance().setActive(true, options: [])
                if !self.engine.isRunning { try? self.engine.start() }
                self.startTask()
            }
        })
        observers.append(NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            guard let self, self.isRunning, !self.engine.isRunning else { return }
            try? self.engine.start()
            self.startTask()
        })
    }
}

/// The current recognition request, shared with the audio thread.
private final class RequestBox {
    private let lock = NSLock()
    private var request: SFSpeechAudioBufferRecognitionRequest?

    func set(_ new: SFSpeechAudioBufferRecognitionRequest?) {
        lock.lock()
        let old = request
        request = new
        lock.unlock()
        if old !== new { old?.endAudio() }
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        lock.lock()
        let current = request
        lock.unlock()
        current?.append(buffer)
    }
}
