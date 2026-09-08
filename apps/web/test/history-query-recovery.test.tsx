import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TaskDTO, TimelineEventDTO } from '@atlas/shared';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, TimelineApi: { ...actual.TimelineApi, list: vi.fn() }, TasksApi: { ...actual.TasksApi, list: vi.fn() } };
});
import { ApiError, TasksApi, TimelineApi } from '@/lib/api';
import { Feed } from '@/components/stream/Feed';
const row: TimelineEventDTO = { id: 'event', type: 'task.created', source: 'tasks', title: 'Saved activity', summary: null, refType: 'task', refId: 'task', occurredAt: '2026-09-01T12:00:00Z' };
const task = { id: 'task', title: row.title, status: 'TODO' } as TaskDTO;
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Feed /></QueryClientProvider>);
}
beforeEach(() => {
  vi.mocked(TimelineApi.list).mockReset().mockResolvedValue({ events: [row], hasMore: false });
  vi.mocked(TasksApi.list).mockReset().mockResolvedValue([]);
});
it('preserves loaded history when fetching an earlier page fails and retries that page', async () => {
  vi.mocked(TimelineApi.list).mockResolvedValueOnce({ events: [row], hasMore: true })
    .mockRejectedValueOnce(new ApiError(503, 'Earlier page unavailable'))
    .mockResolvedValueOnce({ events: [{ ...row, id: 'earlier', title: 'Earlier activity' }], hasMore: false });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Show earlier' }));
  expect(await screen.findByText('Earlier activity could not be loaded.')).toBeVisible();
  expect(screen.getByText('Saved activity')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Earlier activity')).toBeVisible();
  expect(screen.getByText('Saved activity')).toBeVisible();
  expect(TimelineApi.list).toHaveBeenLastCalledWith({ limit: 50, offset: 50, source: undefined });
});
it('keeps history readable while checking which task actions are available', async () => {
  vi.mocked(TasksApi.list).mockImplementation(() => new Promise(() => {}));
  mount();
  expect(await screen.findByText('Saved activity')).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Checking task actions…');
  expect(screen.queryByRole('button', { name: /Complete/ })).toBeNull();
});
it('retries unavailable task actions without discarding saved history', async () => {
  vi.mocked(TasksApi.list).mockRejectedValueOnce(new ApiError(503, 'Tasks unavailable')).mockResolvedValue([task]);
  mount();
  expect(await screen.findByText('Task actions could not be loaded.')).toBeVisible();
  expect(screen.getByText('Saved activity')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: 'Complete "Saved activity"' })).toBeVisible();
  expect(TasksApi.list).toHaveBeenCalledTimes(2);
});
it('keeps the first-page failure distinct from empty history', async () => {
  vi.mocked(TimelineApi.list).mockRejectedValueOnce(new ApiError(503, 'History unavailable')).mockResolvedValue({ events: [], hasMore: false });
  mount();
  await screen.findByText("Couldn't load your story.");
  expect(screen.queryByText('Your story starts here')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Your story starts here')).toBeVisible();
  await waitFor(() => expect(TimelineApi.list).toHaveBeenCalledTimes(2));
});
