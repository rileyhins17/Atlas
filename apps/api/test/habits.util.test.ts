import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeStreak, dayKey } from '../src/modules/habits/habits.util.js';

// Freeze time mid-day UTC so day boundaries are stable during the test run.
const NOW = new Date('2026-07-16T12:00:00.000Z');

/** Map of UTC day key -> logged value, where offset 0 = today, 1 = yesterday, ... */
function days(entries: Array<[offsetDays: number, value: number]>): Map<string, number> {
  const perDay = new Map<string, number>();
  for (const [offset, value] of entries) {
    const d = new Date(NOW);
    d.setUTCDate(d.getUTCDate() - offset);
    perDay.set(dayKey(d), value);
  }
  return perDay;
}

describe('computeStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts a done-today day', () => {
    expect(computeStreak(days([[0, 1]]), 1)).toBe(1);
  });

  it('counts consecutive done days ending today', () => {
    expect(
      computeStreak(
        days([
          [0, 1],
          [1, 1],
          [2, 1],
        ]),
        1,
      ),
    ).toBe(3);
  });

  it('breaks the streak on a gap day', () => {
    // Done today and 2 days ago, but nothing yesterday -> streak is only today.
    expect(
      computeStreak(
        days([
          [0, 1],
          [2, 1],
          [3, 1],
        ]),
        1,
      ),
    ).toBe(1);
  });

  it('does not break an existing streak when today is still in progress', () => {
    // Today logged below target; yesterday and the day before met it.
    expect(
      computeStreak(
        days([
          [0, 1],
          [1, 3],
          [2, 3],
        ]),
        3,
      ),
    ).toBe(2);
  });

  it('requires the daily total to meet the target', () => {
    // Yesterday logged 2 of target 3 -> does not extend the streak.
    expect(
      computeStreak(
        days([
          [0, 3],
          [1, 2],
          [2, 3],
        ]),
        3,
      ),
    ).toBe(1);
  });

  it('is zero with no qualifying days', () => {
    expect(computeStreak(new Map(), 1)).toBe(0);
    expect(computeStreak(days([[5, 1]]), 1)).toBe(0);
  });
});
