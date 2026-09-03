import { describe, expect, it } from 'vitest';
import {
  MIN_DAYS_FOR_PATTERNS,
  MIN_DAYS_PER_SIDE,
  describeMoodContrast,
  findMoodContrasts,
  type MoodDay,
} from '../src/dto/mood-patterns.js';

/**
 * The feature that justifies Atlas holding everything in one graph — and the
 * one most able to embarrass it. A confident, wrong claim about why someone
 * feels bad is worse than no feature, so almost every test here is about
 * refusing to speak.
 */
const day = (i: number, mood: number, factors: Record<string, boolean>): MoodDay => ({
  dayKey: `2026-09-${String(i).padStart(2, '0')}`,
  mood,
  factors,
});

/** n days alternating the factor, with a clean mood gap between the groups. */
function split(n: number, withMood: number, withoutMood: number, factor = 'trained'): MoodDay[] {
  return Array.from({ length: n }, (_, i) =>
    day(i + 1, i % 2 === 0 ? withMood : withoutMood, { [factor]: i % 2 === 0 }),
  );
}

describe('findMoodContrasts', () => {
  it('says nothing below a fortnight of days', () => {
    expect(findMoodContrasts(split(MIN_DAYS_FOR_PATTERNS - 1, 5, 2))).toEqual([]);
  });

  it('finds a real gap once there is enough history', () => {
    const [top] = findMoodContrasts(split(20, 4.5, 3));
    expect(top?.factor).toBe('trained');
    expect(top?.delta).toBeGreaterThan(0);
    expect(top?.withDays).toBeGreaterThanOrEqual(MIN_DAYS_PER_SIDE);
  });

  /** One glorious Tuesday is not a finding. */
  it('refuses a factor with too few days on one side', () => {
    const days = Array.from({ length: 20 }, (_, i) => day(i + 1, i === 0 ? 5 : 3, { trained: i === 0 }));
    expect(findMoodContrasts(days)).toEqual([]);
  });

  it('ignores a gap smaller than half a point', () => {
    // 3.4 vs 3.2 is inside the noise of how anyone uses a five-point scale.
    expect(findMoodContrasts(split(20, 3.4, 3.2))).toEqual([]);
  });

  it('reports a factor that goes with WORSE days too', () => {
    const [top] = findMoodContrasts(split(20, 2, 4, 'skippedSleep'));
    expect(top?.delta).toBeLessThan(0);
  });

  it('puts the strongest contrast first', () => {
    const days = Array.from({ length: 24 }, (_, i) =>
      day(i + 1, i % 2 === 0 ? 5 : 2, { big: i % 2 === 0, small: i % 4 < 2 }),
    );
    const found = findMoodContrasts(days);
    expect(found[0]!.factor).toBe('big');
  });

  /**
   * A day logged twice would otherwise vote twice — and the day someone logs
   * their mood twice is emphatically not a random day.
   */
  it('counts each day once, keeping the corrected mood', () => {
    const days = [...split(20, 4.5, 3), { dayKey: '2026-09-01', mood: 1, factors: { trained: true } }];
    const [top] = findMoodContrasts(days);
    // The re-logged day joins the "trained" side at 1 rather than 4.5, which
    // must pull the mean down, not add a 21st day.
    expect(top!.withDays).toBe(10);
  });

  it('skips a day that never reported the factor', () => {
    const days = [
      ...split(20, 4.5, 3),
      ...Array.from({ length: 6 }, (_, i) => day(30 + i, 5, {})),
    ];
    const [top] = findMoodContrasts(days);
    expect(top!.withDays + top!.withoutDays).toBe(20);
  });

  it('discards a mood outside the scale rather than averaging it in', () => {
    const days = [...split(20, 4.5, 3), day(28, 99, { trained: true })];
    const [top] = findMoodContrasts(days);
    expect(top!.withMean).toBeLessThanOrEqual(5);
  });
});

describe('describeMoodContrast', () => {
  const labels = { trained: 'you trained', skippedSleep: 'you were up past 2am' };

  it('states the observation, with both counts', () => {
    const [top] = findMoodContrasts(split(20, 4.5, 3));
    const line = describeMoodContrast(top!, labels);
    expect(line).toContain('you trained');
    expect(line).toContain('4.5');
    expect(line).toContain('3');
    expect(line).toMatch(/10 days/);
  });

  /**
   * The sentence must never explain, only report. "Training makes you happier"
   * is a claim this data cannot support — the arrow may well point the other
   * way, and a product that asserts it will be confidently wrong in public.
   */
  it('never claims a cause', () => {
    const [top] = findMoodContrasts(split(20, 4.5, 3));
    const line = describeMoodContrast(top!, labels);
    expect(line).not.toMatch(/because|makes you|causes|improves|boosts|leads to/i);
  });

  it('reads correctly when the factor goes with worse days', () => {
    const [top] = findMoodContrasts(split(20, 2, 4, 'skippedSleep'));
    const line = describeMoodContrast(top!, labels);
    expect(line).toContain('you were up past 2am');
    expect(line).toContain('2');
  });

  it('falls back to the key when a label is missing', () => {
    const [top] = findMoodContrasts(split(20, 4.5, 3));
    expect(describeMoodContrast(top!, {})).toContain('trained');
  });
});
