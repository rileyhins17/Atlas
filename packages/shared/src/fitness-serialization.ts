import type { ExerciseDTO, ExerciseKind, MuscleGroup, MuscleTarget, Equipment, WorkoutDTO, WorkoutSetDTO, WorkoutTemplateDTO } from './dto/fitness.js';
import { isSetType } from './dto/set-effort.js';
import { workoutVolumeGrams, countWorkingSets } from './dto/fitness-util.js';

export type ExerciseRecord = {
  id: string; name: string; muscle: string; target: string | null;
  equipment: string | null; kind: string; userId: string | null;
};
export type WorkoutRecord = {
  id: string; title: string; notes: string | null;
  startedAt: Date; endedAt: Date | null; templateId: string | null;
  sets: Parameters<typeof serializeWorkoutSet>[0][];
};
export type WorkoutTemplateRecord = {
  id: string; name: string; position: number; createdAt: Date;
  exercises: {
    exerciseId: string; position: number; supersetGroup: number | null;
    exercise: { name: string; muscle: string; kind: string };
  }[];
};

export function serializeExercise(e: ExerciseRecord): ExerciseDTO {
  return {
    id: e.id,
    name: e.name,
    muscle: e.muscle as MuscleGroup,
    // Null rather than a guess. A row written before these columns existed, or
    // a user's own addition, is genuinely unclassified — and the picker's
    // filters have to be able to say "not filed" rather than quietly filing it
    // somewhere wrong.
    target: (e.target as MuscleTarget | null) ?? null,
    equipment: (e.equipment as Equipment | null) ?? null,
    kind: e.kind as ExerciseKind,
    custom: e.userId !== null,
  };
}

/** One set row to its DTO. Shared so a set means the same thing on every screen. */
export function serializeWorkoutSet(s: {
  id: string;
  exerciseId: string;
  exercise: { name: string; kind: string };
  position: number;
  weightGrams: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  warmup: boolean;
  setType: string;
  rpe: number | null;
  completedAt: Date;
}): WorkoutSetDTO {
  return {
    id: s.id,
    exerciseId: s.exerciseId,
    exerciseName: s.exercise.name,
    kind: s.exercise.kind as ExerciseKind,
    position: s.position,
    weightGrams: s.weightGrams,
    reps: s.reps,
    durationSec: s.durationSec,
    distanceM: s.distanceM,
    warmup: s.warmup,
    setType: isSetType(s.setType) ? s.setType : 'normal',
    rpe: s.rpe,
    completedAt: s.completedAt.toISOString(),
  };
}

export function serializeWorkout(w: WorkoutRecord): WorkoutDTO {
  const sets: WorkoutSetDTO[] = w.sets.map(serializeWorkoutSet);
  return {
    id: w.id,
    title: w.title,
    notes: w.notes,
    startedAt: w.startedAt.toISOString(),
    endedAt: w.endedAt?.toISOString() ?? null,
    sets,
    volumeGrams: workoutVolumeGrams(sets),
    workingSets: countWorkingSets(sets),
    templateId: w.templateId,
  };
}

export function serializeWorkoutTemplate(row: WorkoutTemplateRecord, lastPerformedAt: Date | null): WorkoutTemplateDTO {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    exercises: row.exercises.map((te) => ({
      exerciseId: te.exerciseId,
      name: te.exercise.name,
      muscle: te.exercise.muscle as WorkoutTemplateDTO['exercises'][number]['muscle'],
      kind: te.exercise.kind as WorkoutTemplateDTO['exercises'][number]['kind'],
      position: te.position,
      supersetGroup: te.supersetGroup,
    })),
    lastPerformedAt: lastPerformedAt ? lastPerformedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

