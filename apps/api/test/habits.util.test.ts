import { describe, expect, it } from 'vitest';
import { computeStreak } from '../src/modules/habits/habits.util.js';
import { shiftDayKey } from '../src/core/time.js';

const TODAY = '2026-07-16';

/** Map of local day key -> logged value, where offset 0 = today, 1 = yesterday, ... */
function days(entries: Array<[offsetDays: number, value: number]>): Map<string, number> {
  const perDay = new Map<string, number>();
  for (const [offset, value] of entries) perDay.set(shiftDayKey(TODAY, -offset), value);
  return perDay;
}

describe('computeStreak', () => {
  it('counts a done-today day', () => {
    expect(computeStreak(days([[0, 1]]), 1, TODAY)).toBe(1);
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
        TODAY,
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
        TODAY,
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
        TODAY,
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
        TODAY,
      ),
    ).toBe(1);
  });

  it('is zero with no qualifying days', () => {
    expect(computeStreak(new Map(), 1, TODAY)).toBe(0);
    expect(computeStreak(days([[5, 1]]), 1, TODAY)).toBe(0);
  });

  it('walks back across a month boundary by calendar day', () => {
    const perDay = new Map([
      ['2026-08-01', 1],
      ['2026-07-31', 1],
      ['2026-07-30', 1],
    ]);
    expect(computeStreak(perDay, 1, '2026-08-01')).toBe(3);
  });
});
