import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({
  exercises: { data: [], isPending: false, isError: false, refetch: vi.fn() },
  history: { data: [], isPending: false, isError: false, refetch: vi.fn() },
}));
vi.mock('@/lib/hooks/fitness', () => ({ useExercises: () => state.exercises, useWorkoutHistory: () => state.history, useCreateExercise: () => ({ mutate: vi.fn(), isPending: false }) }));
import { ExercisePicker } from '@/components/fitness/ExercisePicker';
const picker = () => render(<ExercisePicker template={null} alreadyInWorkout={[]} onPick={vi.fn()} onClose={vi.fn()} />);
beforeEach(() => { for (const q of Object.values(state)) { q.isPending = false; q.isError = false; q.refetch.mockClear(); } });
it('does not offer duplicate creation when the catalog failed and retains the search during retry', () => {
  state.exercises.isError = true;
  const { rerender } = picker();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Bench' } });
  expect(screen.queryByRole('button', { name: 'Add “Bench”' })).toBeNull();
  expect(screen.getByText('Exercise catalog could not be loaded.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.exercises.refetch).toHaveBeenCalledOnce();
  state.exercises.isError = false;
  rerender(<ExercisePicker template={null} alreadyInWorkout={[]} onPick={vi.fn()} onClose={vi.fn()} />);
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('Bench');
  expect(screen.getByRole('button', { name: 'Add “Bench”' })).toBeTruthy();
});
it('explains unavailable recency without blocking the catalog', () => {
  state.history.isError = true;
  picker();
  expect(screen.getByRole('listbox', { name: 'Exercises' })).toBeTruthy();
  expect(screen.getByText('Recent exercises could not be loaded. You can still search the catalog.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.history.refetch).toHaveBeenCalledOnce();
});
it('shows when recent exercises are still loading', () => {
  state.history.isPending = true;
  picker();
  expect(screen.getByText('Loading recent exercises…')).toBeTruthy();
});
