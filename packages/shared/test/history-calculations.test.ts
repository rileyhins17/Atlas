import { describe, expect, it } from 'vitest';
import { assembleExerciseHistory, assembleHabitHistory, assembleLastPerformance, assembleTrackerOverview, groupHabitTotals, serializeHabit, serializeTracker, type ExerciseHistoryRow } from '../src/history-calculations.js';

const now = new Date('2026-09-02T12:00:00Z');

describe('history response calculations', () => {
  it('sums repeated daily totals and keeps UTC habit streaks', () => {
    const logs = [{ habitId: 'habit', day: '2026-09-01', value: 5 }, { habitId: 'habit', day: '2026-09-02', value: 2 }, { habitId: 'habit', day: '2026-09-02', value: 3 }];
    const habit = serializeHabit({ id: 'habit', name: 'Synthetic habit', cadence: 'DAILY', target: 5, active: true, createdAt: now }, logs, now, now);
    expect({ today: habit.todayCount, done: habit.doneToday, streak: habit.streak }).toEqual({ today: 5, done: true, streak: 2 });
    expect(groupHabitTotals(logs).get('habit')).toEqual(logs);
  });

  it('keeps zero-log habits and excludes totals for archived habits', () => {
    expect(assembleHabitHistory([{ id: 'a' }, { id: 'b' }], [{ habitId: 'a', day: '2026-09-01', value: 2 }, { habitId: 'a', day: '2026-09-01', value: 3 }, { habitId: 'archived', day: '2026-09-01', value: 99 }]))
      .toEqual([{ habitId: 'a', days: [{ day: '2026-09-01', count: 5 }] }, { habitId: 'b', days: [] }]);
  });

  it('builds oldest-first tracker points without mutating database row order', () => {
    const tracker = serializeTracker({ id: 'tracker', name: 'Synthetic energy', emoji: null, direction: 'higher_better', lowLabel: null, highLabel: null, active: true, position: 0, createdAt: now }, null);
    const rows = [{ trackerId: 'tracker', dayKey: '2026-09-02', value: 7 }, { trackerId: 'tracker', dayKey: '2026-09-01', value: 5 }];
    const result = assembleTrackerOverview([tracker], rows);
    expect(result[0]!.points).toEqual([{ dayKey: '2026-09-01', value: 5 }, { dayKey: '2026-09-02', value: 7 }]);
    expect(rows[0]!.dayKey).toBe('2026-09-02');
    expect(tracker.todayValue).toBeNull();
  });

  const exercise = { id: 'exercise', name: 'Synthetic press', muscle: 'chest', target: null, equipment: null, kind: 'weight_reps', userId: null };
  const row = (id: string, workoutId: string, at: string, weightGrams: number): ExerciseHistoryRow => ({ id, workoutId, exerciseId: exercise.id, position: 0, weightGrams, reps: 10, durationSec: null, distanceM: null, warmup: false, setType: 'normal', rpe: null, completedAt: new Date(at), workout: { id: workoutId, title: 'Synthetic session', startedAt: new Date(at) } });

  it('caps displayed sessions without forgetting an older weight record', () => {
    const rows = [row('latest', 'new', '2026-09-02T12:00:00Z', 10000), row('older', 'old', '2026-09-01T12:00:00Z', 20000)];
    const result = assembleExerciseHistory(exercise, rows, 1);
    expect(result.sessions.map(s => s.workoutId)).toEqual(['new']);
    expect(result.records.heaviestGrams).toBe(20000);
    expect(rows.map(r => r.id)).toEqual(['latest', 'older']);
  });

  it('reports the best individual session volume across all fetched workouts, before the display cap', () => {
    const rows = [
      row('latest', 'new', '2026-09-02T12:00:00Z', 10000),
      row('older', 'old', '2026-09-01T12:00:00Z', 20000),
      { ...row('warmup', 'old', '2026-09-01T11:55:00Z', 100000), warmup: true },
    ];
    const result = assembleExerciseHistory(exercise, rows, 1);
    expect(result.sessions.map(s => s.volumeGrams)).toEqual([100000]);
    expect(result.records.bestSessionVolumeGrams).toBe(200000);
    expect(result.records.heaviestGrams).toBe(20000);
  });

  it('returns the latest workout in set order while keeping historical best weight', () => {
    const rows = [row('last', 'new', '2026-09-02T12:10:00Z', 11000), row('first', 'new', '2026-09-02T12:00:00Z', 10000), row('older', 'old', '2026-09-01T12:00:00Z', 20000)];
    const result = assembleLastPerformance(exercise.id, rows)!;
    expect(result.sets.map(s => s.weightGrams)).toEqual([10000, 11000]);
    expect(result.bestWeightGrams).toBe(20000);
    expect(result.performedAt).toBe('2026-09-02T12:10:00.000Z');
    expect(assembleLastPerformance(exercise.id, [])).toBeNull();
  });
});

it('uses the owner day for an evening habit count and an unfinished-day streak', () => {
  const instant = new Date('2026-09-09T01:00:00Z');
  const habit = { id: 'habit', name: 'Synthetic habit', cadence: 'DAILY' as const, target: 2, active: true, createdAt: instant };
  const logs = [{ habitId: 'habit', day: '2026-09-07', value: 2 }, { habitId: 'habit', day: '2026-09-08', value: 1 }];
  const result = serializeHabit(habit, logs, instant, instant, 'America/Toronto');
  expect({ count: result.todayCount, done: result.doneToday, streak: result.streak }).toEqual({ count: 1, done: false, streak: 1 });
});
for (const instant of ['2026-03-09T02:00:00Z', '2026-11-02T03:00:00Z']) {
  it(`keeps the transition-day evening in its local day at ${instant}`, () => {
    const now = new Date(instant);
    const day = instant.startsWith('2026-03') ? '2026-03-08' : '2026-11-01';
    const result = serializeHabit({ id: 'habit', name: 'Synthetic habit', cadence: 'DAILY', target: 1, active: true, createdAt: now }, [{ habitId: 'habit', day, value: 1 }], now, now, 'America/Toronto');
    expect(result.todayCount).toBe(1);
    expect(result.doneToday).toBe(true);
    expect(result.streak).toBe(1);
  });
}
