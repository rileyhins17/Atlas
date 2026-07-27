'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RollForwardAction, TaskDTO } from '@atlas/shared';
import { TasksApi } from '@/lib/api';
import { qk } from './keys';

export function useTasks() {
  return useQuery({ queryKey: qk.tasks, queryFn: TasksApi.list });
}

/**
 * How long the user's own work actually takes, keyed by `durationKey(title)`.
 *
 * Long-lived on purpose: it moves only when a planned task is completed, and
 * it is read by every task row, so refetching it per render would be noise.
 */
export function useTaskDurations() {
  return useQuery({
    queryKey: qk.taskDurations,
    queryFn: TasksApi.durations,
    staleTime: 5 * 60_000,
    select: (list) => new Map(list.map((e) => [e.key, e])),
  });
}

/** Open work that was due before today — the batched decision on Today. */
export function useSlippedTasks() {
  return useQuery({ queryKey: qk.slipped, queryFn: TasksApi.slipped });
}

/**
 * Answer the whole slipped list at once.
 *
 * Invalidates broadly on purpose: rolling changes due dates, dropping removes
 * tasks from every list, and both write timeline rows — so the task views, the
 * day surfaces and the feed are all stale afterwards.
 */
export function useRollForward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskIds, action }: { taskIds: string[]; action: RollForwardAction }) =>
      TasksApi.rollForward(taskIds, action),
    meta: { errorFallback: "Couldn't update those" },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tasks });
      void qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: TasksApi.create,
    meta: { success: 'Task added', errorFallback: 'Failed to add task' },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tasks });
      // Task counts on a goal are computed server-side, so linking, completing
      // or deleting a task changes them and the goals query must refetch.
      void qc.invalidateQueries({ queryKey: qk.goals });
    },
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tasks });
      // Task counts on a goal are computed server-side, so linking, completing
      // or deleting a task changes them and the goals query must refetch.
      void qc.invalidateQueries({ queryKey: qk.goals });
    },
  });
}
