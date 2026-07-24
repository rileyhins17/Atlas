import { describe, expect, it } from 'vitest';
import type { StatsDayDTO } from '@atlas/shared';
import {
  bestDay,
  delta,
  habitConsistency,
  moodDistribution,
  moodSeries,
  weeklyBuckets,
} from '@/lib/progress';

const day = (over: Partial<StatsDayDTO>): StatsDayDTO => ({
  day: over.day ?? '2026-07-01',
  tasksCompleted: 0,
  habitChecks: 0,
  moodAvg: null,
  spentMinor: 0,
  earnedMinor: 0,
  events: 0,
  ...over,
});

describe('delta', () => {
  it('computes percent + direction vs the previous window', () => {
    expect(delta(120, 100)).toEqual({ pct: 20, direction: 'up' });
    expect(delta(80, 100)).toEqual({ pct: -20, direction: 'down' });
    expect(delta(100, 100)).toEqual({ pct: 0, direction: 'flat' });
  });
  it('marks brand-new activity (previous zero) rather than dividing by zero', () => {
    expect(delta(5, 0)).toEqual({ pct: null, direction: 'new' });
    expect(delta(0, 0)).toEqual({ pct: null, direction: 'flat' });
  });
});

describe('weeklyBuckets', () => {
  it('sums into 7-day buckets anchored to the most recent day', () => {
    // 14 days, tasksCompleted = 1 each → two buckets of 7.
    const days = Array.from({ length: 14 }, () => day({ tasksCompleted: 1 }));
    expect(weeklyBuckets(days, (d) => d.tasksCompleted)).toEqual([7, 7]);
  });
  it('a partial leading week stays its own (smaller) bucket', () => {
    const days = Array.from({ length: 10 }, () => day({ habitChecks: 2 }));
    expect(weeklyBuckets(days, (d) => d.habitChecks)).toEqual([6, 14]); // 3 days + 7 days
  });
});

describe('moodSeries', () => {
  it('carries the last mood across journal-less days for a readable line', () => {
    const days = [
      day({ moodAvg: 3 }),
      day({ moodAvg: null }),
      day({ moodAvg: 5 }),
      day({ moodAvg: null }),
    ];
    expect(moodSeries(days)).toEqual([3, 3, 5, 5]);
  });
  it('skips leading null days (nothing to carry yet)', () => {
    expect(moodSeries([day({ moodAvg: null }), day({ moodAvg: 4 })])).toEqual([4]);
  });
});


describe('moodDistribution', () => {
  it('counts days into 1–5 buckets, rounding averages and skipping blanks', () => {
    const days = [
      day({ moodAvg: 4.4 }), // → 4
      day({ moodAvg: 4.6 }), // → 5
      day({ moodAvg: null }), // skipped
      day({ moodAvg: 1 }),
    ];
    expect(moodDistribution(days)).toEqual([1, 0, 0, 1, 1]);
  });

  it('clamps out-of-range averages into the 1–5 scale', () => {
    expect(moodDistribution([day({ moodAvg: 0.2 }), day({ moodAvg: 9 })])).toEqual([1, 0, 0, 0, 1]);
  });
});

describe('bestDay', () => {
  it('picks the day with the most activity', () => {
    const days = [day({ day: '2026-07-01', events: 2 }), day({ day: '2026-07-02', events: 9 })];
    expect(bestDay(days)?.day).toBe('2026-07-02');
  });

  it('is null when nothing happened at all', () => {
    expect(bestDay([day({ events: 0 }), day({ events: 0 })])).toBeNull();
  });
});

describe('habitConsistency', () => {
  it('is the share of days with at least one check-in', () => {
    const days = [day({ habitChecks: 1 }), day({ habitChecks: 3 }), day({ habitChecks: 0 }), day({})];
    expect(habitConsistency(days)).toBe(50);
  });

  it('is 0 for an empty window rather than NaN', () => {
    expect(habitConsistency([])).toBe(0);
  });
});
