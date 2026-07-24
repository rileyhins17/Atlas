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
  /** Money out (positive number of minor units) and money in. */
  spentMinor: z.number().int(),
  earnedMinor: z.number().int(),
  /** Timeline events — overall activity. */
  events: z.number().int(),
});
export type StatsDayDTO = z.infer<typeof StatsDayDTO>;

export const PeriodTotalsDTO = z.object({
  tasksCompleted: z.number().int(),
  habitChecks: z.number().int(),
  moodAvg: z.number().nullable(),
  spentMinor: z.number().int(),
  earnedMinor: z.number().int(),
  events: z.number().int(),
});
export type PeriodTotalsDTO = z.infer<typeof PeriodTotalsDTO>;

/** The rollup: the requested window day-by-day, plus totals for it and the window before it (delta chips). */
export const StatsDTO = z.object({
  days: z.array(StatsDayDTO),
  totals: z.object({ current: PeriodTotalsDTO, previous: PeriodTotalsDTO }),
});
export type StatsDTO = z.infer<typeof StatsDTO>;
