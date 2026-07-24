import type { PeriodTotalsDTO, StatsDayDTO, StatsDTO } from '@atlas/shared';

/**
 * Pure assembly for the stats rollup — unit-tested without a DB. The SQL side
 * hands over per-metric per-local-day rows spanning BOTH the current window and
 * the one before it; this zero-fills the current window and splits totals on
 * the boundary.
 */

export type StatsMetric = 'tasks' | 'habits' | 'mood' | 'spent' | 'earned' | 'events';

export interface MetricRow {
  metric: StatsMetric;
  /** YYYY-MM-DD in the user's timezone. */
  day: string;
  value: number;
}

function emptyDay(day: string): StatsDayDTO {
  return { day, tasksCompleted: 0, habitChecks: 0, moodAvg: null, spentMinor: 0, earnedMinor: 0, events: 0 };
}

function emptyTotals(): PeriodTotalsDTO {
  return { tasksCompleted: 0, habitChecks: 0, moodAvg: null, spentMinor: 0, earnedMinor: 0, events: 0 };
}

/** ISO day-key sequence [from, from+days) — plain date math on Y-M-D parts. */
export function dayKeys(fromDay: string, days: number): string[] {
  const [y, m, d] = fromDay.split('-').map(Number);
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(y!, m! - 1, d!));
  for (let i = 0; i < days; i++) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function apply(target: StatsDayDTO | PeriodTotalsDTO, metric: StatsMetric, value: number, moodAcc?: { sum: number; n: number }) {
  switch (metric) {
    case 'tasks':
      target.tasksCompleted += value;
      break;
    case 'habits':
      target.habitChecks += value;
      break;
    case 'spent':
      target.spentMinor += value;
      break;
    case 'earned':
      target.earnedMinor += value;
      break;
    case 'events':
      target.events += value;
      break;
    case 'mood':
      if (moodAcc) {
        moodAcc.sum += value;
        moodAcc.n += 1;
      }
      break;
  }
}

export function assembleStats(rows: MetricRow[], currentFromDay: string, days: number): StatsDTO {
  const keys = dayKeys(currentFromDay, days);
  const byDay = new Map<string, StatsDayDTO>(keys.map((k) => [k, emptyDay(k)]));

  const current = emptyTotals();
  const previous = emptyTotals();
  const moodCur = { sum: 0, n: 0 };
  const moodPrev = { sum: 0, n: 0 };

  for (const row of rows) {
    const inCurrent = row.day >= currentFromDay;
    const totals = inCurrent ? current : previous;
    const moodAcc = inCurrent ? moodCur : moodPrev;
    apply(totals, row.metric, row.value, moodAcc);

    if (inCurrent) {
      const dayRow = byDay.get(row.day);
      if (dayRow) {
        if (row.metric === 'mood') dayRow.moodAvg = row.value;
        else apply(dayRow, row.metric, row.value);
      }
    }
  }

  current.moodAvg = moodCur.n > 0 ? moodCur.sum / moodCur.n : null;
  previous.moodAvg = moodPrev.n > 0 ? moodPrev.sum / moodPrev.n : null;

  return { days: keys.map((k) => byDay.get(k)!), totals: { current, previous } };
}
