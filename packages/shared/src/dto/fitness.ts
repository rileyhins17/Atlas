import { z } from 'zod';

/**
 * Fitness DTOs.
 *
 * Weight is carried in **grams** and never as a float. A kg/lb float
 * accumulates rounding error the moment you sum volume across a session, and
 * plate maths (2.5 kg / 1.25 kg) has to stay exact. The UI converts at the
 * edge; everything inside Atlas is integer grams. Duration is seconds and
 * distance is metres for the same reason.
 */

/** What a set of this movement is actually measured in. */
export const ExerciseKind = z.enum(['weight_reps', 'reps', 'duration', 'distance']);
export type ExerciseKind = z.infer<typeof ExerciseKind>;

export const MuscleGroup = z.enum([
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'core',
  'other',
]);
export type MuscleGroup = z.infer<typeof MuscleGroup>;

export const CreateExerciseInput = z.object({
  name: z.string().min(1).max(120),
  muscle: MuscleGroup.default('other'),
  kind: ExerciseKind.default('weight_reps'),
});
export type CreateExerciseInput = z.infer<typeof CreateExerciseInput>;

export const ExerciseDTO = z.object({
  id: z.string(),
  name: z.string(),
  muscle: MuscleGroup,
  kind: ExerciseKind,
  /** False for the shared seeded catalog, true for the user's own additions. */
  custom: z.boolean(),
});
export type ExerciseDTO = z.infer<typeof ExerciseDTO>;

export const LogSetInput = z
  .object({
    exerciseId: z.string().min(1),
    // 500 kg ceiling: high enough for any real lift, low enough that a slipped
    // decimal is rejected rather than silently poisoning a volume total.
    weightGrams: z.number().int().min(0).max(500_000).optional(),
    reps: z.number().int().min(0).max(1_000).optional(),
    durationSec: z.number().int().min(0).max(86_400).optional(),
    distanceM: z.number().int().min(0).max(1_000_000).optional(),
    warmup: z.boolean().default(false),
  })
  .refine(
    (v) =>
      v.weightGrams !== undefined ||
      v.reps !== undefined ||
      v.durationSec !== undefined ||
      v.distanceM !== undefined,
    { message: 'a set must record at least one measurement' },
  );
export type LogSetInput = z.infer<typeof LogSetInput>;

export const WorkoutSetDTO = z.object({
  id: z.string(),
  exerciseId: z.string(),
  exerciseName: z.string(),
  kind: ExerciseKind,
  position: z.number().int(),
  weightGrams: z.number().int().nullable(),
  reps: z.number().int().nullable(),
  durationSec: z.number().int().nullable(),
  distanceM: z.number().int().nullable(),
  warmup: z.boolean(),
  completedAt: z.string(),
});
export type WorkoutSetDTO = z.infer<typeof WorkoutSetDTO>;

export const StartWorkoutInput = z.object({
  title: z.string().min(1).max(200).optional(),
});
export type StartWorkoutInput = z.infer<typeof StartWorkoutInput>;

export const FinishWorkoutInput = z.object({
  notes: z.string().max(5_000).optional(),
});
export type FinishWorkoutInput = z.infer<typeof FinishWorkoutInput>;

export const WorkoutDTO = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  startedAt: z.string(),
  /** Null means the session is still open — this is the one you resume. */
  endedAt: z.string().nullable(),
  sets: z.array(WorkoutSetDTO),
  /** Sum of weight × reps over working sets only, in grams. */
  volumeGrams: z.number().int(),
  /** Working sets (warm-ups excluded), which is what "3 sets" means to a lifter. */
  workingSets: z.number().int(),
});
export type WorkoutDTO = z.infer<typeof WorkoutDTO>;

/**
 * What the user did last time on this movement. The single most useful thing a
 * training app can put on screen: you are trying to beat this, and without it
 * you are guessing.
 */
export const LastPerformanceDTO = z.object({
  exerciseId: z.string(),
  performedAt: z.string(),
  sets: z.array(
    z.object({
      weightGrams: z.number().int().nullable(),
      reps: z.number().int().nullable(),
      durationSec: z.number().int().nullable(),
      distanceM: z.number().int().nullable(),
    }),
  ),
  /** Heaviest working set ever recorded for this movement, in grams. */
  bestWeightGrams: z.number().int().nullable(),
});
export type LastPerformanceDTO = z.infer<typeof LastPerformanceDTO>;
