import { afterAll, describe, expect, it, vi } from 'vitest';
import { activityCalendarGrid, activityLevel, activityMonthLabel, describeActivityCell, heatmapColumns, heatmapLevel, progressRingGeometry, sparklineGeometry } from '../src/chart-calculations.js';
import { localDayKey } from '../src/local-dates.js';

vi.stubEnv('TZ', 'America/Toronto');
afterAll(() => vi.unstubAllEnvs());

describe('chart calculations', () => {
  it('builds Monday-first activity weeks with future cells and real activity counts', () => {
    const now = new Date('2026-09-02T12:00:00-04:00');
    const result = activityCalendarGrid([{ day: '2026-08-31', tasksCompleted: 2, habitChecks: 1, journalEntries: 1, workouts: 1, moodAvg: null, spentMinor: 0, earnedMinor: 0, volumeGrams: 0, events: 99 }], now);
    expect(result.total).toBe(5);
    expect(result.columns).toHaveLength(1);
    expect(result.columns[0]!.map(c => c.key)).toEqual(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
    expect(result.columns[0]!.map(c => c.future)).toEqual([false, false, false, true, true, true, true]);
    expect(activityMonthLabel(result.columns[0]!, 0, result.columns)).toBe('Sep');
    expect(describeActivityCell(result.columns[0]![0]!)).toBe('Monday, August 31 — 5 things');
    expect(now.toISOString()).toBe('2026-09-02T16:00:00.000Z');
  });

  it('retains an empty current week and inclusive activity bands', () => {
    expect(activityCalendarGrid([], new Date('2026-09-02T12:00:00-04:00')).columns).toHaveLength(1);
    expect([0, 1, 3, 5, 6].map(n => activityLevel(n, [1, 3, 5]))).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps heatmap days aligned across the fall clock transition', () => {
    const now = new Date('2026-11-02T12:00:00-05:00');
    const columns = heatmapColumns(now, 2);
    expect(columns.map(c => [localDayKey(c[0]!), localDayKey(c[6]!)])).toEqual([['2026-10-26', '2026-11-01'], ['2026-11-02', '2026-11-08']]);
    expect(now.toISOString()).toBe('2026-11-02T17:00:00.000Z');
    expect([0, 1, 2, 4].map(n => heatmapLevel(n, 4))).toEqual([0, 1, 2, 3]);
  });

  it('retains sparkline padding, rounding and area closure', () => {
    expect(sparklineGeometry([1, 3, 2], 120, 36)).toEqual({ coords: [[3, 33], [60, 3], [117, 18]], line: '3,33 60,3 117,18', area: '3,33 3,33 60,3 117,18 117,33' });
  });

  it('retains flat-domain and single-point placement', () => {
    expect(sparklineGeometry([5, 5], 120, 36, 0).coords).toEqual([[3, 3], [117, 3]]);
    expect(sparklineGeometry([5, 5], 120, 36).coords).toEqual([[3, 33], [117, 33]]);
    expect(sparklineGeometry([4], 120, 36).coords).toEqual([[3, 33]]);
    expect(sparklineGeometry([], 120, 36).coords).toEqual([]);
  });

  it('clamps ring progress while retaining the stroke radius', () => {
    expect(progressRingGeometry(-1, 52, 5)).toEqual({ clamped: 0, r: 23.5, c: 47 * Math.PI });
    expect(progressRingGeometry(2, 52, 5).clamped).toBe(1);
  });
});
