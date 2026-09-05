import { describe, expect, it } from 'vitest';
import {
  CreateTrackerInput,
  LogTrackerInput,
  MIN_DAYS_FOR_TREND,
  describeTracker,
  describeTrackerContrast,
  findTrackerContrasts,
  summariseTracker,
  type TrackerDay,
  type TrackerPoint,
} from '../src/dto/trackers.js';

const series = (values: number[], from = 1): TrackerPoint[] =>
  values.map((value, i) => ({
    dayKey: `2026-09-${String(from + i).padStart(2, '0')}`,
    value,
  }));

describe('summariseTracker', () => {
  it('has nothing to say about nothing', () => {
    expect(summariseTracker([], 'neutral')).toMatchObject({ mean: null, days: 0, latest: null });
  });

  it('averages what it has, and reports the latest', () => {
    const s = summariseTracker(series([4, 6, 8]), 'neutral');
    expect(s.mean).toBe(6);
    expect(s.latest).toBe(8);
    expect(s.days).toBe(3);
  });

  /** Two entries are not a trend. */
  it('refuses to report a change before there are enough days', () => {
    const s = summariseTracker(series([2, 2, 9, 9]), 'higher_better');
    expect(s.days).toBeLessThan(MIN_DAYS_FOR_TREND);
    expect(s.change).toBeNull();
    expect(s.tone).toBe('unknown');
  });

  it('compares the recent half against the older half', () => {
    const s = summariseTracker(series([2, 2, 2, 2, 6, 6, 6, 6]), 'higher_better');
    expect(s.change).toBe(4);
    expect(s.tone).toBe('better');
  });

  /**
   * The direction is what makes a summary sayable. "Up 4" is good news for
   * energy and bad news for bloating, and rendering both the same is worse than
   * rendering neither.
   */
  it('reads the same rise as worse when low is the good end', () => {
    const s = summariseTracker(series([2, 2, 2, 2, 6, 6, 6, 6]), 'lower_better');
    expect(s.change).toBe(4);
    expect(s.tone).toBe('worse');
  });

  it('calls a small change flat rather than a trend', () => {
    const s = summariseTracker(series([5, 5, 5, 5, 5, 5, 5, 5]), 'higher_better');
    expect(s.tone).toBe('flat');
  });

  it('takes no view when neither end is the good end', () => {
    const s = summariseTracker(series([2, 2, 2, 2, 8, 8, 8, 8]), 'neutral');
    expect(s.change).toBe(6);
    expect(s.tone).toBe('unknown');
  });

  /** A corrected rating is the real one. */
  it('counts a day once, keeping the last value written for it', () => {
    const s = summariseTracker(
      [
        { dayKey: '2026-09-01', value: 2 },
        { dayKey: '2026-09-01', value: 9 },
      ],
      'neutral',
    );
    expect(s.days).toBe(1);
    expect(s.mean).toBe(9);
  });

  it('ignores a value off the scale', () => {
    const s = summariseTracker(
      [
        { dayKey: '2026-09-01', value: 44 },
        { dayKey: '2026-09-02', value: 5 },
      ],
      'neutral',
    );
    expect(s.days).toBe(1);
    expect(s.mean).toBe(5);
  });
});

describe('describeTracker', () => {
  it('says nothing at all when there is nothing to say', () => {
    expect(describeTracker('Bloating', summariseTracker([], 'neutral'), 'neutral')).toBeNull();
  });

  it('reports the average before it will report a direction', () => {
    const text = describeTracker('Bloating', summariseTracker(series([4, 6]), 'lower_better'), 'lower_better');
    expect(text).toContain('averaging 5');
    expect(text).not.toMatch(/up|down/);
  });

  it('names the good direction when there is one', () => {
    const s = summariseTracker(series([6, 6, 6, 6, 2, 2, 2, 2]), 'lower_better');
    expect(describeTracker('Bloating', s, 'lower_better')).toContain('good direction');
  });
});

describe('findTrackerContrasts', () => {
  const day = (n: number, value: number, trained: boolean): TrackerDay => ({
    dayKey: `2026-09-${String(n).padStart(2, '0')}`,
    value,
    factors: { trained },
  });

  /** Same bars as the mood engine: an empty answer beats a weak one. */
  it('says nothing below a fortnight of days', () => {
    const days = Array.from({ length: 13 }, (_, i) => day(i + 1, i % 2 ? 8 : 2, i % 2 === 1));
    expect(findTrackerContrasts(days)).toEqual([]);
  });

  it('needs enough days on BOTH sides', () => {
    const days = Array.from({ length: 20 }, (_, i) => day(i + 1, i < 2 ? 9 : 2, i < 2));
    expect(findTrackerContrasts(days)).toEqual([]);
  });

  it('finds a real difference and names which way it goes', () => {
    const days = Array.from({ length: 20 }, (_, i) => day(i + 1, i % 2 ? 8 : 3, i % 2 === 1));
    const [top] = findTrackerContrasts(days);
    expect(top).toBeDefined();
    expect(top!.factor).toBe('trained');
    expect(top!.withMean).toBe(8);
    expect(top!.withoutMean).toBe(3);
    expect(top!.delta).toBe(5);
  });

  it('ignores a difference too small to mean anything', () => {
    const days = Array.from({ length: 20 }, (_, i) => day(i + 1, i % 2 ? 5 : 5.4, i % 2 === 1));
    expect(findTrackerContrasts(days)).toEqual([]);
  });

  it('does not let one day vote twice', () => {
    const days = [
      ...Array.from({ length: 20 }, (_, i) => day(i + 1, i % 2 ? 8 : 3, i % 2 === 1)),
      // The same day again, contradicting itself.
      day(1, 9, true),
    ];
    const [top] = findTrackerContrasts(days);
    expect(top!.withDays + top!.withoutDays).toBe(20);
  });

  /** A day that never reported a factor is not evidence either way. */
  it('skips days that say nothing about the factor', () => {
    const days: TrackerDay[] = Array.from({ length: 20 }, (_, i) => ({
      dayKey: `2026-09-${String(i + 1).padStart(2, '0')}`,
      value: i % 2 ? 8 : 3,
      factors: (i < 4 ? {} : { trained: i % 2 === 1 }) as Record<string, boolean>,
    }));
    const [top] = findTrackerContrasts(days);
    expect(top!.withDays + top!.withoutDays).toBe(16);
  });
});

describe('describeTrackerContrast', () => {
  /** States the observation. Never the cause. */
  it('reports both sides and claims nothing else', () => {
    const text = describeTrackerContrast(
      'Bloating',
      { factor: 'trained', withMean: 6.8, withoutMean: 3.1, withDays: 9, withoutDays: 8, delta: 3.7 },
      'trained',
    );
    expect(text).toBe(
      'Bloating averaged 6.8 on days you trained (9 days) and 3.1 on days you did not (8).',
    );
    expect(text).not.toMatch(/because|causes|makes you/i);
  });
});

describe('the boundary', () => {
  it('takes a name and defaults to taking no view on direction', () => {
    expect(CreateTrackerInput.parse({ name: '  Bloating  ' })).toMatchObject({
      name: 'Bloating',
      direction: 'neutral',
    });
  });

  it('refuses an empty name', () => {
    expect(CreateTrackerInput.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('holds the scale to 1-10', () => {
    expect(LogTrackerInput.safeParse({ value: 0 }).success).toBe(false);
    expect(LogTrackerInput.safeParse({ value: 11 }).success).toBe(false);
    expect(LogTrackerInput.safeParse({ value: 10 }).success).toBe(true);
  });

  it('refuses a day that is not a day', () => {
    expect(LogTrackerInput.safeParse({ value: 5, dayKey: 'yesterday' }).success).toBe(false);
    expect(LogTrackerInput.safeParse({ value: 5, dayKey: '2026-09-04' }).success).toBe(true);
  });
});
