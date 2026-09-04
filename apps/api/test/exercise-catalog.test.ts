import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_LABELS,
  MUSCLE_TARGET_LABELS,
  TARGETS_BY_GROUP,
  groupOfTarget,
} from '@atlas/shared';
import { EXERCISE_CATALOG } from '../src/modules/fitness/exercise-catalog.js';

/**
 * The catalog and the browse tree have to agree, or an exercise is in the app
 * and reachable by nothing.
 *
 * That is not hypothetical — it is the bug this whole change came from. Hip
 * abduction was in the catalog, filed under "legs" alongside squats, and
 * therefore impossible to find by browsing. A movement whose target is missing
 * from TARGETS_BY_GROUP fails exactly the same way, silently, and only for
 * whoever goes looking for it.
 */
describe('the seeded exercise catalog', () => {
  it('is broad enough to be worth browsing', () => {
    expect(EXERCISE_CATALOG.length).toBeGreaterThan(250);
  });

  it('has no duplicate names', () => {
    const names = EXERCISE_CATALOG.map((e) => e.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  /**
   * The coarse group is DERIVED from the target in the catalog, and the browse
   * tree is written by hand in shared. This is the assertion that keeps the two
   * definitions of "which muscles are legs" from drifting apart.
   */
  it('files every exercise under the group its target belongs to', () => {
    const wrong = EXERCISE_CATALOG.filter((e) => groupOfTarget(e.target) !== e.muscle);
    expect(wrong.map((e) => `${e.name}: ${e.target} is not ${e.muscle}`)).toEqual([]);
  });

  it('gives every exercise a target that the browse tree can reach', () => {
    const reachable = new Set(Object.values(TARGETS_BY_GROUP).flat());
    const orphans = EXERCISE_CATALOG.filter((e) => !reachable.has(e.target));
    expect(orphans.map((e) => `${e.name} (${e.target})`)).toEqual([]);
  });

  it('gives every target and every equipment a human label', () => {
    for (const e of EXERCISE_CATALOG) {
      expect(MUSCLE_TARGET_LABELS[e.target], e.name).toBeTruthy();
      expect(EQUIPMENT_LABELS[e.equipment], e.name).toBeTruthy();
    }
  });

  /** A muscle with nothing under it is a chip that leads to an empty list. */
  it('has at least one exercise for every target it offers', () => {
    const covered = new Set(EXERCISE_CATALOG.map((e) => e.target));
    const empty = Object.values(TARGETS_BY_GROUP)
      .flat()
      .filter((t) => !covered.has(t) && t !== 'other');
    expect(empty).toEqual([]);
  });

  /** The one that started it. */
  it('can find a hip abduction machine', () => {
    const abductors = EXERCISE_CATALOG.filter((e) => e.target === 'abductors');
    expect(abductors.length).toBeGreaterThanOrEqual(4);
    expect(abductors.some((e) => /abduction/i.test(e.name) && e.equipment === 'machine')).toBe(true);
  });

  /** Bodyweight and cardio must not be logged as weight x reps. */
  it('measures each movement the way it is actually done', () => {
    const byName = new Map(EXERCISE_CATALOG.map((e) => [e.name, e]));
    expect(byName.get('Plank')?.kind).toBe('duration');
    expect(byName.get('Pull Up')?.kind).toBe('reps');
    expect(byName.get('Run')?.kind).toBe('distance');
    expect(byName.get('Squat (Barbell)')?.kind).toBe('weight_reps');
  });

  it('covers every group with a real spread of equipment', () => {
    for (const group of ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'] as const) {
      const inGroup = EXERCISE_CATALOG.filter((e) => e.muscle === group);
      expect(inGroup.length, group).toBeGreaterThanOrEqual(20);
      expect(new Set(inGroup.map((e) => e.equipment)).size, group).toBeGreaterThanOrEqual(3);
    }
  });
});
