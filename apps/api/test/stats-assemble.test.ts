import { describe, expect, it } from 'vitest';
import { assembleStats, dayKeys, type MetricRow } from '../src/modules/stats/stats.assemble.js';

const row = (metric: MetricRow['metric'], day: string, value: number): MetricRow => ({ metric, day, value });

describe('dayKeys', () => {
  it('produces a contiguous window across month boundaries', () => {
    expect(dayKeys('2026-06-29', 4)).toEqual(['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02']);
  });
});

describe('assembleStats', () => {
  it('zero-fills the current window and places metrics on their days', () => {
    const stats = assembleStats(
      [row('tasks', '2026-07-02', 3), row('habits', '2026-07-01', 2), row('mood', '2026-07-02', 4)],
      '2026-07-01',
      3,
    );
    expect(stats.days.map((d) => d.day)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(stats.days[0]).toMatchObject({ habitChecks: 2, tasksCompleted: 0, moodAvg: null });
    expect(stats.days[1]).toMatchObject({ tasksCompleted: 3, moodAvg: 4 });
    expect(stats.days[2]).toMatchObject({ tasksCompleted: 0, habitChecks: 0, events: 0 });
  });

  it('splits totals on the window boundary for delta chips', () => {
    const stats = assembleStats(
      [
        row('tasks', '2026-06-28', 5), // previous window
        row('tasks', '2026-07-01', 2), // current
        row('spent', '2026-06-30', 1000),
        row('spent', '2026-07-02', 250),
        row('earned', '2026-07-01', 5000),
      ],
      '2026-07-01',
      3,
    );
    expect(stats.totals.current).toMatchObject({ tasksCompleted: 2, spentMinor: 250, earnedMinor: 5000 });
    expect(stats.totals.previous).toMatchObject({ tasksCompleted: 5, spentMinor: 1000, earnedMinor: 0 });
  });

  it('averages mood across journaled days only, per window', () => {
    const stats = assembleStats(
      [row('mood', '2026-06-29', 2), row('mood', '2026-07-01', 4), row('mood', '2026-07-02', 5)],
      '2026-07-01',
      3,
    );
    expect(stats.totals.current.moodAvg).toBeCloseTo(4.5);
    expect(stats.totals.previous.moodAvg).toBe(2);
  });

  it('null mood when a window has no journaled days', () => {
    const stats = assembleStats([], '2026-07-01', 3);
    expect(stats.totals.current.moodAvg).toBeNull();
    expect(stats.totals.previous.moodAvg).toBeNull();
  });

  it('rolls up training sessions and volume per day and per window', () => {
    const stats = assembleStats(
      [
        row('workouts', '2026-06-29', 1),
        row('volume', '2026-06-29', 500_000),
        row('workouts', '2026-07-01', 1),
        row('volume', '2026-07-01', 830_000),
        row('workouts', '2026-07-02', 1),
        row('volume', '2026-07-02', 120_000),
      ],
      '2026-07-01',
      3,
    );
    expect(stats.days[0]).toMatchObject({ workouts: 1, volumeGrams: 830_000 });
    expect(stats.days[2]).toMatchObject({ workouts: 0, volumeGrams: 0 });
    expect(stats.totals.current).toMatchObject({ workouts: 2, volumeGrams: 950_000 });
    // The pre-window session must land in `previous`, never leak into current.
    expect(stats.totals.previous).toMatchObject({ workouts: 1, volumeGrams: 500_000 });
  });

  it('zero-fills training on days with no session', () => {
    const stats = assembleStats([], '2026-07-01', 2);
    expect(stats.days.every((d) => d.workouts === 0 && d.volumeGrams === 0)).toBe(true);
    expect(stats.totals.current.volumeGrams).toBe(0);
  });
});
