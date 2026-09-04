import { describe, expect, it } from 'vitest';
import {
  RPE_CHOICES,
  countsAsWork,
  describeEffort,
  formatRpe,
  isSetType,
  isValidRpe,
  rpeToRir,
} from '../src/dto/set-effort.js';

/**
 * A tracker that records only weight and reps knows what you moved and nothing
 * about what it cost. Two sets of 100kg x 5 are not the same session if one was
 * comfortable and the other was everything you had.
 */
describe('RPE', () => {
  /**
   * Stored in TENTHS. A float column for a value that only ever lands on a half
   * is an invitation to 7.499999 and a display bug — the same reasoning as
   * weight being stored in integer grams.
   */
  it('accepts the halves and rejects everything between', () => {
    expect(isValidRpe(75)).toBe(true);
    expect(isValidRpe(80)).toBe(true);
    expect(isValidRpe(77)).toBe(false);
  });

  it('rejects values off the scale', () => {
    expect(isValidRpe(50)).toBe(false);
    expect(isValidRpe(105)).toBe(false);
  });

  /** "8.0" reads as more precision than exists. */
  it('never writes a trailing zero', () => {
    expect(formatRpe(80)).toBe('8');
    expect(formatRpe(75)).toBe('7.5');
  });

  /** Half the training world thinks in reps-in-reserve; converting is subtraction. */
  it('says the same thing as reps in reserve', () => {
    expect(rpeToRir(100)).toBe(0);
    expect(rpeToRir(80)).toBe(2);
    expect(rpeToRir(75)).toBe(2.5);
  });

  it('describes an all-out set as all out, not "0 left"', () => {
    expect(describeEffort(100)).toBe('RPE 10 · all out');
    expect(describeEffort(90)).toBe('RPE 9 · 1 left');
    expect(describeEffort(80)).toBe('RPE 8 · 2 left');
  });

  /** Hardest first: the common answers are the high ones. */
  it('offers the scale with the usual answers nearest the thumb', () => {
    expect(RPE_CHOICES[0]).toBe(100);
    expect(RPE_CHOICES.at(-1)).toBe(60);
    expect(RPE_CHOICES.every(isValidRpe)).toBe(true);
  });
});

describe('set types', () => {
  it('knows the ones it offers', () => {
    expect(isSetType('drop')).toBe(true);
    expect(isSetType('nonsense')).toBe(false);
  });

  /**
   * Warm-ups never count. Everything else does, drop sets and sets to failure
   * included — they are work, and discounting them would under-report the
   * hardest part of a session.
   */
  it('counts everything but a warm-up as work', () => {
    expect(countsAsWork('warmup')).toBe(false);
    expect(countsAsWork('normal')).toBe(true);
    expect(countsAsWork('drop')).toBe(true);
    expect(countsAsWork('failure')).toBe(true);
    expect(countsAsWork('amrap')).toBe(true);
  });
});
