import AVFoundation
import Foundation
import Speech

/// One voice for everything Assist says (morning briefing, answers, confirmations),
/// plus listening for the user's voice.
///
/// Listening uses Apple's speech recognition. If the user says no to the microphone,
/// or the device can't listen (for example a simulator without a mic), the app
/// plays a sample sentence instead so the flow can still be tried.
@Observable
final class VoiceService {
    private(set) var isSpeaking = false
    private(set) var isListening = false
    /// What the app has heard so far while listening.
    private(set) var heard = ""

    /// Which language to speak and listen in.
    var language: AppLanguage = .english {
        didSet {
            if oldValue != language {
                stopSpeaking()
                stopListening()
            }
        }
    }

    /// When signed in, Assist speaks with the server's voice (Deepgram, e.g. Elise): this returns
    /// the audio for some text, or nil (then the device's own voice is used).
    @ObservationIgnored var remoteVoice: ((String, AppLanguage) async -> Data?)?

    /// Assist's voice mode: always listening, Assist's voice can be interrupted (see VoiceConversation).
    private(set) var isConversing = false
    /// How loud the coach is right now (0…1), while conversing.
    private(set) var inputLevel: Float = 0
    @ObservationIgnored private let conversation = VoiceConversation()
    /// Spoken audio fetched ahead of time (the morning briefing), by language and text.
    @ObservationIgnored private var audioCache: [String: Data] = [:]
    @ObservationIgnored private var audioCacheOrder: [String] = []
    @ObservationIgnored private var inflight: [String: Task<Data?, Never>] = [:]
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private let playerDelegate = PlayerDelegate()
    @ObservationIgnored private var speakToken = 0

    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()
    @ObservationIgnored private let speechDelegate = SpeechDelegate()
    @ObservationIgnored private var currentUtterance: AVSpeechUtterance?
    @ObservationIgnored private var speakCompletion: (() -> Void)?

    @ObservationIgnored private let audioEngine = AVAudioEngine()
    @ObservationIgnored private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var recognitionTask: SFSpeechRecognitionTask?
    @ObservationIgnored private var listenToken = 0
    @ObservationIgnored private var silenceWork: DispatchWorkItem?
    @ObservationIgnored private var maxWork: DispatchWorkItem?
    @ObservationIgnored private var listenDone: ((String) -> Void)?
    @ObservationIgnored private var recognitionUnavailable = false
    @ObservationIgnored private var tapInstalled = false

    init() {
        synthesizer.delegate = speechDelegate
        speechDelegate.onFinish = { [weak self] utterance in
            DispatchQueue.main.async { self?.utteranceFinished(utterance) }
        }
        player = nil
    }

    // MARK: - Speaking

    /// The name of the voice in use, for the settings screen.
    var voiceName: String {
        guard let voice = Self.bestVoice(for: language) else { return "" }
        return voice.name
    }

    /// Speaks text in Assist's voice. `completion` runs when it finishes (not when cancelled).
    func speak(_ text: String, completion: (() -> Void)? = nil) {
        stopSpeaking()
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else {
            if let completion { DispatchQueue.main.async { completion() } }
            return
        }
        if isConversing {
            speakInConversation(clean, completion: completion)
            return
        }
        speakCompletion = completion
        configureAudioSession()
        guard remoteVoice != nil else {
            speakOnDevice(clean)
            return
        }
        // The server's voice: the first sentence is fetched and played while the rest is fetched.
        speakToken += 1
        let token = speakToken
        isSpeaking = true
        let parts = Self.splitForSpeech(clean)
        Task { @MainActor [weak self] in
            guard let self else { return }
            let first = Task { await self.audio(for: parts[0]) }
            let rest = parts.count > 1 ? Task { await self.audio(for: parts[1]) } : nil
            guard let firstAudio = await first.value else {
                guard token == self.speakToken else { return }
                self.speakOnDevice(clean)
                return
            }
            guard token == self.speakToken else { return }
            self.play(firstAudio, token: token) { [weak self] in
                guard let self, token == self.speakToken else { return }
                guard let rest else { self.finishRemote(token); return }
                Task { @MainActor [weak self] in
                    guard let self, token == self.speakToken else { return }
                    if let audio = await rest.value {
                        self.play(audio, token: token) { [weak self] in self?.finishRemote(token) }
                    } else {
                        self.speakOnDevice(parts[1])
                    }
                }
            }
        }
    }

    /// "First sentence. Everything else." (short text stays in one piece)
    static func splitForSpeech(_ text: String) -> [String] {
        guard text.count >= 120 else { return [text] }
        let enders: Set<Character> = [".", "!", "?", "…"]
        var index = text.startIndex
        var count = 0
        while index < text.endIndex {
            let ch = text[index]
            count += 1
            let next = text.index(after: index)
            if enders.contains(ch), count >= 20, next < text.endIndex, text[next] == " " {
                let first = String(text[...index])
                let rest = String(text[next...]).trimmingCharacters(in: .whitespaces)
                return rest.isEmpty ? [text] : [first, rest]
            }
            if count > 180 { break }
            index = next
        }
        return [text]
    }

    private func play(_ audio: Data, token: Int, then: @escaping () -> Void) {
        guard token == speakToken else { return }
        do {
            let p = try AVAudioPlayer(data: audio)
            playerDelegate.onFinish = { DispatchQueue.main.async { then() } }
            p.delegate = playerDelegate
            player = p
            p.prepareToPlay()
            if !p.play() { then() }
        } catch {
            then()
        }
    }

    private func finishRemote(_ token: Int) {
        guard token == speakToken else { return }
        player = nil
        isSpeaking = false
        let done = speakCompletion
        speakCompletion = nil
        done?()
    }

    private func speakOnDevice(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = Self.bestVoice(for: language)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 1.02
        utterance.pitchMultiplier = 1
        utterance.postUtteranceDelay = 0.05
        currentUtterance = utterance
        isSpeaking = true
        synthesizer.speak(utterance)
    }

    func stopSpeaking() {
        speakToken += 1
        sentenceQueue?.finish()
        sentenceQueue = nil
        if isConversing { conversation.stopSpeaking() }
        player?.stop()
        player = nil
        currentUtterance = nil
        speakCompletion = nil
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }
        isSpeaking = false
    }

    /// Only the utterance we're waiting for counts; finishes from stopped ones are ignored.
    private func utteranceFinished(_ utterance: AVSpeechUtterance) {
        guard let current = currentUtterance, current === utterance else { return }
        currentUtterance = nil
        isSpeaking = false
        let done = speakCompletion
        speakCompletion = nil
        done?()
    }

    /// Picks the most natural voice installed for the language
    /// (premium, then enhanced, then the default), skipping novelty voices.
    static func bestVoice(for language: AppLanguage) -> AVSpeechSynthesisVoice? {
        let prefix = language.rawValue
        let preferredRegion = language.speechLocaleIdentifier
        let favorites = language == .spanish
            ? ["Paulina", "Mónica", "Marisol", "Isabela"]
            : ["Ava", "Samantha", "Allison", "Zoe", "Evan"]
        let voices = AVSpeechSynthesisVoice.speechVoices().filter { voice in
            voice.language.hasPrefix(prefix) && !voice.voiceTraits.contains(.isNoveltyVoice)
        }
        func score(_ voice: AVSpeechSynthesisVoice) -> Int {
            var s = 0
            switch voice.quality {
            case .premium: s += 300
            case .enhanced: s += 200
            default: s += 100
            }
            if voice.language == preferredRegion { s += 30 }
            if language == .spanish && voice.language == "es-MX" { s += 20 }
            if let rank = favorites.firstIndex(where: { voice.name.hasPrefix($0) }) { s += 50 - rank * 5 }
            return s
        }
        return voices.max(by: { score($0) < score($1) }) ?? AVSpeechSynthesisVoice(language: preferredRegion)
    }

    // MARK: - Conversation (Assist voice mode)

    /// Opens the microphone for a hands-free conversation. `onUtterance` gets each sentence the
    /// coach says. `done` says whether it started (false: no microphone or speech permission).
    func startConversation(onUtterance: @escaping (String) -> Void, onBargeIn: (() -> Void)? = nil, done: @escaping (Bool) -> Void) {
        stopListening()
        stopSpeaking()
        conversation.onUtterance = { text in onUtterance(text) }
        conversation.onPartial = { [weak self] text in self?.heard = text }
        conversation.onLevel = { [weak self] level in self?.inputLevel = level }
        conversation.onSpeaking = { [weak self] speaking in self?.isSpeaking = speaking }
        conversation.onBargeIn = { onBargeIn?() }
        requestPermissions { [weak self] granted in
            guard let self else { return }
            let ok = granted && self.conversation.start(language: self.language)
            self.isConversing = ok
            self.isListening = ok
            self.heard = ""
            done(ok)
        }
    }

    func stopConversation() {
        guard isConversing || conversation.isRunning else { return }
        conversation.stop()
        isConversing = false
        isListening = false
        isSpeaking = false
        inputLevel = 0
        heard = ""
        // Hand the audio back to normal playback.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func speakInConversation(_ text: String, completion: (() -> Void)?) {
        speakToken += 1
        let token = speakToken
        conversation.stopSpeaking()
        guard remoteVoice != nil else {
            conversation.speakOnDevice(text, voice: Self.bestVoice(for: language), completion: completion)
            return
        }
        let parts = Self.splitForSpeech(text)
        Task { @MainActor [weak self] in
            guard let self else { return }
            let first = Task { await self.audio(for: parts[0]) }
            let rest = parts.count > 1 ? Task { await self.audio(for: parts[1]) } : nil
            let firstAudio = await first.value
            guard token == self.speakToken, self.isConversing else { return }
            guard let firstAudio, self.conversation.play(firstAudio, text: text, moreComing: rest != nil, completion: completion) else {
                self.conversation.speakOnDevice(text, voice: Self.bestVoice(for: self.language), completion: completion)
                return
            }
            if let rest {
                let more = await rest.value
                guard token == self.speakToken else { return }
                self.conversation.playMore(more)
            }
        }
    }

    // MARK: - Speaking an answer while it's still arriving

    @ObservationIgnored private var sentenceQueue: AsyncStream<(String, Task<Data?, Never>?)>.Continuation?

    /// Starts speaking an answer that arrives sentence by sentence (`speakNext`, then
    /// `endStreamedSpeech`). Each sentence's audio is fetched as soon as it arrives and played in
    /// order, so Assist starts talking after the first sentence instead of the whole answer.
    func beginStreamedSpeech() {
        stopSpeaking()
        guard isConversing else { return }
        let token = speakToken
        conversation.beginAnswer()
        let (stream, continuation) = AsyncStream.makeStream(of: (String, Task<Data?, Never>?).self)
        sentenceQueue = continuation
        Task { @MainActor [weak self] in
            for await (text, fetch) in stream {
                guard let self, token == self.speakToken, self.isConversing, self.conversation.acceptsMore else { return }
                if let fetch, let audio = await fetch.value {
                    guard token == self.speakToken else { return }
                    if self.conversation.appendAudio(audio, text: text) { continue }
                }
                // No server voice (or it failed): the phone's own voice for this sentence.
                let buffers = await self.conversation.synthesize(text, voice: Self.bestVoice(for: self.language))
                guard token == self.speakToken else { return }
                self.conversation.appendBuffers(buffers, text: text)
            }
            guard let self, token == self.speakToken else { return }
            self.conversation.finishAnswer()
        }
    }

    /// The next sentence of the answer being spoken.
    func speakNext(_ text: String) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, let queue = sentenceQueue else { return }
        let fetch: Task<Data?, Never>? = remoteVoice == nil ? nil : Task { @MainActor [weak self] in await self?.audio(for: clean) }
        queue.yield((clean, fetch))
    }

    /// Whether an answer is being spoken sentence by sentence right now.
    var isStreamingSpeech: Bool { sentenceQueue != nil }

    /// The answer is complete: Assist finishes saying what's queued.
    func endStreamedSpeech() {
        sentenceQueue?.finish()
        sentenceQueue = nil
    }

    // MARK: - Speaking ahead of time

    private func cacheKey(_ text: String) -> String { language.rawValue + "|" + text }

    /// Fetches the server voice for these lines now, so they play without waiting later.
    func prefetch(_ texts: [String]) {
        guard remoteVoice != nil else { return }
        for text in texts {
            let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { continue }
            let key = cacheKey(clean)
            guard audioCache[key] == nil, inflight[key] == nil else { continue }
            inflight[key] = Task { @MainActor [weak self] in
                guard let self, let remoteVoice = self.remoteVoice else { return nil }
                let data = await remoteVoice(clean, self.language)
                self.inflight[key] = nil
                if let data { self.remember(data, for: key) }
                return data
            }
        }
    }

    private func remember(_ data: Data, for key: String) {
        audioCache[key] = data
        audioCacheOrder.removeAll { $0 == key }
        audioCacheOrder.append(key)
        while audioCacheOrder.count > 40 { audioCache[audioCacheOrder.removeFirst()] = nil }
    }

    /// The server voice for some text: from the cache, a fetch already running, or a new fetch.
    @MainActor
    private func audio(for text: String) async -> Data? {
        let key = cacheKey(text)
        if let data = audioCache[key] { return data }
        if let running = inflight[key] { return await running.value }
        guard let remoteVoice else { return nil }
        let data = await remoteVoice(text, language)
        if let data { remember(data, for: key) }
        return data
    }

    // MARK: - Listening

    /// Listens for one sentence. `fallback` is used when the device can't listen.
    /// `onFinish` gets the final text (empty if nothing was heard).
    func listen(fallback: String, onFinish: @escaping (String) -> Void) {
        if isConversing { stopConversation() }
        stopListening()
        stopSpeaking()
        listenToken += 1
        let token = listenToken
        heard = ""
        isListening = true
        listenDone = onFinish

        if recognitionUnavailable {
            simulate(fallback, token: token)
            return
        }
        requestPermissions { [weak self] granted in
            guard let self, token == self.listenToken else { return }
            if !granted {
                self.recognitionUnavailable = true
                self.simulate(fallback, token: token)
                return
            }
            if !self.startRecognition(token: token) {
                self.recognitionUnavailable = true
                self.simulate(fallback, token: token)
            }
        }
    }

    /// Stops listening without calling the finish handler.
    func stopListening() {
        listenToken += 1
        listenDone = nil
        tearDownRecognition()
        if isListening { isListening = false }
    }

    private func finishListening(token: Int) {
        guard token == listenToken else { return }
        let text = heard.trimmingCharacters(in: .whitespacesAndNewlines)
        let done = listenDone
        listenDone = nil
        listenToken += 1
        tearDownRecognition()
        isListening = false
        done?(text)
    }

    private func requestPermissions(_ completion: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                guard status == .authorized else {
                    completion(false)
                    return
                }
                AVAudioApplication.requestRecordPermission { granted in
                    DispatchQueue.main.async { completion(granted) }
                }
            }
        }
    }

    private func startRecognition(token: Int) -> Bool {
        guard let recognizer = SFSpeechRecognizer(locale: language.locale), recognizer.isAvailable else { return false }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .duckOthers, .allowBluetoothA2DP])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let input = audioEngine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else { return false }

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.contextualStrings = SpeechHints.current
            if #available(iOS 16, *) { request.addsPunctuation = true }
            recognitionRequest = request

            if tapInstalled { input.removeTap(onBus: 0) }
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
            tapInstalled = true
            audioEngine.prepare()
            try audioEngine.start()

            recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                let text = result?.bestTranscription.formattedString
                let isFinal = result?.isFinal ?? false
                let failed = error != nil
                DispatchQueue.main.async {
                    guard let self, token == self.listenToken else { return }
                    if let text, !text.isEmpty {
                        self.heard = text
                        self.scheduleSilenceCheck(token: token)
                    }
                    if isFinal || failed {
                        self.finishListening(token: token)
                    }
                }
            }

            let maxWork = DispatchWorkItem { [weak self] in self?.finishListening(token: token) }
            self.maxWork = maxWork
            DispatchQueue.main.asyncAfter(deadline: .now() + 9, execute: maxWork)
            // If nothing at all is said, stop after a few seconds.
            scheduleSilenceCheck(token: token, delay: 5)
            return true
        } catch {
            tearDownRecognition()
            return false
        }
    }

    /// Ends listening after a short pause in speech.
    private func scheduleSilenceCheck(token: Int, delay: Double = 1.5) {
        silenceWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.finishListening(token: token) }
        silenceWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func tearDownRecognition() {
        silenceWork?.cancel()
        silenceWork = nil
        maxWork?.cancel()
        maxWork = nil
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        if tapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil
    }

    /// Types out a sample sentence word by word, like real listening would.
    private func simulate(_ text: String, token: Int) {
        let words = text.split(separator: " ").map(String.init)
        for (i, _) in words.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7 + Double(i) * 0.23) { [weak self] in
                guard let self, token == self.listenToken else { return }
                self.heard = words[0...i].joined(separator: " ")
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7 + Double(words.count) * 0.23 + 0.5) { [weak self] in
            self?.finishListening(token: token)
        }
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .duckOthers, .allowBluetoothA2DP])
        try? session.setActive(true, options: [])
    }
}

/// Receives "finished playing" callbacks from the server-voice player.
private final class PlayerDelegate: NSObject, AVAudioPlayerDelegate {
    var onFinish: (() -> Void)?

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        onFinish?()
    }

    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        onFinish?()
    }
}

/// Receives "finished speaking" callbacks from AVSpeechSynthesizer.
private final class SpeechDelegate: NSObject, AVSpeechSynthesizerDelegate {
    var onFinish: ((AVSpeechUtterance) -> Void)?

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        onFinish?(utterance)
    }
}

// MARK: - Yes / no

enum YesNo: Equatable {
    case yes, no

    /// Understands "yes, send it", "no", "not now", "sí, envíalo", "ahora no"… in English and Spanish.
    static func parse(_ text: String) -> YesNo? {
        let folded = text.lowercased().folding(options: .diacriticInsensitive, locale: nil)
        let cleaned = folded.map { ch -> Character in
            (ch.isLetter || ch == "'") ? ch : " "
        }
        let words = String(cleaned).split(separator: " ").joined(separator: " ")
        let padded = " " + words + " "

        let noPhrases = ["no", "nope", "nah", "cancel", "cancela", "stop", "para", "wait", "espera", "skip", "salta",
                         "don't", "dont", "not now", "not yet", "ahora no", "todavia no", "despues", "hold on", "later", "luego"]
        let yesPhrases = ["yes", "yeah", "yep", "yup", "sure", "send", "send it", "do it", "go ahead", "go for it", "confirm",
                          "ok", "okay", "sounds good", "add it", "copy", "copy it", "please", "correct", "absolutely",
                          "definitely", "perfect", "read them", "si", "claro", "dale", "envia", "envialo", "mandalo",
                          "hazlo", "de acuerdo", "vale", "perfecto", "por favor", "agregalo", "copialo", "leelos", "adelante"]

        if noPhrases.contains(where: { padded.contains(" \($0) ") }) { return .no }
        if yesPhrases.contains(where: { padded.contains(" \($0) ") }) { return .yes }
        return nil
    }
}

// MARK: - Voice messages

/// Records a voice message (coach ↔ client chat): real audio saved as an .m4a file, up to a
/// minute, with a live transcript while recording when speech recognition is allowed.
@Observable
final class VoiceNoteRecorder {
    static let shared = VoiceNoteRecorder()
    static let maxSeconds: Double = 60

    struct Recording {
        let url: URL
        let seconds: Double
        let transcript: String
    }

    private(set) var isRecording = false
    private(set) var elapsed: Double = 0
    /// How loud the voice is right now (0…1), for the recording bar.
    private(set) var level: Float = 0
    private(set) var transcript = ""

    /// Called when the minute runs out (the recording is finished, not discarded).
    @ObservationIgnored var onLimit: ((Recording?) -> Void)?

    @ObservationIgnored private let engine = AVAudioEngine()
    @ObservationIgnored private var file: AVAudioFile?
    @ObservationIgnored private var url: URL?
    @ObservationIgnored private var started = Date()
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private let lock = NSLock()

    /// Asks for the microphone (and speech recognition for the live transcript), then records.
    /// Returns false if the microphone isn't allowed or can't start.
    @MainActor
    func start(language: AppLanguage) async -> Bool {
        if isRecording { return true }
        let micOK = await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
            AVAudioApplication.requestRecordPermission { done.resume(returning: $0) }
        }
        guard micOK else { return false }
        let speechOK = await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
            SFSpeechRecognizer.requestAuthorization { done.resume(returning: $0 == .authorized) }
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true, options: [])
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else { return false }
            let out = FileManager.default.temporaryDirectory.appendingPathComponent("oj-note-\(UUID().uuidString).m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: format.sampleRate,
                AVNumberOfChannelsKey: min(2, Int(format.channelCount)),
                AVEncoderBitRateKey: 64_000,
            ]
            let file = try AVAudioFile(forWriting: out, settings: settings, commonFormat: format.commonFormat, interleaved: format.isInterleaved)
            self.file = file
            self.url = out

            if speechOK, let recognizer = SFSpeechRecognizer(locale: language.locale), recognizer.isAvailable {
                let request = SFSpeechAudioBufferRecognitionRequest()
                request.shouldReportPartialResults = true
                request.contextualStrings = SpeechHints.current
                if #available(iOS 16, *) { request.addsPunctuation = true }
                self.request = request
                task = recognizer.recognitionTask(with: request) { [weak self] result, _ in
                    guard let text = result?.bestTranscription.formattedString, !text.isEmpty else { return }
                    DispatchQueue.main.async { self?.transcript = text }
                }
            }

            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                guard let self else { return }
                self.lock.lock()
                try? self.file?.write(from: buffer)
                let req = self.request
                self.lock.unlock()
                req?.append(buffer)
                self.meter(buffer)
            }
            engine.prepare()
            try engine.start()
        } catch {
            teardown()
            if let url { try? FileManager.default.removeItem(at: url) }
            return false
        }
        transcript = ""
        elapsed = 0
        started = Date()
        isRecording = true
        Haptics.tap()
        timer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.elapsed = Date().timeIntervalSince(self.started)
            if self.elapsed >= Self.maxSeconds {
                let r = self.stop()
                self.onLimit?(r)
            }
        }
        return true
    }

    /// Stops and returns the recording (nil if it was too short to be a message).
    @discardableResult
    func stop() -> Recording? {
        guard isRecording else { return nil }
        let seconds = Date().timeIntervalSince(started)
        let text = transcript
        teardown()
        guard let url else { return nil }
        self.url = nil
        if seconds < 0.8 {
            try? FileManager.default.removeItem(at: url)
            return nil
        }
        return Recording(url: url, seconds: min(seconds, Self.maxSeconds), transcript: text)
    }

    /// Stops and throws the recording away.
    func cancel() {
        guard isRecording else { return }
        teardown()
        if let url { try? FileManager.default.removeItem(at: url) }
        url = nil
    }

    private func teardown() {
        timer?.invalidate()
        timer = nil
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        lock.lock()
        file = nil // closes the file
        request?.endAudio()
        request = nil
        lock.unlock()
        task?.finish()
        task = nil
        isRecording = false
        level = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func meter(_ buffer: AVAudioPCMBuffer) {
        guard let channel = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
        let n = Int(buffer.frameLength)
        var sum: Float = 0
        for i in stride(from: 0, to: n, by: 4) { sum += channel[i] * channel[i] }
        let rms = sqrt(sum / Float(max(1, n / 4)))
        let value = min(1, max(0, (20 * log10(max(rms, 0.000_01)) + 50) / 40))
        DispatchQueue.main.async { [weak self] in self?.level = value }
    }
}

/// Plays voice messages, one at a time (a local file or a link from the server).
@Observable
final class VoiceNotePlayer {
    static let shared = VoiceNotePlayer()

    /// The message playing now.
    private(set) var playingID: String?
    /// The message whose audio is being fetched.
    private(set) var loadingID: String?
    /// 0…1 through the message playing now.
    private(set) var progress: Double = 0

    @ObservationIgnored private var player: AVPlayer?
    @ObservationIgnored private var timeObserver: Any?
    @ObservationIgnored private var endObserver: NSObjectProtocol?

    /// Plays the message, or pauses it if it's the one playing. `url` is called only when needed
    /// (a server link is fetched on the first tap). Call on the main thread.
    func toggle(id: String, url: @escaping () async -> URL?) {
        if playingID == id {
            stop()
            return
        }
        stop()
        loadingID = id
        Task { @MainActor [weak self] in
            let link = await url()
            guard let self, self.loadingID == id else { return }
            self.loadingID = nil
            guard let link else { return }
            self.play(id: id, url: link)
        }
    }

    private func play(id: String, url: URL) {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? session.setActive(true, options: [])
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        player = p
        playingID = id
        progress = 0
        timeObserver = p.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.1, preferredTimescale: 600), queue: .main) { [weak self, weak item] time in
            guard let self, let duration = item?.duration.seconds, duration.isFinite, duration > 0 else { return }
            self.progress = min(1, time.seconds / duration)
        }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            self?.stop()
        }
        p.play()
    }

    func stop() {
        if let timeObserver, let player { player.removeTimeObserver(timeObserver) }
        timeObserver = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil
        player?.pause()
        player = nil
        playingID = nil
        loadingID = nil
        progress = 0
    }
}
