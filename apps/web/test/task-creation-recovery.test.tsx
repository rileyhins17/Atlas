import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, TasksApi: { ...actual.TasksApi, list: vi.fn(), create: vi.fn(), durations: vi.fn().mockResolvedValue([]) } };
});
import { ApiError, TasksApi } from '@/lib/api';
import { TasksPanel } from '@/components/panels/TasksPanel';
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><TasksPanel /></QueryClientProvider>);
}
beforeEach(() => {
  vi.mocked(TasksApi.list).mockReset().mockResolvedValue([]);
  vi.mocked(TasksApi.create).mockReset();
});
for (const quick of [false, true]) {
  it(`protects the ${quick ? 'dated' : 'main'} draft while saving`, async () => {
    vi.mocked(TasksApi.create).mockImplementation(() => new Promise(() => {}));
    mount();
    await screen.findByText('No tasks yet');
    if (quick) fireEvent.click(screen.getByRole('button', { name: 'Add to today' }));
    const input = screen.getByRole('textbox', { name: quick ? 'New task in Today' : 'New task title' });
    fireEvent.change(input, { target: { value: 'Keep this task' } });
    const form = input.closest('form')!;
    fireEvent.submit(form);
    await waitFor(() => expect(input).toHaveAttribute('readonly'));
    expect(within(form).getByRole('status')).toHaveTextContent('Saving task…');
    if (quick) {
      expect(within(form).getByRole('button', { name: 'High' })).toBeDisabled();
      expect(within(form).getByRole('button', { name: 'Daily' })).toBeDisabled();
      expect(within(form).getByRole('button', { name: 'Cancel' })).toBeDisabled();
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(input).toBeVisible();
    }
    fireEvent.submit(form);
    expect(TasksApi.create).toHaveBeenCalledOnce();
  });
  it(`retains and retries the failed ${quick ? 'dated' : 'main'} draft`, async () => {
    vi.mocked(TasksApi.create).mockRejectedValueOnce(new ApiError(503, 'Unavailable'));
    mount();
    await screen.findByText('No tasks yet');
    if (quick) fireEvent.click(screen.getByRole('button', { name: 'Add to today' }));
    const input = screen.getByRole('textbox', { name: quick ? 'New task in Today' : 'New task title' });
    fireEvent.change(input, { target: { value: 'Keep this task' } });
    const form = input.closest('form')!;
    fireEvent.submit(form);
    expect(await within(form).findByRole('alert')).toHaveTextContent('Task was not confirmed. Your draft is kept.');
    expect(input).toHaveValue('Keep this task');
    expect(input).not.toHaveAttribute('readonly');
    vi.mocked(TasksApi.create).mockResolvedValueOnce({ id: 'saved' } as Awaited<ReturnType<typeof TasksApi.create>>);
    fireEvent.submit(form);
    await waitFor(() => expect(input).toHaveValue(''));
    expect(TasksApi.create).toHaveBeenCalledTimes(2);
  });
}
