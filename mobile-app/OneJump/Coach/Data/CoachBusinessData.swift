import Foundation

// MARK: - Leads

extension CoachData {
    static let leads: [Lead] = [
        Lead(id: "jenna", name: "Jenna Morales", initials: "JM", avatar: 0xEBD9A8,
             source: Loc("Instagram DM", "Mensaje de Instagram"), when: Loc("2 days ago", "hace 2 días"),
             interest: Loc("Wants to lose 15 lb before a wedding in March. Asked about price.", "Quiere bajar 15 lb antes de una boda en marzo. Preguntó el precio."),
             draft: Loc("Hi Jenna! Online coaching is $149/mo: a custom program, weekly check-ins and nutrition targets. Want a free 15-minute call this week? onejumpfit.com/alex",
                        "¡Hola, Jenna! El coaching en línea cuesta $149 al mes: programa a tu medida, revisiones semanales y metas de nutrición. ¿Quieres una llamada gratis de 15 minutos esta semana? onejumpfit.com/alex")),
        Lead(id: "lucas", name: "Lucas Silva", initials: "LS", avatar: 0xC9DDE6,
             source: Loc("Instagram · Portuguese", "Instagram · portugués"), when: Loc("Today", "Hoy"),
             interest: Loc("Writes from Lisbon, in Portuguese. Asked about the price of online coaching.", "Escribe desde Lisboa, en portugués. Preguntó el precio del coaching en línea."),
             draft: Loc("Hi Lucas! Online coaching is $149/month, from anywhere. Want a free 15-minute call? (Assist sends it in Portuguese.)",
                        "¡Hola, Lucas! El coaching en línea cuesta $149 al mes, desde cualquier lugar. ¿Quieres una llamada gratis de 15 minutos? (Assist lo envía en portugués.)")),
        Lead(id: "kevin", name: "Kevin Tran", initials: "KT", avatar: 0xC8D7EA,
             source: Loc("Booking page", "Página de reservas"), when: Loc("Today", "Hoy"),
             interest: Loc("Booked an intro call for Thu 5:00 PM. Wants to train for his first half marathon.", "Agendó una llamada para el jueves a las 5:00 p. m. Quiere prepararse para su primer medio maratón."),
             draft: Loc("Hi Kevin! Looking forward to Thursday at 5.", "¡Hola, Kevin! Nos vemos el jueves a las 5.")),
        Lead(id: "alicia", name: "Alicia Brown", initials: "AB", avatar: 0xDCCFE3,
             source: Loc("Referral from Maya", "Recomendada por Maya"), when: Loc("Yesterday", "Ayer"),
             interest: Loc("Friend of Maya. Interested in hybrid coaching, prefers mornings.", "Amiga de Maya. Le interesa el coaching híbrido y prefiere las mañanas."),
             draft: Loc("Hi Alicia! Maya told me great things. Hybrid coaching is $249/mo with in-person sessions plus the app. Mornings work great for me. Want to book a free intro call?",
                        "¡Hola, Alicia! Maya me habló muy bien de ti. El coaching híbrido cuesta $249 al mes con sesiones presenciales y la app. Las mañanas me funcionan perfecto. ¿Agendamos una llamada gratis?")),
        Lead(id: "ryan", name: "Ryan Scott", initials: "RS", avatar: 0xD2E2C8,
             source: Loc("Website form", "Formulario web"), when: Loc("3 hours ago", "hace 3 horas"),
             interest: Loc("Asked whether you work with beginners over 40.", "Preguntó si trabajas con principiantes de más de 40 años."),
             draft: Loc("Hi Ryan! Absolutely. A lot of my clients started after 40. We build up gradually and fit it around your schedule. Want to hop on a free 15-minute call?",
                        "¡Hola, Ryan! Claro que sí. Muchos de mis clientes empezaron después de los 40. Avanzamos poco a poco y nos adaptamos a tu horario. ¿Hacemos una llamada gratis de 15 minutos?"))
    ]

    static let initialLeadStages: [String: LeadStage] = [
        "jenna": .new, "lucas": .new, "kevin": .booked, "alicia": .new, "ryan": .new
    ]
}

// MARK: - Programs, workouts and the exercise library

extension CoachData {
    static let programs: [ProgramSummary] = [
        ProgramSummary(id: "kf", meta: Loc("4 weeks · 3 days/week", "4 semanas · 3 días/semana"), tag: Loc("Assist draft", "Borrador de Assist"), tone: .ai, kind: .assistDraft),
        ProgramSummary(id: "sf", meta: Loc("8 weeks · 3 days/week · 2 clients", "8 semanas · 3 días/semana · 2 clientes"), tag: Loc("Active", "Activo"), tone: .good, kind: .active),
        ProgramSummary(id: "fl", meta: Loc("12 weeks · 4 days/week · 2 clients", "12 semanas · 4 días/semana · 2 clientes"), tag: Loc("Active", "Activo"), tone: .good, kind: .active),
        ProgramSummary(id: "hb", meta: Loc("6 weeks · 4 days/week · 2 clients", "6 semanas · 4 días/semana · 2 clientes"), tag: Loc("Active", "Activo"), tone: .good, kind: .active),
        ProgramSummary(id: "pb", meta: Loc("8 weeks · 4 days/week · 1 client", "8 semanas · 4 días/semana · 1 cliente"), tag: Loc("Active", "Activo"), tone: .good, kind: .active),
        ProgramSummary(id: "gfs", meta: Loc("8 weeks · 3 days/week · template", "8 semanas · 3 días/semana · plantilla"), tag: Loc("Template", "Plantilla"), tone: .muted, kind: .template)
    ]

    static let programWorkouts: [ProgramWorkout] = [
        ProgramWorkout(name: Loc("Lower Body A", "Tren inferior A"), meta: Loc("6 exercises · ~50 min", "6 ejercicios · ~50 min")),
        ProgramWorkout(name: Loc("Upper Body A", "Tren superior A"), meta: Loc("7 exercises · ~55 min", "7 ejercicios · ~55 min")),
        ProgramWorkout(name: Loc("Full Body B", "Cuerpo completo B"), meta: Loc("6 exercises · ~45 min", "6 ejercicios · ~45 min"))
    ]

    static let programLogs: [DatedLine] = [
        DatedLine(date: Loc("Mon", "Lun"), text: Loc("Maya logged Lower Body A · 52 min", "Maya registró Tren inferior A · 52 min")),
        DatedLine(date: Loc("Sun", "Dom"), text: Loc("Elena logged Full Body B · 47 min", "Elena registró Cuerpo completo B · 47 min")),
        DatedLine(date: Loc("Sat", "Sáb"), text: Loc("Jamal logged Upper Body A · 58 min", "Jamal registró Tren superior A · 58 min"))
    ]

    /// "Lower Body A" in the workout builder.
    static let builderWorkout: [BuilderExercise] = [
        BuilderExercise(name: Loc("Box squat to parallel", "Sentadilla al cajón a paralelo"), reps: "8", rest: Loc("2 min", "2 min"), sets: 4),
        BuilderExercise(name: Loc("Romanian deadlift", "Peso muerto rumano"), reps: "10", rest: Loc("90 sec", "90 s"), sets: 3),
        BuilderExercise(name: Loc("Hip thrust", "Empuje de cadera"), reps: "12", rest: Loc("90 sec", "90 s"), sets: 3),
        BuilderExercise(name: Loc("Step-up (low box)", "Subida al cajón (bajo)"), reps: Loc("10 / leg", "10 / pierna"), rest: Loc("60 sec", "60 s"), sets: 3),
        BuilderExercise(name: Loc("Hamstring curl", "Curl femoral"), reps: "12", rest: Loc("60 sec", "60 s"), sets: 3),
        BuilderExercise(name: Loc("Dead bug", "Bicho muerto"), reps: Loc("10 / side", "10 / lado"), rest: Loc("45 sec", "45 s"), sets: 2)
    ]

    static let library: [LibraryExercise] = [
        LibraryExercise(id: "x1", name: Loc("Back squat", "Sentadilla trasera"), group: .legs, equipment: Loc("Barbell", "Barra")),
        LibraryExercise(id: "x2", name: Loc("Box squat", "Sentadilla al cajón"), group: .legs, equipment: Loc("Barbell", "Barra")),
        LibraryExercise(id: "x3", name: Loc("Romanian deadlift", "Peso muerto rumano"), group: .legs, equipment: Loc("Barbell", "Barra")),
        LibraryExercise(id: "x4", name: Loc("Hip thrust", "Empuje de cadera"), group: .legs, equipment: Loc("Barbell", "Barra")),
        LibraryExercise(id: "x5", name: Loc("Step-up", "Subida al cajón"), group: .legs, equipment: Loc("Dumbbells", "Mancuernas")),
        LibraryExercise(id: "x6", name: Loc("Bench press", "Press de banca"), group: .push, equipment: Loc("Barbell", "Barra")),
        LibraryExercise(id: "x7", name: Loc("Overhead press", "Press militar"), group: .push, equipment: Loc("Barbell", "Barra")),
        LibraryExercise(id: "x8", name: Loc("Push-up", "Lagartija"), group: .push, equipment: Loc("Bodyweight", "Peso corporal")),
        LibraryExercise(id: "x9", name: Loc("Pull-up", "Dominada"), group: .pull, equipment: Loc("Bodyweight", "Peso corporal")),
        LibraryExercise(id: "x10", name: Loc("Seated cable row", "Remo sentado en polea"), group: .pull, equipment: Loc("Cable", "Polea")),
        LibraryExercise(id: "x11", name: Loc("Lat pulldown", "Jalón al pecho"), group: .pull, equipment: Loc("Cable", "Polea")),
        LibraryExercise(id: "x12", name: Loc("Plank", "Plancha"), group: .core, equipment: Loc("Bodyweight", "Peso corporal")),
        LibraryExercise(id: "x13", name: Loc("Dead bug", "Bicho muerto"), group: .core, equipment: Loc("Bodyweight", "Peso corporal"))
    ]

    static let alternatives: [MuscleGroup: [Loc]] = [
        .legs: [Loc("Goblet squat", "Sentadilla goblet"), Loc("Leg press", "Prensa de piernas"), Loc("Step-up", "Subida al cajón"), Loc("Box squat", "Sentadilla al cajón")],
        .push: [Loc("Dumbbell bench press", "Press con mancuernas"), Loc("Push-up", "Lagartija"), Loc("Machine chest press", "Press de pecho en máquina")],
        .pull: [Loc("Seated cable row", "Remo sentado en polea"), Loc("Lat pulldown", "Jalón al pecho"), Loc("Inverted row", "Remo invertido")],
        .core: [Loc("Dead bug", "Bicho muerto"), Loc("Bird dog", "Bird dog"), Loc("Pallof press", "Press Pallof")]
    ]

    static let cues: [MuscleGroup: [Loc]] = [
        .legs: [Loc("Brace your core before every rep.", "Aprieta el abdomen antes de cada repetición."), Loc("Knees track over your toes.", "Las rodillas siguen la línea de los pies."), Loc("Lower for 2 seconds, then drive up.", "Baja en 2 segundos y sube con fuerza.")],
        .push: [Loc("Pin your shoulder blades back.", "Lleva los omóplatos hacia atrás."), Loc("Lower to your chest with control.", "Baja al pecho con control."), Loc("Press up and slightly back.", "Empuja hacia arriba y un poco atrás.")],
        .pull: [Loc("Start every rep by pulling your shoulders down.", "Empieza cada repetición bajando los hombros."), Loc("Drive with your elbows, not your hands.", "Jala con los codos, no con las manos."), Loc("Pause for one second at the top.", "Haz una pausa de un segundo arriba.")],
        .core: [Loc("Keep your low back flat on the floor.", "Mantén la espalda baja pegada al piso."), Loc("Breathe out as you move.", "Suelta el aire al moverte."), Loc("Slow and controlled beats fast.", "Lento y controlado es mejor que rápido.")]
    ]
}

// MARK: - Nutrition overview

extension CoachData {
    static let nutrition: [NutritionRow] = [
        NutritionRow(clientID: "daniel", percent: 100, label: Loc("7 of 7 days", "7 de 7 días")),
        NutritionRow(clientID: "maya", percent: 92, label: Loc("6 of 7 days", "6 de 7 días")),
        NutritionRow(clientID: "elena", percent: 88, label: Loc("6 of 7 days", "6 de 7 días")),
        NutritionRow(clientID: "noah", percent: 76, label: Loc("5 of 7 days", "5 de 7 días")),
        NutritionRow(clientID: "priya", percent: 70, label: Loc("Low · 4 days", "Baja · 4 días")),
        NutritionRow(clientID: "marcus", percent: 0, label: Loc("Not logging", "No registra"))
    ]

    static let howClientsLog: [ShareRow] = [
        ShareRow(title: Loc("Photo", "Foto"), percent: 46),
        ShareRow(title: Loc("Voice", "Voz"), percent: 22),
        ShareRow(title: Loc("Barcode", "Código"), percent: 18),
        ShareRow(title: Loc("Search", "Búsqueda"), percent: 14)
    ]

    static let habitShares: [ShareRow] = [
        ShareRow(title: Loc("Protein at every meal", "Proteína en cada comida"), percent: 71),
        ShareRow(title: Loc("Drink 3 L of water", "Tomar 3 L de agua"), percent: 64),
        ShareRow(title: Loc("8,000 steps", "8,000 pasos"), percent: 58)
    ]

    static let mealPlans: [MealPlanTemplate] = [
        MealPlanTemplate(name: Loc("High protein · 1,800 kcal", "Alto en proteína · 1,800 kcal"), shortName: Loc("High protein", "Alto en proteína"), meta: Loc("3 meals + 1 snack · 3 clients", "3 comidas + 1 merienda · 3 clientes")),
        MealPlanTemplate(name: Loc("Fat loss · 1,600 kcal", "Pérdida de grasa · 1,600 kcal"), shortName: Loc("Fat loss", "Pérdida de grasa"), meta: Loc("3 meals + 2 snacks · 2 clients", "3 comidas + 2 meriendas · 2 clientes")),
        MealPlanTemplate(name: Loc("Lean gain · 2,800 kcal", "Ganancia limpia · 2,800 kcal"), shortName: Loc("Lean gain", "Ganancia limpia"), meta: Loc("4 meals · 1 client", "4 comidas · 1 cliente"))
    ]
}

// MARK: - Automations and notifications

extension CoachData {
    static let automations: [ToggleSetting] = [
        ToggleSetting(id: "checkin", name: Loc("Weekly check-in reminder", "Recordatorio semanal de revisión"), detail: Loc("Sun 6:00 PM · fixed text · sends automatically", "Dom 6:00 p. m. · texto fijo · se envía solo")),
        ToggleSetting(id: "missed", name: Loc("Missed-workout nudge", "Aviso por entrenamiento perdido"), detail: Loc("After 2 missed sessions · Assist drafts, you approve", "Tras 2 sesiones perdidas · Assist prepara, tú apruebas")),
        ToggleSetting(id: "pay", name: Loc("Payment reminder", "Recordatorio de pago"), detail: Loc("3 days after due · Assist drafts, you approve", "3 días después del vencimiento · Assist prepara, tú apruebas")),
        ToggleSetting(id: "welcome", name: Loc("Welcome sequence", "Secuencia de bienvenida"), detail: Loc("New clients · 3 messages over the first week", "Clientes nuevos · 3 mensajes en la primera semana")),
        ToggleSetting(id: "wins", name: Loc("Celebrate wins", "Celebrar logros"), detail: Loc("PRs and streaks · Assist drafts, you approve", "Récords y rachas · Assist prepara, tú apruebas")),
        ToggleSetting(id: "paused", name: Loc("Welcome back", "Bienvenida de regreso"), detail: Loc("7 days before a paused client returns", "7 días antes de que regrese un cliente en pausa"))
    ]

    static let initialAutomations: [String: Bool] = [
        "checkin": true, "missed": true, "pay": true, "welcome": true, "wins": false, "paused": true
    ]

    static let automationRuns: [DatedLine] = [
        DatedLine(date: Loc("Sun", "Dom"), text: Loc("Check-in reminder · sent to 9 clients at 6:00 PM", "Recordatorio de revisión · enviado a 9 clientes a las 6:00 p. m.")),
        DatedLine(date: Loc("Sat", "Sáb"), text: Loc("Missed-workout nudge · drafted for Marcus, waiting for you", "Aviso por entrenamiento perdido · preparado para Marcus, esperando por ti")),
        DatedLine(date: Loc("Fri", "Vie"), text: Loc("Welcome sequence · message 1 of 3 sent to Tyler", "Secuencia de bienvenida · mensaje 1 de 3 enviado a Tyler"))
    ]

    static let notifications: [ToggleSetting] = [
        ToggleSetting(id: "briefing", name: Loc("Morning briefing", "Resumen de la mañana"), detail: Loc("Every day at 7:00 AM", "Todos los días a las 7:00 a. m.")),
        ToggleSetting(id: "checkins", name: Loc("New check-ins", "Revisiones nuevas"), detail: Loc("As they come in", "En cuanto llegan")),
        ToggleSetting(id: "messages", name: Loc("Messages", "Mensajes"), detail: Loc("From clients and leads", "De clientes y prospectos")),
        ToggleSetting(id: "payments", name: Loc("Payments", "Pagos"), detail: Loc("Failed or late payments", "Pagos fallidos o atrasados"))
    ]
}

// MARK: - Money

extension CoachData {
    static let packages: [Package] = [
        Package(name: Loc("Online coaching", "Coaching en línea"), meta: Loc("$149 / month · 5 clients", "$149 / mes · 5 clientes"), total: "$745", value: 745),
        Package(name: Loc("Hybrid coaching", "Coaching híbrido"), meta: Loc("$249 / month · 3 clients", "$249 / mes · 3 clientes"), total: "$747", value: 747),
        Package(name: Loc("In-person 8-pack", "Paquete presencial de 8"), meta: Loc("$480 · 1 client", "$480 · 1 cliente"), total: "$480", value: 480)
    ]

    static let recentPayments: [Payment] = [
        Payment(name: "Daniel Brooks", initials: "DB", avatar: 0xC6D6E6, when: Loc("Oct 3 · 8-pack", "3 oct · paquete de 8"), amount: "$480"),
        Payment(name: "Priya Patel", initials: "PP", avatar: 0xDCC9DF, when: Loc("Oct 2 · Online", "2 oct · En línea"), amount: "$149"),
        Payment(name: "Maya Chen", initials: "MC", avatar: 0xCFE0C3, when: Loc("Oct 1 · Hybrid", "1 oct · Híbrido"), amount: "$249"),
        Payment(name: "Elena Garcia", initials: "EG", avatar: 0xE6D3C7, when: Loc("Oct 1 · Hybrid", "1 oct · Híbrido"), amount: "$249")
    ]

    static let payouts: [(date: Loc, status: Loc, amount: String)] = [
        (Loc("Fri, Oct 16", "vie 16 de oct"), Loc("Scheduled", "Programado"), "$1,240"),
        (Loc("Fri, Oct 9", "vie 9 de oct"), Loc("Paid", "Pagado"), "$334"),
        (Loc("Fri, Oct 2", "vie 2 de oct"), Loc("Paid", "Pagado"), "$1,618")
    ]

    static let revenue: [RevenuePoint] = [
        RevenuePoint(id: 0, month: Loc("May", "may"), value: 1180),
        RevenuePoint(id: 1, month: Loc("Jun", "jun"), value: 1340),
        RevenuePoint(id: 2, month: Loc("Jul", "jul"), value: 1520),
        RevenuePoint(id: 3, month: Loc("Aug", "ago"), value: 1690),
        RevenuePoint(id: 4, month: Loc("Sep", "sep"), value: 1826),
        RevenuePoint(id: 5, month: Loc("Oct", "oct"), value: 1972)
    ]

    /// Average adherence for the last 8 weeks (%).
    static let adherence: [Int] = [78, 81, 80, 84, 86, 83, 85, 87]

    static let plans: [PlanOption] = [
        PlanOption(id: "starter", name: "Starter", price: "$29", saves: Loc("Saves about 3 hours a week", "Ahorra unas 3 horas por semana"), meta: Loc("Up to 15 clients · check-ins, programs, payments", "Hasta 15 clientes · revisiones, programas, pagos")),
        PlanOption(id: "pro", name: "Pro", price: "$59", saves: Loc("Saves about 9 hours a week", "Ahorra unas 9 horas por semana"), meta: Loc("Up to 50 clients · Assist, leads, automations, voice", "Hasta 50 clientes · Assist, prospectos, automatizaciones, voz")),
        PlanOption(id: "studio", name: "Studio", price: "$99", saves: Loc("Handles 150 clients without hiring help", "Maneja 150 clientes sin contratar ayuda"), meta: Loc("Team seats, roles and shared clients", "Asientos de equipo, roles y clientes compartidos"))
    ]
}
