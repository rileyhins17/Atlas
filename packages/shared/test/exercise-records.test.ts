import { describe, expect, it } from 'vitest';
import {
  bestE1rm,
  describeRecord,
  exerciseRecords,
  recordsBrokenBy,
  setVolumeGrams,
} from '../src/dto/exercise-records.js';

/**
 * Records are the thing a workout tracker is FOR.
 *
 * Atlas has had `estimatedOneRepMax`, `bestEffort` and `strengthSeries` since
 * fitness shipped and never put any of them on a screen: the only way to see
 * what you lifted last week was to scroll a wall of identical session cards.
 * These are the numbers that make an exercise screen worth opening.
 */
const set = (weightGrams: number | null, reps: number | null, warmup = false) => ({
  weightGrams,
  reps,
  warmup,
});

describe('setVolumeGrams', () => {
  it('multiplies weight by reps across working sets', () => {
    expect(setVolumeGrams([set(60_000, 5), set(60_000, 5)])).toBe(600_000);
  });

  /** Working up to a top set is not work you did on purpose. */
  it('ignores warm-ups', () => {
    expect(setVolumeGrams([set(20_000, 10, true), set(60_000, 5)])).toBe(300_000);
  });

  it('ignores sets with nothing to multiply', () => {
    expect(setVolumeGrams([set(null, 12), set(60_000, null)])).toBe(0);
  });
});

describe('bestE1rm', () => {
  /** 100kg x 5 beats 105kg x 1 — which is the entire point of estimating. */
  it('prefers the better effort, not the heavier bar', () => {
    const heavier = bestE1rm([set(105_000, 1)]);
    const better = bestE1rm([set(100_000, 5)]);
    expect(better).toBeGreaterThan(heavier!);
  });

  it('ignores warm-ups', () => {
    expect(bestE1rm([set(200_000, 5, true)])).toBeNull();
  });

  it('is null for movements carrying no weight', () => {
    expect(bestE1rm([set(null, 20)])).toBeNull();
  });
});

describe('exerciseRecords', () => {
  const sessions = [
    { sets: [set(60_000, 5), set(65_000, 5)] },
    { sets: [set(70_000, 3), set(20_000, 10, true)] },
    { sets: [set(65_000, 8)] },
  ];

  it('finds the heaviest set and the reps it was done for', () => {
    const r = exerciseRecords(sessions);
    expect(r.heaviestGrams).toBe(70_000);
    expect(r.heaviestReps).toBe(3);
  });

  /**
   * Four records, not one. They answer different questions: the heaviest set is
   * what you brag about, the best e1RM is what tracks strength, session volume
   * tracks work done, and most reps is the only one that means anything for
   * chin-ups. A single "personal best" hides three of them.
   */
  it('tracks the best estimated 1RM separately from the heaviest bar', () => {
    const r = exerciseRecords(sessions);
    // 65 x 8 estimates higher than 70 x 3.
    expect(r.bestE1rmGrams).toBeGreaterThan(70_000);
  });

  it('finds the biggest session by volume', () => {
    expect(exerciseRecords(sessions).bestSessionVolumeGrams).toBe(625_000);
  });

  it('counts working sets only', () => {
    expect(exerciseRecords(sessions).totalSets).toBe(4);
  });

  /** The same bar for more reps is the better set, not an equal one. */
  it('breaks a tie on weight towards more reps', () => {
    const r = exerciseRecords([{ sets: [set(100_000, 3)] }, { sets: [set(100_000, 6)] }]);
    expect(r.heaviestGrams).toBe(100_000);
    expect(r.heaviestReps).toBe(6);
  });

  it('has nothing to report for an untouched movement', () => {
    const r = exerciseRecords([]);
    expect(r.heaviestGrams).toBeNull();
    expect(r.totalSets).toBe(0);
  });

  it('tracks reps for bodyweight work, where weight is meaningless', () => {
    const r = exerciseRecords([{ sets: [set(null, 12)] }, { sets: [set(null, 15)] }]);
    expect(r.mostReps).toBe(15);
    expect(r.heaviestGrams).toBeNull();
  });
});

describe('recordsBrokenBy', () => {
  const before = exerciseRecords([{ sets: [set(100_000, 5)] }]);

  /**
   * Checked against the records BEFORE the set, so a mid-session badge says
   * "this was a record when you did it" rather than "this is the record now".
   */
  it('spots a heavier set', () => {
    expect(recordsBrokenBy(set(105_000, 5), before).heaviest).toBe(true);
  });

  it('spots a better effort at the same weight', () => {
    const broken = recordsBrokenBy(set(100_000, 8), before);
    expect(broken.heaviest).toBe(true);
    expect(broken.e1rm).toBe(true);
  });

  it('says nothing for an ordinary set', () => {
    const broken = recordsBrokenBy(set(90_000, 5), before);
    expect(broken.heaviest).toBe(false);
    expect(broken.e1rm).toBe(false);
    expect(describeRecord(broken)).toBeNull();
  });

  /** A tracker that congratulates you for a warm-up is one you stop believing. */
  it('never awards a warm-up', () => {
    const broken = recordsBrokenBy(set(500_000, 10, true), before);
    expect(broken.heaviest).toBe(false);
    expect(broken.e1rm).toBe(false);
  });

  /** On a barbell, "most reps" is a record you set by going lighter. */
  it('only counts reps as a record when nothing is loaded', () => {
    expect(recordsBrokenBy(set(1_000, 50), before).reps).toBe(false);
    const bodyweight = exerciseRecords([{ sets: [set(null, 10)] }]);
    expect(recordsBrokenBy(set(null, 12), bodyweight).reps).toBe(true);
  });

  it('claims the strongest thing that is true', () => {
    expect(describeRecord({ heaviest: true, e1rm: true, reps: false })).toBe('Heaviest ever');
    expect(describeRecord({ heaviest: false, e1rm: true, reps: false })).toBe(
      'Best estimated 1RM',
    );
    expect(describeRecord({ heaviest: false, e1rm: false, reps: true })).toBe('Most reps');
  });

  it('awards the very first working set', () => {
    const fresh = exerciseRecords([]);
    expect(recordsBrokenBy(set(60_000, 5), fresh).heaviest).toBe(true);
  });
});
