'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskDTO } from '@atlas/shared';
import { TasksApi } from '@/lib/api';
import { qk } from './keys';

export function useTasks() {
  return useQuery({ queryKey: qk.tasks, queryFn: TasksApi.list });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: TasksApi.create,
    meta: { success: 'Task added', errorFallback: 'Failed to add task' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks }),
  });
}

/** Optimistic: the row flips to done instantly and rolls back on failure. */
export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: TasksApi.complete,
    meta: { errorFallback: 'Failed to complete task' },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: qk.tasks });
      const previous = qc.getQueryData<TaskDTO[]>(qk.tasks);
      qc.setQueryData<TaskDTO[]>(qk.tasks, (tasks) =>
        tasks?.map((t) =>
          t.id === id
            ? { ...t, status: 'DONE' as TaskDTO['status'], completedAt: new Date().toISOString() }
            : t,
        ),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.tasks, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.tasks }),
  });
}

/** Inline edits (title, priority, due). Optimistically patches the row. */
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      TasksApi.update(id, patch),
    meta: { errorFallback: 'Failed to update task' },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.tasks });
      const previous = qc.getQueryData<TaskDTO[]>(qk.tasks);
      qc.setQueryData<TaskDTO[]>(qk.tasks, (tasks) =>
        tasks?.map((t) => (t.id === id ? ({ ...t, ...patch } as TaskDTO) : t)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.tasks, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.tasks }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: TasksApi.remove,
    meta: { success: 'Task deleted', errorFallback: 'Failed to delete task' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks }),
  });
}
