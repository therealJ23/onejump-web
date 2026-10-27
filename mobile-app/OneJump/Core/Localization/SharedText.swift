import Foundation

/// Text used by both the coach app and the client app.
enum SharedText {
    static let language = Loc("Language", "Idioma")
    static let appearance = Loc("Appearance", "Apariencia")
    static let light = Loc("Light", "Claro")
    static let dark = Loc("Dark", "Oscuro")
    static let system = Loc("System", "Sistema")
    static let back = Loc("Back", "Atrás")
    static let close = Loc("Close", "Cerrar")
    static let done = Loc("Done", "Listo")
    static let cancel = Loc("Cancel", "Cancelar")
    static let send = Loc("Send", "Enviar")
    static let save = Loc("Save", "Guardar")
    static let switchTheme = Loc("Switch between light and dark mode", "Cambiar entre modo claro y oscuro")
    static let langSoon = Loc(
        "This preview has English and Spanish. The real app adds any language.",
        "Esta vista previa tiene inglés y español. La app real agrega cualquier idioma."
    )
    static let appLanguageToast = Loc("App language: English", "Idioma de la app: español")

    // Voice messages
    static let pauseVoiceMessage = Loc("Pause voice message", "Pausar mensaje de voz")
    static func playVoiceMessage(_ length: String) -> Loc { Loc("Play voice message, \(length)", "Reproducir mensaje de voz, \(length)") }
    static let recordingVoiceMessage = Loc("Recording a voice message", "Grabando un mensaje de voz")
    static let recordingHint = Loc("Talk now…", "Habla ahora…")
    static let recordVoiceMessage = Loc("Record a voice message", "Grabar un mensaje de voz")
    static let cancelVoiceMessage = Loc("Discard voice message", "Descartar mensaje de voz")
    static let sendVoiceMessage = Loc("Send voice message", "Enviar mensaje de voz")
    static let voiceMessageDiscarded = Loc("Voice message discarded.", "Mensaje de voz descartado.")
    static let voiceMessageSent = Loc("Voice message sent.", "Mensaje de voz enviado.")
    static let voiceMessageTooShort = Loc("Hold on a bit longer, that was too short to send.", "Habla un poco más, fue demasiado corto para enviarlo.")
    static let voiceMessageLimit = Loc("That’s the 1-minute limit, so it was sent.", "Llegaste al límite de 1 minuto, así que se envió.")
    static let micNeeded = Loc("Allow the microphone in Settings to send voice messages.", "Permite el micrófono en Ajustes para enviar mensajes de voz.")
    static let transcribing = Loc("Writing out what you said…", "Escribiendo lo que dijiste…")
    static let voiceMessage = Loc("Voice message", "Mensaje de voz")

    // Demo role switcher
    static let previewTitle = Loc("Pick an app to preview", "Elige una app para ver")
    static let previewSub = Loc(
        "In the real app your login decides this. Coaches get the coach app, clients get the client app.",
        "En la app real esto lo decide tu inicio de sesión. Los coaches ven la app de coach y los clientes la de cliente."
    )
    static let coachApp = Loc("Coach app", "App de coach")
    static let coachAppSub = Loc("Run your business with Assist", "Maneja tu negocio con Assist")
    static let clientApp = Loc("Client app", "App de cliente")
    static let clientAppSub = Loc("Train, log food and talk to your coach", "Entrena, registra comida y habla con tu coach")
    static let switchApp = Loc("Switch app (preview)", "Cambiar de app (vista previa)")
    static let seeClientApp = Loc("See the client app", "Ver la app del cliente")
    static let seeClientAppSub = Loc("What your clients see. Photo logging uses your real Assist.", "Lo que ven tus clientes. El registro con foto usa tu Assist real.")
    static let backToCoach = Loc("Back to the coach app", "Volver a la app del coach")
    static let backToCoachSub = Loc("You’re previewing the client app", "Estás viendo la app del cliente")
    static let switchAppSub = Loc("Go back to the app picker", "Volver a elegir app")
}
