import { describe, expect, it } from 'vitest';
import {
  MIN_SAMPLES_FOR_ENERGY,
  buildEnergyProfile,
  describeEnergy,
  type EnergySample,
} from '../src/dto/energy.js';

/**
 * The failure mode this guards against is not a wrong number, it is CONFIDENCE.
 * A profile built from a handful of completions is noise, and a planner that
 * reorganises someone's week around noise is worse than one that never tried —
 * because the user cannot see why their afternoon is now being protected.
 *
 * So most of these are about when it must say nothing.
 */

const at = (hour: number, demanding = true): EnergySample => ({ hour, demanding });
const many = (hour: number, n: number, demanding = true) =>
  Array.from({ length: n }, () => at(hour, demanding));

describe('buildEnergyProfile', () => {
  it('says nothing at all below the sample floor', () => {
    const profile = buildEnergyProfile(many(9, MIN_SAMPLES_FOR_ENERGY - 1));
    expect(profile.peak).toEqual([]);
    expect(profile.trough).toEqual([]);
    expect(profile.samples).toBe(MIN_SAMPLES_FOR_ENERGY - 1);
  });

  it('finds the hours where demanding work actually lands', () => {
    const profile = buildEnergyProfile([
      ...many(9, 8),
      ...many(10, 7),
      ...many(14, 1),
      ...many(15, 1),
      ...many(16, 1),
    ]);
    expect(profile.peak).toEqual([{ startHour: 9, endHour: 11, completions: 15 }]);
    expect(profile.samples).toBe(18);
  });

  it('merges consecutive hours into one window', () => {
    const profile = buildEnergyProfile([...many(9, 6), ...many(10, 6), ...many(11, 6), ...many(15, 1)]);
    expect(profile.peak).toHaveLength(1);
    expect(profile.peak[0]).toMatchObject({ startHour: 9, endHour: 12 });
  });

  it('keeps non-adjacent peaks separate', () => {
    const profile = buildEnergyProfile([
      ...many(9, 6),
      ...many(14, 6),
      ...many(11, 1),
      ...many(12, 1),
      ...many(13, 1),
    ]);
    expect(profile.peak.map((w) => w.startHour)).toEqual([9, 14]);
  });

  /**
   * The one that would embarrass the feature. 04:00 is the flattest hour of
   * almost everyone's day, and a trough drawn from all 24 hours would have the
   * planner solemnly protecting the middle of the night.
   */
  it('never calls an hour you are asleep in a low-energy window', () => {
    const profile = buildEnergyProfile([
      ...many(9, 10),
      ...many(14, 1),
      ...many(15, 1),
      ...many(16, 1),
    ]);
    const troughHours = profile.trough.flatMap((w) =>
      Array.from({ length: w.endHour - w.startHour }, (_, i) => w.startHour + i),
    );
    expect(troughHours).not.toContain(4);
    expect(troughHours).not.toContain(3);
    // The hours it DOES name are ones work really happens in.
    expect(troughHours).toEqual(expect.arrayContaining([14, 15, 16]));
  });

  /** A day with no shape has nothing to offer a planner. */
  it('says nothing when every active hour is equally productive', () => {
    const profile = buildEnergyProfile([
      ...many(9, 4),
      ...many(10, 4),
      ...many(11, 4),
      ...many(12, 4),
    ]);
    expect(profile.peak).toEqual([]);
  });

  it('ignores low-priority completions when finding peaks', () => {
    // Plenty of admin at 16:00, real work at 09:00. The peak is 09:00.
    const profile = buildEnergyProfile([
      ...many(9, 12),
      ...many(16, 30, false),
      ...many(10, 1),
      ...many(11, 1),
    ]);
    expect(profile.peak.map((w) => w.startHour)).toEqual([9]);
    expect(profile.samples).toBe(14);
  });

  it('still counts a busy low-priority hour as an hour you are awake', () => {
    const profile = buildEnergyProfile([...many(9, 14), ...many(16, 30, false)]);
    // 16:00 has zero demanding completions but plenty of activity, so it is a
    // legitimate trough rather than being invisible.
    expect(profile.trough.some((w) => w.startHour === 16)).toBe(true);
  });

  it('discards an out-of-range hour rather than trusting it', () => {
    const profile = buildEnergyProfile([...many(9, 12), at(24), at(-1)]);
    expect(profile.samples).toBe(12);
  });
});

describe('describeEnergy', () => {
  it('returns null when there is nothing honest to say', () => {
    expect(describeEnergy(buildEnergyProfile(many(9, 3)))).toBeNull();
  });

  it('names the peak and the trough in local clock terms', () => {
    const profile = buildEnergyProfile([
      ...many(9, 8),
      ...many(10, 7),
      ...many(14, 1),
      ...many(15, 1),
      ...many(16, 1),
    ]);
    const line = describeEnergy(profile);
    expect(line).toContain('09:00-11:00');
    expect(line).toContain('Rarely finishes it');
    expect(line).toContain('18 completed high-priority tasks');
  });

  it('omits the trough sentence when there is no flat spell', () => {
    const profile = buildEnergyProfile([...many(9, 12), ...many(10, 5), ...many(11, 5)]);
    const line = describeEnergy(profile);
    expect(line).not.toBeNull();
    expect(line).not.toContain('Rarely');
  });
});
