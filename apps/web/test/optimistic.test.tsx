import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { HabitDTO, TaskDTO } from '@atlas/shared';
import { useCompleteTask } from '@/lib/hooks/tasks';
import { useLogHabit } from '@/lib/hooks/habits';
import { qk } from '@/lib/hooks/keys';

// Only the mutation fns the two hooks under test call.
vi.mock('@/lib/api', () => ({
  TasksApi: { complete: vi.fn() },
  HabitsApi: { log: vi.fn() },
}));
import { HabitsApi, TasksApi } from '@/lib/api';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, networkMode: 'always' },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const task = (over: Partial<TaskDTO> = {}): TaskDTO =>
  ({ id: '1', title: 'x', status: 'OPEN', completedAt: null, ...over }) as unknown as TaskDTO;

const habit = (over: Partial<HabitDTO> = {}): HabitDTO =>
  ({ id: 'h1', name: 'Gym', doneToday: false, todayCount: 0, streak: 2, ...over }) as unknown as HabitDTO;

beforeEach(() => vi.clearAllMocks());

describe('useCompleteTask (optimistic)', () => {
  it('flips the row to DONE immediately, then rolls back when the API fails', async () => {
    const { client, wrapper } = makeWrapper();
    client.setQueryData(qk.tasks, [task()]);

    const d = deferred<TaskDTO>();
    vi.mocked(TasksApi.complete).mockReturnValue(d.promise);

    const { result } = renderHook(() => useCompleteTask(), { wrapper });
    act(() => result.current.mutate('1'));

    // Optimistic patch is visible while the request is still in flight.
    await waitFor(() =>
      expect(client.getQueryData<TaskDTO[]>(qk.tasks)?.[0].status).toBe('DONE'),
    );

    await act(async () => {
      d.reject(new Error('network'));
      await d.promise.catch(() => {});
    });

    // Rolled back to the snapshot.
    await waitFor(() =>
      expect(client.getQueryData<TaskDTO[]>(qk.tasks)?.[0].status).toBe('OPEN'),
    );
  });
});

describe('useLogHabit (optimistic)', () => {
  it('bumps the streak immediately, then rolls back when the API fails', async () => {
    const { client, wrapper } = makeWrapper();
    client.setQueryData(qk.habits, [habit({ streak: 2, doneToday: false })]);

    const d = deferred<HabitDTO>();
    vi.mocked(HabitsApi.log).mockReturnValue(d.promise);

    const { result } = renderHook(() => useLogHabit(), { wrapper });
    act(() => result.current.mutate('h1'));

    await waitFor(() => {
      const h = client.getQueryData<HabitDTO[]>(qk.habits)?.[0];
      expect(h?.doneToday).toBe(true);
      expect(h?.streak).toBe(3);
    });

    await act(async () => {
      d.reject(new Error('network'));
      await d.promise.catch(() => {});
    });

    await waitFor(() => {
      const h = client.getQueryData<HabitDTO[]>(qk.habits)?.[0];
      expect(h?.doneToday).toBe(false);
      expect(h?.streak).toBe(2);
    });
  });
});
