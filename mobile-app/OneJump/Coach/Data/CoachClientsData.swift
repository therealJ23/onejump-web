import Foundation

/// Sample data for the coach app preview. In production this comes from the OneJump API.
enum CoachData {}

// MARK: - Shared values

extension CoachData {
    static let paidOct1 = Loc("Paid Oct 1 · next charge Nov 1", "Pagado el 1 de oct · próximo cobro el 1 de nov")
    static let online = Loc("Online · $149/mo", "En línea · $149/mes")
    static let hybrid = Loc("Hybrid · $249/mo", "Híbrido · $249/mes")
    static let goalStrength = Loc("Build strength", "Ganar fuerza")
    static let goalFat = Loc("Lose fat", "Perder grasa")
    static let goalMuscle = Loc("Build muscle", "Ganar músculo")
    static let nextBlock = Loc("Draft next block", "Preparar el próximo bloque")

    static let programNames: [String: Loc] = [
        "sf": Loc("Strength Foundations", "Bases de fuerza"),
        "fl": Loc("Fat Loss Phase 1", "Pérdida de grasa · Fase 1"),
        "hb": Loc("Hypertrophy Block", "Bloque de hipertrofia"),
        "pb": Loc("Powerbuilding", "Powerbuilding"),
        "gf": Loc("General Fitness", "Fitness general"),
        "gfs": Loc("General Fitness Starter", "Inicio de fitness general"),
        "kf": Loc("Knee-friendly Lower Body", "Tren inferior cuidando la rodilla"),
        "rc": Loc("Recomp", "Recomposición")
    ]

    static func programName(_ id: String) -> Loc {
        programNames[id] ?? Loc(same: id)
    }
}

// MARK: - Clients

extension CoachData {
    static let clients: [CoachClient] = [
        CoachClient(
            id: "marcus", name: "Marcus Lee", first: "Marcus", initials: "ML", avatar: 0xE7C9BE,
            programID: "sf", week: 3, weeks: 8, kind: .risk, tone: .crit, adherence: 41, trainedThisWeek: false,
            programLabel: nil, goal: goalStrength, package: online,
            since: Loc("client since May", "cliente desde mayo"), weight: "204.6",
            weightChange: Loc("+0.4 lb this week", "+0.4 lb esta semana"), weightTotal: Loc("−1.8 lb total", "−1.8 lb en total"),
            streak: "0", spark: [10, 12, 13, 14, 15, 16, 15, 15],
            insight: Loc("Adherence fell from 92% to 41% in two weeks, right after he mentioned a new work schedule. Clients in this spot usually come back faster with shorter sessions, not more pressure.",
                         "Su cumplimiento bajó de 92% a 41% en dos semanas, justo después de mencionar un nuevo horario de trabajo. Los clientes en esta situación suelen volver más rápido con sesiones más cortas, no con más presión."),
            suggest: Loc("Draft a low-pressure check-in", "Preparar un mensaje sin presión"),
            next: Loc("Not booked · last session Oct 5", "Sin agendar · última sesión el 5 de oct"), billing: paidOct1,
            nutritionNote: Loc("No food logged in 5 days. Before that he averaged 168 g protein against a 180 g goal.",
                               "No registra comida desde hace 5 días. Antes promediaba 168 g de proteína con una meta de 180 g."),
            noLogs: true, filters: [.attention]
        ),
        CoachClient(
            id: "maya", name: "Maya Chen", first: "Maya", initials: "MC", avatar: 0xCFE0C3,
            programID: "fl", week: 6, weeks: 12, kind: .checkin, tone: .warn, adherence: 94, trainedThisWeek: true,
            programLabel: nil, goal: goalFat, package: hybrid,
            since: Loc("client since Aug", "cliente desde agosto"), weight: "152.4",
            weightChange: Loc("−1.2 lb this week", "−1.2 lb esta semana"), weightTotal: Loc("−6.8 lb total", "−6.8 lb en total"),
            streak: "18", spark: [4, 7, 10, 13, 16, 19, 23, 27],
            insight: Loc("Down 6.8 lb in 6 weeks, right on pace for her goal. She mentioned left knee pain on lunges. I flagged it and suggested a referral. Swapping lunges for step-ups or box squats keeps her moving safely.",
                         "Bajó 6.8 lb en 6 semanas, justo al ritmo de su meta. Mencionó dolor en la rodilla izquierda con las zancadas. Lo marqué y sugerí que vea a un profesional. Cambiar las zancadas por subidas al cajón o sentadillas al cajón la mantiene entrenando con seguridad."),
            suggest: Loc("Open her check-in", "Abrir su revisión"),
            next: Loc("Today 12:30 PM · video check-in", "Hoy 12:30 p. m. · revisión por video"), billing: paidOct1,
            nutritionNote: Loc("On target 6 of 7 days. Protein averages 128 g against a 130 g goal. Nice work.",
                               "En meta 6 de 7 días. Promedia 128 g de proteína con una meta de 130 g. Buen trabajo."),
            filters: [.attention]
        ),
        CoachClient(
            id: "sofia", name: "Sofia Ramirez", first: "Sofia", initials: "SR", avatar: 0xE3D2B5,
            programID: "hb", week: 2, weeks: 6, kind: .overdue, tone: .warn, adherence: 79, trainedThisWeek: true,
            programLabel: nil, goal: goalMuscle, package: online,
            since: Loc("client since Jul", "cliente desde julio"), weight: "138.0",
            weightChange: Loc("+0.2 lb this week", "+0.2 lb esta semana"), weightTotal: Loc("+1.4 lb total", "+1.4 lb en total"),
            streak: "6", spark: [20, 20, 19, 18, 18, 17, 16, 16],
            insight: Loc("Training is steady at 79%, but her October invoice ($149) is 6 days late. A friendly reminder usually fixes this within a day.",
                         "Entrena con constancia (79%), pero su factura de octubre ($149) lleva 6 días de atraso. Un recordatorio amable suele resolverlo en un día."),
            suggest: Loc("Draft a payment reminder", "Preparar recordatorio de pago"),
            next: Loc("Thu 7:00 AM · video call", "Jue 7:00 a. m. · videollamada"),
            billing: Loc("$149 overdue since Oct 7", "$149 atrasado desde el 7 de oct"),
            nutritionNote: Loc("Logging 4 of 7 days. Calories are close to target when she logs.",
                               "Registra 4 de 7 días. Cuando registra, las calorías están cerca de la meta."),
            filters: [.attention]
        ),
        CoachClient(
            id: "daniel", name: "Daniel Brooks", first: "Daniel", initials: "DB", avatar: 0xC6D6E6,
            programID: "pb", week: 7, weeks: 8, kind: .ok, tone: .good, adherence: 98, trainedThisWeek: true,
            programLabel: nil, goal: Loc("Get stronger", "Ser más fuerte"),
            package: Loc("In person · 8-pack $480", "Presencial · paquete de 8 $480"),
            since: Loc("client since Feb", "cliente desde febrero"), weight: "188.2",
            weightChange: Loc("+0.6 lb this week", "+0.6 lb esta semana"), weightTotal: Loc("+3.1 lb total", "+3.1 lb en total"),
            streak: "41", spark: [26, 24, 23, 21, 19, 17, 15, 13],
            insight: Loc("Best week of his block: squat PR at 275 lb, up 20 lb since August. Weight is climbing slowly, right on his lean-gain target.",
                         "La mejor semana de su bloque: récord de sentadilla con 275 lb, 20 lb más que en agosto. Su peso sube despacio, justo en su meta de ganancia limpia."),
            suggest: Loc("Send a PR shout-out", "Felicitarlo por su récord"),
            next: Loc("Today 7:00 AM · in person", "Hoy 7:00 a. m. · presencial"),
            billing: Loc("3 of 8 sessions left", "Le quedan 3 de 8 sesiones"),
            nutritionNote: Loc("Hitting protein 7 of 7 days. Calories are 2% over target, as planned.",
                               "Cumple su proteína 7 de 7 días. Las calorías van 2% arriba de la meta, como se planeó.")
        ),
        CoachClient(
            id: "priya", name: "Priya Patel", first: "Priya", initials: "PP", avatar: 0xDCC9DF,
            programID: "rc", week: 4, weeks: 10, kind: .ok, tone: .good, adherence: 91, trainedThisWeek: true,
            programLabel: nil, goal: Loc("Recomp", "Recomposición"), package: online,
            since: Loc("client since Sep", "cliente desde septiembre"), weight: "141.0",
            weightChange: Loc("−0.4 lb this week", "−0.4 lb esta semana"), weightTotal: Loc("−2.2 lb total", "−2.2 lb en total"),
            streak: "12", spark: [12, 13, 14, 15, 15, 16, 17, 18],
            insight: Loc("Workouts are consistent, but protein is about 30% under target for 4 days running, and she reported lower energy. Small, easy food swaps tend to stick best.",
                         "Sus entrenamientos son constantes, pero su proteína lleva 4 días cerca de 30% por debajo de la meta y reportó menos energía. Los cambios de comida pequeños y fáciles suelen funcionar mejor."),
            suggest: Loc("Draft protein tips", "Preparar consejos de proteína"),
            next: Loc("Fri 5:30 PM · video call", "Vie 5:30 p. m. · videollamada"),
            billing: Loc("Paid Oct 2 · next charge Nov 2", "Pagado el 2 de oct · próximo cobro el 2 de nov"),
            nutritionNote: Loc("Protein averages 95 g against a 135 g goal over the last 4 days. Calories are fine, so the fix is food choice, not more food.",
                               "En los últimos 4 días su proteína promedia 95 g con una meta de 135 g. Las calorías están bien: la solución es elegir mejor, no comer más."),
            lowProtein: true, filters: [.attention]
        ),
        CoachClient(
            id: "tyler", name: "Tyler Johnson", first: "Tyler", initials: "TJ", avatar: 0xC9D6E2,
            programID: "gfs", week: 0, weeks: 8, kind: .new, tone: .info, adherence: nil, trainedThisWeek: false,
            programLabel: Loc("Onboarding · starts tomorrow", "Bienvenida · empieza mañana"),
            goal: Loc("Get back in shape", "Volver a ponerse en forma"), package: hybrid,
            since: Loc("joined Oct 9", "se unió el 9 de oct"), weight: "—",
            weightChange: Loc("first weigh-in tomorrow", "primer pesaje mañana"), weightTotal: Loc("no data yet", "aún sin datos"),
            streak: "0", spark: [16, 16],
            insight: Loc("Tyler finished his intake form: 3 days a week, home gym with dumbbells, old shoulder injury (fully cleared). His kickoff call is today at 6 PM.",
                         "Tyler completó su formulario: 3 días por semana, gimnasio en casa con mancuernas y una lesión vieja de hombro (ya dada de alta). Su llamada de inicio es hoy a las 6 p. m."),
            suggest: Loc("Draft his first week", "Preparar su primera semana"),
            next: Loc("Today 6:00 PM · kickoff call", "Hoy 6:00 p. m. · llamada de inicio"),
            billing: Loc("$249 due Oct 15", "$249 vence el 15 de oct"),
            nutritionNote: Loc("Nutrition targets will be set after his first weigh-in.", "Sus metas de nutrición se fijan después de su primer pesaje."),
            noLogs: true, filters: [.new]
        ),
        CoachClient(
            id: "aisha", name: "Aisha Khan", first: "Aisha", initials: "AK", avatar: 0xD9D4C8,
            programID: "sf", week: 5, weeks: 8, kind: .paused, tone: .muted, adherence: nil, trainedThisWeek: false,
            programLabel: Loc("Paused until Nov 1", "En pausa hasta el 1 de nov"), goal: goalStrength,
            package: Loc("Online · paused", "En línea · en pausa"),
            since: Loc("client since Mar", "cliente desde marzo"), weight: "127.5",
            weightChange: Loc("paused", "en pausa"), weightTotal: Loc("−3.0 lb total", "−3.0 lb en total"),
            streak: "0", spark: [14, 15, 16, 17, 18, 18, 18, 18],
            insight: Loc("Paused for travel until Nov 1. Paused clients come back more often when you check in a week before their return date.",
                         "En pausa por viaje hasta el 1 de nov. Los clientes en pausa vuelven más cuando les escribes una semana antes de su regreso."),
            suggest: Loc("Schedule a welcome-back message", "Programar un mensaje de regreso"),
            next: Loc("Returns Nov 1", "Regresa el 1 de nov"), billing: Loc("Billing paused", "Facturación en pausa"),
            nutritionNote: Loc("Nutrition tracking is paused.", "El registro de nutrición está en pausa."),
            noLogs: true, filters: [.paused]
        ),
        CoachClient(
            id: "noah", name: "Noah Bennett", first: "Noah", initials: "NB", avatar: 0xC3DCD3,
            programID: "gf", week: 9, weeks: 12, kind: .ok, tone: .good, adherence: 87, trainedThisWeek: true,
            programLabel: nil, goal: Loc("Stay healthy", "Mantenerse sano"), package: online,
            since: Loc("client since Jan", "cliente desde enero"), weight: "176.8",
            weightChange: Loc("−0.2 lb this week", "−0.2 lb esta semana"), weightTotal: Loc("−4.0 lb total", "−4.0 lb en total"),
            streak: "9", spark: [10, 11, 13, 13, 15, 16, 16, 17],
            insight: Loc("Steady and consistent. He asked about running the same plan again. Progressing his main lifts by 5% would keep him improving.",
                         "Estable y constante. Preguntó si puede repetir el mismo plan. Subir 5% sus ejercicios principales lo mantendría progresando."),
            suggest: nextBlock, next: Loc("Sat 10:00 AM · video call", "Sáb 10:00 a. m. · videollamada"), billing: paidOct1,
            nutritionNote: Loc("Logging 5 of 7 days, near his targets.", "Registra 5 de 7 días, cerca de sus metas.")
        ),
        CoachClient(
            id: "elena", name: "Elena Garcia", first: "Elena", initials: "EG", avatar: 0xE6D3C7,
            programID: "fl", week: 3, weeks: 12, kind: .ok, tone: .good, adherence: 93, trainedThisWeek: true,
            programLabel: nil, goal: goalFat, package: hybrid,
            since: Loc("client since Sep", "cliente desde septiembre"), weight: "163.1",
            weightChange: Loc("−0.9 lb this week", "−0.9 lb esta semana"), weightTotal: Loc("−2.9 lb total", "−2.9 lb en total"),
            streak: "15", spark: [6, 9, 12, 15, 17, 19, 22, 24],
            insight: Loc("Great start: down 2.9 lb in 3 weeks with 93% adherence. Keep the plan as is.",
                         "Gran comienzo: bajó 2.9 lb en 3 semanas con 93% de cumplimiento. Mantén el plan igual."),
            suggest: Loc("Send a progress note", "Enviar nota de progreso"),
            next: Loc("Wed 8:00 AM · in person", "Mié 8:00 a. m. · presencial"), billing: paidOct1,
            nutritionNote: Loc("On target 6 of 7 days.", "En meta 6 de 7 días.")
        ),
        CoachClient(
            id: "jamal", name: "Jamal Wright", first: "Jamal", initials: "JW", avatar: 0xCCD9BE,
            programID: "hb", week: 5, weeks: 6, kind: .ok, tone: .good, adherence: 84, trainedThisWeek: true,
            programLabel: nil, goal: goalMuscle, package: online,
            since: Loc("client since Jun", "cliente desde junio"), weight: "171.4",
            weightChange: Loc("+0.3 lb this week", "+0.3 lb esta semana"), weightTotal: Loc("+2.6 lb total", "+2.6 lb en total"),
            streak: "7", spark: [22, 21, 20, 19, 18, 17, 16, 15],
            insight: Loc("One week left in his block. Now is a good time to plan the next one so he doesn’t lose momentum.",
                         "Le queda una semana de su bloque. Es buen momento para planear el siguiente y que no pierda el ritmo."),
            suggest: nextBlock, next: Loc("Mon 6:00 PM · video call", "Lun 6:00 p. m. · videollamada"), billing: paidOct1,
            nutritionNote: Loc("Logging 6 of 7 days, slightly under on calories.", "Registra 6 de 7 días, un poco bajo en calorías.")
        )
    ]

    static let lifetimeValue: [String: String] = [
        "marcus": "$894", "maya": "$498", "sofia": "$447", "daniel": "$1,920", "priya": "$149",
        "tyler": "$0", "aisha": "$1,043", "noah": "$1,341", "elena": "$249", "jamal": "$745"
    ]
}

// MARK: - Client detail defaults and extras

extension CoachData {
    static let defaultHabits: [HabitStat] = [
        HabitStat(title: Loc("8,000 steps", "8,000 pasos"), value: Loc("5 of 7 days", "5 de 7 días"), on: true),
        HabitStat(title: Loc("Drink 3 L of water", "Tomar 3 L de agua"), value: Loc("6 of 7 days", "6 de 7 días"), on: true),
        HabitStat(title: Loc("7+ hours of sleep", "Dormir 7+ horas"), value: Loc("3 of 7 days", "3 de 7 días"), on: false)
    ]

    static let defaultActivity: [DatedLine] = [
        DatedLine(date: Loc("Mon", "Lun"), text: Loc("Completed Lower Body A · 52 min", "Completó Tren inferior A · 52 min")),
        DatedLine(date: Loc("Sun", "Dom"), text: Loc("Sent weekly check-in", "Envió su revisión semanal")),
        DatedLine(date: Loc("Sat", "Sáb"), text: Loc("Logged 3 meals · 2 by photo", "Registró 3 comidas · 2 con foto"))
    ]

    static let newClientActivity: [DatedLine] = [
        DatedLine(date: Loc("Oct 9", "9 oct"), text: Loc("Accepted the invite and filled out the intake form", "Aceptó la invitación y llenó el formulario"))
    ]

    static let defaultBests: [PersonalBest] = [
        PersonalBest(name: Loc("Squat", "Sentadilla"), value: "185 lb", date: Loc("Sep 30", "30 sep")),
        PersonalBest(name: Loc("Deadlift", "Peso muerto"), value: "225 lb", date: Loc("Sep 22", "22 sep")),
        PersonalBest(name: Loc("Bench press", "Press de banca"), value: "115 lb", date: Loc("Oct 2", "2 oct"))
    ]

    static let defaultMeasures: [BodyMeasure] = [
        BodyMeasure(name: Loc("Waist", "Cintura"), value: "29.5 in", change: "−1.5 in"),
        BodyMeasure(name: Loc("Hips", "Cadera"), value: "38.0 in", change: "−1.0 in"),
        BodyMeasure(name: Loc("Chest", "Pecho"), value: "35.5 in", change: "−0.5 in"),
        BodyMeasure(name: Loc("Arm", "Brazo"), value: "11.5 in", change: Loc("no change", "sin cambio"))
    ]

    static let defaultCheckInHistory: [CheckInHistoryRow] = [
        CheckInHistoryRow(week: Loc("Week 6", "Semana 6"), date: Loc("Oct 11", "11 oct"), label: Loc("Replied", "Respondida"), tone: .good),
        CheckInHistoryRow(week: Loc("Week 5", "Semana 5"), date: Loc("Oct 4", "4 oct"), label: Loc("Replied", "Respondida"), tone: .good),
        CheckInHistoryRow(week: Loc("Week 4", "Semana 4"), date: Loc("Sep 27", "27 sep"), label: Loc("Replied", "Respondida"), tone: .good)
    ]

    static let newClientCheckInHistory: [CheckInHistoryRow] = [
        CheckInHistoryRow(week: Loc("Week 1", "Semana 1"), date: Loc("Due Sunday", "Vence el domingo"), label: Loc("Upcoming", "Próxima"), tone: .info)
    ]

    static let photoDates: [Loc] = [Loc("Oct 11", "11 oct"), Loc("Sep 13", "13 sep"), Loc("Aug 16", "16 ago")]

    static let defaultNotes: [ClientNote] = [
        ClientNote(date: Loc("Oct 9", "9 oct"), text: Loc("Prefers morning sessions. Check in on Mondays.", "Prefiere sesiones en la mañana. Escribirle los lunes.")),
        ClientNote(date: Loc("Sep 28", "28 sep"), text: Loc("Goal for this block was set together on our call.", "La meta de este bloque la fijamos juntos en la llamada."))
    ]

    static let startsTomorrow = Loc("starts tomorrow", "empieza mañana")

    static let extras: [String: ClientExtras] = [
        "marcus": ClientExtras(
            riskScore: 82,
            riskWhy: Loc("Adherence under 50% for two weeks is the strongest early sign a client will cancel. Marcus is worth $149 a month to you.",
                         "Un cumplimiento menor a 50% por dos semanas es la señal más clara de que un cliente va a cancelar. Marcus vale $149 al mes para ti."),
            habits: [
                HabitStat(title: Loc("8,000 steps", "8,000 pasos"), value: Loc("1 of 7 days", "1 de 7 días"), on: false),
                HabitStat(title: Loc("Drink 3 L of water", "Tomar 3 L de agua"), value: Loc("2 of 7 days", "2 de 7 días"), on: false),
                HabitStat(title: Loc("7+ hours of sleep", "Dormir 7+ horas"), value: Loc("2 of 7 days", "2 de 7 días"), on: false)
            ],
            activity: [
                DatedLine(date: Loc("Oct 11", "11 oct"), text: Loc("Opened the app, didn’t log anything", "Abrió la app, no registró nada")),
                DatedLine(date: Loc("Oct 5", "5 oct"), text: Loc("Completed Upper Body A · 41 min", "Completó Tren superior A · 41 min")),
                DatedLine(date: Loc("Oct 4", "4 oct"), text: Loc("Missed his weekly check-in", "No envió su revisión semanal"))
            ],
            bests: [
                PersonalBest(name: Loc("Squat", "Sentadilla"), value: "245 lb", date: Loc("Sep 19", "19 sep")),
                PersonalBest(name: Loc("Deadlift", "Peso muerto"), value: "315 lb", date: Loc("Sep 26", "26 sep")),
                PersonalBest(name: Loc("Bench press", "Press de banca"), value: "205 lb", date: Loc("Sep 24", "24 sep"))
            ],
            measures: [
                BodyMeasure(name: Loc("Waist", "Cintura"), value: "36.0 in", change: "−0.5 in"),
                BodyMeasure(name: Loc("Chest", "Pecho"), value: "43.0 in", change: "+0.5 in"),
                BodyMeasure(name: Loc("Arm", "Brazo"), value: "15.5 in", change: "+0.25 in"),
                BodyMeasure(name: Loc("Thigh", "Muslo"), value: "24.0 in", change: Loc("no change", "sin cambio"))
            ],
            checkInHistory: [
                CheckInHistoryRow(week: Loc("Week 3", "Semana 3"), date: Loc("Oct 11", "11 oct"), label: Loc("Missing", "Falta"), tone: .crit),
                CheckInHistoryRow(week: Loc("Week 2", "Semana 2"), date: Loc("Oct 4", "4 oct"), label: Loc("Missing", "Falta"), tone: .crit),
                CheckInHistoryRow(week: Loc("Week 1", "Semana 1"), date: Loc("Sep 27", "27 sep"), label: Loc("Replied", "Respondida"), tone: .good)
            ]
        ),
        "daniel": ClientExtras(
            habits: [
                HabitStat(title: Loc("8,000 steps", "8,000 pasos"), value: Loc("7 of 7 days", "7 de 7 días"), on: true),
                HabitStat(title: Loc("190 g of protein", "190 g de proteína"), value: Loc("7 of 7 days", "7 de 7 días"), on: true),
                HabitStat(title: Loc("8+ hours of sleep", "Dormir 8+ horas"), value: Loc("6 of 7 days", "6 de 7 días"), on: true)
            ],
            bests: [
                PersonalBest(name: Loc("Squat", "Sentadilla"), value: "275 lb", date: Loc("Oct 12", "12 oct")),
                PersonalBest(name: Loc("Deadlift", "Peso muerto"), value: "405 lb", date: Loc("Sep 28", "28 sep")),
                PersonalBest(name: Loc("Bench press", "Press de banca"), value: "245 lb", date: Loc("Oct 5", "5 oct"))
            ]
        ),
        "priya": ClientExtras(
            habits: [
                HabitStat(title: Loc("Protein at every meal", "Proteína en cada comida"), value: Loc("2 of 7 days", "2 de 7 días"), on: false),
                HabitStat(title: Loc("8,000 steps", "8,000 pasos"), value: Loc("6 of 7 days", "6 de 7 días"), on: true),
                HabitStat(title: Loc("7+ hours of sleep", "Dormir 7+ horas"), value: Loc("5 of 7 days", "5 de 7 días"), on: true)
            ]
        )
    ]

    static let radar: [RadarEntry] = [
        RadarEntry(clientID: "marcus", score: 82, why: Loc("Adherence 41% · no check-in in 9 days", "Cumplimiento 41% · 9 días sin revisión")),
        RadarEntry(clientID: "aisha", score: 64, why: Loc("Paused · returns Nov 1", "En pausa · regresa el 1 de nov"))
    ]

    /// Avatar colors handed out to newly invited clients.
    static let inviteColors: [UInt32] = [0xE7C9BE, 0xCFE0C3, 0xC6D6E6, 0xDCC9DF, 0xE3D2B5, 0xC3DCD3]
}
