import { describe, expect, it } from 'vitest';
import type { ExerciseDTO, WorkoutTemplateDTO } from '@atlas/shared';
import { pickerSections, recentExerciseIds } from '../lib/exercise-order';

function ex(id: string, name: string): ExerciseDTO {
  // Unclassified on purpose: these cases are about ORDER, and a target here
  // would quietly interact with the filters tested further down.
  return { id, name, muscle: 'other', target: null, equipment: null, kind: 'weight_reps', custom: false };
}

const CATALOG = [
  ex('bench', 'Bench Press (Barbell)'),
  ex('incline', 'Incline Bench Press (Barbell)'),
  ex('squat', 'Squat (Barbell)'),
  ex('row', 'Barbell Row'),
  ex('curl', 'Bicep Curl (Dumbbell)'),
  ex('lateral', 'Lateral Raise (Dumbbell)'),
];

const PUSH: WorkoutTemplateDTO = {
  id: 't1',
  name: 'Push',
  position: 0,
  lastPerformedAt: null,
  createdAt: '',
  exercises: [
    {
      exerciseId: 'bench',
      name: 'Bench Press (Barbell)',
      muscle: 'chest',
      kind: 'weight_reps',
      position: 0,
      supersetGroup: null,
    },
    {
      exerciseId: 'lateral',
      name: 'Lateral Raise (Dumbbell)',
      muscle: 'shoulders',
      kind: 'weight_reps',
      position: 1,
      supersetGroup: null,
    },
  ],
};

describe('pickerSections', () => {
  it('puts the saved day first, in its own order', () => {
    const sections = pickerSections({
      exercises: CATALOG,
      template: PUSH,
      recentExerciseIds: [],
    });
    expect(sections[0]!.title).toBe('Push');
    expect(sections[0]!.exercises.map((e) => e.id)).toEqual(['bench', 'lateral']);
  });

  it('offers recently-used movements next, without repeating the day', () => {
    const sections = pickerSections({
      exercises: CATALOG,
      template: PUSH,
      // `bench` is already in the template and must not appear twice.
      recentExerciseIds: ['bench', 'squat', 'row'],
    });
    expect(sections.map((s) => s.title)).toEqual(['Push', 'Recent', 'All exercises']);
    expect(sections[1]!.exercises.map((e) => e.id)).toEqual(['squat', 'row']);
    expect(sections[2]!.exercises.map((e) => e.id)).toEqual(['curl', 'incline']);
  });

  it('drops movements already open in the session from the suggestions', () => {
    const sections = pickerSections({
      exercises: CATALOG,
      template: PUSH,
      recentExerciseIds: ['squat'],
      alreadyInWorkout: ['bench', 'squat'],
    });
    expect(sections[0]!.exercises.map((e) => e.id)).toEqual(['lateral']);
    expect(sections.some((s) => s.title === 'Recent')).toBe(false);
  });

  it('falls back to one flat list when there is no saved day', () => {
    const sections = pickerSections({
      exercises: CATALOG,
      template: null,
      recentExerciseIds: [],
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]!.title).toBeNull();
  });

  it('searching gives one ranked list, not three headings to scan', () => {
    const sections = pickerSections({
      exercises: CATALOG,
      template: PUSH,
      recentExerciseIds: [],
      query: 'bench',
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]!.title).toBeNull();
    // Template movement first, then the prefix match over the mid-string one.
    expect(sections[0]!.exercises.map((e) => e.id)).toEqual(['bench', 'incline']);
  });

  it('search still ranks a prefix match above a mid-string one', () => {
    const sections = pickerSections({
      exercises: CATALOG,
      template: null,
      recentExerciseIds: [],
      query: 'bench',
    });
    expect(sections[0]!.exercises.map((e) => e.id)).toEqual(['bench', 'incline']);
  });

  it('returns nothing when the search matches nothing', () => {
    const sections = pickerSections({
      exercises: CATALOG,
      template: null,
      recentExerciseIds: [],
      query: 'zercher',
    });
    expect(sections[0]!.exercises).toEqual([]);
  });
});

describe('recentExerciseIds', () => {
  it('is most-recently-used first, deduped', () => {
    const ids = recentExerciseIds([
      { sets: [{ exerciseId: 'bench' }, { exerciseId: 'bench' }, { exerciseId: 'lateral' }] },
      { sets: [{ exerciseId: 'squat' }, { exerciseId: 'bench' }] },
    ]);
    expect(ids).toEqual(['bench', 'lateral', 'squat']);
  });

  it('honours the limit', () => {
    const ids = recentExerciseIds(
      [{ sets: [{ exerciseId: 'a' }, { exerciseId: 'b' }, { exerciseId: 'c' }] }],
      2,
    );
    expect(ids).toEqual(['a', 'b']);
  });

  it('survives an empty history', () => {
    expect(recentExerciseIds([])).toEqual([]);
  });
});

describe('filtering the catalog by muscle and equipment', () => {
  const ex = (
    id: string,
    name: string,
    over: Partial<ExerciseDTO> = {},
  ): ExerciseDTO => ({
    id,
    name,
    muscle: 'legs',
    target: 'quads',
    equipment: 'barbell',
    kind: 'weight_reps',
    custom: false,
    ...over,
  });

  const CATALOG = [
    ex('a', 'Squat (Barbell)'),
    ex('b', 'Leg Press', { equipment: 'machine' }),
    ex('c', 'Hip Abduction (Machine)', { target: 'abductors', equipment: 'machine' }),
    ex('d', 'Banded Lateral Walk', { target: 'abductors', equipment: 'band' }),
    ex('e', 'Bench Press (Barbell)', { muscle: 'chest', target: 'mid_chest' }),
  ];
  const base = { exercises: CATALOG, template: null, recentExerciseIds: [] };

  /**
   * The whole reason this exists. "Legs" is quads, hamstrings, glutes, calves,
   * adductors AND abductors, so a hip abduction machine — in every commercial
   * gym — was unfindable by browsing.
   */
  it('narrows to one specific muscle', () => {
    const [section] = pickerSections({ ...base, target: 'abductors' });
    expect(section!.exercises.map((e) => e.id).sort()).toEqual(['c', 'd']);
  });

  it('narrows by equipment', () => {
    const [section] = pickerSections({ ...base, equipment: 'machine' });
    expect(section!.exercises.map((e) => e.id).sort()).toEqual(['b', 'c']);
  });

  it('narrows by both at once', () => {
    const [section] = pickerSections({ ...base, target: 'abductors', equipment: 'band' });
    expect(section!.exercises.map((e) => e.id)).toEqual(['d']);
  });

  /**
   * A search that ignored the chips would read as the filter being broken —
   * and it is the natural way to write it, because the search branch returns
   * early.
   */
  it('applies a search on top of the filters, not instead of them', () => {
    const [section] = pickerSections({ ...base, target: 'abductors', query: 'machine' });
    expect(section!.exercises.map((e) => e.id)).toEqual(['c']);
  });

  /** A filter is as explicit as a search: one flat answer, no other headings. */
  it('returns one flat list while a filter is on', () => {
    const sections = pickerSections({
      ...base,
      recentExerciseIds: ['e'],
      target: 'abductors',
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]!.title).toBeNull();
    // 'e' is recent but is a chest movement — it must not reappear in a
    // "Recent" section built from the unfiltered catalog.
    expect(sections[0]!.exercises.some((x) => x.id === 'e')).toBe(false);
  });

  it('says nothing matches rather than silently ignoring the filter', () => {
    const [section] = pickerSections({ ...base, target: 'neck' });
    expect(section?.exercises ?? []).toEqual([]);
  });

  it('is unchanged when no filter is set', () => {
    const sections = pickerSections({ ...base });
    expect(sections.flatMap((s) => s.exercises).length).toBeGreaterThan(0);
  });
});
