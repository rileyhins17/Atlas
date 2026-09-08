import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TaskDTO } from '@atlas/shared';
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, TasksApi: { ...actual.TasksApi, list: vi.fn(), durations: vi.fn() }, GoalsApi: { ...actual.GoalsApi, list: vi.fn().mockResolvedValue([]) } };
});
import { ApiError, TasksApi } from '@/lib/api';
import { TasksPanel } from '@/components/panels/TasksPanel';
const task: TaskDTO = { id: 'task', title: 'Write report', notes: null, status: 'TODO', priority: 'MEDIUM', dueAt: null, completedAt: null, tags: [], goalId: null, recurrence: null, recurrenceParentId: null, createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' };
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><TasksPanel /></QueryClientProvider>);
}
beforeEach(() => {
  vi.mocked(TasksApi.list).mockReset().mockResolvedValue([task, { ...task, id: 'other', title: 'Buy supplies' }]);
  vi.mocked(TasksApi.durations).mockReset().mockResolvedValue([]);
});
it('shows one pending timing state while keeping task rows usable', async () => {
  vi.mocked(TasksApi.durations).mockImplementation(() => new Promise(() => {}));
  mount();
  await screen.findByRole('button', { name: 'Write report — click to edit' });
  expect(await screen.findAllByText('Loading task timing…')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Complete "Write report"' })).toBeEnabled();
});
it('retries timing once for the list and retains the new-task draft', async () => {
  vi.mocked(TasksApi.durations).mockRejectedValueOnce(new ApiError(503, 'Timing unavailable'))
    .mockResolvedValue([{ key: 'write report', minutes: 45, samples: 4 }]);
  mount();
  expect(await screen.findAllByText('Task timing could not be loaded.')).toHaveLength(1);
  fireEvent.change(screen.getByRole('textbox', { name: 'New task title' }), { target: { value: 'Unfinished task draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('usually 45m')).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'New task title' })).toHaveValue('Unfinished task draft');
  expect(TasksApi.durations).toHaveBeenCalledTimes(2);
});
it('explains confirmed missing estimates once instead of inventing a duration', async () => {
  mount();
  expect(await screen.findAllByText('No timing estimates yet. Finish a few planned tasks to build them.')).toHaveLength(1);
  expect(screen.queryByText(/usually/)).toBeNull();
});
it('does not read timing before there are open tasks to describe', async () => {
  vi.mocked(TasksApi.list).mockResolvedValue([]);
  mount();
  await screen.findByText('No tasks yet');
  await waitFor(() => expect(TasksApi.durations).not.toHaveBeenCalled());
});
