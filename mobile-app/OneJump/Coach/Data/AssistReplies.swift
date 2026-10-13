import Foundation

/// Canned Assist answers for the preview. In production these come from the AI service
/// (Claude, through the OneJump server), using the coach's real data.
extension CoachData {
    static let suggestions: [Loc] = [
        Loc("Who needs me today?", "¿Quién me necesita hoy?"),
        Loc("How’s my business this month?", "¿Cómo va mi negocio este mes?"),
        Loc("Build Maya a 4-week lower-body block", "Crea para Maya un bloque de tren inferior de 4 semanas"),
        Loc("Write a post: 3 coaching spots open", "Escribe un post: 3 lugares de coaching disponibles")
    ]

    /// What the preview "hears" when the device can't listen.
    static let sampleVoiceQuestions: [Loc] = [
        Loc("Who needs me today?", "¿Quién me necesita hoy?"),
        Loc("How is my business doing this month?", "¿Cómo va mi negocio este mes?"),
        Loc("Build Maya a 4-week lower-body block", "Crea para Maya un bloque de tren inferior de 4 semanas")
    ]

    static let sampleConfirm = Loc("Yes, send it.", "Sí, envíalo.")

    static let replyToday = AssistTemplate(
        text: Loc("4 clients need you today, most urgent first:", "4 clientes te necesitan hoy, del más urgente al menos:"),
        points: [
            AssistPoint(bold: "Marcus.", text: Loc("Missed 3 workouts and no check-in in 9 days. His adherence dropped from 92% to 41% after a schedule change. A low-pressure message is drafted.",
                                                   "Faltó a 3 entrenamientos y lleva 9 días sin revisión. Su cumplimiento bajó de 92% a 41% tras un cambio de horario. Hay un mensaje sin presión listo.")),
            AssistPoint(bold: "Maya.", text: Loc("Knee pain in her check-in. I flagged it for a referral and drafted a reply that swaps lunges.",
                                                 "Dolor de rodilla en su revisión. Lo marqué para remitirla y preparé una respuesta que cambia las zancadas.")),
            AssistPoint(bold: "Sofia.", text: Loc("$149 invoice, 6 days overdue. A friendly reminder is ready.", "Factura de $149 con 6 días de atraso. Hay un recordatorio amable listo.")),
            AssistPoint(bold: "Priya.", text: Loc("Protein about 30% under target for 4 days, which likely explains her low energy.",
                                                  "Proteína cerca de 30% bajo la meta desde hace 4 días, lo que probablemente explica su poca energía."))
        ],
        foot: Loc("Also good news: Daniel hit a 275 lb squat PR. A shout-out is drafted.", "Y una buena noticia: Daniel logró un récord de 275 lb en sentadilla. Hay una felicitación lista."),
        say: Loc("Four clients need you today. Marcus is the most urgent. He missed three workouts and hasn’t checked in for nine days. Maya mentioned knee pain, Sofia’s payment is six days late, and Priya is low on protein. I drafted a message for each.",
                 "Cuatro clientes te necesitan hoy. Marcus es el más urgente: faltó a tres entrenamientos y lleva nueve días sin revisión. Maya mencionó dolor de rodilla, el pago de Sofia lleva seis días de atraso y Priya está baja en proteína. Preparé un mensaje para cada uno."),
        card: ActionCardTemplate(
            kind: .queue,
            label: Loc("4 drafts ready for you", "4 borradores listos para ti"),
            sub: Loc("Nothing is sent until you approve it.", "No se envía nada hasta que lo apruebes."),
            button: Loc("Review drafts", "Revisar borradores"),
            doneText: Loc("Opened your Today queue", "Abrí tu lista de Hoy"),
            ask: Loc("Want me to read them to you one by one, so you can approve each one by voice?", "¿Quieres que te los lea uno por uno para que apruebes cada uno con la voz?"),
            doneSay: Loc("Okay. Let’s go through them.", "Muy bien. Vamos uno por uno.")
        )
    )

    static let replyBusiness = AssistTemplate(
        text: Loc("October so far:", "Octubre hasta ahora:"),
        points: [
            AssistPoint(bold: Loc("$1,972 monthly revenue,", "$1,972 de ingreso mensual,"), text: Loc("up 8% from September, across 9 paying clients.", "8% más que en septiembre, con 9 clientes pagando.")),
            AssistPoint(bold: Loc("$1,574 collected.", "$1,574 cobrados."), text: Loc("$398 outstanding: Sofia $149 (6 days late, reminder drafted) and Tyler $249 (due Oct 15).", "$398 pendientes: Sofia $149 (6 días de atraso, recordatorio listo) y Tyler $249 (vence el 15 de oct).")),
            AssistPoint(bold: Loc("2 clients at risk of leaving:", "2 clientes en riesgo de irse:"), text: Loc("Marcus (adherence 41%) and Aisha (paused until Nov 1).", "Marcus (cumplimiento 41%) y Aisha (en pausa hasta el 1 de nov).")),
            AssistPoint(bold: Loc("5 open leads.", "5 prospectos abiertos."), text: Loc("Jenna hasn’t heard back in 2 days. She’s your fastest win.", "Jenna lleva 2 días sin respuesta. Es tu victoria más rápida."))
        ],
        say: Loc("October is looking good. You’re at $1,972 a month, up 8 percent. $398 is still outstanding, from Sofia and Tyler. Your fastest win is Jenna, a new lead who hasn’t heard back in two days.",
                 "Octubre va bien. Vas en $1,972 al mes, 8 por ciento más. Quedan $398 pendientes, de Sofia y Tyler. Tu victoria más rápida es Jenna, una prospecta que lleva dos días sin respuesta."),
        card: ActionCardTemplate(
            kind: .lead,
            label: Loc("Reply to Jenna", "Responder a Jenna"),
            sub: Loc("“Hi Jenna! Online coaching is $149/mo: custom program, weekly check-ins and messaging with me. Free 15-min call this week?”",
                     "“¡Hola, Jenna! El coaching en línea cuesta $149 al mes: programa a tu medida, revisiones semanales y mensajes conmigo. ¿Llamada gratis de 15 min esta semana?”"),
            button: Loc("Approve & send", "Aprobar y enviar"),
            doneText: Loc("Sent to Jenna", "Enviado a Jenna"),
            ask: Loc("I drafted a reply to Jenna with your booking link. Should I send it?", "Preparé una respuesta para Jenna con tu enlace de reservas. ¿La envío?"),
            doneSay: Loc("Sent. I’ll tell you when she books.", "Enviado. Te aviso cuando agende.")
        )
    )

    static let replyPost = AssistTemplate(
        text: Loc("Here’s a post for Instagram. Short, specific, one call to action:", "Aquí tienes un post para Instagram. Corto, específico y con una sola acción:"),
        quote: Loc("I’m opening 3 online coaching spots for November.\n\nYou get a program built around your schedule, weekly check-ins, and nutrition targets that fit real life.\n\nDM me “JUMP” or book a free call: onejumpfit.com/alex",
                   "Abro 3 lugares de coaching en línea para noviembre.\n\nRecibes un programa hecho para tu horario, revisiones semanales y metas de nutrición para la vida real.\n\nEscríbeme “JUMP” o agenda una llamada gratis: onejumpfit.com/alex"),
        foot: Loc("12 people asked about coaching in the last 90 days. I can draft a personal note to each of them too.", "12 personas preguntaron por coaching en los últimos 90 días. También puedo preparar una nota personal para cada una."),
        say: Loc("Here’s a short Instagram post about your three open spots, with one clear call to action.", "Aquí tienes un post corto para Instagram sobre tus tres lugares disponibles, con una acción clara."),
        card: ActionCardTemplate(
            kind: .post,
            label: Loc("Copy caption", "Copiar texto"),
            sub: Loc("Paste it into Instagram. Assist never posts for you.", "Pégalo en Instagram. Assist nunca publica por ti."),
            button: Loc("Copy", "Copiar"),
            doneText: Loc("Copied to clipboard", "Copiado"),
            ask: Loc("Want me to copy it so you can paste it into Instagram?", "¿Lo copio para que lo pegues en Instagram?"),
            doneSay: Loc("Copied. Paste it into Instagram whenever you’re ready.", "Copiado. Pégalo en Instagram cuando quieras.")
        )
    )

    static let replyLeads = AssistTemplate(
        text: Loc("You have 5 open leads:", "Tienes 5 prospectos abiertos:"),
        points: [
            AssistPoint(bold: "Jenna Morales", text: Loc("(Instagram) wants to lose 15 lb before March. No reply for 2 days.", "(Instagram) quiere bajar 15 lb antes de marzo. 2 días sin respuesta.")),
            AssistPoint(bold: "Lucas Silva", text: Loc("writes in Portuguese from Lisbon. I translate both ways.", "escribe en portugués desde Lisboa. Yo traduzco en ambos sentidos.")),
            AssistPoint(bold: "Kevin Tran", text: Loc("booked an intro call for Thursday at 5 PM.", "agendó una llamada para el jueves a las 5 p. m.")),
            AssistPoint(bold: "Alicia Brown", text: Loc("was referred by Maya and prefers mornings.", "viene recomendada por Maya y prefiere las mañanas."))
        ],
        say: Loc("You have five open leads. Jenna has waited the longest, two days. Lucas writes in Portuguese, and I can translate for you.",
                 "Tienes cinco prospectos abiertos. Jenna es la que más ha esperado, dos días. Lucas escribe en portugués y yo puedo traducir por ti."),
        card: ActionCardTemplate(
            kind: .lead,
            label: Loc("Reply to Jenna first", "Responder primero a Jenna"),
            sub: Loc("She’s been waiting longest. The draft includes your booking link.", "Es la que más ha esperado. El borrador incluye tu enlace de reservas."),
            button: Loc("Approve & send", "Aprobar y enviar"),
            doneText: Loc("Sent to Jenna", "Enviado a Jenna"),
            ask: Loc("Should I send Jenna the reply I drafted?", "¿Le envío a Jenna la respuesta que preparé?"),
            doneSay: Loc("Sent to Jenna.", "Enviado a Jenna.")
        )
    )

    static let replyHelp = AssistTemplate(
        text: Loc("I can take a lot off your plate. Try asking me to:", "Puedo quitarte mucho trabajo. Prueba pedirme:"),
        points: [
            AssistPoint(bold: Loc("Triage:", "Prioridades:"), text: Loc("“Who needs me today?” or “Who’s slipping this week?”", "“¿Quién me necesita hoy?” o “¿Quién se está atrasando?”")),
            AssistPoint(bold: Loc("Program:", "Programas:"), text: Loc("“Build Noah his next 6-week block.”", "“Crea para Noah su próximo bloque de 6 semanas.”")),
            AssistPoint(bold: Loc("Business:", "Negocio:"), text: Loc("“How much did I make this month?” or “Who hasn’t paid?”", "“¿Cuánto gané este mes?” o “¿Quién no ha pagado?”")),
            AssistPoint(bold: Loc("Grow:", "Crecer:"), text: Loc("“Write a post about 3 open spots” or “Follow up with my leads.”", "“Escribe un post sobre 3 lugares” o “Dale seguimiento a mis prospectos.”"))
        ],
        foot: Loc("I draft. You decide. Nothing goes to a client without your approval.", "Yo preparo. Tú decides. Nada llega a un cliente sin tu aprobación."),
        say: Loc("I can tell you who needs you, build programs, check your business, and write posts. Just ask.", "Puedo decirte quién te necesita, crear programas, revisar tu negocio y escribir posts. Solo pregunta.")
    )

    static let replyMayaProgram = AssistTemplate(
        text: Loc("Done. Here’s a 4-week lower-body block built around Maya’s knee:", "Listo. Aquí tienes un bloque de tren inferior de 4 semanas pensado para la rodilla de Maya:"),
        points: [
            AssistPoint(bold: Loc("Schedule:", "Horario:"), text: Loc("3 days a week (Mon, Wed, Fri), about 50 minutes.", "3 días por semana (lun, mié, vie), unos 50 minutos.")),
            AssistPoint(bold: Loc("Main lifts:", "Ejercicios principales:"), text: Loc("box squat to parallel, Romanian deadlift, hip thrust, low step-ups.", "sentadilla al cajón a paralelo, peso muerto rumano, empuje de cadera, subidas a cajón bajo.")),
            AssistPoint(bold: Loc("Left out:", "Quedan fuera:"), text: Loc("lunges and deep knee bends, because she flagged knee pain.", "las zancadas y flexiones profundas de rodilla, porque reportó dolor."))
        ],
        table: [
            AssistTableRow(week: Loc("Week 1", "Semana 1"), sets: "3 × 10", intensity: Loc("Easy (RPE 7)", "Suave (RPE 7)")),
            AssistTableRow(week: Loc("Week 2", "Semana 2"), sets: "3 × 10", intensity: "RPE 7.5"),
            AssistTableRow(week: Loc("Week 3", "Semana 3"), sets: "4 × 8", intensity: Loc("Hard (RPE 8)", "Fuerte (RPE 8)")),
            AssistTableRow(week: Loc("Week 4", "Semana 4"), sets: Loc("Deload", "Descarga"), intensity: "RPE 6")
        ],
        foot: Loc("Knee pain is outside what I can assess. She should still see a physio before heavier loading.", "El dolor de rodilla está fuera de lo que puedo evaluar. Igual debe ver a un fisioterapeuta antes de subir el peso."),
        say: Loc("Done. I built a four-week lower-body block around Maya’s knee: no lunges or deep knee bends, box squats to parallel, and a deload in week four. She should still see a physio before heavier loading.",
                 "Listo. Armé un bloque de cuatro semanas para el tren inferior de Maya pensando en su rodilla: sin zancadas ni flexiones profundas, sentadilla al cajón a paralelo y descarga en la semana cuatro. Igual debe ver a un fisioterapeuta antes de subir el peso."),
        card: ActionCardTemplate(
            kind: .program,
            label: Loc("Add “Knee-friendly Lower Body” to Maya’s plan", "Agregar “Tren inferior cuidando la rodilla” al plan de Maya"),
            sub: Loc("Saved as a draft. Maya only sees it after you publish.", "Se guarda como borrador. Maya solo lo ve cuando lo publiques."),
            button: Loc("Add as draft", "Agregar como borrador"),
            doneText: Loc("Added to Maya’s plan as a draft", "Agregado al plan de Maya como borrador"),
            ask: Loc("Should I add it to her plan as a draft?", "¿Lo agrego a su plan como borrador?"),
            doneSay: Loc("Added as a draft. She’ll see it after you publish.", "Agregado como borrador. Lo verá cuando lo publiques.")
        )
    )
}
