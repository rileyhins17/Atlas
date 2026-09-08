import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ pending: false, error: false, saving: false, retry: vi.fn(), days: vi.fn() }));
const mutation = () => ({ mutate: vi.fn(), isPending: false });
vi.mock('@/lib/hooks/goals', () => ({
  useGoals: () => ({ data: [{ id: 'g', title: 'A real goal', horizon: 'short', status: 'active', taskCount: 1, doneTaskCount: 0 }], isPending: false, isError: false }),
  useCreateGoal: () => mutation(), useUpdateGoal: () => mutation(), useDeleteGoal: () => mutation(),
}));
vi.mock('@/lib/hooks/tasks', () => ({
  useTasks: () => ({ data: undefined, isPending: state.pending, isError: state.error, refetch: state.retry }),
  useCreateTask: () => mutation(), useUpdateTask: () => mutation(),
}));
vi.mock('@/lib/hooks/habits', () => ({
  useHabits: () => ({ data: [{ id: 'h', name: 'Read', target: 1, cadence: 'daily', todayCount: 0, streak: 0 }], isPending: false, isError: false }),
  useHabitHistory: (days: number) => { state.days(days); return { data: undefined, isPending: state.pending, isError: state.error, refetch: state.retry }; },
  useCreateHabit: () => mutation(), useUpdateHabit: () => mutation(), useDeleteHabit: () => mutation(), useLogHabit: () => ({ ...mutation(), isPending: state.saving }),
}));
import { GoalsPanel } from '@/components/panels/GoalsPanel';
import { HabitsPanel } from '@/components/panels/HabitsPanel';
beforeEach(() => { state.pending = false; state.error = false; state.saving = false; state.retry.mockClear(); state.days.mockClear(); });
it.each(['pending', 'error'] as const)('does not call unavailable goal tasks empty: %s', (kind) => {
  state[kind] = true;
  render(<GoalsPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'A real goal' }));
  expect(screen.queryByText(/Break this into work/)).toBeNull();
  if (kind === 'error') {
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.retry).toHaveBeenCalledOnce();
  }
});
it.each(['pending', 'error'] as const)('does not draw empty habit history while unavailable: %s', (kind) => {
  state[kind] = true;
  const { container } = render(<HabitsPanel />);
  expect(container.querySelector('.habit-heatmap')).toBeNull();
  expect(screen.getByRole('button', { name: 'Check in "Read"' })).toBeEnabled();
  if (kind === 'error') {
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.retry).toHaveBeenCalledOnce();
  }
});
it('requests enough history for the visible 26-week heatmap', () => {
  render(<HabitsPanel />);
  expect(state.days).toHaveBeenCalledWith(26 * 7);
});

it('prevents another habit check-in while the previous save is pending', () => {
  state.saving = true;
  render(<HabitsPanel />);
  expect(screen.getByRole('button', { name: 'Check in "Read"' })).toBeDisabled();
});
