import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, AiApi: { ...actual.AiApi, brainDump: vi.fn() }, TasksApi: { ...actual.TasksApi, create: vi.fn() }, EventsApi: { ...actual.EventsApi, create: vi.fn() } };
});
import { AiApi, ApiError, EventsApi, TasksApi } from '@/lib/api';
import { ToastProvider } from '@/components/ui';
import { useBrainDump } from '@/lib/hooks/ai';
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider><QueryClientProvider client={client}>{children}</QueryClientProvider></ToastProvider>;
  return { client, ...renderHook(() => useBrainDump(), { wrapper }) };
}
beforeEach(() => {
  vi.mocked(AiApi.brainDump).mockReset().mockRejectedValue(new ApiError(424, 'No provider'));
  vi.mocked(TasksApi.create).mockReset().mockResolvedValue({ id: 'saved' } as Awaited<ReturnType<typeof TasksApi.create>>);
  vi.mocked(EventsApi.create).mockReset();
});
it('reports a successful local write as a successful capture', async () => {
  const { result } = setup();
  await act(async () => {
    await expect(result.current.mutateAsync('buy milk')).resolves.toMatchObject({ source: 'local', toolExecutions: [] });
  });
  expect(TasksApi.create).toHaveBeenCalledWith({ title: 'buy milk' });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});
it('finishes the fallback and records success even after the caller unmounts', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof TasksApi.create>>) => void;
  vi.mocked(TasksApi.create).mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { result, unmount, client } = setup();
  act(() => result.current.mutate('buy milk'));
  await waitFor(() => expect(TasksApi.create).toHaveBeenCalledOnce());
  unmount();
  resolve({ id: 'saved' } as Awaited<ReturnType<typeof TasksApi.create>>);
  await waitFor(() => expect(client.getMutationCache().getAll()[0]?.state.status).toBe('success'));
});
it('preserves the actual failed-write error instead of the recovered provider error', async () => {
  const writeError = new ApiError(503, 'Write unavailable');
  vi.mocked(TasksApi.create).mockRejectedValue(writeError);
  const { result } = setup();
  await act(async () => { await expect(result.current.mutateAsync('buy milk')).rejects.toBe(writeError); });
});
it('does not create fallback rows after an ordinary server failure', async () => {
  const error = new ApiError(500, 'Server error');
  vi.mocked(AiApi.brainDump).mockRejectedValue(error);
  const { result } = setup();
  await act(async () => { await expect(result.current.mutateAsync('buy milk')).rejects.toBe(error); });
  expect(TasksApi.create).not.toHaveBeenCalled();
  expect(EventsApi.create).not.toHaveBeenCalled();
});
