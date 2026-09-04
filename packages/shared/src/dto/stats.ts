import { z } from 'zod';

/** Query for the cross-domain stats rollup. */
export const StatsQuery = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
});
export type StatsQuery = z.infer<typeof StatsQuery>;

/** One local day's activity across every domain. */
export const StatsDayDTO = z.object({
  day: z.string(), // YYYY-MM-DD in the user's timezone
  tasksCompleted: z.number().int(),
  habitChecks: z.number().int(),
  /** Average mood 1–5 for the day, null when nothing was journaled. */
  moodAvg: z.number().nullable(),
  /** Journal entries written. Counted separately from mood: an entry with no
   *  mood is still something you did that day. */
  journalEntries: z.number().int(),
  /** Money out (positive number of minor units) and money in. */
  spentMinor: z.number().int(),
  earnedMinor: z.number().int(),
  /** Finished training sessions, and their working-set volume in grams. */
  workouts: z.number().int(),
  volumeGrams: z.number().int(),
  /**
   * Rows Atlas wrote to its own timeline that day.
   *
   * NOT a measure of how much you did, and it must never be used as one. It
   * counts log entries, so a feature that writes one row per sync instead of
   * one per item makes a busy day look empty — which is exactly how the page
   * once showed "your long arc starts now" to an account with ninety days of
   * history. `dayActivity` in lib/progress.ts is the honest count.
   */
  events: z.number().int(),
});
export type StatsDayDTO = z.infer<typeof StatsDayDTO>;

export const PeriodTotalsDTO = z.object({
  tasksCompleted: z.number().int(),
  habitChecks: z.number().int(),
  moodAvg: z.number().nullable(),
  journalEntries: z.number().int(),
  spentMinor: z.number().int(),
  earnedMinor: z.number().int(),
  workouts: z.number().int(),
  volumeGrams: z.number().int(),
  events: z.number().int(),
});
export type PeriodTotalsDTO = z.infer<typeof PeriodTotalsDTO>;

/** The rollup: the requested window day-by-day, plus totals for it and the window before it (delta chips). */
export const StatsDTO = z.object({
  days: z.array(StatsDayDTO),
  totals: z.object({ current: PeriodTotalsDTO, previous: PeriodTotalsDTO }),
});
export type StatsDTO = z.infer<typeof StatsDTO>;
