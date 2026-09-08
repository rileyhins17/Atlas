import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExerciseDTO, WorkoutTemplateDTO } from '@atlas/shared';
const state = vi.hoisted(() => ({
  catalog: { data: undefined as ExerciseDTO[] | undefined, isPending: true, isError: false, refetch: vi.fn() },
  update: vi.fn(),
}));
vi.mock('@/lib/hooks/fitness', () => ({ useExercises: () => state.catalog, useCreateTemplate: () => ({ mutate: vi.fn() }), useUpdateTemplate: () => ({ mutate: state.update }), useDeleteTemplate: () => ({ mutate: vi.fn() }) }));
import { DayBuilder } from '@/components/fitness/DayBuilder';
const template = { id: 'day', name: 'Push', exercises: [{ exerciseId: 'press', supersetGroup: null }] } as WorkoutTemplateDTO;
const press = { id: 'press', name: 'Press', kind: 'weight_reps', muscle: 'chest' } as ExerciseDTO;
const view = () => <DayBuilder editing={template} onDone={vi.fn()} onCancel={vi.fn()} />;
beforeEach(() => { state.catalog.data = undefined; state.catalog.isPending = true; state.catalog.isError = false; state.catalog.refetch.mockClear(); state.update.mockClear(); });
it('does not claim the entire catalog is already selected while loading', () => {
  const { container } = render(view());
  expect(screen.queryByText('Everything is already in this day.')).toBeNull();
  expect(container.querySelector('.skeleton')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save (1)' })).toBeDisabled();
});
it('preserves the draft and selected ids through a failed refresh and retry', async () => {
  state.catalog.data = [press]; state.catalog.isPending = false;
  const user = userEvent.setup();
  const ui = render(view());
  await user.clear(screen.getByLabelText('Workout day name'));
  await user.type(screen.getByLabelText('Workout day name'), 'Heavy push');
  state.catalog.isError = true;
  ui.rerender(view());
  expect(screen.getByText('Exercise catalog could not be loaded. Your workout draft is kept.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save (1)' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.catalog.refetch).toHaveBeenCalledOnce();
  state.catalog.isError = false;
  ui.rerender(view());
  fireEvent.click(screen.getByRole('button', { name: 'Save (1)' }));
  expect(state.update).toHaveBeenCalledWith({ id: 'day', patch: { name: 'Heavy push', exerciseIds: ['press'], supersetGroups: [null] } }, expect.anything());
});
it('distinguishes an empty catalog from having selected every exercise', () => {
  state.catalog.data = []; state.catalog.isPending = false;
  render(<DayBuilder editing={null} onDone={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByText('No exercises are available in the catalog yet.')).toBeTruthy();
});
