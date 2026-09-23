import type { HabitDTO, TaskDTO, WorkoutDTO } from '@atlas/shared';
import { addDays, startOfDay } from './dates';

export interface WeekGlance {
  tasksDone: number;
  workouts: number;
  /** The longest current streak across habits; 0 with none going. */
  bestStreak: number;
}

/**
 * The last seven local days at a glance, for the top of "You": today and the
 * six before it, stepped by calendar day so a DST week is still seven days.
 * Only finished workouts count — an open session is not a workout yet.
 */
export function weekAtAGlance(
  tasks: Pick<TaskDTO, 'status' | 'completedAt'>[],
  workouts: Pick<WorkoutDTO, 'endedAt'>[],
  habits: Pick<HabitDTO, 'streak'>[],
  now: Date,
): WeekGlance {
  const since = startOfDay(addDays(now, -6)).getTime();
  const within = (iso: string | null) => iso !== null && new Date(iso).getTime() >= since;
  return {
    tasksDone: tasks.filter((t) => t.status === 'DONE' && within(t.completedAt)).length,
    workouts: workouts.filter((w) => within(w.endedAt)).length,
    bestStreak: habits.reduce((best, h) => Math.max(best, h.streak), 0),
  };
}
