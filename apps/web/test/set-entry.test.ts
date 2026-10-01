import { describe, expect, it } from 'vitest';
import { lbToGrams } from '@atlas/shared';
import { resolveSetEntry, type EntryText } from '@/lib/set-entry';

const text = (over: Partial<EntryText> = {}): EntryText => ({
  weight: '',
  reps: '',
  minutes: '',
  seconds: '',
  km: '',
  ...over,
});

describe('resolveSetEntry — a weight and reps lift', () => {
  const shown = ['weight', 'reps'] as const;

  it('takes both, converting the weight to whole grams', () => {
    const r = resolveSetEntry('weight_reps', shown, text({ weight: '185', reps: '8' }), 'lb');
    expect(r.valid).toBe(true);
    expect(r.measurements).toEqual({ weightGrams: lbToGrams(185), reps: 8 });
  });

  /** The box steps in 2.5 lb, and the browser used to refuse anything else without a word. */
  it('accepts a weight that is not a multiple of the stepper increment', () => {
    for (const w of ['187', '12', '47.3']) {
      expect(resolveSetEntry('weight_reps', shown, text({ weight: w, reps: '8' }), 'lb').valid, w).toBe(true);
    }
    expect(resolveSetEntry('weight_reps', shown, text({ weight: '21', reps: '8' }), 'kg').measurements).toEqual({
      weightGrams: 21_000,
      reps: 8,
    });
  });

  it('records a zero load, which is a real set of an unloaded lift', () => {
    const r = resolveSetEntry('weight_reps', shown, text({ weight: '0', reps: '5' }), 'lb');
    expect(r.valid).toBe(true);
    expect(r.measurements.weightGrams).toBe(0);
  });

  it('needs both a weight and reps', () => {
    expect(resolveSetEntry('weight_reps', shown, text({ reps: '8' }), 'lb').valid).toBe(false);
    expect(resolveSetEntry('weight_reps', shown, text({ weight: '185' }), 'lb').valid).toBe(false);
    expect(resolveSetEntry('weight_reps', shown, text(), 'lb').valid).toBe(false);
  });

  it('refuses reps that are not a positive whole number, rather than sending them to a 400', () => {
    for (const reps of ['0', '2.5', '-3']) {
      expect(resolveSetEntry('weight_reps', shown, text({ weight: '100', reps }), 'lb').valid, reps).toBe(false);
    }
  });

  it('refuses a negative weight', () => {
    expect(resolveSetEntry('weight_reps', shown, text({ weight: '-5', reps: '5' }), 'lb').valid).toBe(false);
  });
});

describe('resolveSetEntry — everything else', () => {
  it('logs a bodyweight movement on reps alone', () => {
    const r = resolveSetEntry('reps', ['reps'], text({ reps: '12' }), 'lb');
    expect(r).toEqual({ valid: true, measurements: { reps: 12 } });
  });

  it('only counts the boxes that are on screen', () => {
    // A weight typed and then hidden again must not ride along on the next set.
    const r = resolveSetEntry('reps', ['reps'], text({ weight: '50', reps: '12' }), 'lb');
    expect(r.measurements).toEqual({ reps: 12 });
  });

  it('adds weight to a bodyweight movement when the box is shown', () => {
    const r = resolveSetEntry('reps', ['weight', 'reps'], text({ weight: '25', reps: '6' }), 'lb');
    expect(r.valid).toBe(true);
    expect(r.measurements).toEqual({ weightGrams: lbToGrams(25), reps: 6 });
  });

  it('treats a zero added weight as none, not as a load', () => {
    const r = resolveSetEntry('reps', ['weight', 'reps'], text({ weight: '0', reps: '6' }), 'lb');
    expect(r).toEqual({ valid: true, measurements: { reps: 6 } });
  });

  it('will not log a weight on its own, even one left over from last time', () => {
    expect(resolveSetEntry('reps', ['weight', 'reps'], text({ weight: '25' }), 'lb').valid).toBe(false);
    expect(resolveSetEntry('duration', ['weight', 'time'], text({ weight: '10' }), 'kg').valid).toBe(false);
  });

  it('reads a time as whole seconds from minutes and seconds', () => {
    expect(resolveSetEntry('duration', ['time'], text({ minutes: '1', seconds: '30' }), 'lb').measurements).toEqual({
      durationSec: 90,
    });
    expect(resolveSetEntry('duration', ['time'], text({ minutes: '2' }), 'lb').measurements).toEqual({
      durationSec: 120,
    });
  });

  it('accepts seconds that are not a multiple of the stepper increment', () => {
    // 50 seconds used to be refused: the box stepped in 15s and the browser held it to that.
    const r = resolveSetEntry('duration', ['time'], text({ seconds: '50' }), 'lb');
    expect(r).toEqual({ valid: true, measurements: { durationSec: 50 } });
  });

  it('refuses an empty, zero or fractional time', () => {
    expect(resolveSetEntry('duration', ['time'], text(), 'lb').valid).toBe(false);
    expect(resolveSetEntry('duration', ['time'], text({ minutes: '0', seconds: '0' }), 'lb').valid).toBe(false);
    expect(resolveSetEntry('duration', ['time'], text({ minutes: '1.5' }), 'lb').valid).toBe(false);
  });

  it('reads a distance in km as whole metres, whatever its precision', () => {
    expect(resolveSetEntry('distance', ['distance'], text({ km: '2.5' }), 'lb').measurements).toEqual({
      distanceM: 2_500,
    });
    // 2.05 used to be refused as a step mismatch against 0.1.
    expect(resolveSetEntry('distance', ['distance'], text({ km: '2.05' }), 'lb').measurements).toEqual({
      distanceM: 2_050,
    });
  });

  it('refuses a distance of nothing, or less than nothing', () => {
    expect(resolveSetEntry('distance', ['distance'], text({ km: '0' }), 'lb').valid).toBe(false);
    expect(resolveSetEntry('distance', ['distance'], text({ km: '-1' }), 'lb').valid).toBe(false);
  });

  it('lets a carry be logged by weight and time, without inventing the distance it is filed under', () => {
    const r = resolveSetEntry('distance', ['weight', 'time', 'distance'], text({ weight: '32', seconds: '45' }), 'kg');
    expect(r).toEqual({ valid: true, measurements: { weightGrams: 32_000, durationSec: 45 } });
  });

  it('records every measure that was filled in', () => {
    const r = resolveSetEntry(
      'distance',
      ['weight', 'time', 'distance'],
      text({ weight: '20', minutes: '8', seconds: '30', km: '2' }),
      'kg',
    );
    expect(r.measurements).toEqual({ weightGrams: 20_000, durationSec: 510, distanceM: 2_000 });
  });

  it('is blocked by an unusable extra even when the main measure is fine', () => {
    expect(resolveSetEntry('reps', ['weight', 'reps'], text({ weight: '-5', reps: '6' }), 'lb').valid).toBe(false);
  });
});
