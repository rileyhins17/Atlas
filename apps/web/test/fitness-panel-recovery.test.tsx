import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({
  settings: { data: { weightUnit: 'kg' } as { weightUnit: 'kg' | 'lb' } | undefined, isPending: false, isError: false, error: null, refetch: vi.fn() },
  history: { data: [] as unknown[], isPending: false, isError: false, error: null, refetch: vi.fn() },
  templates: { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() },
  catalog: { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() },
}));
vi.mock('@/lib/hooks/fitness', () => ({ useActiveWorkout: () => ({ data: null }), useStartWorkout: () => ({ mutate: vi.fn() }), useWorkoutHistory: () => state.history, useWorkoutTemplates: () => state.templates, useExercises: () => state.catalog }));
vi.mock('@/lib/hooks/settings', () => ({ useSettings: () => state.settings }));
vi.mock('@/components/fitness/WorkoutHistory', () => ({ WorkoutHistory: () => <p>History list</p> }));
vi.mock('@/components/fitness/TrainingProgress', () => ({ TrainingProgress: () => <p>Training comparison</p> }));
import { FitnessPanel } from '@/components/panels/FitnessPanel';
beforeEach(() => { state.settings.data = { weightUnit: 'kg' }; state.history.data = []; for (const q of Object.values(state)) { q.isPending = false; q.isError = false; q.refetch.mockClear(); } });
it.each(['pending', 'error'] as const)('does not show training comparison with an unknown weight unit: %s', (kind) => {
  state.history.data = [{}]; state.settings.data = undefined;
  state.settings.isPending = kind === 'pending'; state.settings.isError = kind === 'error';
  render(<FitnessPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Progress' }));
  expect(screen.queryByText('Training comparison')).toBeNull();
  expect(screen.getByText(kind === 'pending' ? 'Loading weight units…' : 'Weight units could not be loaded.')).toBeVisible();
});
it('does not substitute quick starts for unavailable saved days', () => {
  state.templates.isError = true;
  render(<FitnessPanel />);
  expect(screen.queryByRole('group', { name: 'Quick start' })).toBeNull();
  expect(screen.getByText('Saved workout days could not be loaded.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.templates.refetch).toHaveBeenCalledOnce();
});
it('does not call an experienced account new after history fails', () => {
  state.history.isError = true;
  render(<FitnessPanel />);
  expect(screen.queryByRole('region', { name: 'What Atlas tracks' })).toBeNull();
  expect(screen.getByText('Workout history could not be loaded.')).toBeTruthy();
});
it('waits for saved days before offering empty-account quick starts', () => {
  state.templates.isPending = true;
  const { container } = render(<FitnessPanel />);
  expect(screen.queryByRole('group', { name: 'Quick start' })).toBeNull();
  expect(container.querySelector('.skeleton')).toBeTruthy();
});
it('does not render a comparison from an unavailable exercise catalog', () => {
  state.history.data = [{}]; state.catalog.isError = true;
  render(<FitnessPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Progress' }));
  expect(screen.queryByText('Training comparison')).toBeNull();
  expect(screen.getByText('Exercises for training progress could not be loaded.')).toBeTruthy();
});
