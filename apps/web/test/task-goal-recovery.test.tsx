import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ pending: false, error: false, goals: [] as { id: string; title: string; status: string; horizon: string }[], retry: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/hooks/goals', () => ({ useGoals: () => ({ data: state.pending || state.error ? undefined : state.goals, isPending: state.pending, isError: state.error, isSuccess: !state.pending && !state.error, refetch: state.retry }) }));
vi.mock('@/lib/hooks/tasks', () => ({ useUpdateTask: () => ({ mutate: state.update }) }));
import { TaskGoalChip } from '@/components/TaskGoalChip';
beforeEach(() => { state.pending = false; state.error = false; state.goals = []; state.retry.mockClear(); state.update.mockClear(); });
it('offers retry instead of calling a failed goal read loading', () => {
  state.error = true;
  render(<TaskGoalChip taskId="task" goalId={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'Link this task to a goal' }));
  expect(screen.queryByText('Loading your goals…')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.retry).toHaveBeenCalledOnce();
});
it.each(['pending', 'error'] as const)('preserves an existing compact goal link while details are %s', (kind) => {
  state[kind] = true;
  render(<TaskGoalChip taskId="task" goalId="goal" compact />);
  expect(screen.getByRole('button', { name: 'Goal linked — view or change' })).toBeVisible();
});
it('does not hide an existing relationship when the returned list excludes its goal', () => {
  render(<TaskGoalChip taskId="task" goalId="goal" compact />);
  fireEvent.click(screen.getByRole('button', { name: 'Goal linked — view or change' }));
  expect(screen.getByText('The linked goal is unavailable.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Remove from goal' })).toBeVisible();
});
it('replaces the temporary linked label with the recovered goal title', () => {
  state.error = true;
  const view = render(<TaskGoalChip taskId="task" goalId="goal" compact />);
  state.error = false;
  state.goals = [{ id: 'goal', title: 'Build strength', status: 'active', horizon: 'long' }];
  view.rerender(<TaskGoalChip taskId="task" goalId="goal" compact />);
  expect(screen.getByRole('button', { name: 'Goal: Build strength — change' })).toBeVisible();
  expect(state.update).not.toHaveBeenCalled();
});
it('does not advertise a goal picker for a confirmed empty unlinked task', () => {
  const { container } = render(<TaskGoalChip taskId="task" goalId={null} />);
  expect(container).toBeEmptyDOMElement();
});
