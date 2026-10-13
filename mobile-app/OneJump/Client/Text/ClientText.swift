import Foundation

/// Every piece of interface text in the client app, in English and Spanish.
enum CLT {
    // MARK: Tabs
    static let today = Loc("Today", "Hoy")
    static let food = Loc("Food", "Comida")
    static let log = Loc("Log", "Registrar")
    static let progress = Loc("Progress", "Progreso")
    static let coach = Loc("Coach", "Coach")

    // MARK: Today
    static let date = Loc("Tuesday, Oct 13", "Martes, 13 de octubre")
    static let hello = Loc("Morning, Maya", "Buenos días, Maya")
    static let streakLine = Loc("18-day streak · Week 6 of 12", "Racha de 18 días · Semana 6 de 12")
    static let profile = Loc("Your profile and settings", "Tu perfil y ajustes")
    static let todaysWorkout = Loc("Today’s workout", "Entrenamiento de hoy")
    static let workoutName = Loc("Upper Body A", "Tren superior A")
    static let workoutMeta = Loc("6 exercises · about 45 minutes · dumbbells and cables", "6 ejercicios · unos 45 minutos · mancuernas y poleas")
    static let coachNote = Loc("Go up 5 lb on bench if the last set feels easy. — Alex", "Sube 5 lb en el press si la última serie se siente fácil. — Alex")
    static let startWorkout = Loc("Start workout", "Empezar entrenamiento")
    static let continueWorkout = Loc("Continue workout", "Seguir entrenamiento")
    static let doneLabel = Loc("Done", "Listo")
    static let notStarted = Loc("Not started", "Sin empezar")
    static func setsOf(_ n: Int, _ t: Int) -> Loc { Loc("\(n) of \(t) sets", "\(n) de \(t) series") }
    static func workoutSummary(_ minutes: Int, _ volume: String, _ sets: Int) -> Loc {
        Loc("\(minutes) min · \(volume) lb lifted · \(sets) sets", "\(minutes) min · \(volume) lb levantadas · \(sets) series")
    }
    static let checkInCard = Loc("Week 7 check-in", "Revisión semana 7")
    static let checkInCardSub = Loc("Due Sunday · 2 minutes · most of it is filled in for you", "Vence el domingo · 2 minutos · casi todo ya está lleno")
    static let start = Loc("Start", "Empezar")
    static let habitsToday = Loc("Today’s habits", "Hábitos de hoy")
    static func nOfT(_ n: Int, _ t: Int) -> Loc { Loc("\(n) of \(t)", "\(n) de \(t)") }
    static func habitDone(_ habit: String) -> Loc { Loc("\(habit) · done", "\(habit) · hecho") }
    static func waterHabit(_ liters: String) -> Loc { Loc("\(liters) L of 3 L · tap + below to add a glass", "\(liters) L de 3 L · toca + abajo para sumar un vaso") }
    static let foodToday = Loc("Food today", "Comida de hoy")
    static let kcalLeft = Loc("kcal left", "kcal restantes")
    static let protein = Loc("Protein", "Proteína")
    static let carbs = Loc("Carbs", "Carbohidratos")
    static let fat = Loc("Fat", "Grasa")
    static func foodsLogged(_ n: Int, _ protein: Int) -> Loc { Loc("\(n) foods logged · \(protein) g protein", "\(n) alimentos registrados · \(protein) g de proteína") }
    static let videoWithAlex = Loc("Video check-in with Alex", "Revisión por video con Alex")
    static let reschedule = Loc("Reschedule", "Cambiar hora")

    // MARK: Workout
    static let closeWorkout = Loc("Close workout", "Cerrar entrenamiento")
    static let finishWorkout = Loc("Finish workout", "Terminar entrenamiento")
    static let workoutDone = Loc("Workout done", "Entrenamiento listo")
    static let niceWork = Loc("Nice work, Maya. Alex can see it already.", "Buen trabajo, Maya. Alex ya lo puede ver.")
    static let minutes = Loc("Minutes", "Minutos")
    static let lbLifted = Loc("lb lifted", "lb levantadas")
    static let setsLabel = Loc("Sets", "Series")
    static let newBest = Loc("New personal best", "Nuevo récord personal")
    static let backToToday = Loc("Back to Today", "Volver a Hoy")
    static func restNext(_ n: Int) -> Loc { Loc("Rest. Next: set \(n)", "Descanso. Sigue: serie \(n)") }
    static let skip = Loc("Skip", "Saltar")
    static let playHowTo = Loc("Play how-to video", "Ver cómo se hace")
    static func exerciseOf(_ n: Int, _ t: Int) -> Loc { Loc("Exercise \(n) of \(t)", "Ejercicio \(n) de \(t)") }
    static func exerciseLine(_ target: String, _ rest: String, _ last: String) -> Loc {
        Loc("\(target) · rest \(rest) · last time \(last)", "\(target) · descanso \(rest) · la vez pasada \(last)")
    }
    static let equipmentBusy = Loc("Equipment busy? Swap:", "¿Equipo ocupado? Cambia a:")
    static func setN(_ n: Int) -> Loc { Loc("Set \(n)", "Serie \(n)") }
    static func target(_ t: String) -> Loc { Loc("target \(t)", "meta \(t)") }
    static let lessWeight = Loc("Less weight", "Menos peso")
    static let moreWeight = Loc("More weight", "Más peso")
    static let fewerReps = Loc("Fewer reps", "Menos repeticiones")
    static let moreReps = Loc("More reps", "Más repeticiones")
    static let logSet = Loc("Log set", "Registrar serie")
    static let sayIt = Loc("Say it", "Dilo")
    static let sayItLabel = Loc("Log this set by voice", "Registrar esta serie con la voz")
    static func trySaying(_ example: String) -> Loc { Loc("Try saying “\(example)”", "Prueba decir “\(example)”") }
    static let listeningSet = Loc("Listening… say your reps and weight", "Escuchando… di tus repeticiones y el peso")
    static func nextExercise(_ name: String) -> Loc { Loc("Next: \(name)", "Sigue: \(name)") }
    static func backTo(_ name: String) -> Loc { Loc("Back to \(name)", "Volver a \(name)") }
    static func setLogged(_ n: Int) -> Loc { Loc("Set \(n) logged", "Serie \(n) registrada") }
    static func swappedTo(_ name: String) -> Loc { Loc("Swapped to \(name). Alex can see it.", "Cambiado a \(name). Alex lo puede ver.") }
    static let videoHere = Loc("How-to video plays here", "Aquí se reproduce el video")
    static let bodyweight = Loc("Body", "Cuerpo")
    static let repsUnit = Loc("reps", "reps")
    static let secUnit = Loc("sec", "s")
    static let restOver = Loc("Rest is over. Time for your next set.", "Se acabó el descanso. A tu siguiente serie.")
    static func loggedSay(_ reps: Int, _ weight: String) -> Loc { Loc("Logged. \(reps) reps at \(weight) pounds.", "Registrado. \(reps) repeticiones con \(weight) libras.") }
    static func loggedSaySeconds(_ s: Int) -> Loc { Loc("Logged. \(s) seconds.", "Registrado. \(s) segundos.") }
    static let noCatchSet = Loc("Didn’t catch that. Tap Say it again.", "No te entendí. Toca Dilo otra vez.")
    static let savedSay = Loc("Workout saved. Nice work, Maya.", "Entrenamiento guardado. Buen trabajo, Maya.")
    static func voiceExample(_ reps: Int, _ weight: String) -> Loc { Loc("\(reps) reps at \(weight)", "\(reps) repeticiones con \(weight)") }
    static func secondsExample(_ s: Int) -> Loc { Loc("\(s) seconds", "\(s) segundos") }
    static func exerciseMeta(_ target: String, _ done: Int, _ total: Int) -> Loc { Loc("\(target) · \(done) of \(total) sets", "\(target) · \(done) de \(total) series") }
    static let howDidItGo = Loc("How did it go?", "¿Cómo te fue?")
    static let howHard = Loc("How hard was it?", "¿Qué tan duro fue?")
    static let howSore = Loc("How sore are you?", "¿Cuánto dolor muscular tienes?")
    static let max10 = Loc("10 max", "10 máx")
    static let soreOptions: [Loc] = [Loc("None", "Nada"), Loc("A little", "Poco"), Loc("Sore", "Medio"), Loc("Very", "Mucho")]
    static func setsLeft(_ n: Int) -> Loc { Loc("\(n) sets not logged. You can still save, Alex will see what you did.", "\(n) series sin registrar. Igual puedes guardar; Alex verá lo que hiciste.") }
    static let saveWorkout = Loc("Save workout", "Guardar entrenamiento")

    // MARK: Food
    static let foodEyebrow = Loc("Log it, your coach sees it", "Regístralo y tu coach lo ve")
    static let yesterday = Loc("Yesterday", "Ayer")
    static let todayShort = Loc("Today", "Hoy")
    static let methodPhoto = Loc("Photo", "Foto")
    static let methodBarcode = Loc("Barcode", "Código")
    static let methodSearch = Loc("Search", "Buscar")
    static func addTo(_ meal: String) -> Loc { Loc("Add to \(meal)", "Agregar a \(meal)") }
    static let nothingYet = Loc("Nothing logged yet", "Nada registrado aún")
    static func gramsProtein(_ g: Int) -> Loc { Loc("\(g) g protein", "\(g) g de proteína") }
    static let quickAdd = Loc("Quick add", "Agregar rápido")
    static let yourFavorites = Loc("your favorites", "tus favoritos")
    static let dataSources = Loc("Food data from USDA FoodData Central and Open Food Facts.", "Datos de alimentos de USDA FoodData Central y Open Food Facts.")
    static func addedToSnacks(_ name: String) -> Loc { Loc("\(name) added to snacks", "\(name) agregado a meriendas") }

    // MARK: Log food
    static let logPhotoTitle = Loc("Snap your meal", "Foto de tu comida")
    static let logVoiceTitle = Loc("Say what you ate", "Di lo que comiste")
    static let logBarcodeTitle = Loc("Scan a barcode", "Escanea un código")
    static let logSearchTitle = Loc("Search foods", "Buscar alimentos")
    static let fitPlate = Loc("Fit your whole plate in the frame", "Encuadra todo tu plato")
    static let takePhoto = Loc("Take photo", "Tomar foto")
    static let photoNote = Loc("Your photo is read to find foods and portions. You check everything before it’s saved.", "Leemos tu foto para encontrar alimentos y porciones. Tú revisas todo antes de guardarlo.")
    static let sayAte = Loc("Say what you ate", "Di lo que comiste")
    static let tapAndSay = Loc("Tap and say what you ate", "Toca y di lo que comiste")
    static let sayExample = Loc("Like “two eggs, a slice of toast and a coffee with milk.” Tap the circle if it stops listening.", "Por ejemplo: “dos huevos, una tostada y un café con leche”. Toca el círculo si deja de escuchar.")
    static let holdSteady = Loc("Hold steady. It reads on its own.", "Mantén el teléfono quieto. Lee solo.")
    static let searchFoods = Loc("Search foods", "Buscar alimentos")
    static let noMatch = Loc("No match", "Sin resultados")
    static let tryWord = Loc("Try a simpler word, like “chicken”.", "Prueba una palabra más simple, como “pollo”.")
    static let readingPhoto = Loc("Reading your photo…", "Leyendo tu foto…")
    static let foundIt = Loc("Found it. Looking it up…", "Lo encontré. Buscando los datos…")
    static let findingFoods = Loc("Finding foods…", "Buscando alimentos…")
    static let checkFoods = Loc("Check the foods and portions", "Revisa los alimentos y porciones")
    static let nothingSaved = Loc("Nothing is saved until you tap Add.", "No se guarda nada hasta que toques Agregar.")
    static let smaller = Loc("Smaller portion", "Porción más pequeña")
    static let bigger = Loc("Bigger portion", "Porción más grande")
    static let total = Loc("Total", "Total")
    static let addToTitle = Loc("Add to", "Agregar a")
    static let addAnother = Loc("Add another food", "Agregar otro alimento")
    static func addedTo(_ meal: String) -> Loc { Loc("Added to \(meal)", "Agregado a \(meal)") }
    static func addedSay(_ n: Int, _ meal: String, _ kcal: String, _ protein: Int) -> Loc {
        Loc("Added \(n) \(n == 1 ? "food" : "foods") to \(meal). \(kcal) calories and \(protein) grams of protein.",
            "Agregué \(n) \(n == 1 ? "alimento" : "alimentos") a \(meal). \(kcal) calorías y \(protein) gramos de proteína.")
    }
    static let noCatchFood = Loc("Didn’t catch that. Tap the circle to try again.", "No te entendí. Toca el círculo para intentarlo otra vez.")
    static let listening = Loc("Listening…", "Escuchando…")
    static func foodLine(_ quantity: String, _ kcal: String, _ protein: Int) -> Loc { Loc("\(quantity) · \(kcal) kcal · \(protein) g protein", "\(quantity) · \(kcal) kcal · \(protein) g de proteína") }
    static func reviewTotal(_ kcal: String, _ protein: Int) -> Loc { Loc("\(kcal) kcal · \(protein) g protein", "\(kcal) kcal · \(protein) g de proteína") }
    static let close = Loc("Close", "Cerrar")

    // MARK: Progress
    static let sinceAug = Loc("Since Aug 25", "Desde el 25 de agosto")
    static let weight = Loc("Weight", "Peso")
    static let lostSince = Loc("−6.8 lb since you started", "−6.8 lb desde que empezaste")
    static let goalLine = Loc("Goal 145 lb · dashed line", "Meta 145 lb · línea punteada")
    static let workouts = Loc("Workouts", "Entrenamientos")
    static let dayStreak = Loc("Day streak", "Días de racha")
    static let checkIns = Loc("Check-ins", "Revisiones")
    static let sixOfSix = Loc("6 of 6", "6 de 6")
    static let personalBests = Loc("Personal bests", "Récords personales")
    static let newPill = Loc("New", "Nuevo")
    static let measurements = Loc("Measurements", "Medidas")
    static let update = Loc("Update", "Actualizar")
    static let progressPhotos = Loc("Progress photos", "Fotos de progreso")
    static let onlyYouAndAlex = Loc("Only you and Alex", "Solo tú y Alex")
    static let add = Loc("Add", "Agregar")
    static let allRange = Loc("All", "Todo")
    static let photoAdded = Loc("Photo added. Only you and Alex can see it.", "Foto agregada. Solo tú y Alex pueden verla.")
    static let measurementsSaved = Loc("Measurements saved", "Medidas guardadas")
    static let updateMeasurements = Loc("Update measurements", "Actualizar medidas")
    static let saveMeasurements = Loc("Save measurements", "Guardar medidas")

    // MARK: Coach chat
    static let coachSub = Loc("Your coach · usually replies within a few hours", "Tu coach · suele responder en pocas horas")
    static let realPerson = Loc("Messages go to Alex, a real person. Voice notes come with a written transcript.", "Los mensajes van a Alex, una persona real. Las notas de voz llevan transcripción escrita.")
    static let translationNote = Loc("Alex writes in English. You read in Spanish, and your messages reach him in English.", "Alex escribe en inglés. Tú lees en español y tus mensajes le llegan en inglés.")
    static let translatedFrom = Loc("Translated from English · show original", "Traducido del inglés · ver original")
    static let hideOriginal = Loc("Hide original", "Ocultar original")
    static let messageAlex = Loc("Message Alex", "Mensaje para Alex")
    static let recordingTapStop = Loc("Recording · tap stop to send", "Grabando · toca detener para enviar")
    static let stopRecording = Loc("Stop recording", "Detener grabación")
    static let recordVoiceNote = Loc("Record a voice note", "Grabar nota de voz")
    static let send = Loc("Send", "Enviar")
    static let delivered = Loc("Now · delivered", "Ahora · entregado")
    static let deliveredInEnglish = Loc("Now · delivered in English", "Ahora · entregado en inglés")
    static let voiceNoteSent = Loc("Voice note sent with a transcript", "Nota de voz enviada con transcripción")
    static let voiceNoteDiscarded = Loc("Voice note discarded", "Nota de voz descartada")
    static let nothingRecorded = Loc("Nothing was recorded. Try again or type it.", "No se grabó nada. Inténtalo otra vez o escríbelo.")

    // MARK: Check-in
    static let prefilled = Loc("Already filled in from your logs", "Ya lleno con tus registros")
    static let foodLogged = Loc("Food logged", "Comida registrada")
    static let sixOfSeven = Loc("6 of 7 days", "6 de 7 días")
    static let avgProtein = Loc("Average protein", "Proteína promedio")
    static func ofThree(_ n: Int) -> Loc { Loc("\(n) of 3", "\(n) de 3") }
    static let nutritionQuestion = Loc("Stuck to the nutrition plan?", "¿Seguiste el plan de nutrición?")
    static let optionalPrivate = Loc("optional · private", "opcional · privadas")
    static let front = Loc("Front", "Frente")
    static let side = Loc("Side", "Lado")
    static let backPose = Loc("Back", "Espalda")
    static let added = Loc("Added", "Agregada")
    static let anythingElse = Loc("Anything else for Alex?", "¿Algo más para Alex?")
    static let talk = Loc("Talk", "Hablar")
    static let notePlaceholder = Loc("How did the week feel? Any pain, wins or questions?", "¿Cómo te sentiste esta semana? ¿Algún dolor, logro o pregunta?")
    static let noteLabel = Loc("Note for your coach", "Nota para tu coach")
    static let sendToAlex = Loc("Send to Alex", "Enviar a Alex")
    static let checkInSent = Loc("Check-in sent", "Revisión enviada")
    static let checkInSentSub = Loc("Alex usually replies within a day. You’ll get a notification.", "Alex suele responder en un día. Te llegará una notificación.")
    static let checkInSentSay = Loc("Check-in sent. Alex usually replies within a day.", "Revisión enviada. Alex suele responder en un día.")

    // MARK: Booking
    static let bookWithAlex = Loc("Book with Alex", "Agenda con Alex")
    static let nextSession = Loc("Your next session", "Tu próxima sesión")
    static func bookedLine(_ when: String) -> Loc { Loc("\(when) · video · 30 min", "\(when) · video · 30 min") }
    static func moveTo(_ slot: String) -> Loc { Loc("Move to \(slot)", "Mover a \(slot)") }
    static let pickNewTime = Loc("Pick a new time", "Elige una nueva hora")
    static let pickFirst = Loc("Pick a time first", "Primero elige una hora")
    static let moved = Loc("Moved. Alex has been notified.", "Listo. Alex ya recibió el aviso.")
    static let freeToMove = Loc("Alex gets notified right away. Free to move up to 12 hours before.", "Alex recibe el aviso al instante. Puedes moverla gratis hasta 12 horas antes.")

    // MARK: Me
    static let you = Loc("You", "Tú")
    static let goalLine2 = Loc("Goal: lose fat · 152.4 → 145 lb · coached by Alex Rivera", "Meta: perder grasa · 152.4 → 145 lb · con el coach Alex Rivera")
    static let languageFull = Loc("Whole app, voice and messages", "Toda la app, la voz y los mensajes")
    static let languageMessages = Loc("Messages translated · full app soon", "Mensajes traducidos · app completa pronto")
    static let languageNote = Loc("Alex keeps writing in his language. OneJump translates his messages for you, and yours for him.", "Alex sigue escribiendo en su idioma. OneJump traduce sus mensajes para ti y los tuyos para él.")
    static let planBilling = Loc("Plan & billing", "Plan y facturación")
    static let planLine = Loc("Hybrid coaching · $249/month", "Coaching híbrido · $249/mes")
    static let paidLine = Loc("Paid Oct 1 · next charge Nov 1 · Visa ending 4242", "Pagado el 1 de oct · próximo cobro el 1 de nov · Visa terminada en 4242")
    static let updateCard = Loc("Update card", "Actualizar tarjeta")
    static let invoices = Loc("Invoices", "Facturas")
    static let bookOrMove = Loc("Book or move a session", "Agendar o mover una sesión")
    static let reminders = Loc("Reminders", "Recordatorios")
    static let units = Loc("Units", "Unidades")
    static let poundsInches = Loc("Pounds · inches", "Libras · pulgadas")
    static let kilogramsCm = Loc("Kilograms · cm", "Kilos · cm")
    static let privacy = Loc("Privacy", "Privacidad")
    static let photosPrivate = Loc("Your photos are private", "Tus fotos son privadas")
    static let photosPrivateSub = Loc("Only you and Alex can see them. Card details stay with Stripe.", "Solo tú y Alex pueden verlas. Los datos de tu tarjeta se quedan en Stripe.")
    static let downloadData = Loc("Download my data", "Descargar mis datos")
    static let deleteAccount = Loc("Delete account", "Eliminar cuenta")
    static let logOut = Loc("Log out", "Cerrar sesión")
    static let stripePage = Loc("Opens secure Stripe page", "Abre la página segura de Stripe")
    static let invoiceToast = Loc("Oct 1 · $249 · paid", "1 oct · $249 · pagado")
    static let exportToast = Loc("We’ll email you a copy of your data", "Te enviaremos una copia de tus datos por correo")
    static let deleteToast = Loc("You’d confirm this twice first", "Tendrías que confirmarlo dos veces")
    static let logoutToast = Loc("Logged out (preview)", "Sesión cerrada (vista previa)")

    // MARK: Quick log
    static let whatToLog = Loc("What do you want to log?", "¿Qué quieres registrar?")
    static let snapMeal = Loc("Snap a meal", "Foto de comida")
    static let photoToFoods = Loc("Photo → foods", "Foto → alimentos")
    static let talkToFoods = Loc("Talk → foods", "Voz → alimentos")
    static let logWeight = Loc("Log weight", "Registrar peso")
    static func lastWeight(_ w: String) -> Loc { Loc("Last: \(w)", "Último: \(w)") }
    static let addWater = Loc("Add water", "Agregar agua")
    static func waterOf(_ liters: String) -> Loc { Loc("\(liters) L of 3 L today", "\(liters) L de 3 L hoy") }
    static let voiceNoteToAlex = Loc("Voice note to Alex", "Nota de voz para Alex")
    static let withTranscript = Loc("With a transcript", "Con transcripción")
    static let weeklyCheckIn = Loc("Weekly check-in", "Revisión semanal")
    static let twoMinutes = Loc("2 minutes", "2 minutos")
    static let quickLog = Loc("Quick log", "Registro rápido")
    static let weighTip = Loc("Weigh in the morning, before breakfast, for the most honest trend.", "Pésate en la mañana, antes de desayunar, para ver la tendencia más real.")
    static func weightSaved(_ w: String) -> Loc { Loc("Weight saved · \(w) lb", "Peso guardado · \(w) lb") }
    static func waterToast(_ liters: String) -> Loc { Loc("+250 ml · \(liters) L today", "+250 ml · \(liters) L hoy") }
    static let less = Loc("Less", "Menos")
    static let more = Loc("More", "Más")
}
