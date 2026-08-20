import type { ExerciseDTO } from '@atlas/shared';

/** Stable "no data yet" identity — see the note in CalendarPanel. */
export const NO_EXERCISES: ExerciseDTO[] = [];

/** Minutes elapsed, rendered as the running clock a session needs. */
export function elapsed(startedAt: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}
