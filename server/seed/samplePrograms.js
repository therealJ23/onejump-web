// Sample programs a coach can start from (Programs → "Start from a sample"). Nothing is added to a
// coach's list until they pick one; then it's copied in as an ordinary program they can change.
// Every exercise name here is in OneJump's global library (server/seed/exercises.js).
// Item: [exercise, sets, reps, rest seconds, section?, superset letter?]
const W = (name, day, items, minutes) => ({ name, day, minutes, items });
const warm = [['Cat-cow', 1, '8', '0', 'warmup'], ['World’s greatest stretch', 1, '5 each side', '0', 'warmup']];

export const SAMPLE_PROGRAMS = [
  {
    key: 'full-body-beginner', name: 'Full body foundations', level: 'Beginner', weeks: 6, daysPerWeek: 3, pattern: 'squat',
    description: 'Three full-body days a week for new lifters: learn the main movements, build the habit, add weight slowly.',
    workouts: [
      W('Full body A', 1, [...warm, ['Goblet squat', 3, '10', '90'], ['Dumbbell bench press', 3, '10', '90'], ['One-arm dumbbell row', 3, '10 each', '60'], ['Glute bridge', 3, '12', '60'], ['Plank', 3, '30 s', '45']], 45),
      W('Full body B', 3, [...warm, ['Dumbbell RDL', 3, '10', '90'], ['Seated dumbbell press', 3, '10', '90'], ['Lat pulldown', 3, '10', '60'], ['Reverse lunge', 3, '8 each', '60'], ['Dead bug', 3, '8 each', '45']], 45),
      W('Full body C', 5, [...warm, ['Leg press', 3, '12', '90'], ['Push-up', 3, '8–12', '60'], ['Seated cable row', 3, '12', '60'], ['Step-up', 3, '8 each', '60'], ['Farmer carry', 3, '30 m', '60']], 45),
    ],
  },
  {
    key: 'upper-lower', name: 'Upper / lower strength', level: 'Intermediate', weeks: 8, daysPerWeek: 4, pattern: 'push',
    description: 'Four days: two upper, two lower. Heavy compound lifts first, then accessories. Good for steady strength and muscle.',
    workouts: [
      W('Upper 1 (heavy)', 1, [['Band pull-apart', 2, '15', '0', 'warmup'], ['Bench press', 4, '5', '150'], ['Barbell row', 4, '6', '120'], ['Overhead press', 3, '8', '90'], ['Lat pulldown', 3, '10', '75'], ['Dumbbell curl', 2, '12', '45', 'main', 'A'], ['Rope pushdown', 2, '12', '45', 'main', 'A']], 60),
      W('Lower 1 (heavy)', 2, [['Hip flexor stretch', 1, '30 s each', '0', 'warmup'], ['Back squat', 4, '5', '150'], ['Romanian deadlift', 3, '8', '120'], ['Walking lunge', 3, '10 each', '75'], ['Leg curl', 3, '12', '60'], ['Calf raise', 3, '15', '45']], 60),
      W('Upper 2 (volume)', 4, [['Band pull-apart', 2, '15', '0', 'warmup'], ['Incline dumbbell press', 4, '10', '90'], ['Chest-supported row', 4, '10', '90'], ['Arnold press', 3, '12', '60'], ['Face pull', 3, '15', '45', 'main', 'A'], ['Lateral raise', 3, '15', '45', 'main', 'A']], 55),
      W('Lower 2 (volume)', 5, [['Hip flexor stretch', 1, '30 s each', '0', 'warmup'], ['Trap bar deadlift', 4, '6', '150'], ['Bulgarian split squat', 3, '10 each', '90'], ['Hip thrust', 3, '10', '75'], ['Leg extension', 3, '15', '60'], ['Hanging knee raise', 3, '12', '45']], 55),
    ],
  },
  {
    key: 'push-pull-legs', name: 'Push / pull / legs', level: 'Intermediate', weeks: 8, daysPerWeek: 3, pattern: 'pull',
    description: 'The classic three-day split for building muscle. Run it once a week, or twice for six days.',
    workouts: [
      W('Push', 1, [['Incline push-up', 2, '10', '0', 'warmup'], ['Bench press', 4, '6–8', '120'], ['Seated dumbbell press', 3, '10', '90'], ['Incline dumbbell press', 3, '10', '75'], ['Cable fly', 3, '12', '60'], ['Lateral raise', 3, '15', '45', 'main', 'A'], ['Overhead triceps extension', 3, '12', '45', 'main', 'A']], 60),
      W('Pull', 3, [['Band pull-apart', 2, '15', '0', 'warmup'], ['Pull-up', 4, '6–10', '120'], ['Barbell row', 3, '8', '90'], ['Seated cable row', 3, '10', '75'], ['Face pull', 3, '15', '45'], ['Hammer curl', 3, '12', '45', 'main', 'A'], ['EZ-bar curl', 3, '10', '45', 'main', 'A']], 60),
      W('Legs', 5, [['Bodyweight squat', 2, '10', '0', 'warmup'], ['Back squat', 4, '6–8', '150'], ['Romanian deadlift', 3, '8–10', '120'], ['Leg press', 3, '12', '90'], ['Leg curl', 3, '12', '60'], ['Seated calf raise', 4, '15', '45']], 60),
    ],
  },
  {
    key: 'home-dumbbells', name: 'Home dumbbell plan', level: 'Beginner', weeks: 6, daysPerWeek: 3, pattern: 'lunge',
    description: 'Only a pair of dumbbells and a little floor space. Circuits keep it to about 35 minutes.',
    workouts: [
      W('Home A', 1, [['Bodyweight squat', 1, '15', '0', 'warmup'], ['Goblet squat', 3, '12', '30', 'main', 'A'], ['Push-up', 3, '10', '30', 'main', 'A'], ['One-arm dumbbell row', 3, '10 each', '60', 'main', 'A'], ['Glute bridge', 3, '15', '30', 'main', 'B'], ['Dead bug', 3, '8 each', '60', 'main', 'B']], 35),
      W('Home B', 3, [['Cat-cow', 1, '8', '0', 'warmup'], ['Dumbbell RDL', 3, '12', '30', 'main', 'A'], ['Seated dumbbell press', 3, '10', '30', 'main', 'A'], ['Reverse lunge', 3, '8 each', '60', 'main', 'A'], ['Dumbbell fly', 3, '12', '30', 'main', 'B'], ['Side plank', 3, '30 s each', '60', 'main', 'B']], 35),
      W('Home C', 5, [['World’s greatest stretch', 1, '5 each side', '0', 'warmup'], ['Bulgarian split squat', 3, '8 each', '30', 'main', 'A'], ['Dumbbell bench press', 3, '10', '30', 'main', 'A'], ['Hammer curl', 3, '12', '60', 'main', 'A'], ['Suitcase carry', 3, '30 m each', '30', 'main', 'B'], ['Russian twist', 3, '20', '60', 'main', 'B']], 35),
    ],
  },
  {
    key: 'fat-loss-conditioning', name: 'Fat loss: strength + conditioning', level: 'Beginner', weeks: 8, daysPerWeek: 4, pattern: 'cardio',
    description: 'Two strength days to keep muscle and two conditioning days to burn more. Pair it with a nutrition plan.',
    workouts: [
      W('Strength 1', 1, [...warm, ['Goblet squat', 3, '10', '75'], ['Dumbbell bench press', 3, '10', '75'], ['Lat pulldown', 3, '12', '60'], ['Hip thrust', 3, '12', '60'], ['Farmer carry', 3, '30 m', '60']], 45),
      W('Conditioning 1', 2, [['Jump rope', 1, '3 min', '0', 'warmup'], ['Kettlebell swing', 4, '15', '30', 'main', 'A'], ['Medicine ball slam', 4, '10', '30', 'main', 'A'], ['Bike intervals', 6, '30 s hard / 90 s easy', '0'], ['Couch stretch', 1, '45 s each', '0', 'cooldown']], 35),
      W('Strength 2', 4, [...warm, ['Dumbbell RDL', 3, '10', '75'], ['Seated dumbbell press', 3, '10', '75'], ['Seated cable row', 3, '12', '60'], ['Reverse lunge', 3, '10 each', '60'], ['Plank', 3, '40 s', '45']], 45),
      W('Conditioning 2', 6, [['Jump rope', 1, '3 min', '0', 'warmup'], ['Rower intervals', 5, '250 m', '60'], ['Battle ropes', 4, '30 s', '30', 'main', 'A'], ['Bear crawl', 4, '20 m', '30', 'main', 'A'], ['Incline walk', 1, '15 min', '0', 'cooldown']], 40),
    ],
  },
  {
    key: 'glute-focus', name: 'Lower body & glutes', level: 'Intermediate', weeks: 8, daysPerWeek: 3, pattern: 'hinge',
    description: 'Three days with glute work every session plus enough upper body to stay balanced.',
    workouts: [
      W('Glutes + hamstrings', 1, [['Banded lateral walk', 2, '15 each', '0', 'warmup'], ['Hip thrust', 4, '8–10', '120'], ['Romanian deadlift', 3, '10', '90'], ['Bulgarian split squat', 3, '10 each', '75'], ['Leg curl', 3, '12', '60'], ['Hip abduction', 3, '20', '45']], 55),
      W('Upper body', 3, [['Band pull-apart', 2, '15', '0', 'warmup'], ['Incline dumbbell press', 3, '10', '90'], ['Lat pulldown', 3, '10', '75'], ['Seated dumbbell press', 3, '10', '75'], ['Face pull', 3, '15', '45', 'main', 'A'], ['Dumbbell curl', 3, '12', '45', 'main', 'A']], 45),
      W('Glutes + quads', 5, [['Frog pump', 2, '20', '0', 'warmup'], ['Sumo deadlift', 4, '6', '150'], ['Goblet squat', 3, '12', '75'], ['Step-up', 3, '10 each', '60'], ['Cable pull-through', 3, '15', '60'], ['Single-leg hip thrust', 2, '12 each', '45']], 55),
    ],
  },
];

/** The sample as Assist's create_program would take it (exercise names resolved later). */
export const sampleByKey = key => SAMPLE_PROGRAMS.find(p => p.key === key) || null;
