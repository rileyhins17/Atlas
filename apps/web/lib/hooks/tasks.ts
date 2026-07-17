'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TasksApi } from '@/lib/api';
import { qk } from './keys';

export function useTasks() {
  return useQuery({ queryKey: qk.tasks, queryFn: TasksApi.list });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: TasksApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks }),
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: TasksApi.complete,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: TasksApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks }),
  });
}
