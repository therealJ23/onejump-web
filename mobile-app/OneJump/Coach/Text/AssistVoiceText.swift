import Foundation

/// Text for Assist's voice mode, the screen-edge glow and the morning briefing, in English and Spanish.
enum AVT {
    static let listeningSay = Loc("I’m listening.", "Te escucho.")
    static let typeAway = Loc("Got it. Type whenever you’re ready.", "Listo. Escribe cuando quieras.")
    static let micUnavailable = Loc("Assist needs the microphone and speech recognition. Turn them on in Settings → OneJump.", "Assist necesita el micrófono y el reconocimiento de voz. Actívalos en Ajustes → OneJump.")
    static let listening = Loc("Listening…", "Escuchando…")
    static let thinking = Loc("Thinking…", "Pensando…")
    static let speaking = Loc("Speaking · talk to interrupt", "Hablando · habla para interrumpir")
    static let voiceHint = Loc("Just talk. Ask anything about your business, or tell Assist what to do.", "Solo habla. Pregunta lo que quieras de tu negocio o dile a Assist qué hacer.")
    static let keepGoing = Loc("Assist keeps listening on every screen.", "Assist sigue escuchando en todas las pantallas.")
    static let typeInstead = Loc("Type instead", "Escribir")
    static let endVoice = Loc("End voice", "Terminar voz")
    static let voiceMode = Loc("Voice mode", "Modo de voz")
    static let assistListening = Loc("Assist is listening", "Assist te escucha")
    static let assistThinking = Loc("Assist is thinking", "Assist está pensando")
    static let assistSpeaking = Loc("Assist is speaking", "Assist está hablando")
    static let backToAssist = Loc("Back to Assist", "Volver a Assist")
    static let textMode = Loc("Text mode · answers aren’t read aloud", "Modo texto · las respuestas no se leen en voz alta")
    static let startVoice = Loc("Talk to Assist (voice mode)", "Hablar con Assist (modo de voz)")
    static let stopTalking = Loc("Stop talking", "Dejar de hablar")
}
