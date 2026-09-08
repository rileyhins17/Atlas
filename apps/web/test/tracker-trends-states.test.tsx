import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({
  overview: { data: [{ tracker: { id: 'energy', name: 'Energy', emoji: null }, points: [{ value: 4 }, { value: 7 }], sentence: null }], isPending: false, isError: false, refetch: vi.fn() },
  patterns: { data: { trackers: [{ id: 'energy', patterns: [] }] }, isPending: false, isError: false, refetch: vi.fn() },
}));
vi.mock('@/lib/hooks/trackers', () => ({ useTrackerOverview: () => state.overview, useTrackerPatterns: () => state.patterns }));
import { TrackerTrends } from '@/components/progress/TrackerTrends';
beforeEach(() => {
  for (const query of Object.values(state)) { query.isPending = false; query.isError = false; query.refetch.mockClear(); }
});
it('shows loading rather than disappearing while ratings load', () => {
  state.overview.isPending = true;
  const { container } = render(<TrackerTrends />);
  expect(container.querySelector('.skeleton')).toBeTruthy();
});
it('offers retry when ratings fail', () => {
  state.overview.isError = true;
  render(<TrackerTrends />);
  expect(screen.getByText('Personal rating trends could not be loaded.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.overview.refetch).toHaveBeenCalledOnce();
});
it('keeps the series visible when pattern analysis fails and retries only that read', () => {
  state.patterns.isError = true;
  render(<TrackerTrends />);
  expect(screen.getByRole('region', { name: 'Energy' })).toBeTruthy();
  expect(screen.getByText('Patterns could not be loaded. Your ratings are still shown.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.patterns.refetch).toHaveBeenCalledOnce();
  expect(state.overview.refetch).not.toHaveBeenCalled();
});
it('distinguishes pending pattern analysis from no supported pattern', () => {
  state.patterns.isPending = true;
  render(<TrackerTrends />);
  expect(screen.getByText('Checking patterns…')).toBeTruthy();
  expect(screen.queryByText('No supported patterns yet. Keep rating your days.')).toBeNull();
});
it('states when the completed analysis has no supported pattern', () => {
  render(<TrackerTrends />);
  expect(screen.getByText('No supported patterns yet. Keep rating your days.')).toBeTruthy();
});
it('provides a setup path when no trackers exist', () => {
  const saved = state.overview.data;
  state.overview.data = [];
  try {
    render(<TrackerTrends />);
    expect(screen.getByRole('link', { name: 'Set up personal ratings' }).getAttribute('href')).toBe('/settings');
  } finally { state.overview.data = saved; }
});
