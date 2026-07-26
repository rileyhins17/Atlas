import type { ExerciseKind, MuscleGroup } from '@atlas/shared';

/**
 * The starter catalog, seeded once with `userId = null` so every account shares
 * it. Deliberately small — roughly the movements that cover most training — so
 * the picker stays scannable. Anything missing is one "add exercise" away, and
 * a user's own additions are scoped to them.
 */
export interface CatalogEntry {
  name: string;
  muscle: MuscleGroup;
  kind: ExerciseKind;
}

export const EXERCISE_CATALOG: CatalogEntry[] = [
  // Chest
  { name: 'Bench Press (Barbell)', muscle: 'chest', kind: 'weight_reps' },
  { name: 'Bench Press (Dumbbell)', muscle: 'chest', kind: 'weight_reps' },
  { name: 'Incline Bench Press (Barbell)', muscle: 'chest', kind: 'weight_reps' },
  { name: 'Incline Bench Press (Dumbbell)', muscle: 'chest', kind: 'weight_reps' },
  { name: 'Chest Press (Machine)', muscle: 'chest', kind: 'weight_reps' },
  { name: 'Chest Fly (Cable)', muscle: 'chest', kind: 'weight_reps' },
  { name: 'Close-Grip Bench Press (Barbell)', muscle: 'chest', kind: 'weight_reps' },
  { name: 'Push Up', muscle: 'chest', kind: 'reps' },

  // Back
  { name: 'Deadlift (Barbell)', muscle: 'back', kind: 'weight_reps' },
  { name: 'Barbell Row', muscle: 'back', kind: 'weight_reps' },
  { name: 'Lat Pulldown (Cable)', muscle: 'back', kind: 'weight_reps' },
  { name: 'Seated Row (Cable)', muscle: 'back', kind: 'weight_reps' },
  { name: 'Pull Up', muscle: 'back', kind: 'reps' },
  { name: 'Chest-Supported Row (Machine)', muscle: 'back', kind: 'weight_reps' },
  { name: 'Dumbbell Row', muscle: 'back', kind: 'weight_reps' },
  { name: 'Straight-Arm Pulldown (Cable)', muscle: 'back', kind: 'weight_reps' },

  // Legs
  { name: 'Squat (Barbell)', muscle: 'legs', kind: 'weight_reps' },
  { name: 'Front Squat (Barbell)', muscle: 'legs', kind: 'weight_reps' },
  { name: 'Romanian Deadlift (Barbell)', muscle: 'legs', kind: 'weight_reps' },
  { name: 'Leg Press', muscle: 'legs', kind: 'weight_reps' },
  { name: 'Leg Curl (Machine)', muscle: 'legs', kind: 'weight_reps' },
  { name: 'Walking Lunge (Dumbbell)', muscle: 'legs', kind: 'weight_reps' },
  { name: 'Calf Raise (Machine)', muscle: 'legs', kind: 'weight_reps' },
  { name: 'Leg Extension (Machine)', muscle: 'legs', kind: 'weight_reps' },
  { name: 'Hip Thrust (Barbell)', muscle: 'legs', kind: 'weight_reps' },
  { name: 'Bulgarian Split Squat (Dumbbell)', muscle: 'legs', kind: 'weight_reps' },
  { name: 'Romanian Deadlift (Dumbbell)', muscle: 'legs', kind: 'weight_reps' },

  // Shoulders
  { name: 'Overhead Press (Barbell)', muscle: 'shoulders', kind: 'weight_reps' },
  { name: 'Shoulder Press (Dumbbell)', muscle: 'shoulders', kind: 'weight_reps' },
  { name: 'Lateral Raise (Dumbbell)', muscle: 'shoulders', kind: 'weight_reps' },
  { name: 'Face Pull (Cable)', muscle: 'shoulders', kind: 'weight_reps' },
  { name: 'Rear Delt Fly (Dumbbell)', muscle: 'shoulders', kind: 'weight_reps' },
  { name: 'Shrug (Dumbbell)', muscle: 'shoulders', kind: 'weight_reps' },

  // Arms
  { name: 'Bicep Curl (Dumbbell)', muscle: 'arms', kind: 'weight_reps' },
  { name: 'Hammer Curl (Dumbbell)', muscle: 'arms', kind: 'weight_reps' },
  { name: 'Tricep Pushdown (Cable)', muscle: 'arms', kind: 'weight_reps' },
  { name: 'Skull Crusher (Barbell)', muscle: 'arms', kind: 'weight_reps' },
  { name: 'Dip', muscle: 'arms', kind: 'reps' },
  { name: 'Preacher Curl (EZ-Bar)', muscle: 'arms', kind: 'weight_reps' },
  { name: 'Overhead Tricep Extension (Dumbbell)', muscle: 'arms', kind: 'weight_reps' },
  { name: 'Cable Curl', muscle: 'arms', kind: 'weight_reps' },

  // Core
  { name: 'Plank', muscle: 'core', kind: 'duration' },
  { name: 'Hanging Leg Raise', muscle: 'core', kind: 'reps' },
  { name: 'Cable Crunch', muscle: 'core', kind: 'weight_reps' },

  // Conditioning
  { name: 'Run', muscle: 'other', kind: 'distance' },
  { name: 'Row (Machine)', muscle: 'other', kind: 'distance' },
  { name: 'Cycling', muscle: 'other', kind: 'distance' },
];
