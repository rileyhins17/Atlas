import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const query = vi.hoisted(() => ({ data: [] as unknown[], isPending: false, isError: false, refetch: vi.fn() }));
vi.mock('@/lib/hooks/trackers', () => ({ useTrackers: () => query, useLogTracker: () => ({ mutate: vi.fn() }) }));
import { TrackerCheckIn } from '@/components/trackers/TrackerCheckIn';
beforeEach(() => { query.data = []; query.isPending = false; query.isError = false; query.refetch.mockClear(); });
it('shows a retry when ratings cannot be loaded', () => {
  query.isError = true;
  render(<TrackerCheckIn />);
  expect(screen.getByText('Your ratings could not be loaded.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(query.refetch).toHaveBeenCalledOnce();
});
it('shows loading rather than an empty answer', () => {
  query.isPending = true;
  const { container } = render(<TrackerCheckIn />);
  expect(container.querySelector('.skeleton')).toBeTruthy();
  expect(screen.queryByText('No personal ratings set up.')).toBeNull();
});
it('offers setup when no ratings exist', () => {
  render(<TrackerCheckIn />);
  expect(screen.getByText('No personal ratings set up.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Choose what to track' }).getAttribute('href')).toBe('/settings');
});
