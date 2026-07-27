import { describe, expect, it } from 'vitest';
import type { WorkoutSetDTO } from '../src/index.js';
import { lbToGrams } from '../src/dto/fitness-util.js';
import {
  exerciseProgress,
  muscleLoad,
  trainingTotals,
  weeklyVolume,
  type TrainingWorkout,
} from '../src/dto/training-stats.js';

function set(p: Partial<WorkoutSetDTO>): WorkoutSetDTO {
  return {
    id: Math.random().toString(36).slice(2),
    exerciseId: 'bench',
    exerciseName: 'Bench Press (Barbell)',
    kind: 'weight_reps',
    position: 0,
    weightGrams: lbToGrams(185),
    reps: 5,
    durationSec: null,
    distanceM: null,
    warmup: false,
    completedAt: '2026-07-26T10:00:00.000Z',
    ...p,
  };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function workout(p: Partial<TrainingWorkout>): TrainingWorkout {
  const startedAt = p.startedAt ?? daysAgo(1);
  return {
    id: Math.random().toString(36).slice(2),
    title: 'Push',
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + 60 * 60_000).toISOString(),
    sets: [set({})],
    ...p,
  };
}

describe('weeklyVolume', () => {
  it('returns one bucket per week including empty ones', () => {
    // A chart that skips missed weeks makes a broken streak look continuous.
    // Anchored to TODAY, not "yesterday": run this on a Monday and yesterday
    // falls in the previous week, which made the assertion date-dependent.
    const weeks = weeklyVolume([workout({ startedAt: daysAgo(0) })], 8);
    expect(weeks).toHaveLength(8);
    expect(weeks[7]!.sessions).toBe(1);
    expect(weeks.slice(0, 7).every((w) => w.sessions === 0)).toBe(true);
  });

  it('ignores sessions still in progress', () => {
    const weeks = weeklyVolume([workout({ startedAt: daysAgo(1), endedAt: null })], 4);
    expect(weeks.every((w) => w.sessions === 0)).toBe(true);
  });

  it('excludes warm-ups from volume', () => {
    const weeks = weeklyVolume(
      [workout({ startedAt: daysAgo(0), sets: [set({ warmup: true })] })],
      2,
    );
    expect(weeks[1]!.volumeGrams).toBe(0);
    expect(weeks[1]!.sessions).toBe(1);
  });
});

describe('muscleLoad', () => {
  const lookup = (id: string) => ({ bench: 'chest', squat: 'legs' })[id];

  it('counts working sets per muscle, busiest first', () => {
    const load = muscleLoad(
      [
        workout({
          startedAt: daysAgo(1),
          sets: [set({}), set({}), set({ exerciseId: 'squat' })],
        }),
      ],
      lookup,
      7,
    );
    expect(load).toEqual([
      { muscle: 'chest', sets: 2 },
      { muscle: 'legs', sets: 1 },
    ]);
  });

  it('respects the window', () => {
    expect(muscleLoad([workout({ startedAt: daysAgo(30) })], lookup, 7)).toEqual([]);
  });

  it('files an unknown exercise under other rather than dropping it', () => {
    const load = muscleLoad([workout({ startedAt: daysAgo(1) })], () => undefined, 7);
    expect(load).toEqual([{ muscle: 'other', sets: 1 }]);
  });
});

describe('exerciseProgress', () => {
  it('measures change from the first session to the latest', () => {
    const p = exerciseProgress([
      workout({ startedAt: daysAgo(14), sets: [set({ weightGrams: lbToGrams(100), reps: 5 })] }),
      workout({ startedAt: daysAgo(1), sets: [set({ weightGrams: lbToGrams(110), reps: 5 })] }),
    ]);
    expect(p[0]!.sessions).toBe(2);
    expect(p[0]!.changePct).toBe(10);
    expect(p[0]!.atBest).toBe(true);
  });

  it('knows when the latest session is NOT your best', () => {
    const p = exerciseProgress([
      workout({ startedAt: daysAgo(14), sets: [set({ weightGrams: lbToGrams(225), reps: 5 })] }),
      workout({ startedAt: daysAgo(1), sets: [set({ weightGrams: lbToGrams(185), reps: 5 })] }),
    ]);
    expect(p[0]!.atBest).toBe(false);
    expect(p[0]!.changePct).toBeLessThan(0);
  });

  it('has no percentage from a single session', () => {
    expect(exerciseProgress([workout({})])[0]!.changePct).toBeNull();
  });

  it('skips movements with no usable working set', () => {
    expect(exerciseProgress([workout({ sets: [set({ warmup: true })] })])).toEqual([]);
  });
});

describe('trainingTotals', () => {
  it('sums finished sessions only', () => {
    const t = trainingTotals([workout({}), workout({ endedAt: null })]);
    expect(t.sessions).toBe(1);
  });

  it('ignores a session left open for a day when averaging length', () => {
    // A forgotten Finish is not a 26-hour workout.
    const started = daysAgo(2);
    const t = trainingTotals([
      workout({ startedAt: started, endedAt: new Date(Date.now()).toISOString() }),
    ]);
    expect(t.avgMinutes).toBeNull();
  });

  it('reports a normal session length', () => {
    expect(trainingTotals([workout({})]).avgMinutes).toBe(60);
  });
});
