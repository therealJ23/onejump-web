import Foundation

/// Sample data for the client app preview (Maya Chen, coached by Alex Rivera).
/// In production this comes from the client API in API.md.
enum ClientData {

    // MARK: Targets

    static let kcalTarget: Double = 1650
    static let proteinTarget: Double = 130
    static let carbsTarget: Double = 160
    static let fatTarget: Double = 55
    static let goalWeight: Double = 145

    // MARK: Today's workout ("Upper Body A")

    static let workout: [WorkoutExercise] = [
        WorkoutExercise(name: Loc("Dumbbell bench press", "Press de banca con mancuernas"), target: "3 × 10", rest: 60,
                        cue: Loc("Shoulder blades back. Lower to your chest with control.", "Omóplatos atrás. Baja al pecho con control."),
                        sets: 3, weight: 30, reps: 10, last: "30 lb × 10",
                        swaps: [Loc("Push-up", "Lagartija"), Loc("Machine chest press", "Press de pecho en máquina")]),
        WorkoutExercise(name: Loc("Seated cable row", "Remo sentado en polea"), target: "3 × 12", rest: 60,
                        cue: Loc("Pull your shoulders down first, then drive your elbows back.", "Baja primero los hombros y luego lleva los codos atrás."),
                        sets: 3, weight: 75, reps: 12, last: "70 lb × 12",
                        swaps: [Loc("Dumbbell row", "Remo con mancuerna"), Loc("Band row", "Remo con banda")]),
        WorkoutExercise(name: Loc("Dumbbell shoulder press", "Press de hombro con mancuernas"), target: "3 × 10", rest: 60,
                        cue: Loc("Ribs down. Press straight up without arching your back.", "Costillas abajo. Empuja recto hacia arriba sin arquear la espalda."),
                        sets: 3, weight: 20, reps: 10, last: "20 lb × 10",
                        swaps: [Loc("Landmine press", "Press landmine"), Loc("Machine shoulder press", "Press de hombro en máquina")]),
        WorkoutExercise(name: Loc("Lat pulldown", "Jalón al pecho"), target: "3 × 12", rest: 60,
                        cue: Loc("Chest up. Pull the bar to your collarbone.", "Pecho arriba. Lleva la barra a la clavícula."),
                        sets: 3, weight: 80, reps: 12, last: "80 lb × 11",
                        swaps: [Loc("Assisted pull-up", "Dominada asistida"), Loc("Band pulldown", "Jalón con banda")]),
        WorkoutExercise(name: Loc("Cable face pull", "Face pull en polea"), target: "2 × 15", rest: 45,
                        cue: Loc("Pull toward your forehead with elbows high. Squeeze your upper back.", "Jala hacia la frente con los codos altos. Aprieta la espalda alta."),
                        sets: 2, weight: 30, reps: 15, last: "27.5 lb × 15",
                        swaps: [Loc("Band pull-apart", "Apertura con banda")]),
        WorkoutExercise(name: Loc("Plank", "Plancha"), target: Loc("3 × 40 sec", "3 × 40 s"), rest: 30,
                        cue: Loc("Squeeze your glutes. Straight line from head to heels.", "Aprieta los glúteos. Línea recta de la cabeza a los talones."),
                        sets: 3, weight: 0, reps: 40, isTimed: true, last: Loc("35 sec", "35 s"),
                        swaps: [Loc("Dead bug", "Bicho muerto")])
    ]

    /// Best weight so far per exercise index, to spot new personal bests.
    static let bestWeight: [Int: Double] = [0: 30, 1: 75, 3: 80]

    // MARK: Food

    static let mealsToday: [Meal: [FoodItem]] = [
        .breakfast: [
            FoodItem(name: Loc("Greek yogurt with berries", "Yogur griego con frutos rojos"), quantity: Loc("1 bowl", "1 tazón"), kcal: 210, protein: 18, carbs: 24, fat: 4),
            FoodItem(name: Loc("Coffee with milk", "Café con leche"), quantity: Loc("1 cup", "1 taza"), kcal: 40, protein: 2, carbs: 4, fat: 2)
        ],
        .lunch: [
            FoodItem(name: Loc("Chicken salad bowl", "Bowl de ensalada con pollo"), quantity: Loc("1 bowl", "1 tazón"), kcal: 480, protein: 38, carbs: 30, fat: 20)
        ],
        .snacks: [
            FoodItem(name: Loc("Protein shake", "Batido de proteína"), quantity: Loc("1 scoop with water", "1 medida con agua"), kcal: 120, protein: 24, carbs: 3, fat: 1)
        ],
        .dinner: []
    ]

    static let mealsYesterday: [Meal: [FoodItem]] = [
        .breakfast: [FoodItem(name: Loc("Oatmeal with banana", "Avena con guineo"), quantity: Loc("1 bowl", "1 tazón"), kcal: 320, protein: 10, carbs: 58, fat: 6)],
        .lunch: [FoodItem(name: Loc("Turkey wrap", "Wrap de pavo"), quantity: Loc("1 wrap", "1 wrap"), kcal: 430, protein: 32, carbs: 38, fat: 14)],
        .snacks: [FoodItem(name: Loc("Apple with peanut butter", "Manzana con mantequilla de maní"), quantity: Loc("1 apple + 1 tbsp", "1 manzana + 1 cda"), kcal: 190, protein: 4, carbs: 26, fat: 8)],
        .dinner: [FoodItem(name: Loc("Salmon, rice and broccoli", "Salmón, arroz y brócoli"), quantity: Loc("1 plate", "1 plato"), kcal: 560, protein: 46, carbs: 52, fat: 16)]
    ]

    private static let fromPhoto = Loc("From your photo · USDA", "De tu foto · USDA")
    private static let fromVoice = Loc("From what you said · USDA", "De lo que dijiste · USDA")
    static let fromSearch = Loc("Search · USDA FoodData Central", "Búsqueda · USDA FoodData Central")

    static let photoItems: [FoodItem] = [
        FoodItem(name: Loc("Grilled salmon", "Salmón a la plancha"), quantity: "5 oz", kcal: 290, protein: 39, carbs: 0, fat: 14, source: fromPhoto),
        FoodItem(name: Loc("White rice", "Arroz blanco"), quantity: Loc("1 cup", "1 taza"), kcal: 205, protein: 4, carbs: 45, fat: 0, source: fromPhoto),
        FoodItem(name: Loc("Roasted broccoli", "Brócoli asado"), quantity: Loc("1 cup", "1 taza"), kcal: 55, protein: 4, carbs: 11, fat: 1, source: fromPhoto)
    ]

    static let voiceItems: [FoodItem] = [
        FoodItem(name: Loc("Grilled salmon", "Salmón a la plancha"), quantity: "5 oz", kcal: 290, protein: 39, carbs: 0, fat: 14, source: fromVoice),
        FoodItem(name: Loc("White rice", "Arroz blanco"), quantity: Loc("1 cup", "1 taza"), kcal: 205, protein: 4, carbs: 45, fat: 0, source: fromVoice),
        FoodItem(name: Loc("Broccoli", "Brócoli"), quantity: Loc("1 cup", "1 taza"), kcal: 55, protein: 4, carbs: 11, fat: 1, source: fromVoice)
    ]

    static let barcodeItems: [FoodItem] = [
        FoodItem(name: Loc("Protein bar, chocolate chip", "Barra de proteína, chispas de chocolate"), quantity: Loc("1 bar (60 g)", "1 barra (60 g)"),
                 kcal: 200, protein: 20, carbs: 22, fat: 7, source: Loc("Barcode · Open Food Facts", "Código · Open Food Facts"))
    ]

    static let foods: [FoodItem] = [
        FoodItem(name: Loc("Chicken breast, grilled", "Pechuga de pollo a la plancha"), quantity: "4 oz", kcal: 187, protein: 35, carbs: 0, fat: 4),
        FoodItem(name: Loc("Egg, whole, large", "Huevo entero grande"), quantity: Loc("1 egg", "1 huevo"), kcal: 72, protein: 6, carbs: 0, fat: 5),
        FoodItem(name: Loc("Oatmeal, cooked", "Avena cocida"), quantity: Loc("1 cup", "1 taza"), kcal: 166, protein: 6, carbs: 28, fat: 4),
        FoodItem(name: Loc("Banana, medium", "Guineo mediano"), quantity: Loc("1 banana", "1 guineo"), kcal: 105, protein: 1, carbs: 27, fat: 0),
        FoodItem(name: Loc("Avocado", "Aguacate"), quantity: Loc("half", "medio"), kcal: 120, protein: 2, carbs: 6, fat: 11),
        FoodItem(name: Loc("Sweet potato, baked", "Batata al horno"), quantity: Loc("1 medium", "1 mediana"), kcal: 103, protein: 2, carbs: 24, fat: 0),
        FoodItem(name: Loc("Salmon, cooked", "Salmón cocido"), quantity: "4 oz", kcal: 233, protein: 25, carbs: 0, fat: 14),
        FoodItem(name: Loc("Greek yogurt, plain nonfat", "Yogur griego natural sin grasa"), quantity: "170 g", kcal: 100, protein: 17, carbs: 6, fat: 1),
        FoodItem(name: Loc("Brown rice, cooked", "Arroz integral cocido"), quantity: Loc("1 cup", "1 taza"), kcal: 218, protein: 5, carbs: 46, fat: 2),
        FoodItem(name: Loc("Almonds", "Almendras"), quantity: "1 oz", kcal: 164, protein: 6, carbs: 6, fat: 14),
        FoodItem(name: Loc("Cottage cheese, low fat", "Queso cottage bajo en grasa"), quantity: Loc("1 cup", "1 taza"), kcal: 163, protein: 28, carbs: 6, fat: 2),
        FoodItem(name: Loc("Turkey breast, sliced", "Pechuga de pavo en lonjas"), quantity: "3 oz", kcal: 90, protein: 18, carbs: 2, fat: 1)
    ]

    static let favorites: [FoodItem] = [
        FoodItem(name: Loc("Protein shake", "Batido de proteína"), quantity: Loc("1 scoop with water", "1 medida con agua"), kcal: 120, protein: 24, carbs: 3, fat: 1),
        FoodItem(name: Loc("Greek yogurt bowl", "Bowl de yogur griego"), quantity: Loc("1 bowl", "1 tazón"), kcal: 210, protein: 18, carbs: 24, fat: 4),
        FoodItem(name: Loc("Chicken and rice", "Pollo con arroz"), quantity: Loc("1 plate", "1 plato"), kcal: 520, protein: 42, carbs: 55, fat: 10)
    ]

    // MARK: Habits and progress

    static let habits: [Habit] = [
        Habit(id: "steps", title: Loc("8,000 steps", "8,000 pasos"), detail: Loc("6,240 so far · from Apple Health", "6,240 hasta ahora · de Apple Salud")),
        Habit(id: "water", title: Loc("Drink 3 L of water", "Tomar 3 L de agua")),
        Habit(id: "sleep", title: Loc("7+ hours of sleep", "Dormir 7+ horas"), detail: Loc("7 h 10 min last night", "7 h 10 min anoche")),
        Habit(id: "protein", title: Loc("Protein at every meal", "Proteína en cada comida"), detail: Loc("3 of 3 meals so far", "3 de 3 comidas hasta ahora"))
    ]

    static let weight: [WeightRange: WeightSeries] = [
        .oneMonth: WeightSeries(values: [154.8, 154.5, 154.0, 153.6, 153.3, 152.9, 152.6, 152.4], start: Loc("Sep 13", "13 sep")),
        .threeMonths: WeightSeries(values: [159.2, 158.4, 157.5, 156.6, 155.7, 154.6, 153.4, 152.4], start: Loc("Aug 25", "25 ago")),
        .all: WeightSeries(values: [159.2, 158.9, 158.4, 157.6, 156.8, 155.9, 155.0, 154.0, 153.1, 152.4], start: Loc("Aug 25", "25 ago"))
    ]

    static let records: [ClientRecord] = [
        ClientRecord(name: Loc("Hip thrust", "Empuje de cadera"), value: "185 lb", date: Loc("Oct 12", "12 oct"), isNew: true),
        ClientRecord(name: Loc("Romanian deadlift", "Peso muerto rumano"), value: "135 lb", date: Loc("Oct 5", "5 oct")),
        ClientRecord(name: Loc("Lat pulldown", "Jalón al pecho"), value: "80 lb", date: Loc("Sep 30", "30 sep")),
        ClientRecord(name: Loc("Box squat", "Sentadilla al cajón"), value: "115 lb", date: Loc("Sep 28", "28 sep"))
    ]

    static let measureNames: [Loc] = [Loc("Waist", "Cintura"), Loc("Hips", "Cadera"), Loc("Chest", "Pecho"), Loc("Arm", "Brazo")]
    static let measureChanges: [Loc] = ["−1.5 in", "−1.0 in", "−0.5 in", Loc("steady", "estable")]
    static let photoDates: [Loc] = [Loc("Oct 11", "11 oct"), Loc("Sep 13", "13 sep"), Loc("Aug 16", "16 ago")]

    // MARK: Coach chat

    static let chat: [ChatMessage] = [
        ChatMessage(fromMe: false,
                    text: Loc("Great week, Maya! 3 for 3 and down another 1.2 lb. Let’s swap lunges for step-ups for now, and please get the knee checked by a physio before we load it heavier.",
                              "¡Gran semana, Maya! 3 de 3 y bajaste otras 1.2 lb. Por ahora cambiemos las zancadas por subidas al cajón, y por favor que un fisioterapeuta revise la rodilla antes de subir el peso."),
                    original: "Great week, Maya! 3 for 3 and down another 1.2 lb. Let’s swap lunges for step-ups for now, and please get the knee checked by a physio before we load it heavier.",
                    time: Loc("Mon 9:15 AM", "Lun 9:15 a. m.")),
        ChatMessage(fromMe: true,
                    text: Loc("Thanks! I booked a physio for Thursday. Step-ups felt way better on the knee.",
                              "¡Gracias! Agendé fisioterapia para el jueves. Las subidas al cajón se sintieron mucho mejor en la rodilla."),
                    time: Loc("Mon 6:02 PM", "Lun 6:02 p. m."), isVoice: true, duration: "0:18"),
        ChatMessage(fromMe: false,
                    text: Loc("Perfect. Go up 5 lb on bench today if the last set feels easy.", "Perfecto. Hoy sube 5 lb en el press si la última serie se siente fácil."),
                    original: "Perfect. Go up 5 lb on bench today if the last set feels easy.",
                    time: Loc("8:40 AM", "8:40 a. m."))
    ]

    static let quickAsks: [Loc] = [
        Loc("Can I swap an exercise?", "¿Puedo cambiar un ejercicio?"),
        Loc("Can I move a workout?", "¿Puedo mover un entrenamiento?"),
        Loc("Question about food", "Pregunta sobre comida")
    ]

    // MARK: Booking

    static let slotDays: [Loc] = [Loc("Thursday, Oct 15", "Jueves, 15 de oct"), Loc("Friday, Oct 16", "Viernes, 16 de oct"), Loc("Saturday, Oct 17", "Sábado, 17 de oct")]
    static let slotDaysShort: [Loc] = [Loc("Thursday", "Jueves"), Loc("Friday", "Viernes"), Loc("Saturday", "Sábado")]
    static let slotTimes: [[Loc]] = [
        [Loc("7:00 AM", "7:00 a. m."), Loc("12:30 PM", "12:30 p. m."), Loc("5:30 PM", "5:30 p. m.")],
        [Loc("7:00 AM", "7:00 a. m."), Loc("11:00 AM", "11:00 a. m."), Loc("6:00 PM", "6:00 p. m.")],
        [Loc("9:00 AM", "9:00 a. m."), Loc("10:30 AM", "10:30 a. m."), Loc("12:00 PM", "12:00 p. m.")]
    ]

    // MARK: Check-in

    static let scales: [CheckInScale] = [
        CheckInScale(id: "sleep", label: Loc("How did you sleep?", "¿Cómo dormiste?"),
                     options: [Loc("Poor", "Mal"), Loc("Fair", "Regular"), Loc("OK", "Bien"), Loc("Good", "Muy bien"), Loc("Great", "Excelente")]),
        CheckInScale(id: "energy", label: Loc("Energy", "Energía"),
                     options: [Loc("Very low", "Muy baja"), Loc("Low", "Baja"), Loc("OK", "Normal"), Loc("Good", "Buena"), Loc("High", "Alta")]),
        CheckInScale(id: "stress", label: Loc("Stress", "Estrés"),
                     options: [Loc("Very low", "Muy bajo"), Loc("Low", "Bajo"), Loc("Some", "Algo"), Loc("High", "Alto"), Loc("Very high", "Muy alto")]),
        CheckInScale(id: "sore", label: Loc("Soreness", "Dolor muscular"),
                     options: [Loc("None", "Nada"), Loc("A little", "Poco"), Loc("Some", "Algo"), Loc("Sore", "Bastante"), Loc("Very sore", "Mucho")])
    ]

    static let nutritionOptions: [Loc] = [Loc("Mostly", "Casi siempre"), Loc("Sometimes", "A veces"), Loc("Not really", "No mucho")]

    // MARK: Reminders

    static let reminders: [ToggleSetting] = [
        ToggleSetting(id: "workout", name: Loc("Workout reminder", "Recordatorio de entrenamiento"), detail: Loc("Workout days at 6:30 AM", "Días de entrenamiento a las 6:30 a. m.")),
        ToggleSetting(id: "meals", name: Loc("Log your meals", "Registra tus comidas"), detail: Loc("A nudge at 1 PM and 8 PM", "Un aviso a la 1 p. m. y a las 8 p. m.")),
        ToggleSetting(id: "checkin", name: Loc("Weekly check-in", "Revisión semanal"), detail: Loc("Sundays at 6 PM", "Domingos a las 6 p. m."))
    ]

    // MARK: What the preview "hears" when the device can't listen

    static let sayFood = Loc("Grilled salmon, a cup of rice, and some broccoli", "Salmón a la plancha, una taza de arroz y un poco de brócoli")
    static let sayNote = Loc("Knee feels a lot better. Step-ups were easy and I hit all my workouts.", "La rodilla se siente mucho mejor. Las subidas al cajón fueron fáciles y cumplí todos mis entrenamientos.")
    static let sayVoiceNote = Loc("Quick question. Can I move Friday’s workout to Saturday this week?", "Una pregunta rápida. ¿Puedo mover el entrenamiento del viernes al sábado esta semana?")
}
