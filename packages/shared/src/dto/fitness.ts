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

/**
 * The coarse grouping, unchanged.
 *
 * It is what the muscle-balance chart is built on and what every existing row
 * already stores, so it stays exactly as it was. It is also too blunt to search
 * with: "legs" is quads, hamstrings, glutes, calves, adductors AND abductors,
 * which is why someone looking for a hip abduction machine could not find one.
 * That is what `MuscleTarget` below is for.
 */
export const MuscleGroup = z.enum([
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'core',
  'cardio',
  'other',
]);
export type MuscleGroup = z.infer<typeof MuscleGroup>;

/**
 * The specific muscle a movement is for.
 *
 * Finer than the group and deliberately the vocabulary people actually use when
 * they think about training — you do not plan "an arms day", you plan to hit
 * long-head triceps. Nullable on the record, because a user's own additions
 * need not be classified before they can be logged.
 */
export const MuscleTarget = z.enum([
  // Chest
  'upper_chest',
  'mid_chest',
  'lower_chest',
  // Back
  'lats',
  'upper_back',
  'traps',
  'lower_back',
  'rear_delts',
  // Shoulders
  'front_delts',
  'side_delts',
  'rotator_cuff',
  // Arms
  'biceps',
  'triceps',
  'forearms',
  // Legs
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'adductors',
  'abductors',
  'hip_flexors',
  'tibialis',
  // Core
  'abs',
  'obliques',
  'lower_abs',
  // Other
  'neck',
  'full_body',
  'cardio',
  'other',
]);
export type MuscleTarget = z.infer<typeof MuscleTarget>;

/**
 * What you do the movement with.
 *
 * The other half of making a catalog searchable: "row" matches thirty things,
 * "dumbbell row" matches one. It is also the filter that matters in a gym where
 * the cable station is taken.
 */
export const Equipment = z.enum([
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
  'smith',
  'ez_bar',
  'trap_bar',
  'plate',
  'sled',
  'suspension',
  'medicine_ball',
  'cardio_machine',
  'other',
]);
export type Equipment = z.infer<typeof Equipment>;

export const CreateExerciseInput = z.object({
  name: z.string().min(1).max(120),
  muscle: MuscleGroup.default('other'),
  target: MuscleTarget.optional(),
  equipment: Equipment.optional(),
  kind: ExerciseKind.default('weight_reps'),
});
export type CreateExerciseInput = z.infer<typeof CreateExerciseInput>;

export const ExerciseDTO = z.object({
  id: z.string(),
  name: z.string(),
  muscle: MuscleGroup,
  /** Null on a user's own addition that was never classified. */
  target: MuscleTarget.nullable().default(null),
  equipment: Equipment.nullable().default(null),
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
  /** Start from a saved day — its movements load as empty blocks, ready to log. */
  templateId: z.string().min(1).max(64).optional(),
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
  /** The saved day this session came from, if any. */
  templateId: z.string().nullable(),
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

// ── Workout templates ─────────────────────────────────────────────────────
// A named day in the user's split ("Push", "Pull", "Legs"). The point is that
// mid-workout you should never scroll a 32-item catalog to find the movement
// you do every week.

export const TemplateExerciseDTO = z.object({
  exerciseId: z.string(),
  name: z.string(),
  muscle: MuscleGroup,
  kind: ExerciseKind,
  position: z.number().int(),
});
export type TemplateExerciseDTO = z.infer<typeof TemplateExerciseDTO>;

export const WorkoutTemplateDTO = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().int(),
  exercises: z.array(TemplateExerciseDTO),
  /** When this day was last trained, so the UI can suggest what is due. */
  lastPerformedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type WorkoutTemplateDTO = z.infer<typeof WorkoutTemplateDTO>;

// 30 movements is already a very long session; the cap stops a paste from
// turning one template into an unusable wall.
const templateExerciseIds = z.array(z.string().min(1).max(64)).max(30);

export const CreateWorkoutTemplateInput = z.object({
  name: z.string().min(1).max(60),
  exerciseIds: templateExerciseIds.default([]),
});
export type CreateWorkoutTemplateInput = z.infer<typeof CreateWorkoutTemplateInput>;

export const UpdateWorkoutTemplateInput = z.object({
  name: z.string().min(1).max(60).optional(),
  /** Replaces the whole list, in order. Omit to leave the exercises alone. */
  exerciseIds: templateExerciseIds.optional(),
  position: z.number().int().min(0).max(100).optional(),
});
export type UpdateWorkoutTemplateInput = z.infer<typeof UpdateWorkoutTemplateInput>;

/** Free text describing a split, e.g. "push: bench, incline db, lateral raises". */
export const PlanSplitInput = z.object({
  text: z.string().min(1).max(4_000),
});
export type PlanSplitInput = z.infer<typeof PlanSplitInput>;

/**
 * A proposed template. Nothing is written until the user accepts — same
 * "AI proposes, you accept" contract as Plan My Day.
 */
export const ProposedTemplateDTO = z.object({
  name: z.string(),
  exercises: z.array(
    z.object({
      exerciseId: z.string().nullable(),
      name: z.string(),
      /** How the movement was resolved, so the UI can be honest about guesses. */
      match: z.enum(['exact', 'fuzzy', 'new']),
    }),
  ),
});
export type ProposedTemplateDTO = z.infer<typeof ProposedTemplateDTO>;

export const PlanSplitResultDTO = z.object({
  templates: z.array(ProposedTemplateDTO),
  /** True when the AI was consulted; false when local matching handled it all. */
  usedAi: z.boolean(),
  note: z.string().nullable(),
});
export type PlanSplitResultDTO = z.infer<typeof PlanSplitResultDTO>;

/** Accepting a proposal. `exerciseId: null` means "create this movement". */
export const ApplySplitInput = z.object({
  templates: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        exercises: z
          .array(
            z.object({
              exerciseId: z.string().min(1).max(64).nullable(),
              name: z.string().min(1).max(120),
            }),
          )
          .max(30),
      }),
    )
    .min(1)
    .max(20),
});
export type ApplySplitInput = z.infer<typeof ApplySplitInput>;

