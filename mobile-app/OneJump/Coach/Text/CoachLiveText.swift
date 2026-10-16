import Foundation

/// Text for signing in and for the coach's real (live) business, in English and Spanish.
/// Written like a person talks: short, warm, plain.
enum CL {
    // MARK: Login
    static let loginTitle = Loc("Welcome back", "Qué bueno verte")
    static let loginSub = Loc("Log in with your OneJump coach account.", "Inicia sesión con tu cuenta de coach de OneJump.")
    static let email = Loc("Email", "Correo")
    static let password = Loc("Password", "Contraseña")
    static let logIn = Loc("Log in", "Iniciar sesión")
    static let loggingIn = Loc("Logging in…", "Iniciando sesión…")
    static let codeTitle = Loc("Two-step code", "Código de dos pasos")
    static let codeSub = Loc("Enter the 6-digit code from your authenticator app.", "Escribe el código de 6 dígitos de tu app de autenticación.")
    static let code = Loc("6-digit code", "Código de 6 dígitos")
    static let verify = Loc("Verify", "Verificar")
    static let startOver = Loc("Use a different account", "Usar otra cuenta")
    static let fillBoth = Loc("Enter your email and password.", "Escribe tu correo y contraseña.")
    static let clientsOnWeb = Loc("This app is for coaches for now. Clients: use the link your coach sent you.", "Por ahora esta app es para coaches. Clientes: usen el enlace que les envió su coach.")
    static let noAccount = Loc("New to OneJump? Create your account at onejumpfit.com", "¿Nuevo en OneJump? Crea tu cuenta en onejumpfit.com")
    static let tryDemo = Loc("Try the demo", "Probar la demo")
    static let tryDemoSub = Loc("Look around with a sample business. Nothing is sent.", "Explora con un negocio de ejemplo. No se envía nada.")
    static let exitDemo = Loc("Exit the demo", "Salir de la demo")
    static let exitDemoSub = Loc("Back to the login screen", "Volver a iniciar sesión")
    static let logOut = Loc("Log out", "Cerrar sesión")

    // MARK: Loading
    static let loadingBusiness = Loc("Getting your business ready…", "Preparando tu negocio…")
    static let couldntLoad = Loc("Couldn’t load your business", "No se pudo cargar tu negocio")
    static let tryAgain = Loc("Try again", "Intentar de nuevo")
    static let somethingWrong = Loc("Something went wrong. Try again in a minute.", "Algo salió mal. Inténtalo en un minuto.")
    static let loadingPage = Loc("Loading…", "Cargando…")

    // MARK: Today
    static func greeting(_ first: String, hour: Int) -> Loc {
        let name = first.isEmpty ? "" : ", \(first)"
        if hour < 12 { return Loc("Good morning\(name)", "Buenos días\(name)") }
        if hour < 18 { return Loc("Good afternoon\(name)", "Buenas tardes\(name)") }
        return Loc("Good evening\(name)", "Buenas noches\(name)")
    }
    static func todayDate(_ date: Date = Date()) -> Loc {
        let en = DateFormatter(), es = DateFormatter()
        en.locale = Locale(identifier: "en_US"); en.setLocalizedDateFormatFromTemplate("EEEEMMMd")
        es.locale = Locale(identifier: "es_MX"); es.setLocalizedDateFormatFromTemplate("EEEEdMMMM")
        let e = es.string(from: date)
        return Loc(en.string(from: date), e.prefix(1).uppercased() + e.dropFirst())
    }
    static let savedSub = Loc("this week · drafts you approved and automations", "esta semana · borradores aprobados y automatizaciones")
    static func sessionsNote(_ n: Int) -> Loc { n == 0 ? Loc("None today", "Ninguno hoy") : Loc("\(n) scheduled", "\(n) programados") }
    static let noSessions = Loc("No client workouts scheduled today.", "No hay entrenamientos de clientes hoy.")
    static func briefIdle(_ things: Int) -> Loc { Loc("About 40 seconds, read aloud · \(things) things need you", "Unos 40 segundos, en voz alta · \(things) cosas te esperan") }
    static let briefLoading = Loc("Assist is putting it together…", "Assist lo está preparando…")
    static let noRadar = Loc("Nobody is at risk right now.", "Nadie está en riesgo ahora.")
    static let activeClientsChart = Loc("Active clients", "Clientes activos")
    static func activeClientsNote(_ change: Int) -> Loc {
        change == 0 ? Loc("Same as 6 months ago", "Igual que hace 6 meses")
            : Loc("\(change > 0 ? "+" : "")\(change) in 6 months", "\(change > 0 ? "+" : "")\(change) en 6 meses")
    }
    static let noRevenueYet = Loc("Payments you collect show up here.", "Los pagos que cobres aparecen aquí.")
    static let noAdherenceYet = Loc("Shows once clients have workouts scheduled.", "Aparece cuando tus clientes tengan entrenamientos programados.")
    static let noPackagesYet = Loc("Active memberships show up here by package.", "Las membresías activas aparecen aquí por paquete.")
    static func adherenceWeek(_ label: String, _ pct: Int?) -> Loc {
        Loc("\(label): \(pct.map { "\($0)%" } ?? "—")", "\(label): \(pct.map { "\($0)%" } ?? "—")")
    }

    // MARK: Actions and toasts
    static func remindersSent(_ n: Int) -> Loc { Loc("Reminder sent to \(n) \(n == 1 ? "client" : "clients")", "Recordatorio enviado a \(n) \(n == 1 ? "cliente" : "clientes")") }
    static func leadReplyCopied(_ first: String) -> Loc { Loc("Reply copied. Paste it in your chat with \(first).", "Respuesta copiada. Pégala en tu chat con \(first).") }
    static let callBooked = Loc("Marked as call booked", "Marcado como llamada agendada")
    static func reminderSentTo(_ first: String) -> Loc { Loc("Reminder sent to \(first)", "Recordatorio enviado a \(first)") }
    static func remindAll(_ n: Int) -> Loc { n == 1 ? Loc("Send the check-in reminder", "Enviar el recordatorio de check-in") : Loc("Send all \(n) the check-in reminder", "Enviar el recordatorio a los \(n)") }
    static let undone = Loc("Undone. It’s back in your queue.", "Deshecho. Volvió a tu lista.")
    static let assistStillWriting = Loc("Assist is still writing the reply. Try again in a moment.", "Assist aún está escribiendo la respuesta. Inténtalo en un momento.")
    static func inviteLinkCopied(_ first: String) -> Loc { Loc("Added \(first). Invite link copied: text it to them.", "Agregaste a \(first). Enlace de invitación copiado: envíaselo por mensaje.") }
    static func clientAdded(_ first: String) -> Loc { Loc("Added \(first)", "Agregaste a \(first)") }
    static let failedPayments = Loc("Failed payments", "Pagos fallidos")
    static let nothingOwed = Loc("Nobody owes you right now.", "Nadie te debe ahora.")
    static let noPayments = Loc("No payments yet.", "Aún no hay pagos.")
    static let noLeads = Loc("No open leads. New ones from your booking page show up here.", "No hay prospectos abiertos. Los nuevos de tu página de reservas aparecen aquí.")
    static let noThreads = Loc("No messages yet.", "Aún no hay mensajes.")
    static let noCheckIns = Loc("No check-ins waiting.", "No hay check-ins pendientes.")
    static let nobodyMissing = Loc("Everyone has checked in this week.", "Todos hicieron su check-in esta semana.")
    static let noNotes = Loc("No notes yet.", "Aún no hay notas.")
    static let noProgramYet = Loc("No program yet", "Sin programa aún")
    static let noWorkoutsThisWeek = Loc("No workouts scheduled this week.", "No hay entrenamientos esta semana.")
    static let noBests = Loc("No personal bests yet.", "Aún no hay récords personales.")
    static let noMeasures = Loc("No measurements yet.", "Aún no hay medidas.")
    static let noCheckInHistory = Loc("No check-ins yet.", "Aún no hay check-ins.")
    static let editOnWeb = Loc("Build and edit programs on onejumpfit.com. Changes show up here.", "Crea y edita programas en onejumpfit.com. Los cambios aparecen aquí.")
    static let serverVoice = Loc("Your OneJump voice (set on the server) · used for the briefing and every answer", "Tu voz de OneJump (configurada en el servidor) · para el resumen y todas las respuestas")
    static func voicePreview(_ first: String) -> Loc {
        Loc("Hi \(first)! This is Assist. This is the voice you’ll hear for your morning briefing and all of my answers.",
            "¡Hola, \(first)! Soy Assist. Esta es la voz que vas a escuchar en tu resumen de la mañana y en todas mis respuestas.")
    }
    static let off = Loc("Off", "Apagado")
    static func planLine(_ label: Loc, _ trialDays: Int?) -> Loc {
        guard let days = trialDays else { return label }
        return Loc("\(label.en) · \(days) \(days == 1 ? "day" : "days") left", "\(label.es) · quedan \(days) \(days == 1 ? "día" : "días")")
    }
    static let planHint = Loc("Open a client’s Food tab and let Assist build one.", "Abre la pestaña Comida de un cliente y deja que Assist cree uno.")
    static let mealPlansHint = Loc("Meal plans Assist builds for clients show up here.", "Los planes de comidas que Assist crea para tus clientes aparecen aquí.")
    static let noRuns = Loc("Nothing has run yet.", "Aún no se ha ejecutado nada.")
    static let buildProgramAsk = Loc("Help me build a new program", "Ayúdame a crear un programa nuevo")
    static func assignProgramAsk(_ name: String) -> Loc { Loc("Who should I start on \(name)?", "¿A quién debería empezar en \(name)?") }
    static let assignWithAssist = Loc("Start someone on it with Assist", "Empezar a alguien con Assist")
    static let plansOnWeb = Loc("Change your plan on onejumpfit.com (Plan & billing).", "Cambia tu plan en onejumpfit.com (Plan y facturación).")
    static func workingOnIt(_ name: String) -> Loc { Loc("Assist is reading \(name)’s check-in…", "Assist está leyendo el check-in de \(name)…") }

    // MARK: Assist (live)
    static func helloName(_ first: String) -> Loc {
        first.isEmpty ? Loc("Hi! How can I help today?", "¡Hola! ¿En qué te ayudo hoy?")
            : Loc("Hi \(first)! How can I help today?", "¡Hola, \(first)! ¿En qué te ayudo hoy?")
    }
    static let working = Loc("Working on it…", "En eso…")
    static let wontDoIt = Loc("Okay, I won’t do that.", "Está bien, no lo haré.")
    static let startingBriefing = Loc("Starting your morning briefing.", "Empezando tu resumen de la mañana.")
    static let hereItIs = Loc("Okay, here’s what I’ve got.", "Listo, esto es lo que preparé.")
    static func doneSay(_ message: String) -> Loc { Loc("Done. \(message)", "Listo. \(message)") }
    static func messageTo(_ name: String) -> Loc { Loc("Message to \(name)", "Mensaje para \(name)") }
    static func replyToCheckIn(_ first: String) -> Loc { Loc("Reply to \(first)’s check-in", "Respuesta al check-in de \(first)") }
    static func noteFor(_ first: String) -> Loc { Loc("Private note on \(first)’s profile", "Nota privada en el perfil de \(first)") }
    static func newLead(_ name: String) -> Loc { Loc("New lead: \(name)", "Nuevo prospecto: \(name)") }
    static func reminderTo(_ n: Int) -> Loc { Loc("Check-in reminder to \(n) \(n == 1 ? "client" : "clients")", "Recordatorio de check-in a \(n) \(n == 1 ? "cliente" : "clientes")") }
    static func sendAll(_ n: Int) -> Loc { Loc("Send all \(n)", "Enviar a los \(n)") }
    static func startOn(_ first: String, _ program: String) -> Loc { Loc("Start \(first) on \(program)", "Empezar a \(first) en \(program)") }
    static func programMeta(_ weeks: Int, _ days: Int) -> Loc { Loc("\(weeks) weeks · \(days) days a week · starts next Monday", "\(weeks) semanas · \(days) días por semana · empieza el próximo lunes") }
    static func planFor(_ first: String) -> Loc { Loc("Nutrition plan for \(first)", "Plan de nutrición para \(first)") }
    static func macroLine(_ cal: Int, _ protein: Int, _ carbs: Int, _ fat: Int) -> Loc {
        Loc("\(Fmt.grouped(cal)) kcal · \(protein) g protein · \(carbs) g carbs · \(fat) g fat",
            "\(Fmt.grouped(cal)) kcal · \(protein) g proteína · \(carbs) g carbohidratos · \(fat) g grasa")
    }
    static func mealPlanDays(_ name: String, _ days: Int) -> Loc { Loc("\(name) · \(days)-day meal plan", "\(name) · plan de comidas de \(days) días") }
    static let seeDietitian = Loc("A registered dietitian or doctor should guide this one.", "Un nutricionista certificado o un médico debería guiar este caso.")
    static let confirmSend = Loc("Confirm and send", "Confirmar y enviar")
    static let saveNote = Loc("Save note", "Guardar nota")
    static let addLead = Loc("Add lead", "Agregar prospecto")
    static let startProgram = Loc("Start program", "Empezar programa")
    static let usePlan = Loc("Use this plan", "Usar este plan")
    static let confirm = Loc("Confirm", "Confirmar")
    static let sayYesOrTap = Loc("Say “yes” to do it, or tap.", "Di “sí” para hacerlo, o toca.")
    static let tapToConfirm = Loc("It has health details, so it’s on screen only. Read it, then tap.", "Tiene detalles de salud, así que solo está en pantalla. Léelo y toca.")

    // MARK: Nutrition plan builder
    static let buildTitle = Loc("Build a plan with Assist", "Crea un plan con Assist")
    static func buildSub(_ first: String) -> Loc {
        Loc("Type or tap the mic and say what \(first) needs. Assist uses \(first)’s age, height, weight, goal, notes and check-ins. \(first) sees nothing until you tap Use this plan.",
            "Escribe o toca el micrófono y di lo que \(first) necesita. Assist usa la edad, estatura, peso, objetivo, notas y check-ins de \(first). \(first) no ve nada hasta que toques Usar este plan.")
    }
    static let buildPlaceholder = Loc("e.g. Fat loss, vegetarian, quick meals", "p. ej. Pérdida de grasa, vegetariano, comidas rápidas")
    static let buildButton = Loc("Build plan", "Crear plan")
    static let building = Loc("Assist is building the plan…", "Assist está creando el plan…")
    static let draftOnlyYou = Loc("Draft · only you see this", "Borrador · solo tú lo ves")
    static let dailyHabits = Loc("Daily habits", "Hábitos diarios")
    static let includeMealPlan = Loc("Include the meal plan", "Incluir el plan de comidas")
    static let noteForClient = Loc("Note for the client (shown in their app)", "Nota para el cliente (se ve en su app)")
    static let saving = Loc("Saving…", "Guardando…")
    static let discard = Loc("Discard", "Descartar")
    static let tryAgainPlan = Loc("Try again", "Intentar de nuevo")
    static let reviewedTarget = Loc("I’ve reviewed this target", "Revisé este objetivo")
    static func planSaved(_ first: String) -> Loc { Loc("\(first)’s nutrition plan is saved.", "El plan de nutrición de \(first) está guardado.") }
    static let currentPlan = Loc("Current plan", "Plan actual")
    static let noPlanYet = Loc("No nutrition plan yet.", "Aún sin plan de nutrición.")
    static let caloriesShort = Loc("Calories", "Calorías")
    static let proteinShort = Loc("Protein", "Proteína")
    static let carbsShort = Loc("Carbs", "Carbos")
    static let fatShort = Loc("Fat", "Grasa")
    static let breakfast = Loc("Breakfast", "Desayuno")
    static let lunch = Loc("Lunch", "Almuerzo")
    static let dinner = Loc("Dinner", "Cena")
    static let snack = Loc("Snack", "Merienda")
    static let talk = Loc("Talk instead of typing", "Habla en vez de escribir")
    static func approach(_ key: String) -> Loc {
        switch key {
        case "habits": return Loc("Habits", "Hábitos")
        case "meal_plan": return Loc("Meal plan", "Plan de comidas")
        default: return Loc("Targets", "Objetivos")
        }
    }
}
