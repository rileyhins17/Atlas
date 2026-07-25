import { describe, expect, it } from 'vitest';
import type { WorkoutSetDTO } from '../src/dto/fitness.js';
import {
  bestWeightGrams,
  countWorkingSets,
  describeSet,
  gramsToKg,
  groupSetsByExercise,
  isPersonalRecord,
  kgToGrams,
  workoutVolumeGrams,
} from '../src/dto/fitness-util.js';

const set = (over: Partial<WorkoutSetDTO> = {}): WorkoutSetDTO => ({
  id: Math.random().toString(36).slice(2),
  exerciseId: 'ex_1',
  exerciseName: 'Bench Press (Barbell)',
  kind: 'weight_reps',
  position: 0,
  weightGrams: 60_000,
  reps: 8,
  durationSec: null,
  distanceM: null,
  warmup: false,
  completedAt: '2026-07-25T10:00:00.000Z',
  ...over,
});

describe('workoutVolumeGrams', () => {
  it('sums weight × reps across working sets', () => {
    const volume = workoutVolumeGrams([
      { weightGrams: 60_000, reps: 8 }, // 480 kg
      { weightGrams: 70_000, reps: 5 }, // 350 kg
    ]);
    expect(gramsToKg(volume)).toBe(830);
  });

  it('EXCLUDES warm-ups, so empty-bar sets cannot inflate the number', () => {
    const volume = workoutVolumeGrams([
      { weightGrams: 20_000, reps: 10, warmup: true },
      { weightGrams: 60_000, reps: 8 },
    ]);
    expect(gramsToKg(volume)).toBe(480);
  });

  it('contributes zero for sets with no weight or no reps rather than guessing', () => {
    expect(
      workoutVolumeGrams([
        { weightGrams: null, reps: 20 }, // bodyweight
        { weightGrams: 60_000, reps: null }, // a plank at a weight
      ]),
    ).toBe(0);
  });

  it('stays exact across a long session (the reason weight is integer grams)', () => {
    // 2.5 kg increments — as floats these accumulate visible drift.
    const sets = Array.from({ length: 40 }, (_, i) => ({
      weightGrams: 2_500 * (i + 1),
      reps: 3,
    }));
    const total = workoutVolumeGrams(sets);
    expect(Number.isInteger(total)).toBe(true);
    // Σ 2.5k..100k × 3 = 3 × 2500 × (40×41/2) = 6,150,000 g
    expect(total).toBe(6_150_000);
  });
});

describe('countWorkingSets', () => {
  it('counts what a lifter means by "3 sets"', () => {
    expect(
      countWorkingSets([
        { warmup: true },
        { warmup: true },
        { warmup: false },
        {},
        {},
      ]),
    ).toBe(3);
  });
});

describe('bestWeightGrams', () => {
  it('finds the heaviest working set', () => {
    expect(
      bestWeightGrams([
        { weightGrams: 60_000, reps: 8 },
        { weightGrams: 80_000, reps: 3 },
        { weightGrams: 70_000, reps: 5 },
      ]),
    ).toBe(80_000);
  });

  it('ignores warm-ups and weights that were never actually lifted', () => {
    expect(
      bestWeightGrams([
        { weightGrams: 100_000, reps: 5, warmup: true }, // warm-up
        { weightGrams: 120_000, reps: 0 }, // loaded but not lifted
        { weightGrams: 60_000, reps: 8 },
      ]),
    ).toBe(60_000);
  });

  it('is null when nothing qualifies', () => {
    expect(bestWeightGrams([])).toBeNull();
    expect(bestWeightGrams([{ weightGrams: null, reps: 10 }])).toBeNull();
  });
});

describe('isPersonalRecord', () => {
  it('is true for the first real set on a movement', () => {
    expect(isPersonalRecord({ weightGrams: 60_000, reps: 5 }, null)).toBe(true);
  });

  it('requires beating the previous best STRICTLY', () => {
    expect(isPersonalRecord({ weightGrams: 80_000, reps: 1 }, 75_000)).toBe(true);
    // Matching your best is not a record — an app that celebrates everything
    // teaches you to ignore the word.
    expect(isPersonalRecord({ weightGrams: 75_000, reps: 1 }, 75_000)).toBe(false);
    expect(isPersonalRecord({ weightGrams: 70_000, reps: 5 }, 75_000)).toBe(false);
  });

  it('never fires for a warm-up or an unlifted weight', () => {
    expect(isPersonalRecord({ weightGrams: 200_000, reps: 5, warmup: true }, null)).toBe(false);
    expect(isPersonalRecord({ weightGrams: 200_000, reps: 0 }, null)).toBe(false);
  });
});

describe('gram conversions', () => {
  it('round-trips real plate weights', () => {
    for (const kg of [2.5, 20, 60, 82.5, 137.5]) {
      expect(gramsToKg(kgToGrams(kg))).toBe(kg);
    }
  });

  it('rounds to the 0.1 kg a gym scale actually shows', () => {
    expect(gramsToKg(60_040)).toBe(60);
    expect(gramsToKg(60_060)).toBe(60.1);
  });
});

describe('describeSet', () => {
  it('renders each measurement kind in its own units', () => {
    expect(describeSet(set({ weightGrams: 80_000, reps: 5 }), 'weight_reps')).toBe('80 kg × 5');
    expect(describeSet(set({ reps: 12 }), 'reps')).toBe('12 reps');
    expect(describeSet(set({ durationSec: 45 }), 'duration')).toBe('45s');
    expect(describeSet(set({ distanceM: 5_000 }), 'distance')).toBe('5 km');
    // Under a kilometre stays in metres rather than reading "0.4 km".
    expect(describeSet(set({ distanceM: 400 }), 'distance')).toBe('400 m');
  });

  it('falls back to reps when a weight-based movement has no weight', () => {
    expect(describeSet(set({ weightGrams: null, reps: 10 }), 'weight_reps')).toBe('10 reps');
  });
});

describe('groupSetsByExercise', () => {
  it('groups by exercise in logged order, not alphabetically', () => {
    const groups = groupSetsByExercise([
      set({ exerciseId: 'squat', exerciseName: 'Squat', position: 0 }),
      set({ exerciseId: 'bench', exerciseName: 'Bench', position: 1 }),
      set({ exerciseId: 'squat', exerciseName: 'Squat', position: 0 }),
    ]);
    expect(groups.map((g) => g.exerciseName)).toEqual(['Squat', 'Bench']);
    expect(groups[0]!.sets).toHaveLength(2);
  });

  it('is empty for an empty workout rather than throwing', () => {
    expect(groupSetsByExercise([])).toEqual([]);
  });
});
