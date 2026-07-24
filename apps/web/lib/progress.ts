import type { StatsDayDTO } from '@atlas/shared';

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

/** Count of each mood value 1–5 across the window, for the distribution bar. */
export function moodDistribution(days: StatsDayDTO[]): number[] {
  const buckets = [0, 0, 0, 0, 0];
  for (const d of days) {
    if (d.moodAvg === null) continue;
    const rounded = Math.min(5, Math.max(1, Math.round(d.moodAvg)));
    buckets[rounded - 1]! += 1;
  }
  return buckets;
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
