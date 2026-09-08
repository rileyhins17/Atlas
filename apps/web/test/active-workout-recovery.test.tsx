import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkoutDTO, WorkoutSummaryDTO } from '@atlas/shared';
const state = vi.hoisted(() => ({
  settings: { data: { weightUnit: 'kg' } as { weightUnit: 'kg' | 'lb' } | undefined, isPending: false, isError: false, refetch: vi.fn() },
  history: { data: [], isPending: false, isError: false, refetch: vi.fn() },
  templates: { data: [] as unknown[] | undefined, isPending: false, isError: false, refetch: vi.fn() },
  catalog: { data: [], isPending: false, isError: false, refetch: vi.fn() },
  finish: vi.fn((_input: unknown, options: { onSuccess: () => void }) => options.onSuccess()),
}));
vi.mock('@/lib/hooks/fitness', () => ({ useWorkoutHistory: () => state.history, useWorkoutTemplates: () => state.templates, useExercises: () => state.catalog, useFinishWorkout: () => ({ mutate: state.finish }) }));
vi.mock('@/lib/hooks/settings', () => ({ useSettings: () => state.settings }));
vi.mock('@/components/fitness/RestTimer', () => ({ RestTimer: () => null }));
vi.mock('@/components/fitness/ExerciseBlock', () => ({ ExerciseBlock: () => <p>Logged exercise</p> }));
vi.mock('@/components/ui', async (original) => ({ ...await original<object>(), Dialog: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div> }));
import { ActiveWorkout } from '@/components/fitness/ActiveWorkout';
import { WorkoutSummaryDialog } from '@/components/fitness/WorkoutSummaryDialog';
const workout = { id: 'workout', title: 'Push', startedAt: '2026-09-08T10:00:00Z', sets: [], workingSets: 0, volumeGrams: 0, templateId: 'day' } as unknown as WorkoutDTO;
beforeEach(() => {
  state.settings.data = { weightUnit: 'kg' }; state.settings.isPending = false; state.settings.isError = false; state.settings.refetch.mockClear();
  for (const query of [state.history, state.templates, state.catalog]) { query.isPending = false; query.isError = false; query.refetch.mockClear(); }
  state.templates.data = []; state.finish.mockClear();
});
it('does not invent a display preference while an active workout waits for settings', () => {
  state.settings.data = undefined; state.settings.isPending = true;
  render(<ActiveWorkout workout={workout} onFinished={vi.fn()} />);
  expect(screen.getByText('Loading weight units…')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled();
});
it('can finish and retain notes when weight settings fail, with retry available', () => {
  state.settings.data = undefined; state.settings.isError = true;
  const done = vi.fn();
  render(<ActiveWorkout workout={workout} onFinished={done} />);
  fireEvent.change(screen.getByLabelText('How did it go?'), { target: { value: 'Saved despite settings outage' } });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.settings.refetch).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
  expect(state.finish).toHaveBeenCalledWith({ notes: 'Saved despite settings outage' }, expect.anything());
  expect(done).toHaveBeenCalledOnce();
});
it('shows pending planned exercises instead of silently losing the workout plan', () => {
  state.templates.data = undefined; state.templates.isPending = true;
  render(<ActiveWorkout workout={workout} onFinished={vi.fn()} />);
  expect(screen.getByText('Loading planned exercises…')).toBeTruthy();
});
it('offers retry when the plan catalog fails', () => {
  state.catalog.isError = true;
  render(<ActiveWorkout workout={workout} onFinished={vi.fn()} />);
  expect(screen.getByText('Planned exercises could not be loaded. Your logged sets are kept.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.catalog.refetch).toHaveBeenCalledOnce();
});
it('can finish with retained notes when history fails, without pretending comparisons were checked', async () => {
  const done = vi.fn();
  const ui = render(<ActiveWorkout workout={workout} onFinished={done} />);
  await userEvent.setup().type(screen.getByLabelText('How did it go?'), 'Felt steady');
  state.history.isError = true;
  ui.rerender(<ActiveWorkout workout={workout} onFinished={done} />);
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
  expect(state.finish).toHaveBeenCalledWith({ notes: 'Felt steady' }, expect.anything());
  expect(done).toHaveBeenCalledWith(expect.objectContaining({ historyAvailable: false }), 'Push');
});
it('explains unavailable comparisons in the saved workout summary', () => {
  const summary = { durationMin: 30, workingSets: 2, volumeGrams: 100000, exercises: [], prCount: 0, volumeDeltaPct: null, historyAvailable: false } as WorkoutSummaryDTO;
  render(<WorkoutSummaryDialog summary={summary} title="Push" unit="kg" onClose={vi.fn()} />);
  expect(screen.getByText('Workout saved. Earlier sessions were unavailable, so records and volume comparisons were not checked.')).toBeTruthy();
});
