import { describe, expect, it } from 'vitest';
import { serializeExercise, serializeWorkout, serializeWorkoutSet, serializeWorkoutTemplate } from '../src/fitness-serialization.js';

const date = new Date('2026-09-01T12:00:00Z');
const set = {
  id: 'set', exerciseId: 'exercise', exercise: { name: 'Synthetic press', kind: 'weight_reps' },
  position: 0, weightGrams: 10000, reps: 10, durationSec: null, distanceM: null,
  warmup: false, setType: 'legacy', rpe: 75, completedAt: date,
};

describe('fitness response calculations', () => {
  it('retains unclassified exercise fields and custom ownership', () => {
    const exercise = { id: 'exercise', name: 'Synthetic press', muscle: 'chest', target: null, equipment: null, kind: 'weight_reps' };
    expect(serializeExercise({ ...exercise, userId: null })).toEqual({ ...exercise, custom: false });
    expect(serializeExercise({ ...exercise, userId: 'synthetic-owner' })).toEqual({ ...exercise, custom: true });
  });

  it('preserves integer grams and RPE tenths while falling back for legacy set types', () => {
    expect(serializeWorkoutSet(set)).toEqual({
      id: 'set', exerciseId: 'exercise', exerciseName: 'Synthetic press', kind: 'weight_reps',
      position: 0, weightGrams: 10000, reps: 10, durationSec: null, distanceM: null,
      warmup: false, setType: 'normal', rpe: 75, completedAt: date.toISOString(),
    });
  });

  it('derives volume and working sets while preserving open session fields', () => {
    const workout = serializeWorkout({ id: 'workout', title: 'Synthetic workout', notes: null, startedAt: date, endedAt: null, templateId: null, sets: [set] });
    expect({ volumeGrams: workout.volumeGrams, workingSets: workout.workingSets, endedAt: workout.endedAt, templateId: workout.templateId })
      .toEqual({ volumeGrams: 100000, workingSets: 1, endedAt: null, templateId: null });
  });

  it('retains template order, superset groups and last performance date', () => {
    const row = { id: 'template', name: 'Synthetic push', position: 2, createdAt: date, exercises: [{ exerciseId: 'exercise', position: 1, supersetGroup: 3, exercise: { name: 'Synthetic press', muscle: 'chest', kind: 'weight_reps' } }] };
    expect(serializeWorkoutTemplate(row, date)).toEqual({ id: 'template', name: 'Synthetic push', position: 2, createdAt: date.toISOString(), lastPerformedAt: date.toISOString(), exercises: [{ exerciseId: 'exercise', position: 1, supersetGroup: 3, name: 'Synthetic press', muscle: 'chest', kind: 'weight_reps' }] });
  });
});
