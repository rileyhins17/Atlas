/** UTC day key (YYYY-MM-DD) for grouping habit logs. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Consecutive days (ending today or yesterday) whose total value met `target`. */
export function computeStreak(perDay: Map<string, number>, target: number): number {
  let streak = 0;
  const cursor = new Date();
  // If today isn't done yet, start counting from yesterday so an in-progress day
  // doesn't break an existing streak.
  if ((perDay.get(dayKey(cursor)) ?? 0) < target) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while ((perDay.get(dayKey(cursor)) ?? 0) >= target) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
