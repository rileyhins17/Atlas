import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkoutDTO } from '@atlas/shared';
const state = vi.hoisted(() => ({
  settings: { data: undefined as undefined | { weightUnit: 'lb' | 'kg' }, isPending: true, isError: false, refetch: vi.fn() },
  last: { data: null as null | undefined, isPending: false, isError: false, refetch: vi.fn() },
  log: vi.fn(),
}));
vi.mock('@/lib/hooks/settings', () => ({ useSettings: () => state.settings, useWeightUnit: () => state.settings.data?.weightUnit ?? 'lb' }));
vi.mock('@/lib/hooks/fitness', () => ({ useLastPerformance: () => state.last, useLogSet: () => ({ mutate: state.log }), useDeleteSet: () => ({ mutate: vi.fn() }) }));
import { ExerciseBlock } from '@/components/fitness/ExerciseBlock';
const sets = [{ id: 'set-1', exerciseId: 'exercise-1', exerciseName: 'Press', kind: 'weight_reps', weightGrams: 100000, reps: 5, position: 0, warmup: false, setType: 'normal', rpe: null, completedAt: '2026-09-08T10:00:00Z' }] as WorkoutDTO['sets'];
const view = () => <ExerciseBlock workoutId="workout" exerciseId="exercise-1" exerciseName="Press" kind="weight_reps" sets={sets} onLogged={() => {}} />;
beforeEach(() => {
  state.settings.data = undefined; state.settings.isPending = true; state.settings.isError = false;
  state.settings.refetch.mockClear(); state.log.mockClear();
  state.last.data = null; state.last.isPending = false; state.last.isError = false;
});
it('cannot log a weight while the saved unit is unknown', () => {
  render(view());
  expect(screen.queryByRole('button', { name: 'Log set' })).toBeNull();
  expect(screen.queryByRole('spinbutton', { name: 'Weight in lb for Press' })).toBeNull();
  expect(state.log).not.toHaveBeenCalled();
});
it('offers recovery for an unavailable unit rather than a pounds form', () => {
  state.settings.isPending = false; state.settings.isError = true;
  render(view());
  expect(screen.queryByRole('button', { name: 'Log set' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.settings.refetch).toHaveBeenCalledOnce();
});
it('initializes from grams only after kilograms arrive, and saves the same physical weight', () => {
  const { rerender } = render(view());
  state.settings.data = { weightUnit: 'kg' }; state.settings.isPending = false;
  rerender(view());
  expect(screen.getByRole('spinbutton', { name: 'Weight in kg for Press' })).toHaveValue(100);
  fireEvent.click(screen.getByRole('button', { name: 'Log set' }));
  expect(state.log).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: 100000, reps: 5 }), expect.anything());
});

it('waits for previous sets before initializing the draft', () => {
  state.settings.data = { weightUnit: 'kg' }; state.settings.isPending = false;
  state.last.data = undefined; state.last.isPending = true;
  const { rerender } = render(view());
  expect(screen.queryByRole('button', { name: 'Log set' })).toBeNull();
  state.last.data = null; state.last.isPending = false;
  rerender(view());
  expect(screen.getByRole('spinbutton', { name: 'Weight in kg for Press' })).toHaveValue(100);
});
it('preserves a draft through a failed refresh and resumes only after recovery', async () => {
  state.settings.data = { weightUnit: 'kg' }; state.settings.isPending = false;
  const { rerender } = render(view());
  const user = userEvent.setup();
  const weight = screen.getByRole('spinbutton', { name: 'Weight in kg for Press' });
  await user.clear(weight); await user.type(weight, '105');
  state.settings.isError = true;
  rerender(view());
  expect(weight).toHaveValue(105);
  expect(screen.getByRole('button', { name: 'Log set' })).toBeDisabled();
  expect(state.log).not.toHaveBeenCalled();
  state.settings.isError = false;
  rerender(view());
  await user.click(screen.getByRole('button', { name: 'Log set' }));
  expect(state.log).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: 105000 }), expect.anything());
});
it('does not reinterpret an existing kilogram draft when preferences switch to pounds', () => {
  state.settings.data = { weightUnit: 'kg' }; state.settings.isPending = false;
  const { rerender } = render(view());
  state.settings.data = { weightUnit: 'lb' };
  rerender(view());
  expect(screen.getByRole('spinbutton', { name: 'Weight in kg for Press' })).toHaveValue(100);
  fireEvent.click(screen.getByRole('button', { name: 'Log set' }));
  expect(state.log).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: 100000 }), expect.anything());
});
