import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ pending: false, error: false, retry: vi.fn() }));
vi.mock('@/lib/hooks/stats', () => ({ useMoodPatterns: () => ({
  data: { daysLogged: 0, daysNeeded: 14, patterns: [] },
  isPending: state.pending, isError: state.error, refetch: state.retry,
}) }));
import { MoodPatterns } from '@/components/progress/MoodPatterns';
beforeEach(() => { state.pending = false; state.error = false; state.retry.mockClear(); });
it('shows loading instead of silently disappearing', () => {
  state.pending = true;
  render(<MoodPatterns />);
  expect(screen.getByRole('status').textContent).toContain('Loading mood patterns');
});
it('offers recovery after a failed patterns request', () => {
  state.error = true;
  render(<MoodPatterns />);
  expect(screen.getByText('Could not load mood patterns.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(state.retry).toHaveBeenCalledOnce();
});
it('explains the empty state and the amount of history needed', () => {
  render(<MoodPatterns />);
  expect(screen.getByText(/0 of 14 days logged/)).toBeTruthy();
});
