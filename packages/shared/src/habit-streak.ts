import type { HabitDTO } from './dto/habit.js';

/** UTC day key (YYYY-MM-DD) for grouping habit logs. */
export function utcHabitDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Consecutive days (ending today or yesterday) whose total value met `target`. */
export function computeHabitStreak(perDay: Map<string, number>, target: number, now: Date): number {
  let streak = 0;
  const cursor = new Date(now);
  // If today isn't done yet, start counting from yesterday so an in-progress day
  // doesn't break an existing streak.
  if ((perDay.get(utcHabitDayKey(cursor)) ?? 0) < target) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while ((perDay.get(utcHabitDayKey(cursor)) ?? 0) >= target) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** Predict one pending check-in; the server remains authoritative on settlement. */
export function optimisticHabitCheckIn(habit: Pick<HabitDTO, 'todayCount' | 'target' | 'doneToday' | 'streak'>) {
  const todayCount = habit.todayCount + 1;
  const doneToday = todayCount >= habit.target;
  return {
    todayCount,
    doneToday,
    streak: habit.streak + (doneToday && !habit.doneToday ? 1 : 0),
  };
}
