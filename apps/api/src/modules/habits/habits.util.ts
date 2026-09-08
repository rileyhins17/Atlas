import { computeHabitStreak } from '@atlas/shared';
export { utcHabitDayKey as dayKey } from '@atlas/shared';

/** The API owns the clock; shared owns the calendar calculation. */
export function computeStreak(perDay: Map<string, number>, target: number): number {
  return computeHabitStreak(perDay, target, new Date());
}
