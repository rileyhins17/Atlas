import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TaskDTO } from '@atlas/shared';
vi.mock('@/components/TaskGoalChip', () => ({ TaskGoalChip: () => null }));
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, TasksApi: { ...actual.TasksApi, update: vi.fn(), durations: vi.fn().mockResolvedValue([]) } };
});
import { ApiError, TasksApi } from '@/lib/api';
import { TaskRow } from '@/components/TaskRow';
const task = { id: 'task', title: 'Original title', status: 'TODO', priority: 'MEDIUM', tags: [], goalId: null, dueAt: null, recurrence: null } as unknown as TaskDTO;
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><TaskRow task={task} /></QueryClientProvider>);
}
function edit() {
  fireEvent.click(screen.getByRole('button', { name: 'Original title — click to edit' }));
  const input = screen.getByRole('textbox', { name: 'Edit task title' });
  fireEvent.change(input, { target: { value: 'Updated title' } });
  return input;
}
beforeEach(() => { vi.mocked(TasksApi.update).mockReset(); });
it('retains the rejected title and exposes a save retry', async () => {
  vi.mocked(TasksApi.update).mockRejectedValueOnce(new ApiError(503, 'Save unavailable')).mockResolvedValue(task);
  mount();
  const input = edit();
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(TasksApi.update).toHaveBeenCalledOnce());
  expect(await screen.findByRole('textbox', { name: 'Edit task title' })).toHaveValue('Updated title');
  expect(await screen.findByText('Title was not confirmed. Your edit is kept.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Save title' }));
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  expect(TasksApi.update).toHaveBeenCalledTimes(2);
});
it('protects the pending draft and ignores a second submit', async () => {
  vi.mocked(TasksApi.update).mockImplementation(() => new Promise(() => {}));
  mount();
  const input = edit();
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(input).toHaveAttribute('readonly'));
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(TasksApi.update).toHaveBeenCalledOnce();
});
it('does not save implicitly when the user leaves an unfinished edit', async () => {
  mount();
  const input = edit();
  await act(async () => { fireEvent.blur(input); });
  expect(TasksApi.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));
  expect(screen.queryByRole('textbox')).toBeNull();
});
