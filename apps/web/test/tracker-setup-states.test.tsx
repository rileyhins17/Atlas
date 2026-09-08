import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ pending: false, error: false, saving: false, retry: vi.fn() }));
vi.mock('@/lib/hooks/trackers', () => ({
  useTrackers: () => ({ data: state.pending || state.error ? undefined : [], isPending: state.pending, isError: state.error, refetch: state.retry }),
  useCreateTracker: () => ({ mutate: vi.fn(), isPending: state.saving }),
  useArchiveTracker: () => ({ mutate: vi.fn(), isPending: false }),
}));
import { TrackerManager } from '@/components/trackers/TrackerManager';
beforeEach(() => { state.pending = false; state.error = false; state.saving = false; state.retry.mockClear(); });
it.each(['pending', 'error'] as const)('does not offer new-account tracker suggestions when the read is %s', (kind) => {
  state[kind] = true;
  render(<TrackerManager />);
  expect(screen.queryByRole('button', { name: 'Energy' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Track something else' })).toBeNull();
  if (kind === 'error') {
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.retry).toHaveBeenCalledOnce();
  }
});
it('protects the submitted tracker draft while its save is pending', () => {
  const view = render(<TrackerManager />);
  fireEvent.click(screen.getByRole('button', { name: 'Track something else' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Tracker name' }), { target: { value: 'Focus' } });
  state.saving = true;
  view.rerender(<TrackerManager />);
  expect(screen.getByRole('textbox', { name: 'Tracker name' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
});
it('retains an open draft across a failed background read and recovery', () => {
  const view = render(<TrackerManager />);
  fireEvent.click(screen.getByRole('button', { name: 'Track something else' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Tracker name' }), { target: { value: 'Focus' } });
  state.error = true; view.rerender(<TrackerManager />);
  state.error = false; view.rerender(<TrackerManager />);
  expect(screen.getByRole('textbox', { name: 'Tracker name' })).toHaveValue('Focus');
});
