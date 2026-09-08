import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({
  questions: { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() },
  insights: { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() },
  tasks: { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() },
  events: { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() },
}));
vi.mock('@/lib/hooks/ai-questions', () => ({ useAiQuestions: () => state.questions, useAnswerQuestion: () => ({ mutate: vi.fn() }), useDismissQuestion: () => ({ mutate: vi.fn() }) }));
vi.mock('@/lib/hooks/ai', () => ({ useInsights: () => state.insights, useGenerateWeeklyReview: () => ({ mutate: vi.fn() }) }));
vi.mock('@/lib/hooks/tasks', () => ({ useTasks: () => state.tasks }));
vi.mock('@/lib/hooks/events', () => ({ useEvents: () => state.events }));
vi.mock('@/components/panels/WeeklyDecisions', () => ({ WeeklyDecisions: () => <p>Weekly decisions remain available</p> }));
import { AsksBell } from '@/components/atlas/AsksPanel';
import { WeeklyReviewCard } from '@/components/progress/WeeklyReviewCard';
import { FirstCapture } from '@/components/stream/FirstCapture';
import { ESTABLISHED_KEY } from '@/lib/hooks/established';
beforeEach(() => {
  localStorage.removeItem(ESTABLISHED_KEY);
  for (const query of Object.values(state)) { query.isPending = false; query.isError = false; query.refetch.mockClear(); }
});
it('questions do not announce an empty inbox while loading', () => {
  state.questions.isPending = true;
  render(<AsksBell />);
  expect(screen.queryByRole('button', { name: 'Atlas has no questions' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Atlas questions' }));
  expect(screen.queryByText(/Nothing to ask right now/)).toBeNull();
  expect(document.querySelector('.skeleton')).toBeTruthy();
});
it('questions offer retry after a failed read', () => {
  state.questions.isError = true;
  render(<AsksBell />);
  fireEvent.click(screen.getByRole('button', { name: 'Atlas questions' }));
  expect(screen.getByText('Questions could not be loaded.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.questions.refetch).toHaveBeenCalledOnce();
});
it('a failed review read does not offer to generate a supposedly missing review', () => {
  state.insights.isError = true;
  render(<WeeklyReviewCard />);
  expect(screen.getByText('Weekly review could not be loaded.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Write my weekly review' })).toBeNull();
  expect(screen.getByText('Weekly decisions remain available')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.insights.refetch).toHaveBeenCalledOnce();
});
it.each(['tasks','events'] as const)('first capture does not call an account empty after a failed %s read', (source) => {
  state[source].isError = true;
  render(<FirstCapture />);
  expect(screen.queryByRole('region', { name: 'Try your first capture' })).toBeNull();
  expect(screen.getByText('Your capture history could not be loaded.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state[source].refetch).toHaveBeenCalledOnce();
});

it('weekly review waits before offering generation', () => {
  state.insights.isPending = true;
  const { container } = render(<WeeklyReviewCard />);
  expect(container.querySelector('.skeleton')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Write my weekly review' })).toBeNull();
});
it('questions show their empty message after a successful read', () => {
  render(<AsksBell />);
  fireEvent.click(screen.getByRole('button', { name: 'Atlas has no questions' }));
  expect(screen.getByText(/Nothing to ask right now/)).toBeTruthy();
});
it('first capture waits until history arrives', () => {
  state.tasks.isPending = true;
  const { container } = render(<FirstCapture />);
  expect(container.querySelector('.skeleton')).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Try your first capture' })).toBeNull();
});
