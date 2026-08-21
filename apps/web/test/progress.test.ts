import { describe, expect, it } from 'vitest';
import type { PeriodTotalsDTO, StatsDayDTO, StatsDTO } from '@atlas/shared';
import {
  bestDay,
  delta,
  deriveProgress,
  habitConsistency,
  habitRhythm,
  hasActivity,
  moodSeries,
  reviewBullets,
  weeklyBuckets,
} from '@/lib/progress';

const day = (over: Partial<StatsDayDTO>): StatsDayDTO => ({
  day: over.day ?? '2026-07-01',
  tasksCompleted: 0,
  habitChecks: 0,
  moodAvg: null,
  spentMinor: 0,
  earnedMinor: 0,
  workouts: 0,
  volumeGrams: 0,
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


describe('habitRhythm', () => {
  const hist = (counts: number[]) =>
    counts.map((count, i) => ({ day: `2026-07-${String(i + 1).padStart(2, '0')}`, count }));

  it('scores a day as met only when it reaches the target', () => {
    // target 2: days with 2+ count, days with 1 do not.
    const { rate } = habitRhythm(hist([2, 1, 3, 0]), 2, 4);
    expect(rate).toBe(0.5);
  });

  it('buckets check-ins per week, oldest first, anchored to the window END', () => {
    // Anchoring at the end (like weeklyBuckets) keeps the newest bucket a full
    // week; the leftover partial week is the OLDEST one.
    const { weekly } = habitRhythm(hist([1, 1, 1, 1, 1, 1, 1, 5, 5]), 1, 9);
    expect(weekly).toEqual([2, 15]); // 2-day partial, then the last 7 days
  });

  it('rates against the WINDOW, not the days returned — silence still counts', () => {
    // Only 3 recorded days inside a 10-day window: 70% of it was a miss.
    const { rate } = habitRhythm(hist([1, 1, 1]), 1, 10);
    expect(rate).toBeCloseTo(0.3);
  });
});

describe('reviewBullets', () => {
  it('strips list markers and keeps the bold lead intact', () => {
    const out = reviewBullets('- **Tasks:** you finished 12.\n* **Mood:** steady.');
    expect(out).toEqual(['**Tasks:** you finished 12.', '**Mood:** steady.']);
  });

  it('falls back to sentence splitting when the model answers in prose', () => {
    const out = reviewBullets('You did well. Mood held steady. Keep going!');
    expect(out).toEqual(['You did well.', 'Mood held steady.', 'Keep going!']);
  });

  it('drops blank lines rather than rendering empty bullets', () => {
    expect(reviewBullets('- one\n\n\n- two')).toEqual(['one', 'two']);
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

const totals = (over: Partial<PeriodTotalsDTO> = {}): PeriodTotalsDTO => ({
  tasksCompleted: 0,
  habitChecks: 0,
  moodAvg: null,
  spentMinor: 0,
  earnedMinor: 0,
  workouts: 0,
  volumeGrams: 0,
  events: 0,
  ...over,
});

const stats = (days: StatsDayDTO[], current = totals(), previous = totals()): StatsDTO => ({
  days,
  totals: { current, previous },
});

describe('hasActivity', () => {
  it('is about events, not about rows', () => {
    // Every day in the window is present in the response whether or not
    // anything happened on it, so a full array is not evidence of a life.
    expect(hasActivity([day({}), day({ day: '2026-07-02' })])).toBe(false);
    expect(hasActivity([day({}), day({ day: '2026-07-02', events: 1 })])).toBe(true);
    expect(hasActivity([])).toBe(false);
  });
});

describe('deriveProgress', () => {
  it('keys the heatmap by day', () => {
    const d = deriveProgress(
      stats([day({ day: '2026-07-01', events: 3 }), day({ day: '2026-07-02', events: 0 })]),
    );
    expect(d.counts.get('2026-07-01')).toBe(3);
    expect(d.counts.get('2026-07-02')).toBe(0);
  });

  it('keeps the training card once EITHER window has a workout', () => {
    // Both windows, so the card does not blink out of existence the week you
    // miss the gym — a trend you can only see while it is going well is not a
    // trend, and its disappearance reads as a bug.
    expect(deriveProgress(stats([day({})], totals(), totals({ workouts: 2 }))).hasTraining).toBe(
      true,
    );
    expect(deriveProgress(stats([day({})])).hasTraining).toBe(false);
  });

  it('shows money for earning alone, not just spending', () => {
    expect(deriveProgress(stats([day({ earnedMinor: 500 })])).hasMoney).toBe(true);
    expect(deriveProgress(stats([day({ spentMinor: 500 })])).hasMoney).toBe(true);
    expect(deriveProgress(stats([day({})])).hasMoney).toBe(false);
  });

  it('nets cash flow signed, so an overspent week reads as one', () => {
    // The chart anchors zero from both ends precisely because this can be
    // negative; if it were clamped, a bad week would look like a flat one.
    const d = deriveProgress(stats([day({ spentMinor: 900, earnedMinor: 400 })]));
    expect(d.netWeekly).toEqual([-500]);
  });

  it('reports the window as empty when nothing happened in it', () => {
    expect(deriveProgress(stats([day({}), day({ day: '2026-07-02' })])).anyActivity).toBe(false);
  });
});
