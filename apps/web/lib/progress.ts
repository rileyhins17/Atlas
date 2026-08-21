import type { StatsDayDTO, StatsDTO } from '@atlas/shared';

/**
 * Pure helpers for the Progress page — unit-tested. Deltas compare the current
 * window's total to the previous window's; weekly buckets feed the trend
 * sparklines.
 */

export interface Delta {
  /** Percent change vs the previous window; null when previous was zero. */
  pct: number | null;
  direction: 'up' | 'down' | 'flat' | 'new';
}

export function delta(current: number, previous: number): Delta {
  if (previous === 0) {
    return { pct: null, direction: current > 0 ? 'new' : 'flat' };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct, direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

/**
 * Sum a per-day metric into week buckets, oldest → newest, anchored to the END
 * of the window (the last bucket is the most recent ≤7 days).
 */
export function weeklyBuckets(days: StatsDayDTO[], pick: (d: StatsDayDTO) => number): number[] {
  const buckets: number[] = [];
  for (let end = days.length; end > 0; end -= 7) {
    const start = Math.max(0, end - 7);
    buckets.unshift(days.slice(start, end).reduce((sum, d) => sum + pick(d), 0));
  }
  return buckets;
}

/** Per-day mood series with journal-less days carried as the previous value (a readable line, not sawteeth to zero). */
export function moodSeries(days: StatsDayDTO[]): number[] {
  const points: number[] = [];
  let last: number | null = null;
  for (const d of days) {
    if (d.moodAvg !== null) last = d.moodAvg;
    if (last !== null) points.push(last);
  }
  return points;
}

// Money formatting lives in lib/money.ts — re-exported here so Progress
// components import their helpers from one place.
export { formatMinorCompact } from './money';

/**
 * One habit's shape over a window: how often it was actually met, and the
 * per-week pulse. A 12-week grid of squares told you a habit existed; a rate
 * and a line tell you whether it's holding.
 */
export function habitRhythm(
  days: { day: string; count: number }[],
  target: number,
  window: number,
): { rate: number; weekly: number[] } {
  const goal = Math.max(1, target);
  const recent = days.slice(-window);
  const met = recent.filter((d) => d.count >= goal).length;
  const rate = window === 0 ? 0 : met / window;
  const weekly: number[] = [];
  for (let end = recent.length; end > 0; end -= 7) {
    const start = Math.max(0, end - 7);
    weekly.unshift(recent.slice(start, end).reduce((sum, d) => sum + d.count, 0));
  }
  return { rate, weekly };
}

/**
 * Split an AI review into short bullets, keeping any `**bold**` lead intact.
 * The prompt asks for bullets, but a model will occasionally answer in prose —
 * falling back to sentence splitting means the card is never a wall of text.
 */
export function reviewBullets(body: string): string[] {
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;
  // One blob: break it on sentence ends instead.
  return (lines[0] ?? '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The day with the most activity in the window — the period's headline. */
export function bestDay(days: StatsDayDTO[]): StatsDayDTO | null {
  let best: StatsDayDTO | null = null;
  for (const d of days) {
    if (d.events > 0 && (!best || d.events > best.events)) best = d;
  }
  return best;
}

/**
 * Share of days in the window with at least one habit check-in, as a percent.
 * A blunt but honest "am I actually keeping this up?" number.
 */
export function habitConsistency(days: StatsDayDTO[]): number {
  if (days.length === 0) return 0;
  const hit = days.filter((d) => d.habitChecks > 0).length;
  return Math.round((hit / days.length) * 100);
}

/**
 * Does this window contain anything at all? The Progress page's empty state
 * turns on it, and so does `deriveProgress` — one definition so the page cannot
 * decide it is empty and then render charts, or the reverse.
 */
export function hasActivity(days: StatsDayDTO[]): boolean {
  return days.some((d) => d.events > 0);
}

/** Everything the Progress page plots, derived from one stats response. */
export interface ProgressDerived {
  /** Day key → event count, for the activity heatmap. */
  counts: Map<string, number>;
  tasksWeekly: number[];
  volumeWeekly: number[];
  habitsWeekly: number[];
  /** Earned minus spent, per week. Signed — the only series here that can go below zero. */
  netWeekly: number[];
  mood: number[];
  best: StatsDayDTO | null;
  consistency: number;
  /** Cards that would otherwise plot a flat line of zeros only appear once their domain has data. */
  hasMoney: boolean;
  hasTraining: boolean;
  anyActivity: boolean;
}

/**
 * The whole Progress page's arithmetic, in one pure function.
 *
 * It was a `useMemo` inside the panel, which meant the numbers on the page —
 * the ones a person makes decisions about their week from — could only be
 * checked by rendering it. Out here each of them is a test.
 */
export function deriveProgress(data: StatsDTO): ProgressDerived {
  const { days, totals } = data;
  return {
    counts: new Map<string, number>(days.map((d) => [d.day, d.events])),
    tasksWeekly: weeklyBuckets(days, (d) => d.tasksCompleted),
    volumeWeekly: weeklyBuckets(days, (d) => Math.round(d.volumeGrams / 1000)),
    habitsWeekly: weeklyBuckets(days, (d) => d.habitChecks),
    netWeekly: weeklyBuckets(days, (d) => d.earnedMinor - d.spentMinor),
    mood: moodSeries(days),
    best: bestDay(days),
    consistency: habitConsistency(days),
    hasMoney: days.some((d) => d.spentMinor > 0 || d.earnedMinor > 0),
    hasTraining: totals.current.workouts > 0 || totals.previous.workouts > 0,
    anyActivity: hasActivity(days),
  };
}
