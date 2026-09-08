import { elapsedWorkoutLabel } from '@atlas/shared';
import type { ExerciseDTO } from '@atlas/shared';

/** Stable "no data yet" identity — see the note in CalendarPanel. */
export const NO_EXERCISES: ExerciseDTO[] = [];

export function elapsed(startedAt: string): string {
  return elapsedWorkoutLabel(startedAt, Date.now());
}
