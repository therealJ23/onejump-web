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

    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()
    @ObservationIgnored private let speechDelegate = SpeechDelegate()
    @ObservationIgnored private var speakToken = 0
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
        speechDelegate.onFinish = { [weak self] in
            DispatchQueue.main.async { self?.utteranceFinished() }
        }
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
        speakToken += 1
        speakCompletion = completion
        configureAudioSession()
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = Self.bestVoice(for: language)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 1.02
        utterance.pitchMultiplier = 1
        utterance.postUtteranceDelay = 0.05
        isSpeaking = true
        synthesizer.speak(utterance)
    }

    func stopSpeaking() {
        speakToken += 1
        speakCompletion = nil
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }
        isSpeaking = false
    }

    private func utteranceFinished() {
        guard !synthesizer.isSpeaking else { return }
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

    // MARK: - Listening

    /// Listens for one sentence. `fallback` is used when the device can't listen.
    /// `onFinish` gets the final text (empty if nothing was heard).
    func listen(fallback: String, onFinish: @escaping (String) -> Void) {
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

/// Receives "finished speaking" callbacks from AVSpeechSynthesizer.
private final class SpeechDelegate: NSObject, AVSpeechSynthesizerDelegate {
    var onFinish: (() -> Void)?

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        onFinish?()
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
