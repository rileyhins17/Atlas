import { describe, expect, it } from 'vitest';
import {
  matchExercise,
  normalizeExerciseName,
  parseSplitText,
} from '../src/dto/exercise-match.js';
import {
  formatWeight,
  gramsToLb,
  gramsToUnit,
  lbToGrams,
  stepFor,
  unitToGrams,
} from '../src/dto/fitness-util.js';

const CATALOG = [
  { id: '1', name: 'Bench Press (Barbell)' },
  { id: '2', name: 'Incline Bench Press (Barbell)' },
  { id: '3', name: 'Bench Press (Dumbbell)' },
  { id: '4', name: 'Overhead Press (Barbell)' },
  { id: '5', name: 'Lateral Raise (Dumbbell)' },
  { id: '6', name: 'Romanian Deadlift (Barbell)' },
  { id: '7', name: 'Pull Up' },
  { id: '8', name: 'Tricep Pushdown (Cable)' },
  { id: '9', name: 'Squat (Barbell)' },
];

describe('normalizeExerciseName', () => {
  it('strips equipment parens and punctuation', () => {
    expect(normalizeExerciseName('Bench Press (Barbell)')).toBe('bench press barbell');
  });

  it('expands gym shorthand', () => {
    expect(normalizeExerciseName('incline db press')).toContain('dumbbell');
    expect(normalizeExerciseName('ohp')).toBe('overhead press');
    expect(normalizeExerciseName('rdl')).toBe('romanian deadlift');
  });
});

describe('matchExercise', () => {
  it('matches an exact name', () => {
    const hit = matchExercise('Bench Press (Barbell)', CATALOG);
    expect(hit?.candidate.id).toBe('1');
    expect(hit?.match).toBe('exact');
  });

  it('prefers the least-qualified match', () => {
    // "bench press" must not silently become the incline variant.
    expect(matchExercise('bench press', CATALOG)?.candidate.id).toBe('1');
  });

  it('honours a qualifier when one is given', () => {
    expect(matchExercise('incline bench', CATALOG)?.candidate.id).toBe('2');
    expect(matchExercise('db bench press', CATALOG)?.candidate.id).toBe('3');
  });

  it('resolves shorthand to the real movement', () => {
    expect(matchExercise('ohp', CATALOG)?.candidate.id).toBe('4');
    expect(matchExercise('rdl', CATALOG)?.candidate.id).toBe('6');
    expect(matchExercise('pullups', CATALOG)?.candidate.id).toBe('7');
    expect(matchExercise('lateral raises', CATALOG)?.candidate.id).toBe('5');
  });

  it('returns null rather than guessing', () => {
    // A wrong match puts the wrong movement in someone's training history.
    expect(matchExercise('nordic curl', CATALOG)).toBeNull();
    expect(matchExercise('', CATALOG)).toBeNull();
    expect(matchExercise('   ', CATALOG)).toBeNull();
  });
});

describe('parseSplitText', () => {
  it('reads "Day: a, b, c" lines', () => {
    const days = parseSplitText('Push: bench press, incline db press, lateral raise');
    expect(days).toHaveLength(1);
    expect(days[0]!.name).toBe('Push');
    expect(days[0]!.items).toEqual(['bench press', 'incline db press', 'lateral raise']);
  });

  it('reads several days', () => {
    const days = parseSplitText('Push: bench, dips\nPull: rows, curls\nLegs: squat, rdl');
    expect(days.map((d) => d.name)).toEqual(['Push', 'Pull', 'Legs']);
    expect(days[2]!.items).toEqual(['squat', 'rdl']);
  });

  it('reads a heading line followed by a bullet list', () => {
    const days = parseSplitText('Push day\n- bench press\n- overhead press\n* dips');
    expect(days).toHaveLength(1);
    expect(days[0]!.name).toBe('Push');
    expect(days[0]!.items).toEqual(['bench press', 'overhead press', 'dips']);
  });

  it('splits on slashes and plus signs too', () => {
    expect(parseSplitText('Pull: rows / pulldowns + curls')[0]!.items).toEqual([
      'rows',
      'pulldowns',
      'curls',
    ]);
  });

  it('does not drop movements listed before any heading', () => {
    const days = parseSplitText('bench press, squat');
    expect(days).toHaveLength(1);
    expect(days[0]!.items).toEqual(['bench press', 'squat']);
  });

  it('dedupes within a day and ignores blank lines', () => {
    expect(parseSplitText('Push: bench, bench,\n\n  , squat')[0]!.items).toEqual(['bench', 'squat']);
  });

  it('keeps a bare description as a single item, not a list of movements', () => {
    // This is the signal planSplit uses: fewer than two movements means the
    // user described their split rather than listing it, so the AI is worth
    // consulting. Dropping the text entirely would lose that signal.
    const days = parseSplitText('my usual upper day');
    expect(days).toHaveLength(1);
    expect(days[0]!.items).toEqual(['my usual upper day']);
  });
});

describe('weight units', () => {
  it('converts pounds round-trip without drift', () => {
    for (const lb of [45, 135, 185, 225, 315, 2.5]) {
      expect(gramsToLb(lbToGrams(lb))).toBe(lb);
    }
  });

  it('uses the exact international pound', () => {
    // 1 lb = 453.59237 g exactly, so 100 lb is 45359 g (rounded), not 45000.
    expect(lbToGrams(100)).toBe(45359);
  });

  it('routes through the unit-aware helpers', () => {
    expect(unitToGrams(100, 'kg')).toBe(100_000);
    expect(unitToGrams(100, 'lb')).toBe(45359);
    expect(gramsToUnit(100_000, 'kg')).toBe(100);
    expect(gramsToUnit(45359, 'lb')).toBe(100);
  });

  it('formats without a trailing .0', () => {
    expect(formatWeight(lbToGrams(185), 'lb')).toBe('185 lb');
    expect(formatWeight(lbToGrams(2.5), 'lb')).toBe('2.5 lb');
    expect(formatWeight(100_000, 'kg')).toBe('100 kg');
  });

  it('offers the plate increment that matches the unit', () => {
    expect(stepFor('lb')).toBe(5);
    expect(stepFor('kg')).toBe(2.5);
  });

  it('keeps a set logged in one unit correct in the other', () => {
    // The whole reason storage is grams: switching display must not rewrite.
    const grams = unitToGrams(225, 'lb');
    expect(gramsToUnit(grams, 'kg')).toBeCloseTo(102.1, 1);
    expect(gramsToUnit(grams, 'lb')).toBe(225);
  });
});
