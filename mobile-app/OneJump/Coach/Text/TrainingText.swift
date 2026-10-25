import Foundation

/// Text for building programs and workouts and for the exercise library (live business),
/// in English and Spanish.
enum TT {
    // MARK: Programs
    static let newProgram = Loc("New program", "Programa nuevo")
    static let programName = Loc("Program name", "Nombre del programa")
    static let programNamePlaceholder = Loc("e.g. Strength Base", "p. ej. Base de fuerza")
    static let weeks = Loc("Weeks", "Semanas")
    static let daysPerWeek = Loc("Days a week", "Días por semana")
    static let level = Loc("Level", "Nivel")
    static let description = Loc("Description (optional)", "Descripción (opcional)")
    static let createProgram = Loc("Create program", "Crear programa")
    static let creating = Loc("Creating…", "Creando…")
    static let cancel = Loc("Cancel", "Cancelar")
    static let save = Loc("Save", "Guardar")
    static let saving = Loc("Saving…", "Guardando…")
    static let delete = Loc("Delete", "Borrar")
    static let deleteProgram = Loc("Delete program", "Borrar programa")
    static let deleteWorkout = Loc("Delete workout", "Borrar entrenamiento")
    static let addWorkout = Loc("Add workout", "Agregar entrenamiento")
    static let workouts = Loc("Workouts", "Entrenamientos")
    static let noWorkouts = Loc("No workouts yet", "Aún no hay entrenamientos")
    static let noWorkoutsBody = Loc("Add one for each training day.", "Agrega uno por cada día de entrenamiento.")
    static let noPrograms = Loc("No programs yet", "Aún no tienes programas")
    static let noProgramsBody = Loc("Tap New program, or ask Assist to build one.", "Toca Programa nuevo o pídele a Assist que cree uno.")
    static let emptyName = Loc("Give it a name first.", "Primero ponle un nombre.")
    static func programCreated(_ name: String) -> Loc { Loc("\(name) is ready. Add exercises to each day.", "\(name) está listo. Agrega ejercicios a cada día.") }
    static func programDeleted(_ name: String) -> Loc { Loc("\(name) is deleted.", "\(name) está borrado.") }
    static func deleteProgramAsk(_ name: String) -> Loc { Loc("Delete \(name)?", "¿Borrar \(name)?") }
    static let deleteProgramBody = Loc("It disappears from your programs. Workouts clients already logged stay in their history.", "Desaparece de tus programas. Los entrenamientos que tus clientes ya registraron se quedan en su historial.")
    static func deleteWorkoutAsk(_ name: String) -> Loc { Loc("Delete \(name)?", "¿Borrar \(name)?") }
    static func workoutMeta(_ exercises: Int, _ sets: Int, _ minutes: Int?) -> Loc {
        let m = minutes.map { " · \($0) min" } ?? ""
        return Loc("\(exercises) exercise\(exercises == 1 ? "" : "s") · \(sets) set\(sets == 1 ? "" : "s")\(m)", "\(exercises) ejercicio\(exercises == 1 ? "" : "s") · \(sets) serie\(sets == 1 ? "" : "s")\(m)")
    }
    static func dayN(_ n: Int) -> Loc { Loc("Day \(n)", "Día \(n)") }
    struct Level: Hashable { let value: String; let label: Loc }
    static let levels: [Level] = [
        Level(value: "Beginner", label: Loc("Beginner", "Principiante")),
        Level(value: "Intermediate", label: Loc("Intermediate", "Intermedio")),
        Level(value: "Advanced", label: Loc("Advanced", "Avanzado"))
    ]

    // MARK: Workout editor
    static let workoutName = Loc("Workout name", "Nombre del entrenamiento")
    static let addExercise = Loc("Add exercise", "Agregar ejercicio")
    static let noExercises = Loc("No exercises yet", "Aún no hay ejercicios")
    static let noExercisesBody = Loc("Tap Add exercise to pick from your library.", "Toca Agregar ejercicio para elegir de tu biblioteca.")
    static let sets = Loc("Sets", "Series")
    static let reps = Loc("Reps", "Repeticiones")
    static let rest = Loc("Rest (sec)", "Descanso (seg)")
    static let remove = Loc("Remove", "Quitar")
    static let saved = Loc("Saved.", "Guardado.")
    static let unsaved = Loc("Unsaved changes", "Cambios sin guardar")
    static let fewer = Loc("Fewer sets", "Menos series")
    static let more = Loc("More sets", "Más series")
    static let removedExercise = Loc("Removed exercise", "Ejercicio quitado")
    static let pickExercise = Loc("Pick an exercise", "Elige un ejercicio")
    static let buildWithAssist = Loc("Build this workout with Assist", "Crear este entrenamiento con Assist")
    static func buildWorkoutAsk(_ workout: String, _ program: String) -> Loc {
        Loc("Build the \(workout) workout in my \(program) program", "Crea el entrenamiento \(workout) de mi programa \(program)")
    }

    // MARK: Exercise library
    static let addOwnExercise = Loc("Add your own exercise", "Agrega tu propio ejercicio")
    static let newExercise = Loc("New exercise", "Ejercicio nuevo")
    static let exerciseName = Loc("Exercise name", "Nombre del ejercicio")
    static let exerciseNamePlaceholder = Loc("e.g. Banded hip thrust", "p. ej. Hip thrust con banda")
    static let muscleGroup = Loc("Muscle group", "Grupo muscular")
    static let equipment = Loc("Equipment", "Equipo")
    static let equipmentPlaceholder = Loc("Bodyweight, dumbbell, band…", "Peso corporal, mancuerna, banda…")
    static let instructions = Loc("How to do it (one cue per line)", "Cómo hacerlo (una indicación por línea)")
    static let photoOrVideo = Loc("Demo video", "Video de demostración")
    static let addPhotoOrVideo = Loc("Pick a video", "Elegir un video")
    static let recordVideo = Loc("Record a video", "Grabar un video")
    static let videoOnlyNote = Loc("Show the movement in a short video (up to 90 seconds).", "Muestra el movimiento en un video corto (hasta 90 segundos).")
    static let changePhotoOrVideo = Loc("Change video", "Cambiar video")
    static let removeMedia = Loc("Remove video", "Quitar video")
    static let preparingVideo = Loc("Preparing the video…", "Preparando el video…")
    static let uploading = Loc("Uploading…", "Subiendo…")
    static let videoReady = Loc("Video ready", "Video listo")
    static let photoReady = Loc("Photo ready", "Foto lista")
    static let addExerciseButton = Loc("Add to library", "Agregar a la biblioteca")
    static func exerciseAdded(_ name: String) -> Loc { Loc("\(name) is in your library.", "\(name) ya está en tu biblioteca.") }
    static func deleteExerciseAsk(_ name: String) -> Loc { Loc("Delete \(name)?", "¿Borrar \(name)?") }
    static let deleteOwnBody = Loc("Your exercise is deleted. If a workout still uses it, it’s only hidden so the workout keeps working.", "Tu ejercicio se borra. Si un entrenamiento todavía lo usa, solo se oculta para que el entrenamiento siga funcionando.")
    static let deleteSharedBody = Loc("It’s removed from your library. Workouts that use it keep working.", "Se quita de tu biblioteca. Los entrenamientos que lo usan siguen funcionando.")
    static let deleteExercise = Loc("Delete exercise", "Borrar ejercicio")
    static let yours = Loc("Yours", "Tuyo")
    static let hasVideo = Loc("Video", "Video")
    static let hasPhoto = Loc("Photo", "Foto")
    static let noMedia = Loc("No video yet", "Aún sin video")
    static let videoTooBig = Loc("That video is too long to upload. Pick one under about a minute.", "Ese video es muy largo para subirlo. Elige uno de menos de un minuto.")
    static let couldntReadMedia = Loc("Couldn’t open that video. Try another one.", "No se pudo abrir ese video. Prueba con otro.")
    static let mediaSaved = Loc("Video saved.", "Video guardado.")
    static let equipmentChoices: [Loc] = [
        Loc("Bodyweight", "Peso corporal"), Loc("Dumbbell", "Mancuerna"), Loc("Barbell", "Barra"),
        Loc("Kettlebell", "Pesa rusa"), Loc("Band", "Banda"), Loc("Cable", "Polea"), Loc("Machine", "Máquina")
    ]
}
