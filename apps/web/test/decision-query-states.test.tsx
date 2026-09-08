import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({
  slipped: { data: [], isPending: false, isError: false, refetch: vi.fn() },
  goals: { data: [], isPending: false, isError: false, refetch: vi.fn() },
  habits: { data: [], isPending: false, isError: false, refetch: vi.fn() },
  history: { data: [], isPending: false, isError: false, refetch: vi.fn() },
}));
vi.mock('@/lib/hooks/tasks', () => ({ useSlippedTasks: () => state.slipped, useRollForward: () => ({ mutate: vi.fn() }), useCompleteTask: () => ({ mutate: vi.fn() }) }));
vi.mock('@/lib/hooks/goals', () => ({ useGoals: () => state.goals }));
vi.mock('@/lib/hooks/habits', () => ({ useHabits: () => state.habits, useHabitHistory: () => state.history, useDeleteHabit: () => ({ mutate: vi.fn() }), useLogHabit: () => ({ mutate: vi.fn() }) }));
vi.mock('@/components/ui', async (original) => ({ ...await original<typeof import('@/components/ui')>(), useToast: () => ({ toast: vi.fn() }) }));
import { WeeklyDecisions } from '@/components/panels/WeeklyDecisions';
import { TodayChecklist } from '@/components/canvas/TodayChecklist';
import { SlippedTasks } from '@/components/canvas/SlippedTasks';
beforeEach(() => {
  localStorage.removeItem('atlas.slipped.dismissed');
  for (const query of Object.values(state)) { query.isPending = false; query.isError = false; query.refetch.mockClear(); }
});
it.each(['slipped', 'goals', 'habits', 'history'] as const)('weekly decisions retry a failed %s source', (source) => {
  state[source].isError = true;
  render(<WeeklyDecisions />);
  expect(screen.getByText('Weekly decisions could not be loaded.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state[source].refetch).toHaveBeenCalledOnce();
});
it.each(['slipped', 'goals', 'habits', 'history'] as const)('weekly decisions wait for %s', (source) => {
  state[source].isPending = true;
  const { container } = render(<WeeklyDecisions />);
  expect(container.querySelector('.skeleton')).toBeTruthy();
});
it('checklist does not claim completion while habits failed', () => {
  state.habits.isError = true;
  render(<TodayChecklist checklist={[]} />);
  expect(screen.queryByText('Nothing to tick off today.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.habits.refetch).toHaveBeenCalledOnce();
});
it('unfinished work has a recovery path', () => {
  state.slipped.isError = true;
  render(<SlippedTasks />);
  expect(screen.getByText('Unfinished work could not be loaded.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.slipped.refetch).toHaveBeenCalledOnce();
});

it('weekly decisions have an honest settled empty state', () => {
  render(<WeeklyDecisions />);
  expect(screen.getByText('No unfinished decisions to review this week.')).toBeTruthy();
});
it('unfinished work distinguishes loading from an empty carry-over', () => {
  state.slipped.isPending = true;
  const { container, rerender } = render(<SlippedTasks />);
  expect(container.querySelector('.skeleton')).toBeTruthy();
  expect(screen.queryByText('No unfinished work carried over.')).toBeNull();
  state.slipped.isPending = false;
  rerender(<SlippedTasks />);
  expect(screen.getByText('No unfinished work carried over.')).toBeTruthy();
});
it('checklist waits before saying nothing is due', () => {
  state.habits.isPending = true;
  const { container, rerender } = render(<TodayChecklist checklist={[]} />);
  expect(container.querySelector('.skeleton')).toBeTruthy();
  expect(screen.queryByText('Nothing to tick off today.')).toBeNull();
  state.habits.isPending = false;
  rerender(<TodayChecklist checklist={[]} />);
  expect(screen.getByText('Nothing to tick off today.')).toBeTruthy();
});
