import { describe, expect, it } from 'vitest';
import type { WorkoutSetDTO } from '../src/index.js';
import {
  bestEffort,
  estimatedOneRepMax,
  lbToGrams,
  strengthSeries,
  strengthTrendPct,
  summarizeWorkout,
} from '../src/dto/fitness-util.js';

function set(p: Partial<WorkoutSetDTO>): WorkoutSetDTO {
  return {
    id: Math.random().toString(36).slice(2),
    exerciseId: 'bench',
    exerciseName: 'Bench Press (Barbell)',
    kind: 'weight_reps',
    position: 0,
    weightGrams: null,
    reps: null,
    durationSec: null,
    distanceM: null,
    warmup: false,
    completedAt: '2026-07-26T10:00:00.000Z',
    ...p,
  };
}

describe('estimatedOneRepMax', () => {
  it('returns the weight itself for a true single', () => {
    expect(estimatedOneRepMax(lbToGrams(225), 1)).toBe(lbToGrams(225));
  });

  it('scales with reps', () => {
    const five = estimatedOneRepMax(lbToGrams(185), 5)!;
    const one = estimatedOneRepMax(lbToGrams(185), 1)!;
    expect(five).toBeGreaterThan(one);
  });

  it('rates 185x5 as a bigger effort than 205x1', () => {
    // The whole reason for using e1RM: top-set weight alone would call the
    // single the better session, which is wrong.
    expect(estimatedOneRepMax(lbToGrams(185), 5)!).toBeGreaterThan(
      estimatedOneRepMax(lbToGrams(205), 1)!,
    );
  });

  it('declines to guess past 12 reps', () => {
    // Epley drifts badly here; a confident wrong number is worse than none.
    expect(estimatedOneRepMax(lbToGrams(95), 20)).toBeNull();
    expect(estimatedOneRepMax(lbToGrams(95), 12)).not.toBeNull();
  });

  it('rejects nonsense input', () => {
    expect(estimatedOneRepMax(0, 5)).toBeNull();
    expect(estimatedOneRepMax(lbToGrams(100), 0)).toBeNull();
  });
});

describe('bestEffort', () => {
  it('ignores warm-ups', () => {
    const best = bestEffort([
      set({ weightGrams: lbToGrams(315), reps: 5, warmup: true }),
      set({ weightGrams: lbToGrams(135), reps: 5 }),
    ]);
    expect(best?.weightGrams).toBe(lbToGrams(135));
  });

  it('picks the hardest set, not the heaviest', () => {
    const best = bestEffort([
      set({ weightGrams: lbToGrams(205), reps: 1 }),
      set({ weightGrams: lbToGrams(185), reps: 5 }),
    ]);
    expect(best?.weightGrams).toBe(lbToGrams(185));
  });

  it('is null when nothing qualifies', () => {
    expect(bestEffort([set({ reps: 12 })])).toBeNull();
    expect(bestEffort([])).toBeNull();
  });
});

describe('strengthSeries', () => {
  const workout = (at: string, weight: number, reps: number) => ({
    startedAt: at,
    sets: [set({ weightGrams: lbToGrams(weight), reps })],
  });

  it('returns one point per session, oldest first', () => {
    const pts = strengthSeries(
      [
        workout('2026-07-20T10:00:00Z', 195, 5),
        workout('2026-07-06T10:00:00Z', 185, 5),
        workout('2026-07-13T10:00:00Z', 190, 5),
      ],
      'bench',
    );
    expect(pts.map((p) => p.weightGrams)).toEqual([185, 190, 195].map(lbToGrams));
  });

  it('skips sessions where the movement was only warmed up', () => {
    // A fabricated zero would draw a cliff into the trend.
    const pts = strengthSeries(
      [
        { startedAt: '2026-07-06T10:00:00Z', sets: [set({ weightGrams: lbToGrams(45), reps: 5, warmup: true })] },
        workout('2026-07-13T10:00:00Z', 185, 5),
      ],
      'bench',
    );
    expect(pts).toHaveLength(1);
  });

  it('ignores other movements', () => {
    const pts = strengthSeries(
      [{ startedAt: '2026-07-06T10:00:00Z', sets: [set({ exerciseId: 'squat', weightGrams: lbToGrams(315), reps: 5 })] }],
      'bench',
    );
    expect(pts).toEqual([]);
  });
});

describe('strengthTrendPct', () => {
  it('measures first to last', () => {
    const pts = [
      { at: 'a', e1RM: 100, weightGrams: 100, reps: 1 },
      { at: 'b', e1RM: 110, weightGrams: 110, reps: 1 },
    ];
    expect(strengthTrendPct(pts)).toBe(10);
  });

  it('needs two points to say anything', () => {
    expect(strengthTrendPct([{ at: 'a', e1RM: 100, weightGrams: 100, reps: 1 }])).toBeNull();
    expect(strengthTrendPct([])).toBeNull();
  });
});

describe('summarizeWorkout', () => {
  const now = {
    title: 'Push',
    startedAt: '2026-07-26T10:00:00.000Z',
    endedAt: '2026-07-26T11:02:00.000Z',
    sets: [
      set({ weightGrams: lbToGrams(45), reps: 10, warmup: true }),
      set({ weightGrams: lbToGrams(185), reps: 5 }),
      set({ weightGrams: lbToGrams(185), reps: 5 }),
    ],
  };

  it('reports duration and working sets, warm-ups excluded', () => {
    const s = summarizeWorkout(now, []);
    expect(s.durationMin).toBe(62);
    expect(s.workingSets).toBe(2);
  });

  it('does not badge a first-ever session as a PR', () => {
    // Nothing to beat is not an achievement; badging it teaches you to ignore
    // the word.
    expect(summarizeWorkout(now, []).prCount).toBe(0);
  });

  it('badges a genuine PR against history', () => {
    const history = [
      { title: 'Push', startedAt: '2026-07-19T10:00:00Z', sets: [set({ weightGrams: lbToGrams(175), reps: 5 })] },
    ];
    const s = summarizeWorkout(now, history);
    expect(s.prCount).toBe(1);
    expect(s.exercises[0]!.isPr).toBe(true);
  });

  it('compares volume against the last session of the SAME name', () => {
    const history = [
      { title: 'Legs', startedAt: '2026-07-25T10:00:00Z', sets: [set({ weightGrams: lbToGrams(400), reps: 5 })] },
      { title: 'Push', startedAt: '2026-07-19T10:00:00Z', sets: [set({ weightGrams: lbToGrams(175), reps: 5 })] },
    ];
    // Against Push (875 lb of volume), not yesterday's Legs.
    const s = summarizeWorkout(now, history);
    expect(s.volumeDeltaPct).toBeGreaterThan(100);
  });

  it('has no volume delta on a first session', () => {
    expect(summarizeWorkout(now, []).volumeDeltaPct).toBeNull();
  });
});
