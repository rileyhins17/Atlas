import { describe, expect, it } from 'vitest';
import type { ExerciseDTO, WorkoutTemplateDTO } from '@atlas/shared';
import { pickerSections, recentExerciseIds } from '../lib/exercise-order';

function ex(id: string, name: string): ExerciseDTO {
  return { id, name, muscle: 'other', kind: 'weight_reps', custom: false };
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
    { exerciseId: 'bench', name: 'Bench Press (Barbell)', muscle: 'chest', kind: 'weight_reps', position: 0 },
    { exerciseId: 'lateral', name: 'Lateral Raise (Dumbbell)', muscle: 'shoulders', kind: 'weight_reps', position: 1 },
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
