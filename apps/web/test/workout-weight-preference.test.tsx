import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ data: undefined as undefined | { weightUnit: 'lb' | 'kg' }, isPending: true, isError: false, error: null, refetch: vi.fn() }));
const fixtures = vi.hoisted(() => {
  const set = { id: 'set', exerciseId: 'press', exerciseName: 'Press', kind: 'weight_reps', weightGrams: 100000, reps: 1, warmup: false, setType: 'normal', rpe: null, position: 0, completedAt: '2026-09-08T10:00:00Z' };
  return {
    workouts: [{ id: 'workout', title: 'Saved push', startedAt: '2026-09-08T10:00:00Z', workingSets: 1, volumeGrams: 100000, sets: [set] }],
    exercise: { exercise: { id: 'press', name: 'Press', muscle: 'chest', kind: 'weight_reps', equipment: 'barbell' }, sessions: [{ workoutId: 'workout', workoutTitle: 'Saved push', performedAt: '2026-09-08T10:00:00Z', volumeGrams: 100000, bestE1rmGrams: 100000, sets: [set] }], records: { heaviestGrams: 100000, heaviestReps: 1, bestE1rmGrams: 100000, bestSessionVolumeGrams: 100000, mostReps: 1, totalSets: 1 } },
  };
});
vi.mock('@/lib/hooks/settings', () => ({ useSettings: () => state }));
vi.mock('@/lib/hooks/fitness', () => ({ useWorkoutHistory: () => ({ data: fixtures.workouts, isPending: false, isError: false }), useExerciseHistory: () => ({ data: fixtures.exercise, isPending: false, isError: false }) }));
vi.mock('@/components/ui', async (original) => ({ ...await original<object>(), Dialog: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div> }));
import { WorkoutHistory } from '@/components/fitness/WorkoutHistory';
import { ExerciseDetail } from '@/components/fitness/ExerciseDetail';
const views = { history: () => <WorkoutHistory />, detail: () => <ExerciseDetail exerciseId="press" onClose={vi.fn()} /> };
beforeEach(() => { state.data = undefined; state.isPending = true; state.isError = false; state.refetch.mockClear(); });
it.each(['history', 'detail'] as const)('%s waits for the saved unit instead of displaying pounds', (kind) => {
  render(views[kind]());
  expect(screen.getByText('Loading weight units…')).toBeVisible();
  expect(screen.queryByText(/lb/)).toBeNull();
});
it.each(['history', 'detail'] as const)('%s offers retry when the saved unit cannot be read', (kind) => {
  state.isPending = false; state.isError = true;
  render(views[kind]());
  expect(screen.getByText('Weight units could not be loaded.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.refetch).toHaveBeenCalledOnce();
});
it.each(['history', 'detail'] as const)('%s uses kilograms once preferences recover', (kind) => {
  const view = render(views[kind]());
  state.isPending = false; state.data = { weightUnit: 'kg' };
  view.rerender(views[kind]());
  expect(screen.getAllByText(/100 kg/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/lb/)).toBeNull();
});
