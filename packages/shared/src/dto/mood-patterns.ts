import { z } from 'zod';

/**
 * What your good days have in common.
 *
 * This is the one thing Atlas can do that no single-purpose app can. A habit
 * tracker knows you trained. A journal knows you felt like a 2. Only something
 * holding both can notice that your 2s cluster on the days you did not.
 *
 * It is deliberately NOT an AI feature. A model asked "why is he down?" will
 * always produce a confident sentence, and there is no way to tell a real
 * pattern from a fluent one. Counting is checkable; the model can narrate the
 * numbers later if it likes.
 *
 * WHAT THIS IS NOT: causation. "Your mood averaged 4.1 on days you trained and
 * 3.2 on days you did not" is a fact about a fortnight. "Training makes you
 * happy" is a claim this data cannot support — the arrow may point the other
 * way, and probably does at least half the time. Every string this file
 * produces is phrased as the observation, never the explanation.
 */

/** One day, reduced to a mood and a set of yes/no facts about it. */
export interface MoodDay {
  /** Local day key — the caller decides the timezone, this only groups by it. */
  dayKey: string;
  /** 1..5. */
  mood: number;
  /** Whatever the caller could establish about that day. */
  factors: Record<string, boolean>;
}

export interface MoodContrast {
  factor: string;
  /** Mean mood on days where the factor was true. */
  withMean: number;
  withoutMean: number;
  withDays: number;
  withoutDays: number;
  /** withMean − withoutMean, rounded. Positive means better with. */
  delta: number;
}

/**
 * Days of mood history before any comparison is worth making. Two weeks is
 * enough to have both kinds of day in it without being a season.
 */
export const MIN_DAYS_FOR_PATTERNS = 14;

/**
 * A factor needs this many days on BOTH sides. Without it, one glorious Tuesday
 * becomes "your mood is 1.8 higher when you train" — which is not a finding, it
 * is a Tuesday.
 */
export const MIN_DAYS_PER_SIDE = 5;

/**
 * The gap that counts as worth mentioning, on a 1–5 scale.
 *
 * Half a point is deliberately blunt. Anything smaller is inside the noise of
 * how people use a five-point scale at all — the difference between a 3 and a 4
 * is mostly mood about mood — and a product that reports it will be confidently
 * wrong in public, which is worse than saying nothing.
 */
export const MIN_DELTA = 0.5;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Every factor that clears the bars, strongest contrast first.
 *
 * Returns an empty array rather than a weak answer. Days are de-duplicated by
 * `dayKey` — two moods logged on one day would otherwise let a single day vote
 * twice, and the day someone logs twice is not a random day.
 */
export function findMoodContrasts(days: MoodDay[]): MoodContrast[] {
  const byDay = new Map<string, MoodDay>();
  for (const d of days) {
    if (!Number.isFinite(d.mood) || d.mood < 1 || d.mood > 5) continue;
    // Last write wins: a corrected mood is the one that counts.
    byDay.set(d.dayKey, d);
  }
  const unique = [...byDay.values()];
  if (unique.length < MIN_DAYS_FOR_PATTERNS) return [];

  const factors = new Set<string>();
  for (const d of unique) for (const k of Object.keys(d.factors)) factors.add(k);

  const out: MoodContrast[] = [];
  for (const factor of factors) {
    const withIt: number[] = [];
    const without: number[] = [];
    for (const d of unique) {
      // A day that never reported this factor is not evidence either way.
      if (!(factor in d.factors)) continue;
      (d.factors[factor] ? withIt : without).push(d.mood);
    }
    if (withIt.length < MIN_DAYS_PER_SIDE || without.length < MIN_DAYS_PER_SIDE) continue;

    const withMean = mean(withIt);
    const withoutMean = mean(without);
    const delta = round1(withMean - withoutMean);
    if (Math.abs(delta) < MIN_DELTA) continue;

    out.push({
      factor,
      withMean: round1(withMean),
      withoutMean: round1(withoutMean),
      withDays: withIt.length,
      withoutDays: without.length,
      delta,
    });
  }

  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * One sentence, in the user's words, stating the observation and nothing more.
 *
 * `labels` maps a factor key to how it reads in a sentence — "you trained",
 * "you kept every habit" — so the phrasing lives with the caller that knows
 * what the factor meant.
 */
export function describeMoodContrast(
  contrast: MoodContrast,
  labels: Record<string, string>,
): string {
  const what = labels[contrast.factor] ?? contrast.factor;
  const better = contrast.delta > 0;
  const high = better ? contrast.withMean : contrast.withoutMean;
  const low = better ? contrast.withoutMean : contrast.withMean;
  const days = better ? contrast.withDays : contrast.withoutDays;
  const other = better ? contrast.withoutDays : contrast.withDays;
  return better
    ? `On the ${days} days ${what}, your mood averaged ${high} — against ${low} on the other ${other}.`
    : `On the ${other} days ${what}, your mood averaged ${low} — against ${high} on the other ${days}.`;
}

/**
 * The facts Atlas can establish about a day without asking.
 *
 * Each is a by-product of using the app, so the comparison costs the user
 * nothing beyond the one mood tap. A domain someone does not use simply never
 * reaches MIN_DAYS_PER_SIDE and drops out on its own — no special-casing.
 *
 * The label is the clause that follows "the N days …", so it reads as an
 * observation about days rather than a verdict about the person.
 */
export const MOOD_FACTORS = {
  trained: 'you trained',
  keptAHabit: 'you kept a habit',
  finishedTasks: 'you finished something on your list',
  packedDay: 'your calendar had four or more things on it',
} as const;

export type MoodFactor = keyof typeof MOOD_FACTORS;

/** A day counts as "packed" at this many timed events. */
export const PACKED_DAY_EVENTS = 4;

export const MoodPatternDTO = z.object({
  factor: z.string(),
  /** The already-rendered sentence — one implementation, server-side. */
  line: z.string(),
  withMean: z.number(),
  withoutMean: z.number(),
  withDays: z.number().int(),
  withoutDays: z.number().int(),
  delta: z.number(),
});
export type MoodPatternDTO = z.infer<typeof MoodPatternDTO>;

export const MoodPatternsDTO = z.object({
  /** Days with a mood logged in the window — what the answer rests on. */
  daysLogged: z.number().int(),
  /** Days needed before anything is reported, so the UI can say how far off it is. */
  daysNeeded: z.number().int(),
  patterns: z.array(MoodPatternDTO),
});
export type MoodPatternsDTO = z.infer<typeof MoodPatternsDTO>;
