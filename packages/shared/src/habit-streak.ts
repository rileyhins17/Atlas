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
