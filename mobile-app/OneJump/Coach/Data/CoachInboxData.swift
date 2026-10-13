import Foundation

// MARK: - Needs-you queue and today's sessions

extension CoachData {
    static let queue: [QueueItem] = [
        QueueItem(
            id: "marcus",
            reason: Loc("Missed 3 workouts · no check-in for 9 days", "Faltó a 3 entrenamientos · 9 días sin revisión"),
            tag: Loc("At risk", "En riesgo"), tone: .crit,
            draft: Loc("Hey Marcus, noticed this week got away from you. No stress at all. Want me to switch you to two 30-minute sessions so you keep momentum while work is crazy? Just tell me which days work.",
                       "¡Hola, Marcus! Vi que esta semana se te complicó. Cero estrés. ¿Quieres que te cambie a dos sesiones de 30 minutos para no perder el ritmo mientras el trabajo está intenso? Dime qué días te funcionan.")
        ),
        QueueItem(
            id: "sofia",
            reason: Loc("$149 invoice · 6 days overdue", "Factura de $149 · 6 días de atraso"),
            tag: Loc("Payment", "Pago"), tone: .warn,
            draft: Loc("Hi Sofia! Quick heads-up: your October invoice ($149) is still open. Here’s the link whenever you get a sec. Thanks!",
                       "¡Hola, Sofia! Un aviso rápido: tu factura de octubre ($149) sigue pendiente. Aquí tienes el enlace para cuando puedas. ¡Gracias!")
        ),
        QueueItem(
            id: "priya",
            reason: Loc("Protein 30% under target · 4 days", "Proteína 30% bajo la meta · 4 días"),
            tag: Loc("Nutrition", "Nutrición"), tone: .info,
            draft: Loc("Priya, you’re crushing your workouts! Protein has been around 95 g vs your 135 g goal, which might explain the low energy. Easy adds: Greek yogurt at breakfast and a shake after training. Want a few more swaps?",
                       "¡Priya, vas muy bien con tus entrenamientos! Tu proteína ha estado cerca de 95 g contra tu meta de 135 g, y eso podría explicar la poca energía. Fácil de sumar: yogur griego en el desayuno y un batido después de entrenar. ¿Quieres más ideas?")
        ),
        QueueItem(
            id: "daniel",
            reason: Loc("New squat PR · 275 lb", "Nuevo récord de sentadilla · 275 lb"),
            tag: Loc("Win", "Logro"), tone: .good,
            draft: Loc("275 on squat! That’s 20 lb up since August, and it looked smooth. Proud of you, Daniel. Deload next week, then we set up your peaking block.",
                       "¡275 en sentadilla! Son 20 lb más que en agosto y se vio fácil. Orgulloso de ti, Daniel. La próxima semana es de descarga y luego armamos tu bloque de pico.")
        )
    ]

    static let sessions: [Session] = [
        Session(time: Loc("7:00 AM", "7:00 a. m."), name: "Daniel Brooks", type: Loc("In person · Lower body", "Presencial · Tren inferior"), systemImage: "mappin.and.ellipse"),
        Session(time: Loc("12:30 PM", "12:30 p. m."), name: "Maya Chen", type: Loc("Video · Check-in review", "Video · Repaso de revisión"), systemImage: "video"),
        Session(time: Loc("6:00 PM", "6:00 p. m."), name: "Tyler Johnson", type: Loc("Video · Kickoff call", "Video · Llamada de inicio"), systemImage: "video")
    ]

    /// The morning briefing, one line at a time.
    static let briefing: [Loc] = [
        Loc("Marcus missed 3 workouts and hasn’t checked in for 9 days. A low-pressure message is drafted.",
            "Marcus faltó a 3 entrenamientos y lleva 9 días sin revisión. Hay un mensaje sin presión listo."),
        Loc("Maya mentioned knee pain in her check-in. I flagged a referral and drafted a reply.",
            "Maya mencionó dolor de rodilla en su revisión. Marqué que vea a un profesional y preparé una respuesta."),
        Loc("Sofia’s $149 invoice is 6 days overdue. A friendly reminder is ready.",
            "La factura de $149 de Sofia lleva 6 días de atraso. Hay un recordatorio amable listo."),
        Loc("Daniel hit a 275 lb squat PR. Worth a shout-out before his 7 AM session.",
            "Daniel logró un récord de 275 lb en sentadilla. Vale la pena felicitarlo antes de su sesión de las 7 a. m.")
    ]
}

// MARK: - Message threads

extension CoachData {
    static let threadOrder = ["marcus", "tyler", "lucas", "jenna", "maya", "noah"]

    static let threads: [String: CoachThread] = [
        "marcus": CoachThread(
            id: "marcus", unread: true,
            messages: [
                ThreadMessage(fromMe: false,
                              text: Loc("Hey coach, sorry. Work has been insane. Haven’t made it to the gym since last Monday.",
                                        "Hola coach, perdón. El trabajo ha estado una locura. No he ido al gimnasio desde el lunes pasado."),
                              time: Loc("Yesterday 9:42 PM", "Ayer 9:42 p. m."))
            ],
            suggestion: Loc("No stress at all, Marcus. Life happens. Want me to switch you to two 30-minute sessions this week so you keep momentum? Just tell me which days work.",
                            "Cero estrés, Marcus. Así es la vida. ¿Quieres que te cambie a dos sesiones de 30 minutos esta semana para no perder el ritmo? Dime qué días te funcionan."),
            autoReply: ThreadMessage(fromMe: false, text: Loc("Tue and Thu work. Thanks for understanding!", "Martes y jueves me funcionan. ¡Gracias por entender!"), time: Loc("Now", "Ahora"))
        ),
        "tyler": CoachThread(
            id: "tyler", unread: true,
            messages: [
                ThreadMessage(fromMe: false, text: Loc("Filled out the intake form. Excited to start!", "Llené el formulario. ¡Con ganas de empezar!"), time: Loc("8:15 AM", "8:15 a. m."))
            ],
            suggestion: Loc("Welcome aboard, Tyler! Got your intake. Our kickoff call is today at 6 PM. Bring any questions. Your first workouts unlock tomorrow morning.",
                            "¡Bienvenido, Tyler! Recibí tu formulario. Nuestra llamada de inicio es hoy a las 6 p. m. Trae tus preguntas. Tus primeros entrenamientos se activan mañana temprano."),
            autoReply: ThreadMessage(fromMe: false, text: Loc("See you at 6!", "¡Nos vemos a las 6!"), time: Loc("Now", "Ahora"))
        ),
        "lucas": CoachThread(
            id: "lucas", unread: true, isLead: true, isForeign: true,
            languageName: Loc("Portuguese", "portugués"), languageCode: "PT",
            messages: [
                ThreadMessage(fromMe: false,
                              text: Loc("Hi! I saw your Instagram post. How much is online coaching? I live in Lisbon.",
                                        "¡Hola! Vi tu publicación en Instagram. ¿Cuánto cuesta el coaching en línea? Vivo en Lisboa."),
                              original: "Oi! Vi seu post no Instagram. Quanto custa o coaching online? Moro em Lisboa.",
                              time: Loc("7:12 AM", "7:12 a. m."))
            ],
            suggestion: Loc("Hi Lucas! Online coaching is $149/month: a program built for your schedule, weekly check-ins and messaging with me, from anywhere. Want a free 15-minute call?",
                            "¡Hola, Lucas! El coaching en línea cuesta $149 al mes: un programa hecho para tu horario, revisiones semanales y mensajes conmigo, desde cualquier lugar. ¿Quieres una llamada gratis de 15 minutos?"),
            suggestionOut: "Oi, Lucas! O coaching online custa US$149 por mês: um programa feito para a sua rotina, check-ins semanais e mensagens comigo, de qualquer lugar. Quer uma chamada grátis de 15 minutos?",
            autoReply: ThreadMessage(fromMe: false, text: Loc("Perfect! Can we do Thursday at 6 PM?", "¡Perfecto! ¿Puede ser el jueves a las 6 p. m.?"),
                                     original: "Perfeito! Pode ser na quinta às 18h?", time: Loc("Now", "Ahora"))
        ),
        "jenna": CoachThread(
            id: "jenna", unread: false, isLead: true,
            messages: [
                ThreadMessage(fromMe: false, text: Loc("Hi! Saw your post. How does online coaching work and how much is it?",
                                                       "¡Hola! Vi tu publicación. ¿Cómo funciona el coaching en línea y cuánto cuesta?"),
                              time: Loc("Sun", "Dom"))
            ],
            suggestion: Loc("Hi Jenna! Thanks for reaching out. Online coaching is $149/mo: a program built for your schedule, weekly check-ins, nutrition targets and messaging with me. Want a free 15-minute call this week? Book here: onejumpfit.com/alex",
                            "¡Hola, Jenna! Gracias por escribir. El coaching en línea cuesta $149 al mes: un programa hecho para tu horario, revisiones semanales, metas de nutrición y mensajes conmigo. ¿Quieres una llamada gratis de 15 minutos esta semana? Agenda aquí: onejumpfit.com/alex"),
            autoReply: ThreadMessage(fromMe: false, text: Loc("Booked Thursday at 5. Thank you!", "Agendé el jueves a las 5. ¡Gracias!"), time: Loc("Now", "Ahora"))
        ),
        "maya": CoachThread(
            id: "maya", unread: false,
            messages: [
                ThreadMessage(fromMe: true, text: Loc("Great week! Let’s go over your check-in at 12:30.", "¡Gran semana! Repasamos tu revisión a las 12:30."), time: Loc("9:02 AM", "9:02 a. m.")),
                ThreadMessage(fromMe: false, text: Loc("Sounds good, see you then!", "¡Perfecto, nos vemos!"), time: Loc("9:10 AM", "9:10 a. m."))
            ]
        ),
        "noah": CoachThread(
            id: "noah", unread: false,
            messages: [
                ThreadMessage(fromMe: true, text: Loc("Nice work this week, Noah.", "Buen trabajo esta semana, Noah."), time: Loc("Sat", "Sáb")),
                ThreadMessage(fromMe: false, text: Loc("Appreciate it! Same plan next week?", "¡Gracias! ¿El mismo plan la próxima semana?"), time: Loc("Sat", "Sáb"))
            ],
            suggestion: Loc("Same structure, but let’s bump your main lifts about 5% so you keep progressing. I’ll update the plan tonight.",
                            "La misma estructura, pero subamos cerca de 5% tus ejercicios principales para que sigas progresando. Actualizo el plan esta noche.")
        )
    ]

    static let leadPeople: [String: LeadPerson] = [
        "jenna": LeadPerson(name: "Jenna Morales", initials: "JM", avatar: 0xEBD9A8, sub: Loc("Lead · Instagram", "Prospecto · Instagram")),
        "lucas": LeadPerson(name: "Lucas Silva", initials: "LS", avatar: 0xC9DDE6, sub: Loc("Lead · Instagram · writes in Portuguese", "Prospecto · Instagram · escribe en portugués"))
    ]
}

// MARK: - Check-ins

extension CoachData {
    static let checkInOrder = ["maya", "daniel", "priya"]

    static let checkIns: [String: CheckInReport] = [
        "maya": CheckInReport(
            week: Loc("Week 6 check-in", "Revisión semana 6"), when: Loc("2h ago", "hace 2 h"),
            flag: Loc("She mentioned left knee pain during lunges.", "Mencionó dolor en la rodilla izquierda durante las zancadas."),
            answers: [
                CheckInAnswer(question: Loc("Weight", "Peso"), answer: "152.4 lb (−1.2)"),
                CheckInAnswer(question: Loc("Workouts", "Entrenamientos"), answer: Loc("3 of 3", "3 de 3")),
                CheckInAnswer(question: Loc("Sleep", "Sueño"), answer: "6 / 10"),
                CheckInAnswer(question: Loc("Energy", "Energía"), answer: "7 / 10"),
                CheckInAnswer(question: Loc("Stress", "Estrés"), answer: "5 / 10"),
                CheckInAnswer(question: Loc("Nutrition", "Nutrición"), answer: Loc("85% on target", "85% en meta"))
            ],
            note: Loc("Good week overall! My left knee hurt a bit during lunges on Wednesday though.",
                      "¡Buena semana en general! Aunque el miércoles me dolió un poco la rodilla izquierda con las zancadas."),
            summary: Loc("Strong week: 3 of 3 workouts and down 1.2 lb (6.8 lb in 6 weeks, on pace). Sleep dipped to 6/10. Knee pain on lunges is flagged for a referral. I didn’t give medical advice.",
                         "Semana fuerte: 3 de 3 entrenamientos y bajó 1.2 lb (6.8 lb en 6 semanas, a buen ritmo). El sueño bajó a 6/10. El dolor de rodilla con zancadas quedó marcado para remitirla a un profesional. No di consejos médicos."),
            draft: Loc("Awesome week, Maya! 3 for 3 and down another 1.2 lb. About your knee: let’s swap lunges for step-ups and box squats for now, and please get it checked by a physio or doctor before we load it heavier. Also try to protect your sleep this week. Aim for 7+ hours.",
                       "¡Semanón, Maya! 3 de 3 y bajaste otras 1.2 lb. Sobre tu rodilla: por ahora cambiemos las zancadas por subidas al cajón y sentadillas al cajón, y por favor que la revise un fisioterapeuta o médico antes de subir el peso. Y cuida tu sueño esta semana: intenta dormir 7 horas o más."),
            food: Loc("Logged 6 of 7 days · protein 128 g of 130 g · 9 meals by photo", "Registró 6 de 7 días · proteína 128 g de 130 g · 9 comidas con foto"),
            actions: [
                CheckInAction(id: "swap", title: Loc("Swap lunges for step-ups", "Cambiar zancadas por subidas al cajón"), detail: Loc("Fat Loss Phase 1, weeks 6–8", "Pérdida de grasa · Fase 1, semanas 6–8"), button: Loc("Apply", "Aplicar")),
                CheckInAction(id: "ref", title: Loc("Add a referral note", "Agregar nota de remisión"), detail: Loc("See a physio before heavy lower-body work", "Ver a un fisioterapeuta antes de cargar pesado el tren inferior"), button: Loc("Add", "Agregar")),
                CheckInAction(id: "sleep", title: Loc("Add a sleep habit", "Agregar hábito de sueño"), detail: Loc("7+ hours, tracked daily", "7+ horas, registrado a diario"), button: Loc("Add", "Agregar"))
            ]
        ),
        "daniel": CheckInReport(
            week: Loc("Week 7 check-in", "Revisión semana 7"), when: Loc("Yesterday", "Ayer"), flag: nil,
            answers: [
                CheckInAnswer(question: Loc("Weight", "Peso"), answer: "188.2 lb (+0.6)"),
                CheckInAnswer(question: Loc("Workouts", "Entrenamientos"), answer: Loc("4 of 4", "4 de 4")),
                CheckInAnswer(question: Loc("Sleep", "Sueño"), answer: "8 / 10"),
                CheckInAnswer(question: Loc("Energy", "Energía"), answer: "9 / 10"),
                CheckInAnswer(question: Loc("Stress", "Estrés"), answer: "3 / 10"),
                CheckInAnswer(question: Loc("Nutrition", "Nutrición"), answer: Loc("92% on target", "92% en meta"))
            ],
            note: Loc("Hit 275 on squat!! Felt smooth.", "¡¡Hice 275 en sentadilla!! Se sintió fácil."),
            summary: Loc("Best week of his block: 4 of 4 sessions and a squat PR at 275 lb (+20 lb since August). Weight +0.6 lb, right on his lean-gain target.",
                         "La mejor semana de su bloque: 4 de 4 sesiones y récord de sentadilla con 275 lb (+20 lb desde agosto). Peso +0.6 lb, justo en su meta de ganancia limpia."),
            draft: Loc("275! Huge, Daniel. That’s 20 lb up since August and it looked smooth. Next week is a deload, then we set up your peaking block. Enjoy the recovery.",
                       "¡275! Enorme, Daniel. Son 20 lb más que en agosto y se vio fácil. La próxima semana es de descarga y luego armamos tu bloque de pico. Disfruta la recuperación."),
            food: Loc("Logged 7 of 7 days · protein 196 g of 190 g", "Registró 7 de 7 días · proteína 196 g de 190 g"),
            actions: [
                CheckInAction(id: "deload", title: Loc("Make week 8 a deload", "Hacer la semana 8 de descarga"), detail: Loc("60% volume, same exercises", "60% del volumen, mismos ejercicios"), button: Loc("Apply", "Aplicar")),
                CheckInAction(id: "peak", title: Loc("Draft a 4-week peaking block", "Preparar un bloque de pico de 4 semanas"), detail: Loc("Assist builds it, you approve", "Assist lo arma, tú apruebas"), button: Loc("Draft", "Preparar"))
            ]
        ),
        "priya": CheckInReport(
            week: Loc("Week 4 check-in", "Revisión semana 4"), when: Loc("Yesterday", "Ayer"), flag: nil,
            answers: [
                CheckInAnswer(question: Loc("Weight", "Peso"), answer: "141.0 lb (−0.4)"),
                CheckInAnswer(question: Loc("Workouts", "Entrenamientos"), answer: Loc("3 of 3", "3 de 3")),
                CheckInAnswer(question: Loc("Sleep", "Sueño"), answer: "7 / 10"),
                CheckInAnswer(question: Loc("Energy", "Energía"), answer: "6 / 10"),
                CheckInAnswer(question: Loc("Stress", "Estrés"), answer: "6 / 10"),
                CheckInAnswer(question: Loc("Protein", "Proteína"), answer: Loc("70% of goal", "70% de la meta"))
            ],
            note: Loc("Energy was lower than usual this week.", "Esta semana tuve menos energía de lo normal."),
            summary: Loc("Training is consistent (3 of 3), but protein has averaged 95 g vs her 135 g target for 4 days, which may explain the lower energy.",
                         "Entrena con constancia (3 de 3), pero su proteína promedia 95 g contra una meta de 135 g desde hace 4 días, lo que podría explicar la baja energía."),
            draft: Loc("Great consistency, Priya! I think the low energy is partly protein. You’ve averaged about 95 g vs 135 g. Easy adds: Greek yogurt at breakfast and a shake after training. Let’s see how you feel next week.",
                       "¡Gran constancia, Priya! Creo que la poca energía es en parte por la proteína. Has promediado unos 95 g contra 135 g. Fácil de sumar: yogur griego en el desayuno y un batido después de entrenar. Veamos cómo te sientes la próxima semana."),
            food: Loc("Logged 6 of 7 days · protein 95 g of 135 g", "Registró 6 de 7 días · proteína 95 g de 135 g"),
            actions: [
                CheckInAction(id: "habit", title: Loc("Add a protein habit", "Agregar hábito de proteína"), detail: Loc("Protein at every meal", "Proteína en cada comida"), button: Loc("Add", "Agregar")),
                CheckInAction(id: "plan", title: Loc("Send the high-protein meal plan", "Enviar el plan alto en proteína"), detail: Loc("From your templates", "De tus plantillas"), button: Loc("Send", "Enviar"))
            ]
        )
    ]

    static let reviewedCheckIns: [ReviewedCheckIn] = [
        ReviewedCheckIn(name: "Noah Bennett", initials: "NB", avatar: 0xC3DCD3, when: Loc("Week 9 · Oct 11", "Semana 9 · 11 de oct")),
        ReviewedCheckIn(name: "Elena Garcia", initials: "EG", avatar: 0xE6D3C7, when: Loc("Week 3 · Oct 10", "Semana 3 · 10 de oct"))
    ]

    static let missingCheckIns: [MissingCheckIn] = [
        MissingCheckIn(clientID: "marcus", why: Loc("No check-in for 2 weeks", "Sin revisión desde hace 2 semanas")),
        MissingCheckIn(clientID: "sofia", why: Loc("This week’s check-in not sent yet", "Aún no envía la revisión de esta semana"))
    ]
}
