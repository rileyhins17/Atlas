import { shiftDayKey } from '../../core/time.js';

/**
 * Consecutive LOCAL days, ending today or yesterday, whose total met `target`.
 *
 * `perDay` and `todayKey` must be keyed by the user's own calendar day. They
 * used to be UTC keys, so for a user in Toronto the day rolled over at 8pm:
 * an evening check-in counted towards tomorrow, and a habit done that morning
 * read "not yet today" for the rest of the evening.
 */
export function computeStreak(
  perDay: Map<string, number>,
  target: number,
  todayKey: string,
): number {
  let key = todayKey;
  // If today isn't done yet, start counting from yesterday so an in-progress day
  // doesn't break an existing streak.
  if ((perDay.get(key) ?? 0) < target) key = shiftDayKey(key, -1);
  let streak = 0;
  while ((perDay.get(key) ?? 0) >= target) {
    streak += 1;
    key = shiftDayKey(key, -1);
  }
  return streak;
}
