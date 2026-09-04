import { describe, expect, it } from 'vitest';
import {
  BAR_KG,
  describePlates,
  platesFor,
  platesForGrams,
} from '../src/dto/plates.js';

/**
 * The one piece of arithmetic a lifter does under fatigue.
 *
 * Getting it wrong means a set logged at a weight that was never on the bar,
 * which quietly poisons every record and trend built on it — so the failure
 * mode is not "inconvenient", it is "the data is now wrong and nobody knows".
 */
describe('platesFor', () => {
  it('loads a bar the way you would at the rack, heaviest first', () => {
    const load = platesFor(100, 'kg');
    expect(load.perSide).toEqual([25, 15]);
    expect(load.achievable).toBe(100);
  });

  it('says empty bar rather than nothing', () => {
    expect(describePlates(platesFor(20, 'kg').perSide, 'kg')).toBe('empty bar');
  });

  /**
   * Reported, not rounded. Told to load 102.5 with no 1.25s available, the
   * honest answer is "100, you are 2.5 short" — a silently rounded number is
   * one that was never on the bar.
   */
  it('reports what the gym cannot make instead of rounding it away', () => {
    const load = platesFor(102.5, 'kg', { plates: [25, 20, 15, 10, 5, 2.5] });
    expect(load.achievable).toBe(100);
    expect(load.shortfallBy).toBe(2.5);
  });

  it('makes an awkward number when the small plates exist', () => {
    const load = platesFor(102.5, 'kg');
    expect(load.perSide).toEqual([25, 15, 1.25]);
    expect(load.shortfallBy).toBe(0);
  });

  /** 2.5 + 1.25 in binary floating point is exactly how this drifts. */
  it('does not drift on halves and quarters', () => {
    const load = platesFor(47.5, 'kg');
    expect(load.achievable).toBe(47.5);
    expect(load.shortfallBy).toBe(0);
  });

  it('says so when the target is under the empty bar', () => {
    const load = platesFor(15, 'kg');
    expect(load.belowBar).toBe(true);
    expect(load.perSide).toEqual([]);
    expect(load.achievable).toBe(BAR_KG);
  });

  it('works in pounds, with a pound bar', () => {
    const load = platesFor(135, 'lb');
    expect(load.perSide).toEqual([45]);
    expect(load.achievable).toBe(135);
  });

  it('honours a bar that is not the usual one', () => {
    const load = platesFor(60, 'kg', { bar: 15 });
    expect(load.achievable).toBe(60);
    expect(load.perSide).toEqual([20, 2.5]);
  });

  it('reads from the grams the app actually stores', () => {
    const load = platesForGrams(100_000, 'kg');
    expect(load.achievable).toBe(100);
  });
});

describe('describePlates', () => {
  it('says it the way you would say it out loud', () => {
    expect(describePlates([25, 25, 5], 'kg')).toBe('2 × 25kg, 1 × 5kg');
  });

  it('keeps the order they go on in', () => {
    expect(describePlates([45, 25, 10], 'lb')).toBe('1 × 45lb, 1 × 25lb, 1 × 10lb');
  });
});
